require("dotenv").config();
const express = require("express");
const jwt = require("jsonwebtoken");
const pool = require("./db");
const path = require("path");
const cors = require("cors");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const distPath = path.join(__dirname, "../client/dist");
app.use(express.static(distPath));

// --- HELPERS ---

// Helper to validate UUIDs
const safeUUID = (id) => {
  return id && typeof id === "string" && id.length === 36 ? id : null;
};

// Recalculate Balance Helper
const recalculateClientBalance = async (client, clientId) => {
  if (!clientId) return;
  await client.query(
    `
    UPDATE clients 
    SET outstanding_balance = (
      SELECT COALESCE(SUM(
        (SELECT COALESCE(SUM(price_override), 0) 
         FROM appointment_services aps 
         WHERE aps.appointment_id = a.id) 
        - a.deposit_amount
      ), 0)
      FROM appointments a
      WHERE a.client_id = $1 
      AND a.status != 'cancelled'
    )
    WHERE id = $1
  `,
    [clientId]
  );
};

// --- VISIBILITY HELPER ---
// If user is 'super_admin', return empty string (no filter).
// If user is standard (staff, admin, manager), filter out 'completed' unless 'save_receipt' is true.
const getVisibilityClause = (user, tableAlias = "a") => {
  if (user.role === "super_admin") {
    return "";
  }
  return ` AND (${tableAlias}.status != 'completed' OR ${tableAlias}.save_receipt = true)`;
};

// --- MIDDLEWARE ---

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET || "secret", (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    req.shopId = user.shopId;
    next();
  });
};

// --- AUTH ROUTE ---

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const result = await pool.query("SELECT * FROM users WHERE username = $1", [
      username,
    ]);

    const user = result.rows[0];

    // In production, compare hashed passwords
    if (user && user.password_hash === password) {
      const token = jwt.sign(
        {
          userId: user.id,
          shopId: user.shop_id,
          staffId: user.staff_id,
          role: user.role, // Ensure role is in token
        },
        process.env.JWT_SECRET || "secret",
        { expiresIn: "24h" }
      );

      res.json({
        token,
        user: {
          id: user.id,
          name: user.username,
          role: user.role,
          shop_id: user.shop_id,
          staff_id: user.staff_id,
        },
      });
    } else {
      res.status(401).json({ error: "Invalid credentials" });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Login error" });
  }
});

// --- PROFILE ROUTE ---

app.get("/api/v1/profile", authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT 
        u.id as user_id, 
        u.username, 
        u.role, 
        s.name as shop_name,
        s.id as shop_id,
        st.id as staff_id,
        st.name as staff_name,
        st.email as staff_email,
        st.phone as staff_phone,
        st.specialty
      FROM users u
      LEFT JOIN shops s ON u.shop_id = s.id
      LEFT JOIN staff st ON u.staff_id = st.id
      WHERE u.id = $1
    `,
      [req.user.userId]
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/v1/profile/password", authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: "New password is too short" });
  }
  try {
    const { rows } = await pool.query(
      "SELECT password_hash FROM users WHERE id = $1",
      [req.user.userId]
    );
    if (rows.length === 0)
      return res.status(404).json({ error: "User not found" });

    const user = rows[0];
    if (user.password_hash !== currentPassword) {
      return res.status(400).json({ error: "Incorrect current password" });
    }

    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
      newPassword,
      req.user.userId,
    ]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- STAFF ROUTES ---

app.get("/api/v1/staff", authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT 
        st.*,
        COALESCE(
          json_agg(ss.service_id) FILTER (WHERE ss.service_id IS NOT NULL), 
          '[]'
        ) as service_ids
      FROM staff st
      LEFT JOIN staff_services ss ON st.id = ss.staff_id
      WHERE st.is_active = true 
      AND st.shop_id = $1
      GROUP BY st.id
      ORDER BY st.name
    `,
      [req.shopId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/v1/staff", authenticateToken, async (req, res) => {
  const {
    first_name,
    last_name,
    email,
    phone,
    hourly_rate,
    color_code,
    specialty,
    service_ids = [],
  } = req.body;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const fullName = `${first_name} ${last_name}`.trim();
    const color = color_code || "#3b82f6";

    const staffRes = await client.query(
      `INSERT INTO staff (name, email, phone, hourly_rate, color_code, specialty, is_active, shop_id)
       VALUES ($1, $2, $3, $4, $5, $6, true, $7)
       RETURNING id`,
      [fullName, email, phone, hourly_rate || 0, color, specialty, req.shopId]
    );

    const newStaffId = staffRes.rows[0].id;

    if (service_ids.length > 0) {
      for (const svcId of service_ids) {
        await client.query(
          `INSERT INTO staff_services (staff_id, service_id) VALUES ($1, $2)`,
          [newStaffId, svcId]
        );
      }
    }

    await client.query("COMMIT");
    res.json({ success: true, id: newStaffId });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: "Failed to create staff" });
  } finally {
    client.release();
  }
});

app.put("/api/v1/staff/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const {
    first_name,
    last_name,
    email,
    phone,
    hourly_rate,
    specialty,
    service_ids = [],
  } = req.body;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const fullName = `${first_name} ${last_name}`.trim();

    await client.query(
      `UPDATE staff 
       SET name = $1, email = $2, phone = $3, hourly_rate = $4, specialty = $5
       WHERE id = $6 AND shop_id = $7`,
      [fullName, email, phone, hourly_rate, specialty, id, req.shopId]
    );

    await client.query(`DELETE FROM staff_services WHERE staff_id = $1`, [id]);

    if (service_ids.length > 0) {
      for (const svcId of service_ids) {
        await client.query(
          `INSERT INTO staff_services (staff_id, service_id) VALUES ($1, $2)`,
          [id, svcId]
        );
      }
    }

    await client.query("COMMIT");
    res.json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: "Failed to update staff" });
  } finally {
    client.release();
  }
});

app.delete("/api/v1/staff/:id", authenticateToken, async (req, res) => {
  try {
    await pool.query(
      "UPDATE staff SET is_active = false WHERE id = $1 AND shop_id = $2",
      [req.params.id, req.shopId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create Staff Login
app.post("/api/v1/staff/:id/login", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { username, password } = req.body;

  if (!username || !password)
    return res.status(400).json({ error: "Username and password required" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const checkUser = await client.query(
      "SELECT id FROM users WHERE username = $1",
      [username]
    );
    if (checkUser.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Username already taken" });
    }

    await client.query(
      `INSERT INTO users (username, password_hash, shop_id, staff_id, role)
       VALUES ($1, $2, $3, $4, 'staff')`,
      [username, password, req.shopId, id]
    );

    await client.query("COMMIT");
    res.json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: "Failed to create login" });
  } finally {
    client.release();
  }
});

// --- CLIENT ROUTES ---

app.get("/api/v1/clients", authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, first_name, last_name, email, phone, notes, no_show_count, total_sales, custom_fields, outstanding_balance
       FROM clients 
       WHERE shop_id = $1 
       ORDER BY last_name`,
      [req.shopId]
    );
    const data = rows.map((c) => ({
      ...c,
      full_name: `${c.first_name} ${c.last_name}`,
    }));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/v1/clients", authenticateToken, async (req, res) => {
  const {
    first_name,
    last_name,
    email,
    phone,
    notes,
    custom_fields = [],
  } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO clients (first_name, last_name, email, phone, notes, custom_fields, shop_id) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING *`,
      [
        first_name,
        last_name,
        email,
        phone,
        notes,
        JSON.stringify(custom_fields),
        req.shopId,
      ]
    );
    rows[0].full_name = `${rows[0].first_name} ${rows[0].last_name}`;
    res.json({ success: true, client: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/v1/clients/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const {
    first_name,
    last_name,
    email,
    phone,
    notes,
    custom_fields = [],
  } = req.body;
  try {
    await pool.query(
      `UPDATE clients 
       SET first_name=$1, last_name=$2, email=$3, phone=$4, notes=$5, custom_fields=$6
       WHERE id=$7 AND shop_id=$8`,
      [
        first_name,
        last_name,
        email,
        phone,
        notes,
        JSON.stringify(custom_fields),
        id,
        req.shopId,
      ]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Update failed" });
  }
});

app.delete("/api/v1/clients/:id", authenticateToken, async (req, res) => {
  try {
    await pool.query("DELETE FROM clients WHERE id = $1 AND shop_id = $2", [
      req.params.id,
      req.shopId,
    ]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- SERVICE ROUTES ---

app.get("/api/v1/services", authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM services WHERE shop_id = $1 ORDER BY name`,
      [req.shopId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/v1/services", authenticateToken, async (req, res) => {
  const { name, duration_minutes, price, category, color_code } = req.body;
  try {
    await pool.query(
      `INSERT INTO services (name, duration_minutes, price, category, color_code, shop_id) VALUES ($1, $2, $3, $4, $5, $6)`,
      [name, duration_minutes, price, category, color_code, req.shopId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/v1/services/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { name, duration_minutes, price, category, color_code } = req.body;
  try {
    await pool.query(
      `UPDATE services SET name=$1, duration_minutes=$2, price=$3, category=$4, color_code=$5 WHERE id=$6 AND shop_id=$7`,
      [name, duration_minutes, price, category, color_code, id, req.shopId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Update failed" });
  }
});

app.delete("/api/v1/services/:id", authenticateToken, async (req, res) => {
  try {
    await pool.query("DELETE FROM services WHERE id = $1 AND shop_id = $2", [
      req.params.id,
      req.shopId,
    ]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- APPOINTMENT ROUTES ---

app.get("/api/v1/appointments", authenticateToken, async (req, res) => {
  try {
    // Apply Visibility Logic
    const visibilityClause = getVisibilityClause(req.user, "a");

    const { rows } = await pool.query(
      `
      SELECT 
        a.id, a.client_id, a.status, a.internal_notes, a.booking_notes, a.deposit_amount, 
        a.payment_status, a.is_block, a.save_receipt, a.created_at,
        c.first_name, c.last_name, c.phone as client_phone,
        json_agg(
          json_build_object(
            'service_id', s.id,
            'service_name', s.name,
            'price', COALESCE(aps.price_override, s.price),
            'duration_minutes', COALESCE(aps.duration_override, s.duration_minutes),
            'staff_id', aps.staff_id,
            'staff_name', st.name,
            'start_time', aps.start_time
          )
        ) FILTER (WHERE s.id IS NOT NULL) as services
      FROM appointments a
      LEFT JOIN clients c ON a.client_id = c.id
      LEFT JOIN appointment_services aps ON aps.appointment_id = a.id
      LEFT JOIN services s ON aps.service_id = s.id
      LEFT JOIN staff st ON aps.staff_id = st.id
      WHERE a.shop_id = $1 ${visibilityClause}
      GROUP BY a.id, c.first_name, c.last_name, c.phone
      ORDER BY a.created_at DESC
    `,
      [req.shopId]
    );

    const formatted = rows.map((row) => ({
      ...row,
      services: row.services || [],
      start_time: row.services?.[0]?.start_time || row.created_at,
      staff_id: row.services?.[0]?.staff_id,
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/v1/appointments", authenticateToken, async (req, res) => {
  const {
    client_id,
    status = "new",
    internal_notes,
    booking_notes,
    deposit_amount,
    payment_status,
    is_block,
    save_receipt = false, // Default false
    services = [],
  } = req.body;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const validClientId = safeUUID(client_id);

    const apptRes = await client.query(
      `INSERT INTO appointments (client_id, status, internal_notes, booking_notes, deposit_amount, payment_status, is_block, save_receipt, shop_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW()) RETURNING id`,
      [
        is_block ? null : validClientId,
        status,
        internal_notes,
        booking_notes,
        deposit_amount || 0,
        payment_status || "unpaid",
        is_block,
        save_receipt,
        req.shopId,
      ]
    );
    const appointmentId = apptRes.rows[0].id;

    if (!is_block && services.length > 0) {
      for (const svc of services) {
        const validServiceId = safeUUID(svc.service_id);
        const validStaffId = safeUUID(svc.staff_id);

        if (validServiceId) {
          await client.query(
            `INSERT INTO appointment_services (appointment_id, service_id, staff_id, start_time, duration_override, price_override, shop_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              appointmentId,
              validServiceId,
              validStaffId,
              svc.start_time,
              svc.duration_override,
              svc.price_override,
              req.shopId,
            ]
          );
        }
      }
    }

    // Recalculate Balance
    if (validClientId) await recalculateClientBalance(client, validClientId);

    await client.query("COMMIT");
    res.json({ id: appointmentId, success: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Create Error:", err);
    res.status(500).json({ error: "Failed to create appointment" });
  } finally {
    client.release();
  }
});

app.put("/api/v1/appointments/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const {
    client_id,
    status,
    internal_notes,
    booking_notes,
    deposit_amount,
    payment_status,
    is_block,
    save_receipt, // Allow updating flag
    services = [],
  } = req.body;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const validClientId = safeUUID(client_id);

    await client.query(
      `UPDATE appointments SET
        client_id = $1, status = $2, internal_notes = $3, booking_notes = $4, deposit_amount = $5, payment_status = $6, is_block = $7, save_receipt = $8, updated_at = NOW()
       WHERE id = $9 AND shop_id = $10`,
      [
        is_block ? null : validClientId,
        status,
        internal_notes,
        booking_notes,
        deposit_amount || 0,
        payment_status || "unpaid",
        is_block,
        save_receipt || false,
        id,
        req.shopId,
      ]
    );

    await client.query(
      "DELETE FROM appointment_services WHERE appointment_id = $1",
      [id]
    );

    if (!is_block && services.length > 0) {
      for (const svc of services) {
        const validServiceId = safeUUID(svc.service_id);
        const validStaffId = safeUUID(svc.staff_id);

        if (validServiceId) {
          await client.query(
            `INSERT INTO appointment_services 
               (appointment_id, service_id, staff_id, start_time, duration_override, price_override, shop_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              id,
              validServiceId,
              validStaffId,
              svc.start_time,
              svc.duration_override || null,
              svc.price_override || null,
              req.shopId,
            ]
          );
        }
      }
    }

    // Recalculate Balance
    if (validClientId) await recalculateClientBalance(client, validClientId);

    await client.query("COMMIT");
    res.json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Update Error:", err);
    res.status(500).json({ error: "Update failed" });
  } finally {
    client.release();
  }
});

app.delete("/api/v1/appointments/:id", authenticateToken, async (req, res) => {
  try {
    await pool.query(
      "DELETE FROM appointments WHERE id = $1 AND shop_id = $2",
      [req.params.id, req.shopId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/v1/appointments/swap", authenticateToken, async (req, res) => {
  const { appointment1_id, appointment2_id } = req.body;
  if (!appointment1_id || !appointment2_id)
    return res.status(400).json({ error: "Two appointment IDs required" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const q1 = await client.query(
      `SELECT * FROM appointment_services WHERE appointment_id = $1 AND shop_id = $2 ORDER BY id`,
      [appointment1_id, req.shopId]
    );
    const q2 = await client.query(
      `SELECT * FROM appointment_services WHERE appointment_id = $1 AND shop_id = $2 ORDER BY id`,
      [appointment2_id, req.shopId]
    );

    const s1 = q1.rows;
    const s2 = q2.rows;

    for (let i = 0; i < s1.length && i < s2.length; i++) {
      await client.query(
        `UPDATE appointment_services SET start_time=$1, staff_id=$2, duration_override=$3, price_override=$4 WHERE id=$5`,
        [
          s2[i].start_time,
          s2[i].staff_id,
          s2[i].duration_override,
          s2[i].price_override,
          s1[i].id,
        ]
      );
      await client.query(
        `UPDATE appointment_services SET start_time=$1, staff_id=$2, duration_override=$3, price_override=$4 WHERE id=$5`,
        [
          s1[i].start_time,
          s1[i].staff_id,
          s1[i].duration_override,
          s1[i].price_override,
          s2[i].id,
        ]
      );
    }

    await client.query("COMMIT");
    res.json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: "Swap failed" });
  } finally {
    client.release();
  }
});

// --- TRANSACTIONS & FINANCIALS ---

app.post("/api/v1/transactions", authenticateToken, async (req, res) => {
  const {
    appointment_id,
    client_id,
    amount,
    payment_method = "card",
  } = req.body;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO transactions (appointment_id, client_id, amount, payment_method, transaction_type, shop_id, created_at)
       VALUES ($1, $2, $3, $4, 'payment', $5, NOW())`,
      [appointment_id, client_id, amount, payment_method, req.shopId]
    );

    // Calculate updated payment status
    const priceRes = await client.query(
      `SELECT SUM(price_override) as total_price FROM appointment_services WHERE appointment_id = $1`,
      [appointment_id]
    );
    const totalPrice = Number(priceRes.rows[0].total_price || 0);

    const apptRes = await client.query(
      `SELECT deposit_amount FROM appointments WHERE id = $1`,
      [appointment_id]
    );
    const currentPaid = Number(apptRes.rows[0]?.deposit_amount || 0);
    const newTotalPaid = currentPaid + Number(amount);

    const isFullyPaid = newTotalPaid >= totalPrice - 0.01;
    const newPaymentStatus = isFullyPaid ? "paid" : "partial";
    const newStatus = isFullyPaid ? "completed" : "confirmed";

    // Update appointment
    // Note: visibility logic checks 'completed' status, which is set here.
    await client.query(
      `UPDATE appointments 
       SET payment_status = $1, status = $2, deposit_amount = deposit_amount + $3 
       WHERE id = $4 AND shop_id = $5`,
      [newPaymentStatus, newStatus, amount, appointment_id, req.shopId]
    );

    await client.query(
      `UPDATE clients SET total_sales = COALESCE(total_sales, 0) + $1 WHERE id = $2 AND shop_id = $3`,
      [amount, client_id, req.shopId]
    );

    // CRITICAL: Update outstanding balance
    await recalculateClientBalance(client, client_id);

    await client.query("COMMIT");
    res.json({ success: true });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: "Payment failed" });
  } finally {
    client.release();
  }
});

app.get("/api/v1/financials", authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT t.*, c.first_name, c.last_name, s.name AS service_name
      FROM transactions t
      LEFT JOIN clients c ON t.client_id = c.id
      LEFT JOIN appointments a ON t.appointment_id = a.id
      LEFT JOIN appointment_services aps ON a.id = aps.appointment_id
      LEFT JOIN services s ON aps.service_id = s.id
      WHERE t.shop_id = $1
      ORDER BY t.created_at DESC
    `,
      [req.shopId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- REPORT ENDPOINTS (ALL FILTERED BY SHOP_ID AND VISIBILITY) ---

app.get("/api/v1/reports/appointments", authenticateToken, async (req, res) => {
  const { from, to } = req.query;
  const params = [req.shopId];

  // Apply Visibility Clause
  let whereClause = " AND a.shop_id = $1" + getVisibilityClause(req.user, "a");

  if (from) {
    params.push(from);
    whereClause += ` AND aps.start_time >= $${params.length}`;
  }
  if (to) {
    params.push(to);
    whereClause += ` AND aps.start_time <= $${params.length}`;
  }
  try {
    const { rows } = await pool.query(
      `SELECT a.id, a.client_id, a.status, a.created_at, c.first_name, c.last_name,
        json_agg(json_build_object('service_name', s.name, 'price', aps.price_override)) as services
      FROM appointments a
      LEFT JOIN clients c ON a.client_id = c.id
      LEFT JOIN appointment_services aps ON aps.appointment_id = a.id
      LEFT JOIN services s ON aps.service_id = s.id
      WHERE 1=1 ${whereClause}
      GROUP BY a.id, c.first_name, c.last_name
      ORDER BY a.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/v1/reports/clients", authenticateToken, async (req, res) => {
  const { from, to } = req.query;
  const params = [req.shopId];

  // Subquery must also respect visibility rules
  let subQuery =
    "WHERE a.shop_id = $1 AND a.client_id = c.id" +
    getVisibilityClause(req.user, "a");

  if (from) {
    params.push(from);
    subQuery += ` AND aps.start_time >= $${params.length}`;
  }
  if (to) {
    params.push(to);
    subQuery += ` AND aps.start_time <= $${params.length}`;
  }
  try {
    const { rows } = await pool.query(
      `SELECT c.*, COUNT(a.id) as appointment_count
      FROM clients c
      LEFT JOIN appointments a ON c.id = a.client_id
      WHERE c.shop_id = $1 
      AND EXISTS (SELECT 1 FROM appointments a JOIN appointment_services aps ON a.id = aps.appointment_id ${subQuery})
      GROUP BY c.id ORDER BY c.last_name`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/v1/reports/sales", authenticateToken, async (req, res) => {
  const { from, to } = req.query;
  const params = [req.shopId];

  // Base Clause
  let whereClause = "WHERE a.shop_id = $1 AND a.status = 'completed'";

  // Visibility: If not super_admin, require save_receipt = true for completed items
  if (req.user.role !== "super_admin") {
    whereClause += " AND a.save_receipt = true";
  }

  if (from) {
    params.push(from);
    whereClause += ` AND aps.start_time >= $${params.length}`;
  }
  if (to) {
    params.push(to);
    whereClause += ` AND aps.start_time <= $${params.length}`;
  }
  try {
    const { rows } = await pool.query(
      `SELECT s.name as service_name, COUNT(aps.id) as count, SUM(COALESCE(aps.price_override, s.price)) as total_revenue
      FROM appointment_services aps
      JOIN services s ON aps.service_id = s.id
      JOIN appointments a ON aps.appointment_id = a.id
      ${whereClause} GROUP BY s.name ORDER BY total_revenue DESC`,
      params
    );
    const summary = rows.reduce(
      (acc, row) => acc + Number(row.total_revenue),
      0
    );
    res.json({ summary: { total_revenue: summary }, details: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/v1/reports/staff", authenticateToken, async (req, res) => {
  const { from, to } = req.query;
  const params = [req.shopId];

  // Apply Visibility Clause
  let whereClause = "WHERE a.shop_id = $1" + getVisibilityClause(req.user, "a");

  if (from) {
    params.push(from);
    whereClause += ` AND aps.start_time >= $${params.length}`;
  }
  if (to) {
    params.push(to);
    whereClause += ` AND aps.start_time <= $${params.length}`;
  }
  try {
    const { rows } = await pool.query(
      `SELECT st.name as staff_name, COUNT(aps.id) as appointment_count,
        SUM(COALESCE(aps.duration_override, s.duration_minutes)) as total_hours,
        SUM(COALESCE(aps.price_override, s.price)) as total_revenue
      FROM appointment_services aps
      JOIN staff st ON aps.staff_id = st.id
      JOIN services s ON aps.service_id = s.id
      JOIN appointments a ON aps.appointment_id = a.id
      ${whereClause} GROUP BY st.name ORDER BY total_revenue DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/v1/reports/payments", authenticateToken, async (req, res) => {
  // Payments report usually shows all transactions. If you want to hide transactions
  // linked to "hidden" appointments, we can join appointments.
  const { from, to } = req.query;
  const params = [req.shopId];

  let whereClause = "WHERE t.shop_id = $1";

  // Visibility Filter for Payments linked to Appointments
  if (req.user.role !== "super_admin") {
    // Ensure we only see payments for valid visible appointments
    whereClause +=
      " AND (a.id IS NULL OR (a.status != 'completed' OR a.save_receipt = true))";
  }

  if (from) {
    params.push(from);
    whereClause += ` AND t.created_at >= $${params.length}`;
  }
  if (to) {
    params.push(to);
    whereClause += ` AND t.created_at <= $${params.length}`;
  }
  try {
    const { rows } = await pool.query(
      `SELECT t.*, c.first_name, c.last_name 
       FROM transactions t 
       LEFT JOIN clients c ON t.client_id = c.id 
       LEFT JOIN appointments a ON t.appointment_id = a.id
       ${whereClause} 
       ORDER BY t.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/v1/reports/finances", authenticateToken, async (req, res) => {
  const { from, to } = req.query;
  const params = [req.shopId];

  let salesWhere = "WHERE a.shop_id = $1 AND a.status = 'completed'";
  let payWhere = "WHERE t.shop_id = $1";

  // Visibility logic for non-super-admins
  if (req.user.role !== "super_admin") {
    salesWhere += " AND a.save_receipt = true";
    // For payments, we filter those attached to completed appointments without receipts
    payWhere +=
      " AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.id = t.appointment_id AND a.status='completed' AND a.save_receipt = false)";
  }

  if (from) {
    params.push(from);
    salesWhere += ` AND aps.start_time >= $${params.length}`;
    payWhere += ` AND t.created_at >= $${params.length}`;
  }
  if (to) {
    params.push(to);
    salesWhere += ` AND aps.start_time <= $${params.length}`;
    payWhere += ` AND t.created_at <= $${params.length}`;
  }
  try {
    const salesRes = await pool.query(
      `SELECT SUM(COALESCE(aps.price_override, s.price)) as total FROM appointment_services aps JOIN services s ON aps.service_id=s.id JOIN appointments a ON aps.appointment_id=a.id ${salesWhere}`,
      params
    );
    const payRes = await pool.query(
      `SELECT SUM(amount) as total FROM transactions t ${payWhere}`,
      params
    );
    res.json({
      total_sales: Number(salesRes.rows[0].total) || 0,
      total_payments: Number(payRes.rows[0].total) || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ... (other reports follow similar logic, omitted for brevity but principles apply) ...

app.get(/(.*)/, (req, res) => {
  if (req.path.startsWith("/api"))
    return res.status(404).json({ error: "Not found" });
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`)
);
