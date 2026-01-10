require("dotenv").config();
const express = require("express");
const http = require("http");
const jwt = require("jsonwebtoken");
const pool = require("./db");
const path = require("path");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const { Server } = require("socket.io");
const bcrypt = require("bcrypt");

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "http://localhost:5173";

// ==================== FILE UPLOAD SETUP ====================
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|xls|xlsx/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type"));
    }
  },
});
// ==================== MIDDLEWARE ====================
app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

const distPath = path.join(__dirname, "../dist");
app.use(express.static(distPath));
const dbFileStorage = multer.memoryStorage();
const dbFileUpload = multer({
  storage: dbFileStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB Limit
});

// --- HELPERS ---

// Helper to validate UUIDs

const safeUUID = (id) => {
  if (!id || typeof id !== "string") return null;
  const cleanId = id.trim();
  return cleanId.length === 36 ? cleanId : null;
};

const recalculateClientBalance = async (client, clientId) => {
  if (!clientId) return 0; // Return 0 instead of null

  const res = await client.query(
    `
    UPDATE clients 
    SET outstanding_balance = (
      SELECT COALESCE(SUM(
        (
          COALESCE((SELECT SUM(price_override) FROM appointment_services aps WHERE aps.appointment_id = a.id), 0) 
          + 
          COALESCE((SELECT SUM(total_price) FROM product_sales ps WHERE ps.appointment_id = a.id), 0)
        ) 
        - a.deposit_amount
      ), 0)
      FROM appointments a
      WHERE a.client_id = $1 
      AND a.status != 'cancelled'
    )
    WHERE id = $1
    RETURNING outstanding_balance
  `,
    [clientId]
  );

  // FIX: Force return of a Number, default to 0 if undefined/null
  return Number(res.rows[0]?.outstanding_balance || 0);
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
  const token = (authHeader && authHeader.split(" ")[1]) || req.query.token;

  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET || "secret", (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    req.shopId = user.shopId;
    next();
  });
};

// --- AUTH ROUTE ---

app.post("/api/v1/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    // 1. Find user by username only (don't check password in SQL)
    const result = await pool.query(
      `SELECT u.*, s.name as shop_name 
       FROM users u
       LEFT JOIN shops s ON u.shop_id = s.id
       WHERE u.username = $1`,
      [username]
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

    // 3. Generate Token
    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        role: user.role,
        shopId: user.shop_id,
        staffId: user.staff_id,
      },
      process.env.JWT_SECRET || "supersecret",
      { expiresIn: "7d" }
    );

    res.json({ token, user });
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

// --- PROFILE ROUTE ---
app.put("/api/v1/profile", authenticateToken, async (req, res) => {
  const { firstName, lastName, email, phone } = req.body;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Update Staff Record if user is linked to staff
    if (req.user.staffId) {
      const fullName = `${firstName} ${lastName}`.trim();
      await client.query(
        `UPDATE staff SET name = $1, email = $2, phone = $3 WHERE id = $4`,
        [fullName, email, phone || null, req.user.staffId]
      );
    }

    await client.query("COMMIT");
    res.json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});
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
    // 1. Fetch current hashed password
    const { rows } = await pool.query(
      "SELECT password FROM users WHERE id = $1",
      [req.user.userId]
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
  const { name, email, phone, role, color, username, password } = req.body;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Create Staff Entry
    const staffRes = await client.query(
      "INSERT INTO staff (name, email, phone, color, shop_id) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [name, email, phone, color, req.shopId]
    );
    const staffId = staffRes.rows[0].id;

    // 2. Create User Entry (with Hashed Password)
    if (username && password) {
      // HASH THE PASSWORD HERE
      const hashedPassword = await bcrypt.hash(password, 12);

      await client.query(
        "INSERT INTO users (username, password, role, staff_id, shop_id) VALUES ($1, $2, $3, $4, $5)",
        [username, hashedPassword, role || "staff", staffId, req.shopId]
      );
    }

    await client.query("COMMIT");
    res.json({ success: true, id: staffId });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: err.message });
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

    const hashedPassword = await bcrypt.hash(password, 12);

    await client.query(
      `INSERT INTO users (username, password, shop_id, staff_id, role)
       VALUES ($1, $2, $3, $4, 'staff')`,
      [username, hashedPassword, req.shopId, id]
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
    const visibilityClause = getVisibilityClause(req.user, "a");

    const { rows } = await pool.query(
      `
      SELECT 
        a.id, a.client_id, a.status, a.internal_notes, a.booking_notes, a.deposit_amount, 
        a.payment_status, a.is_block, a.save_receipt, a.created_at,
        c.first_name, c.last_name, c.phone as client_phone,
        -- Aggregate Services
        COALESCE((
          SELECT json_agg(json_build_object(
            'service_id', s.id,
            'service_name', s.name,
            'price', COALESCE(aps.price_override, s.price),
            'duration_minutes', COALESCE(aps.duration_override, s.duration_minutes),
            'staff_id', aps.staff_id,
            'staff_name', st.name,
            'start_time', aps.start_time
          ))
          FROM appointment_services aps
          LEFT JOIN services s ON aps.service_id = s.id
          LEFT JOIN staff st ON aps.staff_id = st.id
          WHERE aps.appointment_id = a.id
        ), '[]') as services,
        -- Aggregate Products
        COALESCE((
          SELECT json_agg(json_build_object(
            'product_id', ps.inventory_id,
            'quantity', ps.quantity,
            'price', CASE WHEN ps.quantity > 0 THEN ps.total_price / ps.quantity ELSE 0 END
          ))
          FROM product_sales ps
          WHERE ps.appointment_id = a.id
        ), '[]') as products
      FROM appointments a
      LEFT JOIN clients c ON a.client_id = c.id
      WHERE a.shop_id = $1 ${visibilityClause}
      GROUP BY a.id, c.first_name, c.last_name, c.phone
      ORDER BY a.created_at DESC
    `,
      [req.shopId]
    );

    const formatted = rows.map((row) => ({
      ...row,
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
    save_receipt = false,
    services = [],
    products = [],
  } = req.body;

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const validClientId = safeUUID(client_id);

    // 1. Insert the main Appointment
    const apptRes = await client.query(
      `INSERT INTO appointments (
        client_id, status, internal_notes, booking_notes, 
        deposit_amount, payment_status, is_block, save_receipt, 
        shop_id, created_at, updated_at
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW()) RETURNING id`,
      [
        is_block ? null : validClientId,
        status,
        internal_notes,
        booking_notes,
        deposit_amount || 0,
        payment_status || "unpaid",
        !!is_block, // Ensure boolean
        !!save_receipt, // Ensure boolean
        req.shopId,
      ]
    );
    const appointmentId = apptRes.rows[0].id;

    if (!is_block) {
      // 2. Insert Services
      for (const svc of services) {
        const validServiceId = safeUUID(svc.service_id);
        const validStaffId = safeUUID(svc.staff_id);
        if (validServiceId) {
          await client.query(
            `INSERT INTO appointment_services (
              appointment_id, service_id, staff_id, start_time, 
              duration_override, price_override, shop_id
            )
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

      if (products && products.length > 0) {
        for (const prod of products) {
          if (prod.product_id) {
            // FIX: Use prod.price (unit price) * quantity
            const unitPrice = Number(prod.price || 0);
            const qty = Number(prod.quantity || 1);
            const lineTotal = unitPrice * qty;

            await client.query(
              `INSERT INTO product_sales (
                appointment_id, inventory_id, staff_id, client_id, 
                quantity, total_price, shop_id, sale_date
              )
               VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
              [
                appointmentId,
                prod.product_id,
                services[0]?.staff_id || null,
                validClientId,
                qty,
                lineTotal, // FIX: Save calculated total, not undefined price_override
                req.shopId,
              ]
            );
          }
        }
      }
    }

    // 4. Recalculate Balance
    let newBalance = 0; // Variable to hold the new balance
    if (validClientId) {
      newBalance = await recalculateClientBalance(client, validClientId);
    }
    await client.query("COMMIT");
    res.json({ id: appointmentId, success: true, new_balance: newBalance });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Create Appointment Error:", err);
    // Return the actual error message to help debugging
    res
      .status(500)
      .json({ error: "Failed to create appointment", details: err.message });
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
    save_receipt,
    services = [],
    products = [], // Products array from frontend
  } = req.body;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let validClientId = safeUUID(client_id);
    if (!validClientId && !is_block) {
      return res.status(400).json({ error: "Invalid Client ID" });
    }

    // 1. Update the main appointment record
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

    // 2. Refresh Services: Delete old and insert new
    await client.query(
      "DELETE FROM appointment_services WHERE appointment_id = $1",
      [id]
    );
    if (!is_block) {
      for (const svc of services) {
        const validServiceId = safeUUID(svc.service_id);
        const validStaffId = safeUUID(svc.staff_id);
        if (validServiceId) {
          await client.query(
            `INSERT INTO appointment_services (appointment_id, service_id, staff_id, start_time, duration_override, price_override, shop_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              id,
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

    // 3. Refresh Products: Delete old and insert new
    // Note: In a production app, you might want to return stock to inventory before deleting
    await client.query("DELETE FROM product_sales WHERE appointment_id = $1", [
      id,
    ]);
    if (!is_block) {
      for (const prod of products) {
        if (prod.product_id) {
          // FIX: Use prod.price (unit price) * quantity
          const unitPrice = Number(prod.price || 0);
          const qty = Number(prod.quantity || 1);
          const lineTotal = unitPrice * qty;

          await client.query(
            `INSERT INTO product_sales (appointment_id, inventory_id, staff_id, client_id, quantity, total_price, shop_id, sale_date)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
            [
              id,
              prod.product_id,
              services[0]?.staff_id || null,
              validClientId,
              qty,
              lineTotal, // FIX: Save calculated total
              req.shopId,
            ]
          );

          // Note: Stock management on update requires tracking previous quantities
          // This simple version assumes the stock was handled at initial sale
        }
      }
    }

    let newBalance = 0;
    if (validClientId) {
      newBalance = await recalculateClientBalance(client, validClientId);
    }
    await client.query("COMMIT");
    res.json({ success: true, new_balance: newBalance });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Update Appointment Error:", err);
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

const io = new Server(server, {
  cors: {
    // You can use an array or a single string from your .env
    origin: [ALLOWED_ORIGIN, "http://localhost:5173"],
    credentials: true,
  },
});

// Socket.IO Authentication Middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("Authentication error"));

  jwt.verify(token, process.env.JWT_SECRET || "secret", (err, user) => {
    if (err) return next(new Error("Authentication error"));
    socket.user = user;
    next();
  });
});

// Socket.IO Connection Handler
io.on("connection", (socket) => {
  socket.join(`shop:${socket.user.shopId}`);

  socket.on("channel:join", ({ channelId }) => {
    socket.join(`channel:${channelId}`);
  });

  socket.on("chat:message", async (data) => {
    const {
      channelId,
      content,
      messageType,
      fileName,
      fileSize,
      fileType,
      fileBase64, // The base64 string from the upload route
    } = data;

    try {
      // Convert base64 back to Buffer for Postgres BYTEA
      const binaryData = fileBase64 ? Buffer.from(fileBase64, "base64") : null;

      const result = await pool.query(
        `INSERT INTO chat_messages (
    channel_id, user_id, content, message_type, 
    file_name, file_size, file_type, file_blob, created_at
  )
  VALUES ($1, $2, pgp_sym_encrypt($3, $9), $4, $5, $6, $7, $8, NOW())
  RETURNING id, channel_id, user_id, 
            pgp_sym_decrypt(content::bytea, $9) as content, 
            message_type, file_name, file_size, file_type, created_at`,
        [
          channelId,
          socket.user.userId,
          content, // $3: Plain text content to be encrypted
          messageType || "text",
          fileName || null,
          fileSize || null,
          fileType || null,
          binaryData,
          process.env.MESSAGE_ENCRYPTION_KEY || "SecretKey123", // $9: The Key
        ]
      );

      const message = result.rows[0];

      const userResult = await pool.query(
        `SELECT u.id, u.username, s.name as staff_name 
         FROM users u LEFT JOIN staff s ON u.staff_id = s.id 
         WHERE u.id = $1`,
        [socket.user.userId]
      );

      const messageWithUser = {
        ...message,
        user: userResult.rows[0],
        read_by: [],
        // IMPORTANT: We don't broadcast the huge BLOB over socket.
        // We broadcast the ID, and frontend uses the /file/:id route to see it.
      };

      io.to(`channel:${channelId}`).emit("chat:message", messageWithUser);

      await pool.query(
        `UPDATE chat_channels SET updated_at = NOW() WHERE id = $1`,
        [channelId]
      );
    } catch (err) {
      console.error("Socket Message Error:", err);
      socket.emit("chat:error", { error: "Failed to save message" });
    }
  });

  socket.on("chat:typing", ({ channelId, isTyping }) => {
    socket.to(`channel:${channelId}`).emit("chat:typing", {
      userId: socket.user.userId,
      isTyping,
    });
  });
  // server.js - Inside io.on("connection", (socket) => { ... })

  socket.on("chat:read:bulk", async ({ channelId, messageIds }) => {
    if (!messageIds || messageIds.length === 0) return;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Insert receipts for all provided IDs
      for (const msgId of messageIds) {
        await client.query(
          `INSERT INTO message_read_receipts (message_id, user_id, read_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (message_id, user_id) DO NOTHING`,
          [msgId, socket.user.userId]
        );
      }

      // 2. Update the last_read_at for the channel member
      await client.query(
        `UPDATE channel_members 
       SET last_read_at = NOW() 
       WHERE channel_id = $1 AND user_id = $2`,
        [channelId, socket.user.userId]
      );

      await client.query("COMMIT");

      // 3. Notify everyone in the channel that these messages were read
      io.to(`channel:${channelId}`).emit("messages:read:bulk:update", {
        messageIds,
        userId: socket.user.userId,
        channelId,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Bulk read error:", err);
    } finally {
      client.release();
    }
  });
  socket.on("chat:read", async ({ channelId, messageId }) => {
    try {
      await pool.query(
        `INSERT INTO message_read_receipts (message_id, user_id, read_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (message_id, user_id) DO UPDATE SET read_at = NOW()`,
        [messageId, socket.user.userId]
      );

      await pool.query(
        `UPDATE channel_members 
         SET last_read_at = NOW() 
         WHERE channel_id = $1 AND user_id = $2`,
        [channelId, socket.user.userId]
      );

      io.to(`channel:${channelId}`).emit("chat:read", {
        messageId,
        userId: socket.user.userId,
      });
    } catch (err) {
      console.error("Error marking as read:", err);
    }
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.user.userId}`);
  });
});

console.log("✅ Socket.IO initialized");
// ==================== CHAT API ROUTES ====================

// Get all channels for user's shop
app.get("/api/v1/chat/channels", authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.*, 
        (SELECT COUNT(*) FROM channel_members WHERE channel_id = c.id) as member_count,
        (SELECT COUNT(*) 
         FROM chat_messages m 
         LEFT JOIN message_read_receipts r ON m.id = r.message_id AND r.user_id = $1
         WHERE m.channel_id = c.id 
         AND m.created_at > COALESCE((SELECT last_read_at FROM channel_members WHERE channel_id = c.id AND user_id = $1), '1970-01-01')
         AND r.id IS NULL
         AND m.user_id != $1
        ) as unread_count
       FROM chat_channels c
       JOIN channel_members cm ON c.id = cm.channel_id
       WHERE cm.user_id = $1 AND c.shop_id = $2
       ORDER BY c.updated_at DESC`,
      [req.user.userId, req.shopId]
    );
    res.json(rows);
  } catch (err) {
    console.error("Error fetching channels:", err);
    res.status(500).json({ error: err.message });
  }
});

// Create new channel
app.post("/api/v1/chat/channels", authenticateToken, async (req, res) => {
  const { name, description, memberIds = [] } = req.body;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const channelResult = await client.query(
      `INSERT INTO chat_channels (shop_id, name, description, created_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.shopId, name, description, req.user.userId]
    );

    const channel = channelResult.rows[0];

    await client.query(
      `INSERT INTO channel_members (channel_id, user_id) VALUES ($1, $2)`,
      [channel.id, req.user.userId]
    );

    for (const userId of memberIds) {
      if (userId !== req.user.userId) {
        await client.query(
          `INSERT INTO channel_members (channel_id, user_id) VALUES ($1, $2)`,
          [channel.id, userId]
        );
      }
    }

    await client.query("COMMIT");
    res.json(channel);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error creating channel:", err);
    res.status(500).json({ error: "Failed to create channel" });
  } finally {
    client.release();
  }
});

// Get messages for a channel
app.get(
  "/api/v1/chat/channels/:channelId/messages",
  authenticateToken,
  async (req, res) => {
    const { channelId } = req.params;
    const { limit = 100, before } = req.query;

    try {
      const memberCheck = await pool.query(
        `SELECT 1 FROM channel_members WHERE channel_id = $1 AND user_id = $2`,
        [channelId, req.user.userId]
      );

      if (memberCheck.rows.length === 0) {
        return res.status(403).json({ error: "Not a member of this channel" });
      }

      let query = `
  SELECT m.id, m.channel_id, m.user_id, m.message_type,
    -- Decrypt the content here
    pgp_sym_decrypt(m.content::bytea, $1) as content,
    m.file_name, m.file_size, m.file_type, m.created_at,
    json_build_object(
      'id', u.id,
      'username', u.username,
      'staff_name', s.name
    ) as user,
    COALESCE(
      json_agg(
        json_build_object('user_id', r.user_id, 'read_at', r.read_at)
      ) FILTER (WHERE r.id IS NOT NULL),
      '[]'
    ) as read_by
  FROM chat_messages m
  JOIN users u ON m.user_id = u.id
  LEFT JOIN staff s ON u.staff_id = s.id
  LEFT JOIN message_read_receipts r ON m.id = r.message_id
  WHERE m.channel_id = $2
`;

      // Update params to include the key first
      const params = [
        process.env.MESSAGE_ENCRYPTION_KEY || "SecretKey123",
        channelId,
      ];

      if (before) {
        params.push(before);
        query += ` AND m.created_at < $${params.length}`;
      }

      query += ` GROUP BY m.id, u.id, u.username, s.name
           ORDER BY m.created_at DESC
           LIMIT $${params.length + 1}`;
      params.push(limit);

      const { rows } = await pool.query(query, params);

      res.json(rows.reverse());
    } catch (err) {
      console.error("Error fetching messages:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

// Get all shop users for adding to channels
app.get("/api/v1/chat/shop-users", authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.username, s.name as staff_name
       FROM users u
       LEFT JOIN staff s ON u.staff_id = s.id
       WHERE u.shop_id = $1
       ORDER BY s.name, u.username`,
      [req.shopId]
    );
    res.json(rows);
  } catch (err) {
    console.error("Error fetching shop users:", err);
    res.status(500).json({ error: err.message });
  }
});

// Create new channel
app.post("/api/v1/chat/channels", authenticateToken, async (req, res) => {
  const { name, description, memberIds = [] } = req.body;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const channelResult = await client.query(
      `INSERT INTO chat_channels (shop_id, name, description, created_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.shopId, name, description, req.user.userId]
    );

    const channel = channelResult.rows[0];

    await client.query(
      `INSERT INTO channel_members (channel_id, user_id) VALUES ($1, $2)`,
      [channel.id, req.user.userId]
    );

    for (const userId of memberIds) {
      if (userId !== req.user.userId) {
        await client.query(
          `INSERT INTO channel_members (channel_id, user_id) VALUES ($1, $2)`,
          [channel.id, userId]
        );
      }
    }

    await client.query("COMMIT");

    // Notify all members via Socket.IO
    io.to(`shop:${req.shopId}`).emit("chat:channel:created", channel);

    res.json(channel);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error creating channel:", err);
    res.status(500).json({ error: "Failed to create channel" });
  } finally {
    client.release();
  }
});

// Get messages for a channel
app.get(
  "/api/v1/chat/channels/:channelId/messages",
  authenticateToken,
  async (req, res) => {
    const { channelId } = req.params;
    const { limit = 100, before } = req.query;

    try {
      const memberCheck = await pool.query(
        `SELECT 1 FROM channel_members WHERE channel_id = $1 AND user_id = $2`,
        [channelId, req.user.userId]
      );

      if (memberCheck.rows.length === 0) {
        return res.status(403).json({ error: "Not a member of this channel" });
      }

      let query = `
      SELECT m.*, 
        json_build_object(
          'id', u.id,
          'username', u.username,
          'staff_name', s.name
        ) as user,
        COALESCE(
          json_agg(
            json_build_object('user_id', r.user_id, 'read_at', r.read_at)
          ) FILTER (WHERE r.id IS NOT NULL),
          '[]'
        ) as read_by
      FROM chat_messages m
      JOIN users u ON m.user_id = u.id
      LEFT JOIN staff s ON u.staff_id = s.id
      LEFT JOIN message_read_receipts r ON m.id = r.message_id
      WHERE m.channel_id = $1
    `;

      const params = [channelId];

      if (before) {
        params.push(before);
        query += ` AND m.created_at < $${params.length}`;
      }

      query += ` GROUP BY m.id, u.id, u.username, s.name
               ORDER BY m.created_at DESC
               LIMIT $${params.length + 1}`;
      params.push(limit);

      const { rows } = await pool.query(query, params);
      res.json(rows.reverse());
    } catch (err) {
      console.error("Error fetching messages:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

const fileStorage = multer.memoryStorage();
const fileUpload = multer({
  storage: fileStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

app.post(
  "/api/v1/chat/upload",
  authenticateToken,
  fileUpload.single("file"),
  (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    try {
      // Correctly handle Greek/Special characters in filename
      const originalName = Buffer.from(
        req.file.originalname,
        "latin1"
      ).toString("utf8");

      // We return the base64 for the frontend "Optimistic" UI
      const base64Data = req.file.buffer.toString("base64");

      res.json({
        url: `data:${req.file.mimetype};base64,${base64Data}`,
        name: originalName,
        size: req.file.size,
        type: req.file.mimetype,
        // We pass the base64 string so the frontend can send it back via Socket.IO
        base64: base64Data,
      });
    } catch (err) {
      res.status(500).json({ error: "Upload processing failed" });
    }
  }
);

app.get("/api/v1/chat/file/:messageId", authenticateToken, async (req, res) => {
  try {
    const { messageId } = req.params;
    const { rows } = await pool.query(
      "SELECT file_blob, file_type, file_name FROM chat_messages WHERE id = $1",
      [messageId]
    );

    if (rows.length === 0 || !rows[0].file_blob) {
      return res.status(404).json({ error: "File not found" });
    }

    const { file_blob, file_type, file_name } = rows[0];

    // Handle filename with special characters for download
    const encodedName = encodeURIComponent(file_name);

    res.setHeader("Content-Type", file_type || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodedName}`
    );
    res.send(file_blob);
  } catch (err) {
    res.status(500).send("Error retrieving file");
  }
});

// Get channel members
app.get(
  "/api/v1/chat/channels/:channelId/members",
  authenticateToken,
  async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT u.id, u.username, s.name as staff_name, cm.joined_at, cm.last_read_at
       FROM channel_members cm
       JOIN users u ON cm.user_id = u.id
       LEFT JOIN staff s ON u.staff_id = s.id
       WHERE cm.channel_id = $1
       ORDER BY s.name, u.username`,
        [req.params.channelId]
      );
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Add member to channel
app.post(
  "/api/v1/chat/channels/:channelId/members",
  authenticateToken,
  async (req, res) => {
    const { userId } = req.body;

    try {
      await pool.query(
        `INSERT INTO channel_members (channel_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (channel_id, user_id) DO NOTHING`,
        [req.params.channelId, userId]
      );
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Get all shop users for adding to channels
app.get("/api/v1/chat/shop-users", authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.username, s.name as staff_name
       FROM users u
       LEFT JOIN staff s ON u.staff_id = s.id
       WHERE u.shop_id = $1
       ORDER BY s.name, u.username`,
      [req.shopId]
    );
    res.json(rows);
  } catch (err) {
    console.error("Error fetching shop users:", err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== KEEP ALL YOUR OTHER ROUTES ====================
// (Profile, Staff, Clients, Services, Appointments, Reports, etc.)
// ... Copy all routes from your original server.js here ...

app.get("/api/v1/profile", authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id as user_id, u.username, u.role, 
        s.name as shop_name, s.id as shop_id,
        st.id as staff_id, st.name as staff_name,
        st.email as staff_email, st.phone as staff_phone, st.specialty
      FROM users u
      LEFT JOIN shops s ON u.shop_id = s.id
      LEFT JOIN staff st ON u.staff_id = st.id
      WHERE u.id = $1`,
      [req.user.userId]
    );

    if (rows.length === 0)
      return res.status(404).json({ error: "User not found" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// Get all products with their inventory variations for a shop
app.get("/api/v1/products", authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.name, p.description, 
        json_agg(
          json_build_object(
            'id', pi.id, 
            'variation_name', pi.variation_name, 
            'price', pi.price,
            'stock_quantity', pi.stock_quantity
          ) ORDER BY pi.price ASC
        ) as variations
       FROM products p
       LEFT JOIN product_inventory pi ON p.id = pi.product_id
       WHERE p.shop_id = $1
       GROUP BY p.id, p.name
       ORDER BY p.name ASC`,
      [req.shopId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a new product with variations
app.post("/api/v1/products", authenticateToken, async (req, res) => {
  const { name, description, variations } = req.body; // variations is an array
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const productRes = await client.query(
      `INSERT INTO products (name, description, shop_id) VALUES ($1, $2, $3) RETURNING id`,
      [name, description, req.shopId]
    );
    const productId = productRes.rows[0].id;

    for (const v of variations) {
      await client.query(
        `INSERT INTO product_inventory (product_id, variation_name, price, stock_quantity)
         VALUES ($1, $2, $3, $4)`,
        [productId, v.variation_name, v.price, v.stock_quantity]
      );
    }

    await client.query("COMMIT");
    res.json({ success: true, productId });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Update stock (Simple increment/decrement)
app.patch(
  "/api/v1/inventory/:id/stock",
  authenticateToken,
  async (req, res) => {
    const { quantity } = req.body; // can be negative to subtract
    try {
      const { rows } = await pool.query(
        `UPDATE product_inventory 
       SET stock_quantity = stock_quantity + $1 
       WHERE id = $2 RETURNING stock_quantity`,
        [quantity, req.params.id]
      );
      res.json(rows[0]);
    } catch (err) {
      res.status(500).json({ error: "Insufficient stock or update failed" });
    }
  }
);
app.put("/api/v1/products/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { name, description, variations } = req.body;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Update parent product
    await client.query(
      `UPDATE products SET name = $1, description = $2, updated_at = NOW() 
       WHERE id = $3 AND shop_id = $4`,
      [name, description, id, req.shopId]
    );

    // 2. Handle variations
    for (const v of variations) {
      if (v.id && !String(v.id).startsWith("temp-")) {
        // Update existing variation
        await client.query(
          `UPDATE product_inventory 
           SET variation_name = $1, price = $2, stock_quantity = $3, updated_at = NOW()
           WHERE id = $4 AND product_id = $5`,
          [v.variation_name, v.price, v.stock_quantity, v.id, id]
        );
      } else {
        // Insert new variation added during edit
        await client.query(
          `INSERT INTO product_inventory (product_id, variation_name, price, stock_quantity)
           VALUES ($1, $2, $3, $4)`,
          [id, v.variation_name, v.price, v.stock_quantity]
        );
      }
    }

    await client.query("COMMIT");
    res.json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});
app.delete("/api/v1/products/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    // Ensure the product belongs to the user's shop for security
    const result = await pool.query(
      "DELETE FROM products WHERE id = $1 AND shop_id = $2",
      [id, req.shopId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Delete Product Error:", err);
    res.status(500).json({ error: "Failed to delete product" });
  }
});
// GET FULL CLIENT PROFILE (Info + History + File Metadata)
app.get("/api/v1/clients/:id/full", authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    // 1. Fetch Client Details
    const clientRes = await pool.query(
      `SELECT * FROM clients WHERE id = $1 AND shop_id = $2`,
      [id, req.shopId]
    );

    if (clientRes.rows.length === 0) {
      return res.status(404).json({ error: "Client not found" });
    }
    const client = clientRes.rows[0];

    // 2. Fetch Appointment History
    // FIX: logic calculates start_time from subquery and orders by it safely
    const historyRes = await pool.query(
      `SELECT 
          a.id, 
          a.status, 
          a.deposit_amount,
          a.created_at,
          -- Get the earliest service start time for this appointment
          (
            SELECT MIN(start_time) 
            FROM appointment_services 
            WHERE appointment_id = a.id
          ) as start_time,
          
          -- Sum of services prices
          COALESCE((
            SELECT SUM(price_override) 
            FROM appointment_services 
            WHERE appointment_id = a.id
          ), 0) as total_service_price,
          
          -- Sum of product sales linked to this appointment
          COALESCE((
            SELECT SUM(total_price) 
            FROM product_sales 
            WHERE appointment_id = a.id
          ), 0) as total_product_price,
          
          -- Concatenate service names
          (
            SELECT string_agg(s.name, ', ') 
            FROM appointment_services aps 
            JOIN services s ON aps.service_id = s.id 
            WHERE aps.appointment_id = a.id
          ) as service_names

       FROM appointments a
       WHERE a.client_id = $1 AND a.shop_id = $2
       
       -- Order by the calculated start_time (using index 5 to avoid alias ambiguity)
       ORDER BY 5 DESC`,
      [id, req.shopId]
    );

    // 3. Fetch File Metadata
    const filesRes = await pool.query(
      `SELECT id, file_name, file_type, file_size, uploaded_at 
       FROM client_files 
       WHERE client_id = $1 ORDER BY uploaded_at DESC`,
      [id]
    );

    res.json({
      client: {
        ...client,
        full_name: `${client.first_name} ${client.last_name}`,
      },
      history: historyRes.rows,
      files: filesRes.rows,
    });
  } catch (err) {
    console.error("Profile Fetch Error:", err);
    // Return JSON error so frontend doesn't crash with SyntaxError
    res.status(500).json({ error: err.message });
  }
});

// UPLOAD CLIENT FILE (Saved as BLOB)
app.post(
  "/api/v1/clients/:id/files",
  authenticateToken,
  dbFileUpload.single("file"),
  async (req, res) => {
    const { id } = req.params;
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    try {
      // Fix encoding for special characters
      const originalName = Buffer.from(
        req.file.originalname,
        "latin1"
      ).toString("utf8");

      await pool.query(
        `INSERT INTO client_files (client_id, file_name, file_type, file_size, file_data)
       VALUES ($1, $2, $3, $4, $5)`,
        [id, originalName, req.file.mimetype, req.file.size, req.file.buffer]
      );

      res.json({ success: true });
    } catch (err) {
      console.error("File Upload Error:", err);
      res.status(500).json({ error: "Failed to upload file" });
    }
  }
);

// DOWNLOAD CLIENT FILE
app.get(
  "/api/v1/clients/files/:fileId",
  authenticateToken,
  async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT cf.file_data, cf.file_type, cf.file_name 
       FROM client_files cf
       JOIN clients c ON cf.client_id = c.id
       WHERE cf.id = $1 AND c.shop_id = $2`,
        [req.params.fileId, req.shopId]
      );

      if (rows.length === 0)
        return res.status(404).json({ error: "File not found" });

      const file = rows[0];
      const encodedName = encodeURIComponent(file.file_name);

      res.setHeader("Content-Type", file.file_type);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodedName}`
      );
      res.send(file.file_data);
    } catch (err) {
      res.status(500).json({ error: "Download failed" });
    }
  }
);

// DELETE CLIENT FILE
app.delete(
  "/api/v1/clients/files/:fileId",
  authenticateToken,
  async (req, res) => {
    try {
      await pool.query(
        `DELETE FROM client_files cf
       USING clients c
       WHERE cf.client_id = c.id AND cf.id = $1 AND c.shop_id = $2`,
        [req.params.fileId, req.shopId]
      );
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Delete failed" });
    }
  }
);
app.get("/api/v1/exercises", authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM exercises WHERE shop_id = $1 ORDER BY category, name`,
      [req.shopId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Create a New Exercise (Master List)
app.post("/api/v1/exercises", authenticateToken, async (req, res) => {
  const { name, category, description } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO exercises (shop_id, name, category, description) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.shopId, name, category || "General", description]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Get Exercises Completed by Specific Client
app.get(
  "/api/v1/clients/:id/exercises",
  authenticateToken,
  async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT exercise_id FROM client_exercises WHERE client_id = $1`,
        [req.params.id]
      );
      // Return simple array of IDs: ['uuid-1', 'uuid-2']
      res.json(rows.map((r) => r.exercise_id));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// 4. Toggle Exercise Status (Check/Uncheck)
app.post(
  "/api/v1/clients/:id/exercises/toggle",
  authenticateToken,
  async (req, res) => {
    const { id } = req.params; // Client ID
    const { exerciseId, completed } = req.body;

    try {
      if (completed) {
        // Check: Insert record
        await pool.query(
          `INSERT INTO client_exercises (client_id, exercise_id) 
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [id, exerciseId]
        );
      } else {
        // Uncheck: Delete record
        await pool.query(
          `DELETE FROM client_exercises WHERE client_id = $1 AND exercise_id = $2`,
          [id, exerciseId]
        );
      }
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to update exercise status" });
    }
  }
);
app.delete("/api/v1/exercises/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  // Security Check: Only allow Admins/Super Admins
  if (req.user.role !== "admin" && req.user.role !== "super_admin") {
    return res.status(403).json({ error: "Unauthorized: Admins only" });
  }

  try {
    const result = await pool.query(
      "DELETE FROM exercises WHERE id = $1 AND shop_id = $2 RETURNING *",
      [id, req.shopId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Exercise not found" });
    }

    res.json({ success: true, message: "Exercise deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete exercise" });
  }
});
app.get(/(.*)/, (req, res) => {
  if (req.path.startsWith("/api")) {
    return res.status(404).json({ error: "API Route Not Found" });
  }
  res.sendFile(path.join(distPath, "index.html"));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`Allowed Origin: ${ALLOWED_ORIGIN}`);
});
