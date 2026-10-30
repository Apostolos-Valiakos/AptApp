// Login, signup and the logged-in user's own profile: /api/v1/login, /signup, /profile.
// Moved out of server.js; helpers that still live there are handed over when
// it mounts this router (see "Area routers" near the end of server.js).
const express = require("express");
const { asyncHandler, withTransaction } = require("../http");
const pool = require("../db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

module.exports = function accountRouter({
  authenticateToken,
  isSessionToken,
  loginLimiter,
  notForClients,
  signupLimiter,
}) {
  const router = express.Router();

  router.post("/login", loginLimiter, asyncHandler(async (req, res) => {
    const { username, password } = req.body;
    // 1. Find user by username only (don't check password in SQL)
    const result = await pool.query(
      `SELECT u.*, s.name as shop_name, s.status as shop_status, s.force_hide_cash as shop_force_hide_cash,
              s.force_hide_cash_locked_by as shop_force_hide_cash_locked_by
       FROM users u
       LEFT JOIN shops s ON u.shop_id = s.id
       WHERE u.username = $1`,
      [username],
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = result.rows[0];

    // 2. Compare the provided password with the hashed password in DB
    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // 2b. Block login for suspended/cancelled shops and deactivated accounts.
    // user.shop_id is null for a platform "owner", who is never shop-scoped.
    if (user.shop_id && user.shop_status && user.shop_status !== "active") {
      return res.status(403).json({
        error: `This shop is currently ${user.shop_status}. Please contact support.`,
      });
    }
    if (user.is_active === false) {
      return res.status(403).json({ error: "This account has been deactivated." });
    }

    // 3. Generate Token
    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        role: user.role,
        shopId: user.shop_id,
        staffId: user.staff_id,
        clientId: user.client_id,
      },
      process.env.JWT_SECRET,
      { expiresIn: "24h" },
    );

    res.json({ token, user });
  }, { log: "Login Error:", message: "Login failed" }));

  // --- PROFILE ROUTE ---
  router.put("/profile", authenticateToken, notForClients, asyncHandler(async (req, res) => {
    const { firstName, lastName, email, phone } = req.body;
    const answer = await withTransaction(async (client) => {
      if (req.user.staffId) {
        const fullName = `${firstName} ${lastName}`.trim();
        await client.query(
          `UPDATE staff SET name = $1, email = $2, phone = $3 WHERE id = $4`,
          [fullName, email, phone || null, req.user.staffId],
        );
      }

      return { success: true };
    });
    res.json(answer);
  }));

  router.get("/profile", authenticateToken, notForClients, asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `
      SELECT 
        u.id as user_id, 
        u.username, 
        u.role, 
        s.name as shop_name,
        s.id as shop_id,
        s.ergotherapia as ergotherapia,
        s.physiotherapia as physiotherapia,
        s.logotherapia as logotherapia,
        s.reply_email as shop_reply_email,
        s.phone as shop_phone,
        s.address as shop_address,
        s.website as shop_website,
        s.slot_min_time,
        s.slot_max_time,
        s.show_weekends,
        s.reminder_hours_before,
        s.self_booking_enabled,
        st.id as staff_id,
        st.name as staff_name,
        st.email as staff_email,
        st.phone as staff_phone,
        st.photo_url as staff_photo_url,
        st.specialty
      FROM users u
      LEFT JOIN shops s ON u.shop_id = s.id
      LEFT JOIN staff st ON u.staff_id = st.id
      WHERE u.id = $1
    `,
      [req.user.userId],
    );

    if (rows.length === 0)
      return res.status(404).json({ error: "User not found" });

    const profile = rows[0];
    if (!profile.staff_id) {
      delete profile.staff_name;
      delete profile.staff_email;
      delete profile.staff_phone;
      delete profile.specialty;
    }

    res.json(profile);
  }));

  router.put("/profile/password", authenticateToken, notForClients, asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 4) {
      return res.status(400).json({ error: "New password is too short" });
    }
    // 1. Fetch current hashed password
    const { rows } = await pool.query(
      "SELECT password FROM users WHERE id = $1",
      [req.user.userId],
    );
    if (rows.length === 0)
      return res.status(404).json({ error: "User not found" });

    const user = rows[0];

    // 2. Securely compare current password
    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) {
      return res.status(400).json({ error: "Incorrect current password" });
    }

    // 3. Hash the NEW password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // 4. Update DB
    await pool.query("UPDATE users SET password = $1 WHERE id = $2", [
      hashedPassword,
      req.user.userId,
    ]);
    res.json({ success: true });
  }));

  // Signup Endpoint
  router.post("/signup", signupLimiter, async (req, res) => {
    const { token, password } = req.body;
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      // Only an invite link signs up (a login token has a role, not an email).
      if (isSessionToken(decoded) || !decoded.email || !decoded.clientId) {
        return res.status(400).json({ error: "Invalid or expired invitation link" });
      }

      const userCheck = await pool.query(
        "SELECT id FROM users WHERE username = $1",
        [decoded.email],
      );
      if (userCheck.rows.length > 0)
        return res
          .status(400)
          .json({ error: "An account with this email already exists" });

      const hashedPassword = await bcrypt.hash(password, 12);

      await pool.query(
        `INSERT INTO users (username, password, role, shop_id, client_id) VALUES ($1, $2, 'client', $3, $4)`,
        [decoded.email, hashedPassword, decoded.shopId, decoded.clientId],
      );

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(400).json({ error: "Invalid or expired invitation link" });
    }
  });

  return router;
};
