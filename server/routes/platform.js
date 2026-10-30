// The platform console (shops, their admins, demo requests): /api/v1/platform.
// Moved out of server.js; helpers that still live there are handed over when
// it mounts this router (see "Area routers" near the end of server.js).
const express = require("express");
const { HttpError, asyncHandler, withTransaction } = require("../http");
const pool = require("../db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

module.exports = function platformRouter({
  authenticateToken,
}) {
  const router = express.Router();

  // Platform console (cross-shop) is "owner"-only — a separate, shop-less role from super_admin.
  const requireOwner = (req, res, next) => {
    if (req.user.role !== "owner") {
      return res.status(403).json({ error: "Owner only" });
    }
    next();
  };

  // Accepts either `pool` or an in-flight transaction `client` so callers can log
  // atomically inside BEGIN/COMMIT blocks.
  const logPlatformActivity = async (db, actorUserId, action, targetShopId, detail) => {
    await db.query(
      `INSERT INTO platform_activity_log (actor_user_id, action, target_shop_id, detail) VALUES ($1, $2, $3, $4)`,
      [actorUserId, action, targetShopId, detail || null],
    );
  };

  router.get(
    "/platform/shops",
    authenticateToken,
    requireOwner,
    asyncHandler(async (req, res) => {
      const { search, status, plan } = req.query;
      const conditions = [];
      const params = [];

      if (search) {
        params.push(`%${search}%`);
        conditions.push(`s.name ILIKE $${params.length}`);
      }
      if (status) {
        params.push(status);
        conditions.push(`s.status = $${params.length}`);
      }
      if (plan) {
        params.push(plan);
        conditions.push(`s.plan = $${params.length}`);
      }
      const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const { rows } = await pool.query(
        `
        SELECT
          s.id, s.name, s.plan, s.status, s.owner_name, s.owner_email,
          s.trial_ends_at, s.notes, s.primary_color, s.secondary_color, s.created_at,
          COALESCE(ac.admin_count, 0) AS admin_count
        FROM shops s
        LEFT JOIN (
          SELECT shop_id, COUNT(*) AS admin_count
          FROM users
          WHERE role = 'admin' AND is_active = true
          GROUP BY shop_id
        ) ac ON ac.shop_id = s.id
        ${whereClause}
        ORDER BY s.created_at DESC
      `,
        params,
      );
      res.json(rows);
    }),
  );

  router.post(
    "/platform/shops",
    authenticateToken,
    requireOwner,
    asyncHandler(async (req, res) => {
      const {
        name,
        plan,
        status,
        owner_name,
        owner_email,
        trial_ends_at,
        notes,
        primary_color,
        secondary_color,
        admin_username,
        admin_password,
      } = req.body;

      if (!name) return res.status(400).json({ error: "Shop name is required" });

      const answer = await withTransaction(async (client) => {
      const shopRes = await client.query(
          `INSERT INTO shops
            (name, plan, status, owner_name, owner_email, trial_ends_at, notes, primary_color, secondary_color)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id`,
          [
            name,
            plan || "trial",
            status || "active",
            owner_name || null,
            owner_email || null,
            trial_ends_at || null,
            notes || null,
            primary_color || null,
            secondary_color || null,
          ],
        );
        const shopId = shopRes.rows[0].id;

        let adminCreated = false;
        if (admin_username && admin_password) {
          const hashedPassword = await bcrypt.hash(admin_password, 12);
          await client.query(
            `INSERT INTO users (username, password, role, shop_id, is_active) VALUES ($1, $2, 'admin', $3, true)`,
            [admin_username, hashedPassword, shopId],
          );
          adminCreated = true;
        }

        await logPlatformActivity(
          client,
          req.user.userId,
          "shop_created",
          shopId,
          `Created shop "${name}"${adminCreated ? ` with admin login "${admin_username}"` : ""}`,
        );

        return { success: true, id: shopId, adminCreated };
    });
    res.json(answer);
  }, { mapError: (err) => (err.code === "23505" ? { status: 400, body: { error: "Username already taken" } } : null) }),
  );

  router.put(
    "/platform/shops/:id",
    authenticateToken,
    requireOwner,
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const {
        name,
        plan,
        status,
        owner_name,
        owner_email,
        trial_ends_at,
        notes,
        primary_color,
        secondary_color,
      } = req.body;

      const fields = {
        name,
        plan,
        status,
        owner_name,
        owner_email,
        trial_ends_at,
        notes,
        primary_color,
        secondary_color,
      };

      const setClauses = [];
      const params = [];
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) {
          params.push(value);
          setClauses.push(`${key} = $${params.length}`);
        }
      }
      if (setClauses.length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }
      const before = await pool.query(
        `SELECT plan, status FROM shops WHERE id = $1`,
        [id],
      );
      if (before.rows.length === 0) {
        return res.status(404).json({ error: "Shop not found" });
      }

      params.push(id);
      const { rows } = await pool.query(
        `UPDATE shops SET ${setClauses.join(", ")} WHERE id = $${params.length} RETURNING name`,
        params,
      );

      const changes = [];
      if (plan !== undefined && plan !== before.rows[0].plan) {
        changes.push(`plan: ${before.rows[0].plan} -> ${plan}`);
        await logPlatformActivity(pool, req.user.userId, "shop_plan_changed", id, changes[changes.length - 1]);
      }
      if (status !== undefined && status !== before.rows[0].status) {
        changes.push(`status: ${before.rows[0].status} -> ${status}`);
        await logPlatformActivity(pool, req.user.userId, "shop_status_changed", id, changes[changes.length - 1]);
      }
      if (changes.length === 0) {
        await logPlatformActivity(pool, req.user.userId, "shop_updated", id, `Updated shop "${rows[0].name}"`);
      }

      res.json({ success: true });
    }),
  );

  router.get(
    "/platform/shops/:id/admins",
    authenticateToken,
    requireOwner,
    asyncHandler(async (req, res) => {
      const { rows } = await pool.query(
        `SELECT id, username, is_active, staff_id, created_at
         FROM users WHERE shop_id = $1 AND role = 'admin' ORDER BY created_at`,
        [req.params.id],
      );
      res.json(rows);
    }),
  );

  router.post(
    "/platform/shops/:id/admins",
    authenticateToken,
    requireOwner,
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: "Username and password required" });
      }

      const answer = await withTransaction(async (client) => {
      const checkUser = await client.query(
          "SELECT id FROM users WHERE username = $1",
          [username],
        );
        if (checkUser.rows.length > 0) {
          throw new HttpError(400, { error: "Username already taken" });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const insertRes = await client.query(
          `INSERT INTO users (username, password, shop_id, role, is_active)
           VALUES ($1, $2, $3, 'admin', true) RETURNING id`,
          [username, hashedPassword, id],
        );

        await logPlatformActivity(
          client,
          req.user.userId,
          "admin_created",
          id,
          `Created admin login "${username}"`,
        );

        return { success: true, id: insertRes.rows[0].id };
    });
    res.json(answer);
  }),
  );

  router.put(
    "/platform/admins/:userId",
    authenticateToken,
    requireOwner,
    asyncHandler(async (req, res) => {
      const { is_active } = req.body;
      if (typeof is_active !== "boolean") {
        return res.status(400).json({ error: "is_active (boolean) is required" });
      }
      const { rows } = await pool.query(
        `UPDATE users SET is_active = $1 WHERE id = $2 AND role = 'admin' RETURNING shop_id, username`,
        [is_active, req.params.userId],
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: "Admin not found" });
      }

      await logPlatformActivity(
        pool,
        req.user.userId,
        "admin_status_changed",
        rows[0].shop_id,
        `${is_active ? "Reactivated" : "Deactivated"} admin login "${rows[0].username}"`,
      );

      res.json({ success: true });
    }),
  );

  router.post(
    "/platform/admins/:userId/reset-password",
    authenticateToken,
    requireOwner,
    asyncHandler(async (req, res) => {
      const { newPassword } = req.body;
      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }
      const hashedPassword = await bcrypt.hash(newPassword, 12);
      const { rows } = await pool.query(
        `UPDATE users SET password = $1 WHERE id = $2 AND role = 'admin' RETURNING shop_id, username`,
        [hashedPassword, req.params.userId],
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: "Admin not found" });
      }

      await logPlatformActivity(
        pool,
        req.user.userId,
        "admin_password_reset",
        rows[0].shop_id,
        `Reset password for admin "${rows[0].username}"`,
      );

      res.json({ success: true });
    }),
  );

  // Mints a short-lived JWT scoped to the target shop so the owner can "view as"
  // that shop's admin. Allowed even for suspended shops, so the owner can go fix them.
  router.post(
    "/platform/impersonate/:shopId",
    authenticateToken,
    requireOwner,
    asyncHandler(async (req, res) => {
      const { rows } = await pool.query(
        `SELECT id, name FROM shops WHERE id = $1`,
        [req.params.shopId],
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: "Shop not found" });
      }
      const shop = rows[0];

      const impersonationToken = jwt.sign(
        {
          userId: req.user.userId,
          username: req.user.username,
          role: "admin",
          shopId: shop.id,
          staffId: null,
          clientId: null,
          impersonating: true,
          impersonatedBy: req.user.userId,
        },
        process.env.JWT_SECRET,
        { expiresIn: "2h" },
      );

      await logPlatformActivity(
        pool,
        req.user.userId,
        "impersonation_started",
        shop.id,
        `Started impersonation session as shop "${shop.name}"`,
      );

      res.json({
        token: impersonationToken,
        user: {
          role: "admin",
          shopId: shop.id,
          shopName: shop.name,
          username: req.user.username,
          impersonating: true,
        },
        expiresIn: 7200,
      });
    }),
  );

  router.get(
    "/platform/demo-requests",
    authenticateToken,
    requireOwner,
    asyncHandler(async (req, res) => {
      const { rows } = await pool.query(
        `SELECT id, name, email, shop_name, phone, message, status, created_at
         FROM demo_requests ORDER BY created_at DESC`,
      );
      res.json(rows);
    }),
  );

  router.put(
    "/platform/demo-requests/:id",
    authenticateToken,
    requireOwner,
    asyncHandler(async (req, res) => {
      const { status } = req.body;
      if (!["new", "contacted"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }
      const { rowCount } = await pool.query(
        `UPDATE demo_requests SET status = $1 WHERE id = $2`,
        [status, req.params.id],
      );
      if (rowCount === 0) {
        return res.status(404).json({ error: "Demo request not found" });
      }
      res.json({ success: true });
    }),
  );

  router.delete(
    "/platform/demo-requests/:id",
    authenticateToken,
    requireOwner,
    asyncHandler(async (req, res) => {
      const { rowCount } = await pool.query(
        `DELETE FROM demo_requests WHERE id = $1`,
        [req.params.id],
      );
      if (rowCount === 0) {
        return res.status(404).json({ error: "Demo request not found" });
      }
      res.json({ success: true });
    }),
  );

  return router;
};
