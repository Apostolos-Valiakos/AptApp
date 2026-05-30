require("dotenv").config();

// Fail fast if critical secrets are missing
if (!process.env.JWT_SECRET) {
  console.error("FATAL: JWT_SECRET environment variable is not set");
  process.exit(1);
}
if (!process.env.MESSAGE_ENCRYPTION_KEY) {
  console.error(
    "FATAL: MESSAGE_ENCRYPTION_KEY environment variable is not set",
  );
  process.exit(1);
}

const express = require("express");
const http = require("http");
const jwt = require("jsonwebtoken");
const pool = require("./db");
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const fs = require("fs");
const { Server } = require("socket.io");
const bcrypt = require("bcrypt");

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : ["http://localhost:5173"];

const allowedOrigins = [ALLOWED_ORIGIN, "http://localhost:5173", "http://localhost:3000"];

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many login attempts, please try again in 15 minutes" },
  standardHeaders: true,
  legacyHeaders: false,
});

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: "Too many signup attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

const publicActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Too many requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

require("./reminderService");

// ==================== FILE UPLOAD SETUP ====================
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  },
});
// --- HELPER: Check for duplicate appointment ---
const checkAppointmentExists = async (
  client,
  shopId,
  clientId,
  startTime,
  staffId,
) => {
  // Add staffId to the initial check so we don't query with undefined
  if (!clientId || !startTime || !staffId) return false;

  const res = await client.query(
    `SELECT 1 
     FROM appointments a
     JOIN appointment_services aps ON a.id = aps.appointment_id
     WHERE a.shop_id = $1 
       AND a.client_id = $2
       AND aps.start_time = $3
       AND aps.staff_id = $4 
       AND a.status != 'cancelled'
     LIMIT 1`,
    [shopId, clientId, startTime, staffId], // <-- Add staffId here
  );
  return res.rows.length > 0;
};

const eoppyReport = (rows) => {
  return rows.reduce(
    (acc, row) => {
      // Determine the key based on boolean is_eoppy
      const category = row.is_eoppy ? "eoppy_count" : "non_eoppy_count";

      // Initialize category if it's the first time we see it
      if (!acc[category]) {
        acc[category] = { total: 0, services: {} };
      }

      // Add to the total and map the service name to its count
      acc[category].total += row.service_count;
      acc[category].services[row.service_name] = row.service_count;

      return acc;
    },
    {
      eoppy_count: { total: 0, services: {} },
      non_eoppy_count: { total: 0, services: {} },
    },
  );
};

const addRecurrenceInterval = (date, freq) => {
  const result = new Date(date);
  if (freq === "Daily") result.setDate(result.getDate() + 1);
  if (freq === "Weekly") result.setDate(result.getDate() + 7);
  if (freq === "Bi-Weekly") result.setDate(result.getDate() + 14);
  if (freq === "Monthly") result.setMonth(result.getMonth() + 1);
  return result;
};
const getGroupDetails = async (client, id, shopId) => {
  const res = await client.query(
    "SELECT group_id, (SELECT start_time FROM appointment_services WHERE appointment_id = appointments.id LIMIT 1) as start_time FROM appointments WHERE id = $1 AND shop_id = $2",
    [id, shopId],
  );
  return res.rows[0];
};
// --- HELPER: Create Appointment Series ---
const createAppointmentSeries = async (client, data, shopId) => {
  const {
    client_id,
    status = "new",
    internal_notes,
    booking_notes,
    deposit_amount,
    payment_status,
    is_block,
    save_receipt = false,
    is_eoppy = false,
    services = [],
    products = [],
    recurrence,
    group_id_override,
  } = data;

  const crypto = require("crypto");
  const groupId =
    group_id_override || (recurrence ? crypto.randomUUID() : null);
  const recurrenceRule = recurrence ? JSON.stringify(recurrence) : null;
  const validClientId = safeUUID(client_id);

  let datesToBook = [new Date(services[0]?.start_time || new Date())];

  if (recurrence && recurrence.end_date) {
    let nextDate = addRecurrenceInterval(datesToBook[0], recurrence.freq);
    const endDate = new Date(recurrence.end_date);

    // Safety Limit: Max 52 appointments
    while (nextDate <= endDate && datesToBook.length < 52) {
      datesToBook.push(new Date(nextDate));
      nextDate = addRecurrenceInterval(nextDate, recurrence.freq);
    }
  }

  let firstAppointmentId = null;

  for (let i = 0; i < datesToBook.length; i++) {
    const currentDate = datesToBook[i];
    const isFirstInstance = i === 0;

    // Calculate the start time for this instance to check for collisions
    const originalStart = new Date(services[0]?.start_time);
    const instanceStart = new Date(currentDate);
    instanceStart.setHours(
      originalStart.getHours(),
      originalStart.getMinutes(),
      0,
      0,
    );
    const instanceStartIso = instanceStart.toISOString();
    const staffId = services[0]?.staff_id;

    // === DUPLICATE CHECK ===
    if (!is_block && validClientId) {
      const exists = await checkAppointmentExists(
        client,
        shopId,
        validClientId,
        instanceStartIso,
        staffId, // <-- Pass it into the helper
      );
      if (exists) {
        continue;
      }
    }

    const currentEoppyStatus = !!is_eoppy;

    const instanceDeposit = isFirstInstance ? deposit_amount || 0 : 0;
    const instancePaymentStatus = isFirstInstance
      ? payment_status || "unpaid"
      : "unpaid";

    const apptRes = await client.query(
      `INSERT INTO appointments (
        client_id, status, internal_notes, booking_notes, 
        deposit_amount, payment_status, is_block, save_receipt, is_eoppy,
        shop_id, created_at, updated_at,
        group_id, recurrence 
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW(), $11, $12) 
      RETURNING id`,
      [
        is_block ? null : validClientId,
        status,
        internal_notes,
        booking_notes,
        instanceDeposit,
        instancePaymentStatus,
        !!is_block,
        !!save_receipt,
        currentEoppyStatus,
        shopId,
        groupId,
        recurrenceRule,
      ],
    );
    const appointmentId = apptRes.rows[0].id;
    if (isFirstInstance) firstAppointmentId = appointmentId;

    if (!is_block) {
      for (const svc of services) {
        const validServiceId = safeUUID(svc.service_id);
        const validStaffId = safeUUID(svc.staff_id);

        if (validServiceId) {
          await client.query(
            `INSERT INTO appointment_services (
              appointment_id, service_id, staff_id, start_time, 
              duration_override, price_override, shop_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              appointmentId,
              validServiceId,
              validStaffId,
              instanceStartIso, // Use the calculated ISO time
              svc.duration_override,
              svc.price_override,
              shopId,
            ],
          );
        }
      }

      // Products logic remains the same (usually only for first instance)
      if (isFirstInstance && products && products.length > 0) {
        // ... existing product logic ...
        for (const prod of products) {
          if (prod.product_id) {
            const unitPrice = Number(prod.price || 0);
            const qty = Number(prod.quantity || 1);
            const lineTotal = unitPrice * qty;

            await client.query(
              `INSERT INTO product_sales (
                    appointment_id, inventory_id, staff_id, client_id, 
                    quantity, total_price, shop_id, sale_date
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
              [
                appointmentId,
                prod.product_id,
                services[0]?.staff_id || null,
                validClientId,
                qty,
                lineTotal,
                shopId,
              ],
            );
          }
        }
      }
    }
  }
  return { firstAppointmentId, validClientId };
};

// --- HELPER: Perform Single Update ---
const performSingleUpdate = async (client, id, shopId, body) => {
  const {
    client_id,
    status,
    internal_notes,
    booking_notes,
    deposit_amount,
    payment_status,
    is_block,
    save_receipt,
    is_eoppy,
    services = [],
    products = [],
  } = body;

  const validClientId = safeUUID(client_id);

  await client.query(
    `UPDATE appointments SET
      client_id = $1, status = $2, internal_notes = $3, booking_notes = $4, 
      deposit_amount = $5, payment_status = $6, is_block = $7, save_receipt = $8,is_eoppy = $9, updated_at = NOW()
    WHERE id = $10 AND shop_id = $11`,
    [
      is_block ? null : validClientId,
      status,
      internal_notes,
      booking_notes,
      deposit_amount || 0,
      payment_status || "unpaid",
      is_block,
      save_receipt || false,
      !!is_eoppy,
      id,
      shopId,
    ],
  );

  await client.query(
    "DELETE FROM appointment_services WHERE appointment_id = $1",
    [id],
  );
  if (!is_block) {
    for (const svc of services) {
      if (safeUUID(svc.service_id)) {
        await client.query(
          `INSERT INTO appointment_services (
            appointment_id, service_id, staff_id, start_time, duration_override, price_override, shop_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            id,
            safeUUID(svc.service_id),
            safeUUID(svc.staff_id),
            svc.start_time,
            svc.duration_override,
            svc.price_override,
            shopId,
          ],
        );
      }
    }
  }

  await client.query("DELETE FROM product_sales WHERE appointment_id = $1", [
    id,
  ]);
  if (!is_block && products.length > 0) {
    for (const prod of products) {
      if (prod.product_id) {
        const unitPrice = Number(prod.price || 0);
        const qty = Number(prod.quantity || 1);
        await client.query(
          `INSERT INTO product_sales (
            appointment_id, inventory_id, staff_id, client_id, quantity, total_price, shop_id, sale_date
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
          [
            id,
            prod.product_id,
            services[0]?.staff_id || null,
            validClientId,
            qty,
            unitPrice * qty,
            shopId,
          ],
        );
      }
    }
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|xls|xlsx/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase(),
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
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "ws:", "wss:"],
        fontSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  }),
);
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
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

// --- HELPER: Recalculate Outstanding Balance for a Client ---
const recalculateClientBalance = async (client, clientId) => {
  try {
    // We use a subquery to find the appointment time from appointment_services
    // since 'start_time' does not exist on the appointments table directly.
    const balanceRes = await client.query(
      `SELECT 
         COALESCE(SUM(total_cost - total_paid), 0) as new_balance
       FROM (
         SELECT 
           a.id,
           COALESCE(SUM(COALESCE(aps.price_override, s.price)), 0) as total_cost,
           COALESCE((SELECT SUM(amount) FROM transactions WHERE appointment_id = a.id), 0) as total_paid,
           (SELECT MIN(start_time) FROM appointment_services WHERE appointment_id = a.id) as appt_time
         FROM appointments a
         LEFT JOIN appointment_services aps ON a.id = aps.appointment_id
         LEFT JOIN services s ON aps.service_id = s.id
         WHERE a.client_id = $1 
           AND a.status != 'cancelled'
         GROUP BY a.id
       ) subquery
       WHERE appt_time <= CURRENT_TIMESTAMP
         AND appt_time >= '2026-03-01 00:00:00'`,
      [clientId],
    );

    const newBalance = balanceRes.rows[0].new_balance;

    // This updates the 'Clients' list you see in your second image
    await client.query(
      "UPDATE clients SET outstanding_balance = $1 WHERE id = $2",
      [newBalance, clientId],
    );

    return newBalance;
  } catch (err) {
    console.error("Error recalculating balance:", err);
    throw err;
  }
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

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    req.shopId = user.shopId;
    next();
  });
};

// --- AUTH ROUTE ---

app.post("/api/v1/login", loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  try {
    // 1. Find user by username only (don't check password in SQL)
    const result = await pool.query(
      `SELECT u.*, s.name as shop_name 
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
        [fullName, email, phone || null, req.user.staffId],
      );
    }

    await client.query("COMMIT");
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    await client.query("ROLLBACK");
    res.status(500).json({ error: "Internal server error" });
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
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
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
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
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
      [req.shopId],
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/v1/staff", authenticateToken, async (req, res) => {
  const {
    first_name,
    last_name,
    email,
    phone,
    role,
    color,
    username,
    password,
  } = req.body;
  const name = first_name + " " + last_name;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Create Staff Entry
    const staffRes = await client.query(
      "INSERT INTO staff (name, email, phone, shop_id) VALUES ($1, $2, $3, $4) RETURNING id",
      [name, email, phone, req.shopId],
    );
    const staffId = staffRes.rows[0].id;

    // 2. Create User Entry (with Hashed Password)
    if (username && password) {
      // HASH THE PASSWORD HERE
      const hashedPassword = await bcrypt.hash(password, 12);

      await client.query(
        "INSERT INTO users (username, password, role, staff_id, shop_id) VALUES ($1, $2, $3, $4, $5)",
        [username, hashedPassword, role || "staff", staffId, req.shopId],
      );
    }

    await client.query("COMMIT");
    res.json({ success: true, id: staffId });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});
// server.js
app.post("/api/v1/staff/reorder", authenticateToken, async (req, res) => {
  const { orders } = req.body; // Expects [{id: 1, sort_order: 0}, {id: 2, sort_order: 1}]

  try {
    // Start a transaction
    await pool.query("BEGIN");

    const queryText = "UPDATE public.staff SET sort_order = $1 WHERE id = $2";

    for (const item of orders) {
      await pool.query(queryText, [item.sort_order, item.id]);
    }

    await pool.query("COMMIT");
    res.json({ success: true, message: "Staff order updated successfully" });
  } catch (err) {
    await pool.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Failed to reorder staff" });
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
      [fullName, email, phone, hourly_rate, specialty, id, req.shopId],
    );

    await client.query(`DELETE FROM staff_services WHERE staff_id = $1`, [id]);

    if (service_ids.length > 0) {
      for (const svcId of service_ids) {
        await client.query(
          `INSERT INTO staff_services (staff_id, service_id) VALUES ($1, $2)`,
          [id, svcId],
        );
      }
    }

    await client.query("COMMIT");
    res.json({ success: true });
  } catch (err) {
    console.error(err);
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
      [req.params.id, req.shopId],
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
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
      [username],
    );
    if (checkUser.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Username already taken" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    await client.query(
      `INSERT INTO users (username, password, shop_id, staff_id, role)
       VALUES ($1, $2, $3, $4, 'staff')`,
      [username, hashedPassword, req.shopId, id],
    );

    await client.query("COMMIT");
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    await client.query("ROLLBACK");
    res.status(500).json({ error: "Failed to create login" });
  } finally {
    client.release();
  }
});

// --- CLIENT ROUTES ---
// app.get("/api/v1/clients", authenticateToken, async (req, res) => {
//   try {
//     const { rows } = await pool.query(
//       `SELECT c.*,
//         -- Count only EOPPY appointments
//         (SELECT COUNT(*) FROM appointments WHERE client_id = c.id AND is_eoppy = true) as eoppy_count,
//         -- Count appointments that are NOT EOPPY (is_eoppy is false or null)
//         (SELECT COUNT(*) FROM appointments WHERE client_id = c.id AND (is_eoppy = false OR is_eoppy IS NULL)) as non_eoppy_count
//       FROM clients c
//       WHERE shop_id = $1
//       ORDER BY last_name`,
//       [req.shopId],
//     );

//     const data = rows.map((c) => ({
//       ...c,
//       full_name: `${c.first_name} ${c.last_name}`,
//       eoppy_count: parseInt(c.eoppy_count || 0),
//       non_eoppy_count: parseInt(c.non_eoppy_count || 0),
//     }));

//     res.json(data);
//   } catch (err) {
//     res.status(500).json({ error: "Internal server error" });
//   }
// });
app.get("/api/v1/clients", authenticateToken, async (req, res) => {
  try {
    const query = `
      SELECT 
        c.*,
        c.first_name || ' ' || c.last_name as full_name,
        
        -- EOPPY Breakdown
        (SELECT jsonb_build_object(
            'total', COALESCE(SUM(s_inner.count_per_service), 0),
            'services', COALESCE(jsonb_object_agg(s_inner.service_name, s_inner.count_per_service), '{}'::jsonb)
          )
         FROM (
           SELECT s.name as service_name, COUNT(aps.id) as count_per_service
           FROM appointments a
           JOIN appointment_services aps ON a.id = aps.appointment_id
           JOIN services s ON aps.service_id = s.id
           WHERE a.client_id = c.id AND a.is_eoppy = true
           GROUP BY s.name
         ) s_inner
        ) as eoppy_breakdown,

        -- Non-EOPPY Breakdown
        (SELECT jsonb_build_object(
            'total', COALESCE(SUM(s_inner.count_per_service), 0),
            'services', COALESCE(jsonb_object_agg(s_inner.service_name, s_inner.count_per_service), '{}'::jsonb)
          )
         FROM (
           SELECT s.name as service_name, COUNT(aps.id) as count_per_service
           FROM appointments a
           JOIN appointment_services aps ON a.id = aps.appointment_id
           JOIN services s ON aps.service_id = s.id
           WHERE a.client_id = c.id AND (a.is_eoppy = false OR a.is_eoppy IS NULL)
           GROUP BY s.name
         ) s_inner
        ) as non_eoppy_breakdown

      FROM active_clients c
      WHERE c.shop_id = $1
      ORDER BY c.last_name;
    `;

    const { rows } = await pool.query(query, [req.shopId]);

    // Format the data safely
    const data = rows.map((row) => ({
      ...row,
      // The COALESCE in SQL helps, but we ensure the structure exists here too
      eoppy_breakdown: row.eoppy_breakdown || { total: 0, services: {} },
      non_eoppy_breakdown: row.non_eoppy_breakdown || {
        total: 0,
        services: {},
      },
    }));

    // Use 'return' to ensure the function stops here
    return res.json(data);
  } catch (err) {
    // Check if headers were already sent to avoid the ERR_HTTP_HEADERS_SENT crash
    if (!res.headersSent) {
      return res.status(500).json({ error: "Internal Server Error" });
    }
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
    ergotherapia,
    physiotherapia,
    logotherapia,
    date_of_birth,
  } = req.body;

  if (!first_name?.trim() || !last_name?.trim()) {
    return res
      .status(400)
      .json({ error: "First name and last name are required" });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO clients (first_name, last_name, email, phone, notes, custom_fields, shop_id, ergotherapia, physiotherapia, logotherapia, date_of_birth) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
       RETURNING *`,
      [
        first_name,
        last_name,
        email,
        phone,
        notes,
        JSON.stringify(custom_fields),
        req.shopId,
        ergotherapia,
        physiotherapia,
        logotherapia,
        date_of_birth || null,
      ],
    );
    rows[0].full_name = `${rows[0].first_name} ${rows[0].last_name}`;
    res.json({ success: true, client: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
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
    ergotherapia,
    physiotherapia,
    logotherapia,
    date_of_birth,
  } = req.body;

  try {
    await pool.query(
      `UPDATE clients 
       SET first_name=$1, last_name=$2, email=$3, phone=$4, notes=$5, custom_fields=$6,
           ergotherapia=$7, physiotherapia=$8, logotherapia=$9, date_of_birth=$10
       WHERE id=$11 AND shop_id=$12`,
      [
        first_name,
        last_name,
        email,
        phone,
        notes,
        JSON.stringify(custom_fields),
        !!ergotherapia,
        !!physiotherapia,
        !!logotherapia,
        date_of_birth || null,
        id,
        req.shopId,
      ],
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Update failed" });
  }
});

// app.delete("/api/v1/clients/:id", authenticateToken, async (req, res) => {
//   try {
//     const result = await pool.query(
//       "DELETE FROM clients WHERE id = $1 AND shop_id = $2",
//       [req.params.id, req.shopId],
//     );

//     // Optional check if the client even existed
//     if (result.rowCount === 0) {
//       return res.status(404).json({ error: "Client not found" });
//     }

//     res.json({ success: true });
//   } catch (err) {
//     // 1. Intercept the PostgreSQL Foreign Key Violation Error (Code 23503)
//     if (err.code === "23503") {
//       return res.status(409).json({
//         error:
//           "Δεν μπορείτε να διαγράψετε αυτόν τον πελάτη, επειδή υπάρχουν ραντεβού καταχωρημένα στο όνομά του.",
//       });
//     }

//     // 2. Generic fallback error (hides the ugly SQL from the user)
//     console.error("Delete Client Error:", err);
//     res.status(500).json({ error: "Αποτυχία διαγραφής πελάτη." });
//   }
// });
app.delete("/api/v1/clients/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    // We don't DELETE anymore, we just mark them
    await pool.query("UPDATE clients SET is_deleted = TRUE WHERE id = $1", [
      id,
    ]);
    res.json({ success: true, message: "Client archived" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to archive client" });
  }
});

// --- SERVICE ROUTES ---

app.get("/api/v1/services", authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM services WHERE shop_id = $1 ORDER BY name`,
      [req.shopId],
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/v1/services", authenticateToken, async (req, res) => {
  const { name, duration_minutes, price, category, color_code } = req.body;

  if (!name?.trim()) {
    return res.status(400).json({ error: "Service name is required" });
  }
  if (!duration_minutes || Number(duration_minutes) <= 0) {
    return res
      .status(400)
      .json({ error: "Duration must be a positive number" });
  }
  if (price == null || Number(price) < 0) {
    return res
      .status(400)
      .json({ error: "Price must be a non-negative number" });
  }

  try {
    await pool.query(
      `INSERT INTO services (name, duration_minutes, price, category, color_code, shop_id) VALUES ($1, $2, $3, $4, $5, $6)`,
      [name, duration_minutes, price, category, color_code, req.shopId],
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.put("/api/v1/services/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { name, duration_minutes, price, category, color_code } = req.body;
  try {
    await pool.query(
      `UPDATE services SET name=$1, duration_minutes=$2, price=$3, category=$4, color_code=$5 WHERE id=$6 AND shop_id=$7`,
      [name, duration_minutes, price, category, color_code, id, req.shopId],
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
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
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- APPOINTMENT ROUTES ---

// In server.js

app.get("/api/v1/appointments", authenticateToken, async (req, res) => {
  try {
    // 1. Capture date parameters from the request
    const { date, start, end } = req.query;
    const visibilityClause = getVisibilityClause(req.user, "a");

    let dateFilter = "";
    const params = [req.shopId];

    // 2. Build the dynamic date filter
    if (date) {
      // Filter for a specific single day
      params.push(date);
      dateFilter = ` AND (SELECT MIN(start_time) FROM appointment_services WHERE appointment_id = a.id)::date = $${params.length}::date`;
    } else if (start && end) {
      // Filter for a range (e.g., a full week or month)
      params.push(start, end);
      dateFilter = ` AND (SELECT MIN(start_time) FROM appointment_services WHERE appointment_id = a.id) BETWEEN $${params.length - 1} AND $${params.length}`;
    }

    const { rows } = await pool.query(
      `
      SELECT 
        a.id, 
        a.client_id, 
        a.status, 
        a.internal_notes, 
        a.booking_notes, 
        a.payment_status, 
        a.is_block, 
        a.is_eoppy,
        a.save_receipt, 
        a.created_at,
        a.recurrence,
        a.group_id,
        c.first_name, 
        c.last_name, 
        c.phone as client_phone,
        COALESCE(c.outstanding_balance, 0) as client_outstanding_balance,
        COALESCE((SELECT SUM(amount) FROM transactions WHERE appointment_id = a.id), 0) as deposit_amount,
        (
          COALESCE((SELECT SUM(COALESCE(aps2.price_override, s2.price)) FROM appointment_services aps2 JOIN services s2 ON aps2.service_id = s2.id WHERE aps2.appointment_id = a.id), 0) +
          COALESCE((SELECT SUM(total_price) FROM product_sales WHERE appointment_id = a.id), 0)
        ) as total_cost,
        COALESCE((
          SELECT json_agg(json_build_object(
            'service_id', s.id,
            'service_name', s.name,
            'price', COALESCE(aps.price_override, s.price),
            'duration_minutes', COALESCE(aps.duration_override, s.duration_minutes),
            'staff_id', aps.staff_id,
            'staff_name', st.name,
            'start_time', aps.start_time
          ) ORDER BY aps.start_time ASC)
          FROM appointment_services aps
          LEFT JOIN services s ON aps.service_id = s.id
          LEFT JOIN staff st ON aps.staff_id = st.id
          WHERE aps.appointment_id = a.id
        ), '[]') as services
      FROM appointments a
      LEFT JOIN clients c ON a.client_id = c.id
      WHERE a.shop_id = $1 ${visibilityClause} ${dateFilter}
      GROUP BY a.id, c.first_name, c.last_name, c.phone, c.outstanding_balance
      ORDER BY (SELECT MIN(start_time) FROM appointment_services WHERE appointment_id = a.id) ASC
    `,
      params,
    );

    const formatted = rows.map((row) => ({
      ...row,
      start_time: row.services?.[0]?.start_time || row.created_at,
      staff_id: row.services?.[0]?.staff_id,
      current_appt_total: parseFloat(row.total_cost),
      deposit_amount: parseFloat(row.deposit_amount),
    }));

    res.json(formatted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/v1/appointments", authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { firstAppointmentId, validClientId } = await createAppointmentSeries(
      client,
      req.body,
      req.shopId,
    );

    let newBalance = 0;
    if (validClientId) {
      newBalance = await recalculateClientBalance(client, validClientId);
    }

    await client.query("COMMIT");
    res.json({
      id: firstAppointmentId,
      success: true,
      new_balance: newBalance,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Create Appointment Error:", err);
    res.status(500).json({ error: "Failed to create appointment" });
  } finally {
    client.release();
  }
});
app.get("/api/v1/unsubscribe", publicActionLimiter, async (req, res) => {
  const crypto = require("crypto");

  const { id, token } = req.query;

  if (!id || !token) {
    return res.status(400).send("Μη έγκυρο αίτημα.");
  }

  // Verify the token matches the ID using your secret
  const expectedToken = crypto
    .createHmac("sha256", process.env.JWT_SECRET)
    .update(id)
    .digest("hex");

  if (token !== expectedToken) {
    return res.status(403).send("Ο σύνδεσμος είναι άκυρος ή έχει λήξει.");
  }

  try {
    const result = await pool.query(
      "UPDATE clients SET receive_emails = false WHERE id = $1",
      [id],
    );

    if (result.rowCount === 0) {
      return res.status(404).send("Ο χρήστης δεν βρέθηκε.");
    }

    // Return a nice styled confirmation page
    res.send(`
            <div style="font-family: sans-serif; text-align: center; padding: 100px 20px; background: #fff5f9; min-height: 100vh;">
                <div style="background: white; padding: 40px; border-radius: 20px; display: inline-block; box-shadow: 0 10px 25px rgba(0,0,0,0.05);">
                    <h1 style="color: #111827; margin-bottom: 10px;">Επιτυχής Διαγραφή</h1>
                    <p style="color: #4b5563;">Έχετε διαγραφεί με επιτυχία από τη λίστα των υπενθυμίσεων.</p>
                    <a href="https://interventio.gr" style="display: inline-block; margin-top: 20px; color: #ff93d4; text-decoration: none; font-weight: bold;">Επιστροφή στην Αρχική</a>
                </div>
            </div>
        `);
  } catch (err) {
    console.error("Unsubscribe Error:", err);
    res.status(500).send("Παρουσιάστηκε σφάλμα κατά τη διαγραφή.");
  }
});
app.get(
  "/api/v1/confirm-appointment",
  publicActionLimiter,
  async (req, res) => {
    const crypto = require("crypto");
    const { id, token } = req.query;

    if (!id || !token) {
      return res.status(400).send("Μη έγκυρο αίτημα.");
    }

    // Verify the token matches the Appointment ID
    const expectedToken = crypto
      .createHmac("sha256", process.env.JWT_SECRET)
      .update(id.toString())
      .digest("hex");

    if (token !== expectedToken) {
      return res.status(403).send("Ο σύνδεσμος είναι άκυρος ή έχει λήξει.");
    }

    try {
      // Update status to 'confirmed' only if it's not already cancelled
      const result = await pool.query(
        "UPDATE appointments SET status = 'confirmed' WHERE id = $1 AND status != 'cancelled' RETURNING id",
        [id],
      );

      if (result.rowCount === 0) {
        return res
          .status(404)
          .send("Το ραντεβού δεν βρέθηκε ή έχει ήδη ακυρωθεί.");
      }

      // Success Styled Page
      res.send(`
      <div style="font-family: sans-serif; text-align: center; padding: 100px 20px; background: #fff5f9; min-height: 100vh;">
          <div style="background: white; padding: 40px; border-radius: 32px; display: inline-block; box-shadow: 0 20px 25px rgba(255,147,212,0.1); max-width: 400px;">
              <div style="font-size: 48px; margin-bottom: 20px;">✅</div>
              <h1 style="color: #111827; margin-bottom: 10px; font-size: 24px;">Το ραντεβού επιβεβαιώθηκε!</h1>
              <p style="color: #4b5563; line-height: 1.5;">Σας ευχαριστούμε. Η κράτησή σας έχει επισημανθεί ως επιβεβαιωμένη στο σύστημά μας. Ανυπομονούμε να σας δούμε!</p>
              <a href="https://interventio.gr" style="display: inline-block; margin-top: 30px; background: #ff93d4; color: white; padding: 12px 24px; border-radius: 12px; text-decoration: none; font-weight: bold;">Επιστροφή στην Αρχική</a>
          </div>
      </div>
    `);
    } catch (err) {
      console.error("Confirmation Error:", err);
      res.status(500).send("Παρουσιάστηκε σφάλμα κατά την επιβεβαίωση.");
    }
  },
);
app.put("/api/v1/appointments/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { scope } = req.query;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const validClientId = safeUUID(req.body.client_id);

    if (scope === "series") {
      const groupInfo = await getGroupDetails(client, id, req.shopId);
      const isRecurringBody = !!req.body.recurrence;

      if (groupInfo && groupInfo.group_id) {
        // === Case 1: Existing Series (Delete Future & Recreate) ===
        const currentApptStart = req.body.services[0]?.start_time;
        await client.query(
          `DELETE FROM appointments 
           WHERE group_id = $1 AND shop_id = $2
           AND id IN (
             SELECT a.id FROM appointments a
             JOIN appointment_services aps ON a.id = aps.appointment_id
             WHERE a.group_id = $1 AND aps.start_time >= $3
           )`,
          [groupInfo.group_id, req.shopId, currentApptStart],
        );

        // createAppointmentSeries will create new rows.
        // These rows default to reminder_sent = false automatically via DB schema.
        await createAppointmentSeries(
          client,
          { ...req.body, group_id_override: groupInfo.group_id },
          req.shopId,
        );
      } else if (isRecurringBody) {
        // === Case 2: Convert Single -> Series (Update Current & Fill Future) ===
        const crypto = require("crypto");
        const newGroupId = crypto.randomUUID();
        const recurrenceRule = JSON.stringify(req.body.recurrence);

        // 1. Update the CURRENT appointment (the 'Single' one)
        // We use performSingleUpdate to handle services/products/basic info
        await performSingleUpdate(client, id, req.shopId, req.body);

        // 2. Assign the new Group ID, Recurrence Rule to it and RESET reminder_sent
        await client.query(
          `UPDATE appointments 
             SET group_id = $1, recurrence = $2, email_reminder_sent = false 
             WHERE id = $3 AND shop_id = $4`,
          [newGroupId, recurrenceRule, id, req.shopId],
        );

        // 3. Create the REST of the series
        // The duplicate check in createAppointmentSeries will see the current appointment
        // (which we just updated) and skip creating a duplicate for today,
        // then proceed to create the future ones.
        await createAppointmentSeries(
          client,
          { ...req.body, group_id_override: newGroupId },
          req.shopId,
        );
      }
    } else {
      // === Case 3: Single Update ===
      await performSingleUpdate(client, id, req.shopId, req.body);

      // Reset flag to ensure that if the time was moved, a new reminder can trigger
      await client.query(
        `UPDATE appointments SET email_reminder_sent = false WHERE id = $1 AND shop_id = $2`,
        [id, req.shopId],
      );
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
  const { id } = req.params;
  const { scope } = req.query;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (scope === "series") {
      const groupInfo = await getGroupDetails(client, id, req.shopId);
      if (groupInfo && groupInfo.group_id) {
        await client.query(
          `
          DELETE FROM appointments 
          WHERE group_id = $1 
          AND shop_id = $2
          AND id IN (
            SELECT a.id FROM appointments a
            JOIN appointment_services aps ON a.id = aps.appointment_id
            WHERE a.group_id = $1 
            AND aps.start_time >= $3
          )
        `,
          [groupInfo.group_id, req.shopId, groupInfo.start_time],
        );
      } else {
        await client.query(
          "DELETE FROM appointments WHERE id = $1 AND shop_id = $2",
          [id, req.shopId],
        );
      }
    } else {
      await client.query(
        "DELETE FROM appointments WHERE id = $1 AND shop_id = $2",
        [id, req.shopId],
      );
    }

    await client.query("COMMIT");
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    await client.query("ROLLBACK");
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
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
      [appointment1_id, req.shopId],
    );
    const q2 = await client.query(
      `SELECT * FROM appointment_services WHERE appointment_id = $1 AND shop_id = $2 ORDER BY id`,
      [appointment2_id, req.shopId],
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
        ],
      );
      await client.query(
        `UPDATE appointment_services SET start_time=$1, staff_id=$2, duration_override=$3, price_override=$4 WHERE id=$5`,
        [
          s1[i].start_time,
          s1[i].staff_id,
          s1[i].duration_override,
          s1[i].price_override,
          s2[i].id,
        ],
      );
    }

    await client.query("COMMIT");
    res.json({ success: true });
  } catch (err) {
    console.error(err);
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

  if (!amount || Number(amount) <= 0) {
    return res.status(400).json({ error: "Invalid payment amount" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Helper: create a transaction record and update the appointment's status/deposit_amount
    const applyPaymentToAppointment = async (apptId, paymentAmount) => {
      await client.query(
        `INSERT INTO transactions (appointment_id, client_id, amount, payment_method, transaction_type, shop_id, created_at)
         VALUES ($1, $2, $3, $4, 'payment', $5, NOW())`,
        [apptId, client_id, paymentAmount, payment_method, req.shopId],
      );

      const priceRes = await client.query(
        `SELECT COALESCE(SUM(price_override), 0) as total_price
         FROM appointment_services WHERE appointment_id = $1`,
        [apptId],
      );
      const totalPrice = Number(priceRes.rows[0].total_price);

      const alreadyPaidRes = await client.query(
        `SELECT COALESCE(SUM(amount), 0) as paid
         FROM transactions WHERE appointment_id = $1`,
        [apptId],
      );
      const totalPaid = Number(alreadyPaidRes.rows[0].paid);

      const isFullyPaid = totalPaid >= totalPrice - 0.01;
      await client.query(
        `UPDATE appointments
         SET payment_status = $1, status = $2, deposit_amount = deposit_amount + $3
         WHERE id = $4 AND shop_id = $5`,
        [
          isFullyPaid ? "paid" : "partial",
          isFullyPaid ? "completed" : "confirmed",
          paymentAmount,
          apptId,
          req.shopId,
        ],
      );
    };

    // 1. Calculate what is still owed for the current appointment (from transactions, not deposit_amount column)
    const currentPriceRes = await client.query(
      `SELECT COALESCE(SUM(price_override), 0) as total_price
       FROM appointment_services WHERE appointment_id = $1`,
      [appointment_id],
    );
    const currentApptCost = Number(currentPriceRes.rows[0].total_price);

    const currentPaidRes = await client.query(
      `SELECT COALESCE(SUM(amount), 0) as paid FROM transactions WHERE appointment_id = $1`,
      [appointment_id],
    );
    const currentApptAlreadyPaid = Number(currentPaidRes.rows[0].paid);
    const currentApptOwed = Math.max(
      0,
      currentApptCost - currentApptAlreadyPaid,
    );

    // 2. Allocate: pay current appointment first, then apply the remainder to old debt (FIFO)
    let remaining = Number(amount);

    const forCurrentAppt = Math.min(remaining, currentApptOwed);
    if (forCurrentAppt > 0.009) {
      await applyPaymentToAppointment(appointment_id, forCurrentAppt);
      remaining -= forCurrentAppt;
    }

    // 3. Distribute the remainder to older unpaid appointments (oldest first, March 1 2026+)
    if (remaining > 0.009) {
      const oldAppts = await client.query(
        `SELECT
           a.id,
           COALESCE(SUM(aps.price_override), 0) as total_cost,
           COALESCE((SELECT SUM(t2.amount) FROM transactions t2 WHERE t2.appointment_id = a.id), 0) as total_paid
         FROM appointments a
         JOIN appointment_services aps ON aps.appointment_id = a.id
         WHERE a.client_id = $1
           AND a.id != $2
           AND a.shop_id = $3
           AND a.status NOT IN ('cancelled', 'completed')
           AND (SELECT MIN(start_time) FROM appointment_services WHERE appointment_id = a.id) >= '2026-03-01 00:00:00'
         GROUP BY a.id
         ORDER BY (SELECT MIN(start_time) FROM appointment_services WHERE appointment_id = a.id) ASC`,
        [client_id, appointment_id, req.shopId],
      );

      for (const row of oldAppts.rows) {
        if (remaining <= 0.009) break;
        const owed = Number(row.total_cost) - Number(row.total_paid);
        if (owed <= 0.009) continue;

        const forThisAppt = Math.min(remaining, owed);
        await applyPaymentToAppointment(row.id, forThisAppt);
        remaining -= forThisAppt;
      }
    }

    // 4. Recalculate client balance and return it so the frontend can update without guessing
    const newBalance = await recalculateClientBalance(client, client_id);

    await client.query("COMMIT");
    res.json({ success: true, new_balance: newBalance });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Payment error:", e);
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
      [req.shopId],
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- REPORT ENDPOINTS (ALL FILTERED BY SHOP_ID AND VISIBILITY) ---
app.get("/api/v1/reports/analytics", authenticateToken, async (req, res) => {
  const { from, to } = req.query;
  // Default to last 30 days if no dates provided
  const startDate =
    from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const endDate = to || new Date().toISOString();

  try {
    const client = await pool.connect();
    try {
      // A. Cancellation Rate
      // (Cancelled + No-Show) / Total Appointments
      const statusRes = await client.query(
        `SELECT 
           COUNT(*) FILTER (WHERE status IN ('cancelled', 'no-show')) as negative,
           COUNT(*) as total
         FROM appointments a
         JOIN appointment_services aps ON a.id = aps.appointment_id
         WHERE a.shop_id = $1 
         AND aps.start_time >= $2 AND aps.start_time <= $3`,
        [req.shopId, startDate, endDate],
      );

      const negCount = Number(statusRes.rows[0].negative);
      const totalAppts = Number(statusRes.rows[0].total);
      const cancelRate = totalAppts > 0 ? (negCount / totalAppts) * 100 : 0;

      // B. Client Retention (New vs Returning in this period)
      // "New" = Their first ever appointment is in this period
      // "Returning" = They have appointments before this period
      const retentionRes = await client.query(
        `SELECT 
           COUNT(DISTINCT a.client_id) FILTER (
             WHERE NOT EXISTS (
               SELECT 1 FROM appointments old 
               JOIN appointment_services aps_old ON old.id = aps_old.appointment_id
               WHERE old.client_id = a.client_id 
               AND aps_old.start_time < $2
               AND old.status = 'completed'
             )
           ) as new_clients,
           COUNT(DISTINCT a.client_id) FILTER (
             WHERE EXISTS (
               SELECT 1 FROM appointments old 
               JOIN appointment_services aps_old ON old.id = aps_old.appointment_id
               WHERE old.client_id = a.client_id 
               AND aps_old.start_time < $2
               AND old.status = 'completed'
             )
           ) as returning_clients
         FROM appointments a
         WHERE a.shop_id = $1 
         AND a.created_at >= $2 AND a.created_at <= $3`,
        [req.shopId, startDate, endDate],
      );

      const newClients = Number(retentionRes.rows[0].new_clients);
      const retClients = Number(retentionRes.rows[0].returning_clients);
      const retentionRate =
        newClients + retClients > 0
          ? (retClients / (newClients + retClients)) * 100
          : 0;

      // C. Staff Utilization
      // Returns hours booked per staff member
      const utilRes = await client.query(
        `SELECT st.name, 
           SUM(COALESCE(aps.duration_override, s.duration_minutes))/60.0 as hours_booked,
           COUNT(aps.id) as appt_count,
           SUM(COALESCE(aps.price_override, s.price)) as total_revenue
         FROM appointment_services aps
         JOIN staff st ON aps.staff_id = st.id
         LEFT JOIN services s ON aps.service_id = s.id
         WHERE st.shop_id = $1
         AND aps.start_time >= $2 AND aps.start_time <= $3
         GROUP BY st.name`,
        [req.shopId, startDate, endDate],
      );

      res.json({
        cancellation_rate: cancelRate.toFixed(1),
        retention_rate: retentionRate.toFixed(1),
        new_clients: newClients,
        returning_clients: retClients,
        staff_utilization: utilRes.rows,
      });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

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
      params,
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/v1/reports/clients", authenticateToken, async (req, res) => {
  const { from, to } = req.query;
  const params = [req.shopId];

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
      `SELECT c.*, COUNT(DISTINCT a.id) as appointment_count
       FROM clients c
       JOIN appointments a ON c.id = a.client_id
       JOIN appointment_services aps ON a.id = aps.appointment_id
       ${whereClause}
       GROUP BY c.id 
       ORDER BY c.last_name`,
      params,
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/v1/reports/sales", authenticateToken, async (req, res) => {
  const { from, to } = req.query;
  const params = [req.shopId];

  let whereClause = "WHERE a.shop_id = $1 AND a.status = 'completed'";
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
      `SELECT 
        COALESCE(s.name, 'Deleted Service') as service_name, 
        COUNT(aps.id) as count, 
        SUM(COALESCE(aps.price_override, s.price)) as total_revenue
      FROM appointment_services aps
      LEFT JOIN services s ON aps.service_id = s.id -- FIXED: LEFT JOIN
      JOIN appointments a ON aps.appointment_id = a.id
      ${whereClause} 
      GROUP BY COALESCE(s.name, 'Deleted Service') 
      ORDER BY total_revenue DESC`,
      params,
    );

    // Also return summary for charts
    const summary = rows.reduce(
      (acc, row) => acc + Number(row.total_revenue),
      0,
    );
    res.json({ summary: { total_revenue: summary }, details: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
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
      params,
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
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
      params,
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});
app.get("/api/v1/reports/finances", authenticateToken, async (req, res) => {
  const { from, to } = req.query;
  const shopId = req.shopId;
  const isSuperAdmin = req.user.role === "super_admin";

  // 1. Setup Parameters for Appointments (Sales/Debt)
  const apptParams = [shopId];
  let apptDateFilter = "";
  if (from) {
    apptParams.push(from);
    apptDateFilter += ` AND aps2.start_time >= $${apptParams.length}`;
  }
  if (to) {
    apptParams.push(to);
    apptDateFilter += ` AND aps2.start_time <= $${apptParams.length}`;
  }

  // Subquery to find appointments in the date range.
  // Includes completed appointments and any past appointment that is not cancelled/no-show
  // (covers 'new', 'confirmed', and 'started' statuses that have already occurred).
  const appointmentSubquery = `
    SELECT DISTINCT a2.id FROM appointments a2
    JOIN appointment_services aps2 ON a2.id = aps2.appointment_id
    WHERE a2.shop_id = $1
    AND (
      a2.status = 'completed'
      OR (a2.status IN ('new', 'confirmed', 'started') AND aps2.start_time < CURRENT_TIMESTAMP)
    )
    ${!isSuperAdmin ? "AND a2.save_receipt = true" : ""}
    ${apptDateFilter}
  `;

  try {
    const client = await pool.connect();

    // --- A. TOTAL SALES (Services Only) ---
    const salesRes = await client.query(
      `
      SELECT SUM(COALESCE(aps.price_override, s.price)) as total
      FROM appointment_services aps
      LEFT JOIN services s ON aps.service_id = s.id
      WHERE aps.appointment_id IN (${appointmentSubquery})
    `,
      apptParams,
    );
    const totalSales = Number(salesRes.rows[0].total) || 0;

    // --- B. PERIOD DEBT ---
    const periodPaymentsRes = await client.query(
      `
      SELECT SUM(amount) as total FROM transactions WHERE appointment_id IN (${appointmentSubquery})
    `,
      apptParams,
    );
    const periodPaymentsApplied = Number(periodPaymentsRes.rows[0].total) || 0;
    const totalDebt = totalSales - periodPaymentsApplied;

    // --- C. TOTAL COLLECTED (Cash Flow for Period) ---
    const flowParams = [shopId];
    let flowFilter = "";
    if (from) {
      flowParams.push(from);
      flowFilter += ` AND created_at >= $${flowParams.length}`;
    }
    if (to) {
      flowParams.push(to);
      flowFilter += ` AND created_at <= $${flowParams.length}`;
    }

    const payRes = await client.query(
      `
      SELECT SUM(amount) as total FROM transactions WHERE shop_id = $1 ${flowFilter}
    `,
      flowParams,
    );
    const totalPayments = Number(payRes.rows[0].total) || 0;

    // --- D. COLLECTED TODAY (The missing piece) ---
    const todayRes = await client.query(
      `
      SELECT SUM(amount) as total FROM transactions 
      WHERE shop_id = $1 AND created_at >= CURRENT_DATE
    `,
      [shopId],
    );
    const collectedToday = Number(todayRes.rows[0].total) || 0;

    // --- Final Response (All keys required by FinancialsView.vue) ---
    res.json({
      total_sales: totalSales,
      total_payments: totalPayments,
      collected_today: collectedToday,
      total_debt: totalDebt,
    });
  } catch (err) {
    console.error("Finance Report Error:", err);
    res.status(500).json({ error: "Failed to generate report" });
  } finally {
    client.release();
  }
});
app.get(
  "/api/v1/reports/service-summary",
  authenticateToken,
  async (req, res) => {
    const { from, to } = req.query;
    const params = [req.shopId];
    let dateFilter = "";

    if (from) {
      params.push(from);
      dateFilter += ` AND aps.start_time >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      dateFilter += ` AND aps.start_time <= $${params.length}`;
    }

    try {
      // We join with active_clients as the source of truth for client data
      // Updated query to filter for past appointments only
      const query = `
        SELECT 
          s.name as service_name,
          COUNT(aps.id) as service_count,
          SUM(COALESCE(aps.price_override, s.price)) as total_value,
          SUM(COALESCE((
            SELECT SUM(t.amount) 
            FROM transactions t 
            WHERE t.appointment_id = a.id
          ), 0)) as total_paid
        FROM appointment_services aps
        JOIN services s ON aps.service_id = s.id
        JOIN appointments a ON aps.appointment_id = a.id
        JOIN active_clients c ON a.client_id = c.id
        WHERE a.shop_id = $1 
          -- AND aps.start_time <= CURRENT_TIMESTAMP 
          -- Exclude cancelled and no-show statuses
          AND a.status NOT IN ('cancelled', 'no-show') 
          ${dateFilter}
        GROUP BY s.name
        ORDER BY total_value DESC
      `;

      const { rows } = await pool.query(query, params);

      // Calculate owed amount for each row
      const reportData = rows.map((row) => ({
        ...row,
        total_owed: Math.max(
          0,
          Number(row.total_value) - Number(row.total_paid),
        ),
      }));

      res.json(reportData);
    } catch (err) {
      console.error("Service Summary Error:", err);
      res.status(500).json({ error: "Failed to generate service summary" });
    }
  },
);
const io = new Server(server, {
  cors: {
    // You can use an array or a single string from your .env
    origin: allowedOrigins,
    credentials: true,
  },
});

// Socket.IO Authentication Middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("Authentication error"));

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
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
          process.env.MESSAGE_ENCRYPTION_KEY, // $9: The Key
        ],
      );

      const message = result.rows[0];

      const userResult = await pool.query(
        `SELECT u.id, u.username, s.name as staff_name 
         FROM users u LEFT JOIN staff s ON u.staff_id = s.id 
         WHERE u.id = $1`,
        [socket.user.userId],
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
        [channelId],
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
          [msgId, socket.user.userId],
        );
      }

      // 2. Update the last_read_at for the channel member
      await client.query(
        `UPDATE channel_members 
       SET last_read_at = NOW() 
       WHERE channel_id = $1 AND user_id = $2`,
        [channelId, socket.user.userId],
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
        [messageId, socket.user.userId],
      );

      await pool.query(
        `UPDATE channel_members 
         SET last_read_at = NOW() 
         WHERE channel_id = $1 AND user_id = $2`,
        [channelId, socket.user.userId],
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
      [req.user.userId, req.shopId],
    );
    res.json(rows);
  } catch (err) {
    console.error("Error fetching channels:", err);
    res.status(500).json({ error: "Internal server error" });
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
      [req.shopId, name, description, req.user.userId],
    );

    const channel = channelResult.rows[0];

    await client.query(
      `INSERT INTO channel_members (channel_id, user_id) VALUES ($1, $2)`,
      [channel.id, req.user.userId],
    );

    for (const userId of memberIds) {
      if (userId !== req.user.userId) {
        await client.query(
          `INSERT INTO channel_members (channel_id, user_id) VALUES ($1, $2)`,
          [channel.id, userId],
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
        [channelId, req.user.userId],
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
      const params = [process.env.MESSAGE_ENCRYPTION_KEY, channelId];

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
      res.status(500).json({ error: "Internal server error" });
    }
  },
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
      [req.shopId],
    );
    res.json(rows);
  } catch (err) {
    console.error("Error fetching shop users:", err);
    res.status(500).json({ error: "Internal server error" });
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
      [req.shopId, name, description, req.user.userId],
    );

    const channel = channelResult.rows[0];

    await client.query(
      `INSERT INTO channel_members (channel_id, user_id) VALUES ($1, $2)`,
      [channel.id, req.user.userId],
    );

    for (const userId of memberIds) {
      if (userId !== req.user.userId) {
        await client.query(
          `INSERT INTO channel_members (channel_id, user_id) VALUES ($1, $2)`,
          [channel.id, userId],
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

const fileStorage = multer.memoryStorage();
const fileUpload = multer({
  storage: fileStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
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
        "latin1",
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
      console.error(err);
      res.status(500).json({ error: "Upload processing failed" });
    }
  },
);

app.get("/api/v1/chat/file/:messageId", authenticateToken, async (req, res) => {
  try {
    const { messageId } = req.params;
    const { rows } = await pool.query(
      "SELECT file_blob, file_type, file_name FROM chat_messages WHERE id = $1",
      [messageId],
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
      `inline; filename*=UTF-8''${encodedName}`,
    );
    res.send(file_blob);
  } catch (err) {
    console.error(err);
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
        [req.params.channelId],
      );
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
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
        [req.params.channelId, userId],
      );
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
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
      [req.shopId],
    );
    res.json(rows);
  } catch (err) {
    console.error("Error fetching shop users:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
app.get("/api/v1/shop", authenticateToken, async (req, res) => {
  try {
    // 2. Add the WHERE clause with the $1 placeholder
    const { rows } = await pool.query(
      `SELECT *
       FROM shops
       WHERE id = $1`, // <--- crucial fix
      [req.shopId],
    );

    // 3. Handle case where shop isn't found
    if (rows.length === 0) {
      return res.status(404).json({ message: "Shop not found" });
    }

    // 5. Send the first item (since ID is unique), not the whole array
    res.json(rows[0]);
  } catch (err) {
    console.error("Error fetching shop:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
// PUT: Update Shop Theme Color
app.put("/api/v1/shop/theme", authenticateToken, async (req, res) => {
  const { primaryColor } = req.body;

  // Basic Hex Validation (7 characters, starts with #)
  if (!primaryColor || !/^#[0-9A-F]{6}$/i.test(primaryColor)) {
    return res.status(400).json({ error: "Invalid hex color format" });
  }

  try {
    const { rowCount } = await pool.query(
      `UPDATE shops
       SET primary_color = $1 
       WHERE id = $2`,
      [primaryColor, req.shopId],
    );

    if (rowCount === 0) {
      return res.status(404).json({ message: "Shop not found" });
    }

    res.json({ message: "Theme updated successfully", primaryColor });
  } catch (err) {
    console.error("Error updating theme:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.put("/api/v1/shop/services", authenticateToken, async (req, res) => {
  const { ergotherapia, physiotherapia, logotherapia } = req.body;

  // Validation: Ensure all fields are present and are booleans
  // We check for 'undefined' because 'false' is a falsy value in JS
  if (
    typeof ergotherapia === "undefined" ||
    typeof physiotherapia === "undefined" ||
    typeof logotherapia === "undefined"
  ) {
    return res.status(400).json({ error: "Missing therapy service data" });
  }

  try {
    const { rowCount } = await pool.query(
      `UPDATE shops
       SET ergotherapia = $1, 
           physiotherapia = $2, 
           logotherapia = $3
       WHERE id = $4`,
      [ergotherapia, physiotherapia, logotherapia, req.shopId],
    );

    if (rowCount === 0) {
      return res.status(404).json({ message: "Shop not found" });
    }

    res.json({
      message: "Services updated successfully",
      services: { ergotherapia, physiotherapia, logotherapia },
    });
  } catch (err) {
    console.error("Error updating shop services:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
app.put("/api/v1/shop/reply-email", authenticateToken, async (req, res) => {
  const { reply_email } = req.body;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (reply_email && !emailRegex.test(reply_email)) {
    return res.status(400).json({ error: "Invalid email format" });
  }
  try {
    await pool.query(`UPDATE shops SET reply_email = $1 WHERE id = $2`, [
      reply_email || null,
      req.shopId,
    ]);
    res.json({ success: true, reply_email: reply_email || null });
  } catch (err) {
    console.error("Error updating reply email:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.put("/api/v1/shop/contact", authenticateToken, async (req, res) => {
  const { phone, address, website } = req.body;
  if (
    website &&
    !website.startsWith("http://") &&
    !website.startsWith("https://")
  ) {
    return res
      .status(400)
      .json({ error: "Website must start with http:// or https://" });
  }
  try {
    await pool.query(
      `UPDATE shops SET phone = $1, address = $2, website = $3 WHERE id = $4`,
      [phone || null, address || null, website || null, req.shopId],
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Error updating shop contact:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.put(
  "/api/v1/shop/calendar-settings",
  authenticateToken,
  async (req, res) => {
    const {
      slot_min_time,
      slot_max_time,
      show_weekends,
      reminder_hours_before,
    } = req.body;
    const timePattern = /^\d{2}:\d{2}$/;
    if (!timePattern.test(slot_min_time) || !timePattern.test(slot_max_time)) {
      return res
        .status(400)
        .json({
          error: "slot_min_time and slot_max_time must be in HH:MM format",
        });
    }
    const hours = parseInt(reminder_hours_before, 10);
    if (!Number.isInteger(hours) || hours < 1 || hours > 72) {
      return res
        .status(400)
        .json({
          error: "reminder_hours_before must be an integer between 1 and 72",
        });
    }
    try {
      await pool.query(
        `UPDATE shops SET slot_min_time = $1, slot_max_time = $2, show_weekends = $3, reminder_hours_before = $4 WHERE id = $5`,
        [slot_min_time, slot_max_time, !!show_weekends, hours, req.shopId],
      );
      res.json({ success: true });
    } catch (err) {
      console.error("Error updating calendar settings:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

app.post(
  "/api/v1/staff/:id/photo",
  authenticateToken,
  dbFileUpload.single("photo"),
  async (req, res) => {
    if (req.user.role !== "admin" && req.user.role !== "super_admin") {
      return res.status(403).json({ error: "Admins only" });
    }
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    if (!req.file.mimetype.startsWith("image/")) {
      return res.status(400).json({ error: "File must be an image" });
    }
    const dataUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
    try {
      await pool.query(
        `UPDATE staff SET photo_url = $1 WHERE id = $2 AND shop_id = $3`,
        [dataUrl, req.params.id, req.shopId],
      );
      res.json({ success: true, photo_url: dataUrl });
    } catch (err) {
      console.error("Error uploading staff photo:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

app.delete("/api/v1/staff/:id/photo", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin" && req.user.role !== "super_admin") {
    return res.status(403).json({ error: "Admins only" });
  }
  try {
    await pool.query(
      `UPDATE staff SET photo_url = NULL WHERE id = $1 AND shop_id = $2`,
      [req.params.id, req.shopId],
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting staff photo:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ==================== KEEP ALL YOUR OTHER ROUTES ====================
// (Profile, Staff, Clients, Services, Appointments, Reports, etc.)
// ... Copy all routes from your original server.js here ...

app.get("/api/v1/profile", authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id as user_id, u.username, u.role, 
        s.name as shop_name, s.id as shop_id, s.ergotherapia as ergotherapia,
        st.id as staff_id, st.name as staff_name,
        st.email as staff_email, st.phone as staff_phone, st.specialty
      FROM users u
      LEFT JOIN shops s ON u.shop_id = s.id
      LEFT JOIN staff st ON u.staff_id = st.id
      WHERE u.id = $1`,
      [req.user.userId],
    );
    console.log(rows);
    if (rows.length === 0)
      return res.status(404).json({ error: "User not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
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
      [req.shopId],
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
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
      [name, description, req.shopId],
    );
    const productId = productRes.rows[0].id;

    for (const v of variations) {
      await client.query(
        `INSERT INTO product_inventory (product_id, variation_name, price, stock_quantity)
         VALUES ($1, $2, $3, $4)`,
        [productId, v.variation_name, v.price, v.stock_quantity],
      );
    }

    await client.query("COMMIT");
    res.json({ success: true, productId });
  } catch (err) {
    console.error(err);
    await client.query("ROLLBACK");
    res.status(500).json({ error: "Internal server error" });
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
        [quantity, req.params.id],
      );
      res.json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Insufficient stock or update failed" });
    }
  },
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
      [name, description, id, req.shopId],
    );

    // 2. Handle variations
    for (const v of variations) {
      if (v.id && !String(v.id).startsWith("temp-")) {
        // Update existing variation
        await client.query(
          `UPDATE product_inventory 
           SET variation_name = $1, price = $2, stock_quantity = $3, updated_at = NOW()
           WHERE id = $4 AND product_id = $5`,
          [v.variation_name, v.price, v.stock_quantity, v.id, id],
        );
      } else {
        // Insert new variation added during edit
        await client.query(
          `INSERT INTO product_inventory (product_id, variation_name, price, stock_quantity)
           VALUES ($1, $2, $3, $4)`,
          [id, v.variation_name, v.price, v.stock_quantity],
        );
      }
    }

    await client.query("COMMIT");
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    await client.query("ROLLBACK");
    res.status(500).json({ error: "Internal server error" });
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
      [id, req.shopId],
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
  if (req.user.role === "client") {
    if (String(req.user.clientId) !== String(id)) {
      console.log(
        `Blocked access: User ${req.user.clientId} tried to view ${id}`,
      );
      return res
        .status(403)
        .json({ error: "Unauthorized to view this profile" });
    }
  }
  try {
    // 1. Fetch Client Details
    const clientRes = await pool.query(
      `SELECT * FROM clients WHERE id = $1 AND shop_id = $2`,
      [id, req.shopId],
    );

    if (clientRes.rows.length === 0) {
      return res.status(404).json({ error: "Client not found" });
    }
    const client = clientRes.rows[0];

    // 2. Fetch Appointment History
    // FIX: logic calculates start_time from subquery and orders by it safely
    // 2. Fetch Appointment History
    const historyRes = await pool.query(
      `SELECT 
          a.id, 
          a.status, 
          a.deposit_amount,
          a.created_at,
          (
            SELECT MIN(start_time) 
            FROM appointment_services 
            WHERE appointment_id = a.id
          ) as start_time,
          
          COALESCE((
            SELECT SUM(price_override) 
            FROM appointment_services 
            WHERE appointment_id = a.id
          ), 0) as total_service_price,
          
          COALESCE((
            SELECT SUM(total_price) 
            FROM product_sales 
            WHERE appointment_id = a.id
          ), 0) as total_product_price,
          
          (
            SELECT string_agg(s.name, ', ') 
            FROM appointment_services aps 
            JOIN services s ON aps.service_id = s.id 
            WHERE aps.appointment_id = a.id
          ) as service_names,

          (
            SELECT string_agg(DISTINCT st.name, ', ') 
            FROM appointment_services aps 
            JOIN staff st ON aps.staff_id = st.id 
            WHERE aps.appointment_id = a.id
          ) as staff_names

        FROM appointments a
        WHERE a.client_id = $1 AND a.shop_id = $2
        ORDER BY 5 DESC`, // 5 refers to start_time
      [id, req.shopId],
    );

    // 3. Fetch File Metadata
    const filesRes = await pool.query(
      `SELECT id, file_name, file_type, file_size, uploaded_at 
       FROM client_files 
       WHERE client_id = $1 ORDER BY uploaded_at DESC`,
      [id],
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
    res.status(500).json({ error: "Internal server error" });
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
        "latin1",
      ).toString("utf8");

      await pool.query(
        `INSERT INTO client_files (client_id, file_name, file_type, file_size, file_data)
       VALUES ($1, $2, $3, $4, $5)`,
        [id, originalName, req.file.mimetype, req.file.size, req.file.buffer],
      );

      res.json({ success: true });
    } catch (err) {
      console.error("File Upload Error:", err);
      res.status(500).json({ error: "Failed to upload file" });
    }
  },
);

// DOWNLOAD CLIENT FILE
app.get(
  "/api/v1/clients/files/:fileId",
  authenticateToken,
  async (req, res) => {
    try {
      const { fileId } = req.params;
      let query = `
      SELECT cf.file_data, cf.file_type, cf.file_name 
      FROM client_files cf
      JOIN clients c ON cf.client_id = c.id
      WHERE cf.id = $1
    `;
      let params = [fileId];

      // 2. Add Role-Based Security
      if (req.user.role === "client") {
        // CLIENTS: Must match the file ID AND their own clientId
        query += ` AND cf.client_id = $2`;
        params.push(req.user.clientId);
      } else {
        // STAFF/ADMIN: Must match the file ID AND the shop_id they belong to
        query += ` AND c.shop_id = $2`;
        params.push(req.shopId);
      }

      // 3. Execute the query AFTER building it
      const { rows } = await pool.query(query, params);

      if (rows.length === 0) {
        return res
          .status(404)
          .json({ error: "File not found or access denied" });
      }

      const file = rows[0];
      const encodedName = encodeURIComponent(file.file_name);

      // 4. Send the file
      res.setHeader(
        "Content-Type",
        file.file_type || "application/octet-stream",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodedName}`,
      );

      res.send(file.file_data);
    } catch (err) {
      console.error("Download Error:", err);
      res.status(500).json({ error: "Download failed" });
    }
  },
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
        [req.params.fileId, req.shopId],
      );
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Delete failed" });
    }
  },
);
app.get("/api/v1/exercises", authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM exercises WHERE shop_id = $1 ORDER BY category, name`,
      [req.shopId],
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 2. Create a New Exercise (Master List)
app.post("/api/v1/exercises", authenticateToken, async (req, res) => {
  const { name, category, description } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO exercises (shop_id, name, category, description) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.shopId, name, category || "General", description],
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
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
        [req.params.id],
      );
      // Return simple array of IDs: ['uuid-1', 'uuid-2']
      res.json(rows.map((r) => r.exercise_id));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
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
          [id, exerciseId],
        );
      } else {
        // Uncheck: Delete record
        await pool.query(
          `DELETE FROM client_exercises WHERE client_id = $1 AND exercise_id = $2`,
          [id, exerciseId],
        );
      }
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to update exercise status" });
    }
  },
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
      [id, req.shopId],
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

// Invite Endpoint
app.post("/api/v1/clients/:id/invite", authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      "SELECT * FROM clients WHERE id = $1 AND shop_id = $2",
      [id, req.shopId],
    );
    if (rows.length === 0)
      return res.status(404).json({ error: "Client not found" });
    const client = rows[0];

    if (!client.email)
      return res
        .status(400)
        .json({ error: "Client does not have an email address" });

    const userCheck = await pool.query(
      "SELECT id FROM users WHERE client_id = $1",
      [id],
    );
    if (userCheck.rows.length > 0)
      return res.status(400).json({ error: "Client already has an account" });

    // Fetch shop reply_email
    const shopRes = await pool.query(
      "SELECT reply_email FROM shops WHERE id = $1",
      [req.shopId],
    );
    const replyEmail = shopRes.rows[0]?.reply_email || null;

    // Generate temporary token for signup
    const inviteToken = jwt.sign(
      { clientId: id, shopId: req.shopId, email: client.email },
      process.env.JWT_SECRET,
      { expiresIn: "48h" },
    );

    const signupUrl = `https://interventio.gr/signup?token=${inviteToken}`;
    const nodemailer = require("nodemailer");

    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      secure: process.env.EMAIL_PORT == 465,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      family: 4,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
    });

    await transporter.sendMail({
      from: `"${req.user.shopName || "Booking"}" <${process.env.EMAIL_USER}>`,
      ...(replyEmail && { replyTo: replyEmail }),
      to: client.email,
      subject: "Invitation to your Client Portal",
      html: `
<!doctype html>
<html>
  <head>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800&display=swap" rel="stylesheet" />
    <style>
      /* Mobile responsiveness */
      @media only screen and (max-width: 600px) {
        .inner-padding { padding: 30px 15px !important; }
        .button-stack { display: block !important; width: 100% !important; margin: 10px 0 !important; box-sizing: border-box !important; }
      }
      /* Hover effect for buttons */
      .btn-hover:hover { background-color: #ff7ec7 !important; transform: translateY(-2px); }
    </style>
  </head>
  <body style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #fff5f9; padding: 40px 10px; margin: 0; -webkit-font-smoothing: antialiased;">
    <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 32px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(255, 147, 212, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);">
      
      <div style="padding: 40px 40px 20px 40px; text-align: left">
        <div style="display: inline-block; background-color: #ff93d4; color: white; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 700; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.05em;">
          Πρόσκληση
        </div>
        <h2 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.025em;">
          <span style="color: #111827">${req.user.shopName || "Petalouda"}</span><span style="color: #ff93d4">Portal</span>
        </h2>
      </div>

      <div class="inner-padding" style="padding: 0 40px 40px 40px">
        <h1 style="color: #111827; font-size: 32px; font-weight: 800; margin-bottom: 24px; line-height: 1.1; letter-spacing: -1px;">
          Καλώς ήρθατε στο <span style="color: #ff7ec7">Online Portal</span> μας
        </h1>

        <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin-bottom: 16px;">
          Γεια σας ${client.first_name},
        </p>
        <p style="color: #4b5563; font-size: 16px; line-height: 1.6">
          Είμαστε ενθουσιασμένοι που σας προσκαλούμε στη νέα μας πλατφόρμα. Εδώ μπορείτε να διαχειρίζεστε τα ραντεβού σας και να έχετε πρόσβαση στα έγγραφά σας 24/7.
        </p>

        <div style="background-color: #fff5f9; border-radius: 24px; padding: 30px; margin: 32px 0; border: 1px solid rgba(255, 147, 212, 0.2);">
          <ul style="color: #374151; font-size: 15px; padding-left: 0; list-style: none; margin: 0;">
            <li style="margin-bottom: 12px; display: flex; align-items: center;">
              <span style="color: #ff93d4; margin-right: 12px; font-size: 18px;">📅</span> 
              <strong>Προβολή ραντεβού:</strong> Δείτε τα επόμενα ραντεβού σας.
            </li>
            <li style="margin-bottom: 12px; display: flex; align-items: center;">
              <span style="color: #ff93d4; margin-right: 12px; font-size: 18px;">🕒</span> 
              <strong>Ιστορικό:</strong> Πλήρης έλεγχος των επισκέψεών σας.
            </li>
            <li style="display: flex; align-items: center;">
              <span style="color: #ff93d4; margin-right: 12px; font-size: 18px;">📁</span> 
              <strong>Αρχεία:</strong> Κατεβάστε σημαντικά έγγραφα και οδηγίες.
            </li>
          </ul>
        </div>

        <div style="text-align: center; margin-top: 40px;">
          <a href="${signupUrl}" class="btn-hover button-stack" style="display: inline-block; background-color: #ff93d4; color: white; padding: 18px 40px; border-radius: 16px; text-decoration: none; font-weight: 700; font-size: 16px; transition: all 0.2s ease; box-shadow: 0 10px 15px -3px rgba(255, 147, 212, 0.3);">
            Ενεργοποίηση Λογαριασμού
          </a>
          <p style="color: #9ca3af; font-size: 12px; margin-top: 25px;">
             Αυτός ο σύνδεσμος θα λήξει σε 48 ώρες για την ασφάλειά σας.
          </p>
        </div>
      </div>

      <div style="background-color: #fff; padding: 40px; text-align: center; border-top: 1px solid rgba(255, 147, 212, 0.1);">
        <p style="color: #111827; font-size: 16px; font-weight: 700; margin-bottom: 8px;">
          ${req.user.shopName || "Petalouda"}<span style="color: #ff93d4"> Booking</span>
        </p>
        <p style="color: #9ca3af; font-size: 12px; margin: 0;">
          © 2026 Powered by Interventio Booking System
        </p>
      </div>
    </div>
  </body>
</html>
      `,
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Invite Error:", err);
    res.status(500).json({ error: "Failed to send invitation" });
  }
});

// Signup Endpoint
app.post("/api/v1/signup", signupLimiter, async (req, res) => {
  const { token, password } = req.body;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

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
// ==================== CLIENT PORTAL ROUTES ====================

app.put("/api/v1/portal/profile", authenticateToken, async (req, res) => {
  if (req.user.role !== "client") {
    return res.status(403).json({ error: "Clients only" });
  }
  const { first_name, last_name, email, phone } = req.body;
  if (!first_name?.trim() || !last_name?.trim()) {
    return res
      .status(400)
      .json({ error: "First name and last name are required" });
  }
  try {
    await pool.query(
      `UPDATE clients SET first_name = $1, last_name = $2, email = $3, phone = $4 WHERE id = $5 AND shop_id = $6`,
      [
        first_name,
        last_name,
        email || null,
        phone || null,
        req.user.clientId,
        req.shopId,
      ],
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Portal profile update error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.put("/api/v1/portal/password", authenticateToken, async (req, res) => {
  if (req.user.role !== "client") {
    return res.status(403).json({ error: "Clients only" });
  }
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res
      .status(400)
      .json({ error: "New password must be at least 6 characters" });
  }
  try {
    const { rows } = await pool.query(
      "SELECT password FROM users WHERE id = $1",
      [req.user.userId],
    );
    if (rows.length === 0)
      return res.status(404).json({ error: "User not found" });
    const match = await bcrypt.compare(currentPassword, rows[0].password);
    if (!match)
      return res.status(400).json({ error: "Current password is incorrect" });
    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.query("UPDATE users SET password = $1 WHERE id = $2", [
      hashed,
      req.user.userId,
    ]);
    res.json({ success: true });
  } catch (err) {
    console.error("Portal password change error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post(
  "/api/v1/portal/appointments/:id/cancel",
  authenticateToken,
  async (req, res) => {
    if (req.user.role !== "client") {
      return res.status(403).json({ error: "Clients only" });
    }
    const { id } = req.params;
    try {
      const check = await pool.query(
        `SELECT id FROM appointments WHERE id = $1 AND client_id = $2 AND shop_id = $3 AND status NOT IN ('cancelled', 'completed')`,
        [id, req.user.clientId, req.shopId],
      );
      if (check.rows.length === 0) {
        return res
          .status(404)
          .json({ error: "Appointment not found or cannot be cancelled" });
      }
      await pool.query(
        `UPDATE appointments SET status = 'cancelled' WHERE id = $1`,
        [id],
      );
      res.json({ success: true });
    } catch (err) {
      console.error("Portal appointment cancel error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

app.put("/api/v1/portal/notifications", authenticateToken, async (req, res) => {
  if (req.user.role !== "client") {
    return res.status(403).json({ error: "Clients only" });
  }
  const { receive_emails } = req.body;
  try {
    await pool.query(
      `UPDATE clients SET receive_emails = $1 WHERE id = $2 AND shop_id = $3`,
      [!!receive_emails, req.user.clientId, req.shopId],
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Portal notifications update error:", err);
    res.status(500).json({ error: "Internal server error" });
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
