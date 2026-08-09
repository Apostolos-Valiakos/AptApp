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
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : ["http://localhost:5173"];

const allowedOrigins = [...ALLOWED_ORIGINS];

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

const { PUBLIC_BASE_URL } = require("./reminderService");

// ==================== FILE UPLOAD SETUP ====================
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  },
});
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

  // === DUPLICATE CHECK (batched) ===
  // A recurring series can book up to 52 dates; checking one-by-one meant up
  // to 52 sequential round-trips just to look for collisions. staffId is the
  // same for every instance (services[0].staff_id doesn't vary per date), so
  // fetch this client+staff's existing start times once and check in memory.
  const seriesStaffId = services[0]?.staff_id;
  let existingStartTimes = null;
  if (!is_block && validClientId && seriesStaffId) {
    const existingRes = await client.query(
      `SELECT aps.start_time
       FROM appointments a
       JOIN appointment_services aps ON a.id = aps.appointment_id
       WHERE a.shop_id = $1
         AND a.client_id = $2
         AND aps.staff_id = $3
         AND a.status != 'cancelled'`,
      [shopId, validClientId, seriesStaffId],
    );
    existingStartTimes = new Set(
      existingRes.rows.map((r) => new Date(r.start_time).toISOString()),
    );
  }

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

    // === DUPLICATE CHECK ===
    if (
      !is_block &&
      validClientId &&
      existingStartTimes?.has(instanceStartIso)
    ) {
      continue;
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
            await client.query(
              `UPDATE product_inventory SET stock_quantity = GREATEST(0, stock_quantity - $1) WHERE id = $2`,
              [qty, prod.product_id],
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

  // Restore stock for the sales being removed, then delete and re-insert
  await client.query(
    `UPDATE product_inventory pi
     SET stock_quantity = pi.stock_quantity + ps.quantity
     FROM product_sales ps
     WHERE ps.inventory_id = pi.id AND ps.appointment_id = $1`,
    [id],
  );
  await client.query("DELETE FROM product_sales WHERE appointment_id = $1", [
    id,
  ]);
  // Cancelled appointments keep no product sales — stock stays restored
  if (!is_block && status !== "cancelled" && products.length > 0) {
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
        await client.query(
          `UPDATE product_inventory SET stock_quantity = GREATEST(0, stock_quantity - $1) WHERE id = $2`,
          [qty, prod.product_id],
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
           COALESCE(SUM(COALESCE(aps.price_override, s.price)), 0)
             + COALESCE((SELECT SUM(total_price) FROM product_sales WHERE appointment_id = a.id), 0) as total_cost,
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
  return ` AND ${tableAlias}.save_receipt = true`;
};

// --- REVENUE EXCLUSION HELPERS (Ctrl+1 hides cash+gift-card, Ctrl+8 hides card — independent toggles) ---
const buildRevenueExclusionClause = (excludeCash, excludeCard, alias = "a") => {
  const methods = [];
  if (excludeCash === "true") methods.push("'cash'", "'gift-card'");
  if (excludeCard === "true") methods.push("'card'");
  if (methods.length === 0) return "";
  return `AND NOT (${alias}.payment_status = 'paid' AND EXISTS (SELECT 1 FROM transactions _t WHERE _t.appointment_id = ${alias}.id AND _t.payment_method IN (${methods.join(", ")})))`;
};

const buildTxnMethodExclusionClause = (excludeCash, excludeCard, columnPrefix = "") => {
  const methods = [];
  if (excludeCash === "true") methods.push("'cash'", "'gift-card'");
  if (excludeCard === "true") methods.push("'card'");
  if (methods.length === 0) return "";
  return `AND ${columnPrefix}payment_method NOT IN (${methods.join(", ")})`;
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

// Analytics/financials/reports are admin-only — frontdesk has admin access everywhere else.
const requireAnalyticsAccess = (req, res, next) => {
  if (req.user.role !== "admin" && req.user.role !== "super_admin") {
    return res.status(403).json({ error: "Admins only" });
  }
  next();
};

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

// --- AUTH ROUTE ---

app.post("/api/v1/login", loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  try {
    // 1. Find user by username only (don't check password in SQL)
    const result = await pool.query(
      `SELECT u.*, s.name as shop_name, s.status as shop_status
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
        st.id, st.name, st.color_code, st.hourly_rate, st.is_active,
        st.email, st.phone, st.specialty, st.shop_id, st.sort_order,
        st.visible_in_calendar,
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
    visible_in_calendar,
  } = req.body;
  const name = first_name + " " + last_name;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Create Staff Entry
    const staffRes = await client.query(
      "INSERT INTO staff (name, email, phone, shop_id, visible_in_calendar) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [name, email, phone, req.shopId, visible_in_calendar ?? true],
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
    visible_in_calendar,
  } = req.body;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const fullName = `${first_name} ${last_name}`.trim();

    await client.query(
      `UPDATE staff
       SET name = $1, email = $2, phone = $3, hourly_rate = $4, specialty = $5, visible_in_calendar = $6
       WHERE id = $7 AND shop_id = $8`,
      [fullName, email, phone, hourly_rate, specialty, visible_in_calendar ?? true, id, req.shopId],
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
const STAFF_LOGIN_ROLES = ["staff", "frontdesk"];

app.post("/api/v1/staff/:id/login", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { username, password, role } = req.body;

  if (!username || !password)
    return res.status(400).json({ error: "Username and password required" });

  if (role && !STAFF_LOGIN_ROLES.includes(role)) {
    return res.status(400).json({ error: "Invalid role" });
  }

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
       VALUES ($1, $2, $3, $4, $5)`,
      [username, hashedPassword, req.shopId, id, role || "staff"],
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

// --- PLATFORM / OWNER ROUTES (cross-shop, no req.shopId scoping) ---

app.get(
  "/api/v1/platform/shops",
  authenticateToken,
  requireOwner,
  async (req, res) => {
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

    try {
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
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

app.post(
  "/api/v1/platform/shops",
  authenticateToken,
  requireOwner,
  async (req, res) => {
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

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

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

      await client.query("COMMIT");
      res.json({ success: true, id: shopId, adminCreated });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(err);
      if (err.code === "23505") {
        return res.status(400).json({ error: "Username already taken" });
      }
      res.status(500).json({ error: "Internal server error" });
    } finally {
      client.release();
    }
  },
);

app.put(
  "/api/v1/platform/shops/:id",
  authenticateToken,
  requireOwner,
  async (req, res) => {
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

    try {
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
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

app.get(
  "/api/v1/platform/shops/:id/admins",
  authenticateToken,
  requireOwner,
  async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, username, is_active, staff_id, created_at
         FROM users WHERE shop_id = $1 AND role = 'admin' ORDER BY created_at`,
        [req.params.id],
      );
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

app.post(
  "/api/v1/platform/shops/:id/admins",
  authenticateToken,
  requireOwner,
  async (req, res) => {
    const { id } = req.params;
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }

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

      await client.query("COMMIT");
      res.json({ success: true, id: insertRes.rows[0].id });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    } finally {
      client.release();
    }
  },
);

app.put(
  "/api/v1/platform/admins/:userId",
  authenticateToken,
  requireOwner,
  async (req, res) => {
    const { is_active } = req.body;
    if (typeof is_active !== "boolean") {
      return res.status(400).json({ error: "is_active (boolean) is required" });
    }

    try {
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
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

app.post(
  "/api/v1/platform/admins/:userId/reset-password",
  authenticateToken,
  requireOwner,
  async (req, res) => {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    try {
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
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// Mints a short-lived JWT scoped to the target shop so the owner can "view as"
// that shop's admin. Allowed even for suspended shops, so the owner can go fix them.
app.post(
  "/api/v1/platform/impersonate/:shopId",
  authenticateToken,
  requireOwner,
  async (req, res) => {
    try {
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
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

app.get(
  "/api/v1/platform/demo-requests",
  authenticateToken,
  requireOwner,
  async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, name, email, shop_name, phone, message, status, created_at
         FROM demo_requests ORDER BY created_at DESC`,
      );
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

app.put(
  "/api/v1/platform/demo-requests/:id",
  authenticateToken,
  requireOwner,
  async (req, res) => {
    const { status } = req.body;
    if (!["new", "contacted"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    try {
      const { rowCount } = await pool.query(
        `UPDATE demo_requests SET status = $1 WHERE id = $2`,
        [status, req.params.id],
      );
      if (rowCount === 0) {
        return res.status(404).json({ error: "Demo request not found" });
      }
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

app.delete(
  "/api/v1/platform/demo-requests/:id",
  authenticateToken,
  requireOwner,
  async (req, res) => {
    try {
      const { rowCount } = await pool.query(
        `DELETE FROM demo_requests WHERE id = $1`,
        [req.params.id],
      );
      if (rowCount === 0) {
        return res.status(404).json({ error: "Demo request not found" });
      }
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

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
  const { slim, search, limit, offset } = req.query;
  try {
    // Slim mode: lightweight list for dropdowns (scheduler, booking dialog).
    // With `search` + `limit` it becomes a fast autocomplete lookup instead of
    // shipping the entire client table (used by the Gift Cards client picker).
    if (slim === "true") {
      const slimParams = [req.shopId];
      let slimSearchClause = "";
      if (search) {
        slimParams.push(`%${String(search).trim()}%`);
        slimSearchClause = ` AND (first_name || ' ' || last_name ILIKE $${slimParams.length}
          OR email ILIKE $${slimParams.length}
          OR REPLACE(phone, ' ', '') ILIKE REPLACE($${slimParams.length}, ' ', ''))`;
      }
      const slimLimitClause = limit
        ? ` LIMIT ${Math.min(parseInt(limit) || 10, 50)}`
        : "";

      const { rows } = await pool.query(
        `SELECT id, first_name, last_name,
                first_name || ' ' || last_name as full_name,
                email, phone, outstanding_balance, custom_fields
         FROM active_clients WHERE shop_id = $1 ${slimSearchClause}
         ORDER BY NULLIF(TRIM(last_name), '') NULLS LAST, first_name
         ${slimLimitClause}`,
        slimParams,
      );
      return res.json(rows);
    }

    const params = [req.shopId];
    let searchClause = "";
    if (search) {
      params.push(`%${String(search).trim()}%`);
      searchClause = ` AND (c.first_name || ' ' || c.last_name ILIKE $${params.length}
        OR c.email ILIKE $${params.length}
        OR REPLACE(c.phone, ' ', '') ILIKE REPLACE($${params.length}, ' ', ''))`;
    }

    const heavyColumns = `
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
        ) as non_eoppy_breakdown`;

    // Paged mode: server-side search + pagination, heavy aggregates only for the page
    if (limit !== undefined) {
      const pageSize = Math.min(parseInt(limit) || 50, 200);
      const pageOffset = parseInt(offset) || 0;

      const countRes = await pool.query(
        `SELECT COUNT(*) as total FROM active_clients c WHERE c.shop_id = $1 ${searchClause}`,
        params,
      );

      const pagedParams = [...params, pageSize, pageOffset];
      const { rows } = await pool.query(
        `SELECT ${heavyColumns}
         FROM active_clients c
         WHERE c.shop_id = $1 ${searchClause}
         ORDER BY NULLIF(TRIM(c.last_name), '') NULLS LAST, c.first_name
         LIMIT $${pagedParams.length - 1} OFFSET $${pagedParams.length}`,
        pagedParams,
      );

      const data = rows.map((row) => ({
        ...row,
        eoppy_breakdown: row.eoppy_breakdown || { total: 0, services: {} },
        non_eoppy_breakdown: row.non_eoppy_breakdown || {
          total: 0,
          services: {},
        },
      }));

      return res.json({
        total: parseInt(countRes.rows[0].total),
        clients: data,
      });
    }

    // Legacy mode: full list with aggregates (backward compatible)
    const { rows } = await pool.query(
      `SELECT ${heavyColumns}
       FROM active_clients c
       WHERE c.shop_id = $1 ${searchClause}
       ORDER BY NULLIF(TRIM(c.last_name), '') NULLS LAST, c.first_name`,
      params,
    );

    const data = rows.map((row) => ({
      ...row,
      eoppy_breakdown: row.eoppy_breakdown || { total: 0, services: {} },
      non_eoppy_breakdown: row.non_eoppy_breakdown || {
        total: 0,
        services: {},
      },
    }));

    return res.json(data);
  } catch (err) {
    console.error("Clients fetch error:", err);
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
      `SELECT * FROM services WHERE shop_id = $1 AND is_active = true ORDER BY name`,
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
      params.push(date);
      dateFilter = ` AND (SELECT MIN(start_time) FROM appointment_services WHERE appointment_id = a.id)::date = $${params.length}::date`;
    } else if (start && end) {
      params.push(start, end);
      dateFilter = ` AND (SELECT MIN(start_time) FROM appointment_services WHERE appointment_id = a.id) BETWEEN $${params.length - 1} AND $${params.length}`;
    }

    // 3. Non-super_admin users cannot retrieve appointments older than 3 months
    const threeMonthClause =
      req.user.role !== "super_admin"
        ? ` AND (SELECT MIN(start_time) FROM appointment_services WHERE appointment_id = a.id) >= NOW() - INTERVAL '3 months'`
        : "";

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
        (SELECT payment_method FROM transactions WHERE appointment_id = a.id ORDER BY created_at DESC LIMIT 1) as payment_method,
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
      WHERE a.shop_id = $1 ${visibilityClause} ${dateFilter} ${threeMonthClause}
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
            <div style="font-family: 'Inter', sans-serif; text-align: center; padding: 100px 20px; background: #F9F5F0; min-height: 100vh;">
                <div style="background: white; padding: 40px; border-radius: 20px; display: inline-block; box-shadow: 0 10px 25px rgba(139, 111, 78, 0.1);">
                    <h1 style="color: #2C2C2C; font-family: Georgia, serif; margin-bottom: 10px;">Επιτυχής Διαγραφή</h1>
                    <p style="color: #5C4A3A;">Έχετε διαγραφεί με επιτυχία από τη λίστα των υπενθυμίσεων.</p>
                    <a href="${PUBLIC_BASE_URL}/" style="display: inline-block; margin-top: 20px; color: #8B6F4E; text-decoration: none; font-weight: bold;">Επιστροφή στην Αρχική</a>
                </div>
            </div>
        `);
  } catch (err) {
    console.error("Unsubscribe Error:", err);
    res.status(500).send("Παρουσιάστηκε σφάλμα κατά τη διαγραφή.");
  }
});

app.post("/api/v1/demo-requests", publicActionLimiter, async (req, res) => {
  const { name, email, shop_name, phone, message } = req.body;

  if (!name || !email || !shop_name) {
    return res.status(400).json({ error: "Name, email and business name are required" });
  }

  try {
    await pool.query(
      `INSERT INTO demo_requests (name, email, shop_name, phone, message) VALUES ($1, $2, $3, $4, $5)`,
      [name, email, shop_name, phone || null, message || null],
    );

    // Best-effort notification — the lead is already saved above regardless of email outcome.
    try {
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
        from: `"BookFlow" <${process.env.EMAIL_USER}>`,
        to: process.env.DEMO_REQUEST_EMAIL || process.env.EMAIL_USER,
        replyTo: email,
        subject: `New demo request: ${shop_name}`,
        html: `
          <div style="font-family: sans-serif; font-size: 14px; color: #111;">
            <h2>New demo request</h2>
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Business:</strong> ${shop_name}</p>
            <p><strong>Phone:</strong> ${phone || "—"}</p>
            <p><strong>Message:</strong><br>${(message || "—").replace(/\n/g, "<br>")}</p>
          </div>
        `,
      });
    } catch (emailErr) {
      console.error("Demo request notification email failed:", emailErr);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Demo request error:", err);
    res.status(500).json({ error: "Internal server error" });
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
      <div style="font-family: 'Inter', sans-serif; text-align: center; padding: 100px 20px; background: #F9F5F0; min-height: 100vh;">
          <div style="background: white; padding: 40px; border-radius: 32px; display: inline-block; box-shadow: 0 20px 25px rgba(139, 111, 78, 0.12); max-width: 400px;">
              <div style="font-size: 48px; margin-bottom: 20px;">✅</div>
              <h1 style="color: #2C2C2C; font-family: Georgia, serif; margin-bottom: 10px; font-size: 24px;">Το ραντεβού επιβεβαιώθηκε!</h1>
              <p style="color: #5C4A3A; line-height: 1.5;">Σας ευχαριστούμε. Η κράτησή σας έχει επισημανθεί ως επιβεβαιωμένη στο σύστημά μας. Ανυπομονούμε να σας δούμε!</p>
              <a href="${PUBLIC_BASE_URL}/" style="display: inline-block; margin-top: 30px; background: #8B6F4E; color: white; padding: 12px 24px; border-radius: 12px; text-decoration: none; font-weight: bold;">Επιστροφή στην Αρχική</a>
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

    // Look up the client now — the row won't exist to query after deletion.
    const affectedClientRes = await client.query(
      "SELECT client_id FROM appointments WHERE id = $1 AND shop_id = $2",
      [id, req.shopId],
    );
    const affectedClientId = affectedClientRes.rows[0]?.client_id || null;

    // Collect the appointment ids being deleted so product stock can be restored
    let deletedIds = [id];
    let groupInfo = null;
    if (scope === "series") {
      groupInfo = await getGroupDetails(client, id, req.shopId);
      if (groupInfo && groupInfo.group_id) {
        const idsRes = await client.query(
          `SELECT DISTINCT a.id FROM appointments a
           JOIN appointment_services aps ON a.id = aps.appointment_id
           WHERE a.group_id = $1 AND a.shop_id = $2 AND aps.start_time >= $3`,
          [groupInfo.group_id, req.shopId, groupInfo.start_time],
        );
        deletedIds = idsRes.rows.map((r) => r.id);
      }
    }

    // Restore stock for any product sales on the deleted appointments
    await client.query(
      `UPDATE product_inventory pi
       SET stock_quantity = pi.stock_quantity + ps.quantity
       FROM product_sales ps
       WHERE ps.inventory_id = pi.id AND ps.appointment_id = ANY($1)`,
      [deletedIds],
    );
    await client.query(
      "DELETE FROM product_sales WHERE appointment_id = ANY($1)",
      [deletedIds],
    );

    if (scope === "series" && groupInfo && groupInfo.group_id) {
      await client.query(
        `DELETE FROM appointments WHERE id = ANY($1) AND shop_id = $2`,
        [deletedIds, req.shopId],
      );
    } else {
      await client.query(
        "DELETE FROM appointments WHERE id = $1 AND shop_id = $2",
        [id, req.shopId],
      );
    }

    let newBalance;
    if (affectedClientId) {
      newBalance = await recalculateClientBalance(client, affectedClientId);
    }

    await client.query("COMMIT");
    res.json({ success: true, new_balance: newBalance });
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
    gift_card_id,
    amount2,
    payment_method2,
    gift_card_id2,
  } = req.body;

  if (!amount || Number(amount) <= 0) {
    return res.status(400).json({ error: "Invalid payment amount" });
  }
  if (payment_method === "gift-card" && !gift_card_id) {
    return res
      .status(400)
      .json({ error: "gift_card_id is required for gift-card payments" });
  }
  const hasSecondLeg =
    amount2 !== undefined && amount2 !== null && Number(amount2) > 0;
  if (hasSecondLeg) {
    if (!payment_method2) {
      return res
        .status(400)
        .json({ error: "payment_method2 is required when amount2 is set" });
    }
    if (payment_method2 === "gift-card" && !gift_card_id2) {
      return res
        .status(400)
        .json({
          error: "gift_card_id2 is required for a gift-card second payment",
        });
    }
  }

  const client = await pool.connect();

  // Processes ONE payment leg against the client's current owed appointments
  // (current appointment first, then oldest debt first). Re-reads owed state
  // fresh on every call, so calling it twice in sequence for a split payment
  // naturally continues the FIFO allocation from where the first leg left off.
  // Returns an error message string on failure, or null on success.
  const processLeg = async ({
    legAmount,
    legMethod,
    legGiftCardId,
    splitGroupId,
  }) => {
    if (legMethod === "gift-card") {
      const cardRes = await client.query(
        `SELECT * FROM gift_cards WHERE id = $1 AND shop_id = $2`,
        [legGiftCardId, req.shopId],
      );
      if (cardRes.rows.length === 0) return "Gift card not found";
      const card = cardRes.rows[0];
      if (new Date(card.expires_at) < new Date())
        return "This gift card has expired";
      if (Number(legAmount) > Number(card.remaining_balance) + 0.01) {
        return `Amount exceeds the card's remaining balance (€${Number(card.remaining_balance).toFixed(2)})`;
      }
    }

    const applyPaymentToAppointment = async (apptId, paymentAmount) => {
      await client.query(
        `INSERT INTO transactions (appointment_id, client_id, amount, payment_method, transaction_type, shop_id, gift_card_id, split_group_id, created_at)
         VALUES ($1, $2, $3, $4, 'payment', $5, $6, $7, NOW())`,
        [
          apptId,
          client_id,
          paymentAmount,
          legMethod,
          req.shopId,
          legGiftCardId || null,
          splitGroupId,
        ],
      );

      const priceRes = await client.query(
        `SELECT
           COALESCE((SELECT SUM(price_override) FROM appointment_services WHERE appointment_id = $1), 0)
           + COALESCE((SELECT SUM(total_price) FROM product_sales WHERE appointment_id = $1), 0) as total_price`,
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
         SET payment_status = $1,
             status = CASE WHEN status = 'completed' THEN 'completed' ELSE $2 END,
             deposit_amount = deposit_amount + $3
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

    const currentPriceRes = await client.query(
      `SELECT
         COALESCE((SELECT SUM(price_override) FROM appointment_services WHERE appointment_id = $1), 0)
         + COALESCE((SELECT SUM(total_price) FROM product_sales WHERE appointment_id = $1), 0) as total_price`,
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

    // Other unpaid appointments (oldest first, March 1 2026+). Completed
    // appointments are included: marking one completed must not make its
    // debt uncollectable (the balance formula counts it too).
    const oldAppts = await client.query(
      `SELECT
         a.id,
         COALESCE(SUM(aps.price_override), 0)
           + COALESCE((SELECT SUM(total_price) FROM product_sales WHERE appointment_id = a.id), 0) as total_cost,
         COALESCE((SELECT SUM(t2.amount) FROM transactions t2 WHERE t2.appointment_id = a.id), 0) as total_paid
       FROM appointments a
       JOIN appointment_services aps ON aps.appointment_id = a.id
       WHERE a.client_id = $1
         AND a.id != $2
         AND a.shop_id = $3
         AND a.status != 'cancelled'
         AND (SELECT MIN(start_time) FROM appointment_services WHERE appointment_id = a.id) >= '2026-03-01 00:00:00'
       GROUP BY a.id
       ORDER BY (SELECT MIN(start_time) FROM appointment_services WHERE appointment_id = a.id) ASC`,
      [client_id, appointment_id, req.shopId],
    );

    const oldOwedTotal = oldAppts.rows.reduce(
      (sum, row) =>
        sum + Math.max(0, Number(row.total_cost) - Number(row.total_paid)),
      0,
    );
    const totalOwed = currentApptOwed + oldOwedTotal;
    if (Number(legAmount) > totalOwed + 0.01) {
      return `Amount exceeds total owed (€${totalOwed.toFixed(2)}). Refresh and try again.`;
    }

    // Allocate: pay current appointment first, then apply the remainder to old debt (FIFO)
    let remaining = Number(legAmount);

    const forCurrentAppt = Math.min(remaining, currentApptOwed);
    if (forCurrentAppt > 0.009) {
      await applyPaymentToAppointment(appointment_id, forCurrentAppt);
      remaining -= forCurrentAppt;
    }

    for (const row of oldAppts.rows) {
      if (remaining <= 0.009) break;
      const owed = Number(row.total_cost) - Number(row.total_paid);
      if (owed <= 0.009) continue;

      const forThisAppt = Math.min(remaining, owed);
      await applyPaymentToAppointment(row.id, forThisAppt);
      remaining -= forThisAppt;
    }

    if (legMethod === "gift-card") {
      const deductRes = await client.query(
        `UPDATE gift_cards SET remaining_balance = remaining_balance - $1
         WHERE id = $2 AND remaining_balance >= $1
         RETURNING id`,
        [Number(legAmount), legGiftCardId],
      );
      if (deductRes.rows.length === 0) {
        return "Gift card balance changed — please retry";
      }
    }

    return null;
  };

  try {
    await client.query("BEGIN");

    // A shared id links both rows of a split payment so reports can flag them
    const splitGroupId = hasSecondLeg ? crypto.randomUUID() : null;

    const leg1Error = await processLeg({
      legAmount: amount,
      legMethod: payment_method,
      legGiftCardId: gift_card_id,
      splitGroupId,
    });
    if (leg1Error) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: leg1Error });
    }

    if (hasSecondLeg) {
      const leg2Error = await processLeg({
        legAmount: amount2,
        legMethod: payment_method2,
        legGiftCardId: gift_card_id2,
        splitGroupId,
      });
      if (leg2Error) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: leg2Error });
      }
    }

    // Recalculate client balance and return it so the frontend can update without guessing
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

app.get("/api/v1/financials", authenticateToken, requireAnalyticsAccess, async (req, res) => {
  try {
    const { from, to } = req.query;
    // Safety net: without a range this scanned every transaction ever recorded.
    // Default to the last 12 months when the caller doesn't specify one.
    const startDate =
      from || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = to || new Date().toISOString();

    const { rows } = await pool.query(
      `
      SELECT t.*, c.first_name, c.last_name, s.name AS service_name
      FROM transactions t
      LEFT JOIN clients c ON t.client_id = c.id
      LEFT JOIN appointments a ON t.appointment_id = a.id
      LEFT JOIN appointment_services aps ON a.id = aps.appointment_id
      LEFT JOIN services s ON aps.service_id = s.id
      WHERE t.shop_id = $1 AND t.created_at BETWEEN $2 AND $3
      ORDER BY t.created_at DESC
    `,
      [req.shopId, startDate, endDate],
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- REPORT ENDPOINTS (ALL FILTERED BY SHOP_ID AND VISIBILITY) ---
app.get("/api/v1/reports/analytics", authenticateToken, requireAnalyticsAccess, async (req, res) => {
  const { from, to, excludeCash, excludeCard } = req.query;
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
         JOIN appointments a ON aps.appointment_id = a.id
         WHERE st.shop_id = $1
         AND aps.start_time >= $2 AND aps.start_time <= $3
         ${buildRevenueExclusionClause(excludeCash, excludeCard, "a")}
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

app.get("/api/v1/reports/appointments", authenticateToken, requireAnalyticsAccess, async (req, res) => {
  const { from, to, excludeCash, excludeCard } = req.query;
  const params = [req.shopId];

  let whereClause = " AND a.shop_id = $1" + getVisibilityClause(req.user, "a");
  whereClause += " " + buildRevenueExclusionClause(excludeCash, excludeCard, "a");

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

app.get("/api/v1/reports/clients", authenticateToken, requireAnalyticsAccess, async (req, res) => {
  const { from, to, excludeCash, excludeCard } = req.query;
  const params = [req.shopId];

  let whereClause = "WHERE a.shop_id = $1" + getVisibilityClause(req.user, "a");
  whereClause += " " + buildRevenueExclusionClause(excludeCash, excludeCard, "a");

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

app.get("/api/v1/reports/sales", authenticateToken, requireAnalyticsAccess, async (req, res) => {
  const { from, to, excludeCash, excludeCard } = req.query;
  const params = [req.shopId];

  let whereClause = "WHERE a.shop_id = $1 AND a.status = 'completed'";
  if (req.user.role !== "super_admin") {
    whereClause += " AND a.save_receipt = true";
  }
  whereClause += " " + buildRevenueExclusionClause(excludeCash, excludeCard, "a");

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

app.get("/api/v1/reports/products", authenticateToken, requireAnalyticsAccess, async (req, res) => {
  const { from, to, excludeCash, excludeCard } = req.query;
  const params = [req.shopId];

  let whereClause = "WHERE ps.shop_id = $1";
  if (req.user.role !== "super_admin") {
    whereClause += " AND (a.id IS NULL OR a.save_receipt = true)";
  }
  whereClause += " " + buildRevenueExclusionClause(excludeCash, excludeCard, "a");
  if (from) {
    params.push(from);
    whereClause += ` AND ps.sale_date >= $${params.length}`;
  }
  if (to) {
    params.push(to);
    whereClause += ` AND ps.sale_date <= $${params.length}`;
  }

  try {
    const { rows } = await pool.query(
      `SELECT
        COALESCE(p.name, 'Deleted Product') as product_name,
        COALESCE(pi.variation_name, 'Standard') as variation_name,
        SUM(ps.quantity) as units_sold,
        SUM(ps.total_price) as total_revenue,
        MAX(pi.stock_quantity) as current_stock
      FROM product_sales ps
      LEFT JOIN product_inventory pi ON ps.inventory_id = pi.id
      LEFT JOIN products p ON pi.product_id = p.id
      LEFT JOIN appointments a ON ps.appointment_id = a.id
      ${whereClause}
      GROUP BY COALESCE(p.name, 'Deleted Product'), COALESCE(pi.variation_name, 'Standard')
      ORDER BY total_revenue DESC`,
      params,
    );

    const summary = rows.reduce(
      (acc, row) => {
        acc.total_revenue += Number(row.total_revenue) || 0;
        acc.total_units += Number(row.units_sold) || 0;
        return acc;
      },
      { total_revenue: 0, total_units: 0 },
    );
    res.json({ summary, details: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/v1/reports/gift-cards", authenticateToken, requireAnalyticsAccess, async (req, res) => {
  const { from, to, excludeCash, excludeCard } = req.query;
  const params = [req.shopId];

  let whereClause = "WHERE gc.shop_id = $1";
  if (excludeCash === "true") {
    whereClause += " AND gc.purchase_payment_method != 'cash'";
  }
  if (excludeCard === "true") {
    whereClause += " AND gc.purchase_payment_method != 'card'";
  }
  if (from) {
    params.push(from);
    whereClause += ` AND gc.issued_at >= $${params.length}`;
  }
  if (to) {
    params.push(to);
    whereClause += ` AND gc.issued_at <= $${params.length}`;
  }

  try {
    const { rows } = await pool.query(
      `SELECT gc.card_number, gc.customer_name, gc.initial_amount,
              gc.remaining_balance, gc.purchase_payment_method,
              gc.issued_at, gc.expires_at
       FROM gift_cards gc
       ${whereClause}
       ORDER BY gc.issued_at DESC`,
      params,
    );

    const summary = rows.reduce(
      (acc, row) => {
        acc.total_revenue += Number(row.initial_amount) || 0;
        acc.total_outstanding += Number(row.remaining_balance) || 0;
        acc.total_cards += 1;
        return acc;
      },
      { total_revenue: 0, total_outstanding: 0, total_cards: 0 },
    );
    res.json({ summary, details: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/v1/reports/staff", authenticateToken, requireAnalyticsAccess, async (req, res) => {
  const { from, to, excludeCash, excludeCard } = req.query;
  const params = [req.shopId];

  let whereClause = "WHERE a.shop_id = $1" + getVisibilityClause(req.user, "a");
  whereClause += " " + buildRevenueExclusionClause(excludeCash, excludeCard, "a");

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

app.get("/api/v1/reports/payments", authenticateToken, requireAnalyticsAccess, async (req, res) => {
  const { from, to, excludeCash, excludeCard } = req.query;
  const params = [req.shopId];

  let whereClause = "WHERE t.shop_id = $1";

  if (req.user.role !== "super_admin") {
    whereClause += " AND (a.id IS NULL OR a.save_receipt = true)";
  }

  whereClause += " " + buildTxnMethodExclusionClause(excludeCash, excludeCard, "t.");

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
app.get("/api/v1/reports/finances", authenticateToken, requireAnalyticsAccess, async (req, res) => {
  const { from, to, excludeCash, excludeCard } = req.query;
  const shopId = req.shopId;
  const isSuperAdmin = req.user.role === "super_admin";
  const cashApptClause = buildRevenueExclusionClause(excludeCash, excludeCard, "a2");
  const cashTxnClause = buildTxnMethodExclusionClause(excludeCash, excludeCard);

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
    ${cashApptClause}
  `;

  let client;
  try {
    client = await pool.connect();

    // --- A. TOTAL SALES (Services + Products) ---
    const salesRes = await client.query(
      `
      SELECT SUM(COALESCE(aps.price_override, s.price)) as total
      FROM appointment_services aps
      LEFT JOIN services s ON aps.service_id = s.id
      WHERE aps.appointment_id IN (${appointmentSubquery})
    `,
      apptParams,
    );
    const productSalesRes = await client.query(
      `
      SELECT SUM(ps.total_price) as total
      FROM product_sales ps
      WHERE ps.appointment_id IN (${appointmentSubquery})
    `,
      apptParams,
    );
    const totalSales =
      (Number(salesRes.rows[0].total) || 0) +
      (Number(productSalesRes.rows[0].total) || 0);

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
      SELECT SUM(amount) as total FROM transactions WHERE shop_id = $1 ${flowFilter} ${cashTxnClause}
    `,
      flowParams,
    );
    const totalPayments = Number(payRes.rows[0].total) || 0;

    // --- D. COLLECTED TODAY (The missing piece) ---
    const todayRes = await client.query(
      `
      SELECT SUM(amount) as total FROM transactions
      WHERE shop_id = $1 AND created_at >= CURRENT_DATE ${cashTxnClause}
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
    if (client) client.release();
  }
});
app.get(
  "/api/v1/reports/service-summary",
  authenticateToken,
  requireAnalyticsAccess,
  async (req, res) => {
    const { from, to, excludeCash, excludeCard } = req.query;
    const params = [req.shopId];
    let dateFilter = "";
    const cashExclusion = buildRevenueExclusionClause(excludeCash, excludeCard, "a");

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
          AND a.status NOT IN ('cancelled', 'no-show')
          ${dateFilter}
          ${cashExclusion}
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

  // Remote cash-filter broadcast — super_admin only
  socket.on("cash:filter:broadcast", ({ hidden }) => {
    if (socket.user.role !== "super_admin") return;
    io.to(`shop:${socket.user.shopId}`).emit("cash:filter:set", {
      hidden: !!hidden,
    });
  });

  // Remote card-filter broadcast — super_admin only, independent of cash
  socket.on("card:filter:broadcast", ({ hidden }) => {
    if (socket.user.role !== "super_admin") return;
    io.to(`shop:${socket.user.shopId}`).emit("card:filter:set", {
      hidden: !!hidden,
    });
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
      return res.status(400).json({
        error: "slot_min_time and slot_max_time must be in HH:MM format",
      });
    }
    const hours = parseInt(reminder_hours_before, 10);
    if (!Number.isInteger(hours) || hours < 1 || hours > 72) {
      return res.status(400).json({
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
    if (req.user.role !== "admin" && req.user.role !== "super_admin" && req.user.role !== "frontdesk") {
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
  if (req.user.role !== "admin" && req.user.role !== "super_admin" && req.user.role !== "frontdesk") {
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
// Lightweight: last N past appointments for the booking sidebar
app.get(
  "/api/v1/clients/:id/past-appointments",
  authenticateToken,
  async (req, res) => {
    const { id } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 5, 20);
    const threeMonthClause =
      req.user.role !== "super_admin"
        ? "AND (SELECT MIN(start_time) FROM appointment_services WHERE appointment_id = a.id) >= NOW() - INTERVAL '3 months'"
        : "";
    try {
      const { rows } = await pool.query(
        `SELECT
            a.id,
            a.status,
            (SELECT MIN(start_time) FROM appointment_services WHERE appointment_id = a.id) as start_time,
            (SELECT string_agg(s.name, ', ')
             FROM appointment_services aps
             JOIN services s ON aps.service_id = s.id
             WHERE aps.appointment_id = a.id) as service_names
         FROM appointments a
         WHERE a.client_id = $1 AND a.shop_id = $2
           AND (SELECT MIN(start_time) FROM appointment_services WHERE appointment_id = a.id) < NOW()
           ${threeMonthClause}
         ORDER BY 3 DESC
         LIMIT $3`,
        [id, req.shopId, limit],
      );
      res.json(rows);
    } catch (err) {
      console.error("Past appointments fetch error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

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

    // The cached balance is only refreshed on writes, but its formula is
    // time-dependent (appointments crossing into the past start counting).
    // Recalculate on read so the profile always shows the true balance.
    client.outstanding_balance = await recalculateClientBalance(pool, id);

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
          ) as staff_names,

          a.payment_status,

          (
            SELECT payment_method FROM transactions
            WHERE appointment_id = a.id
            ORDER BY created_at DESC LIMIT 1
          ) as payment_method

        FROM appointments a
        WHERE a.client_id = $1 AND a.shop_id = $2
          ${req.user.role !== "super_admin" ? "AND (SELECT MIN(start_time) FROM appointment_services WHERE appointment_id = a.id) >= NOW() - INTERVAL '3 months'" : ""}
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
  if (req.user.role !== "admin" && req.user.role !== "super_admin" && req.user.role !== "frontdesk") {
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
      // Restore stock for any product sales on the cancelled appointment
      await pool.query(
        `UPDATE product_inventory pi
         SET stock_quantity = pi.stock_quantity + ps.quantity
         FROM product_sales ps
         WHERE ps.inventory_id = pi.id AND ps.appointment_id = $1`,
        [id],
      );
      await pool.query("DELETE FROM product_sales WHERE appointment_id = $1", [
        id,
      ]);
      res.json({ success: true });
    } catch (err) {
      console.error("Portal appointment cancel error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

app.post(
  "/api/v1/portal/appointments/:id/confirm",
  authenticateToken,
  async (req, res) => {
    if (req.user.role !== "client") {
      return res.status(403).json({ error: "Clients only" });
    }
    const { id } = req.params;
    try {
      const check = await pool.query(
        `SELECT id FROM appointments
         WHERE id = $1 AND client_id = $2 AND shop_id = $3
           AND status NOT IN ('cancelled', 'completed')
           AND payment_status != 'paid'`,
        [id, req.user.clientId, req.shopId],
      );
      if (check.rows.length === 0) {
        return res
          .status(404)
          .json({ error: "Appointment not found or cannot be confirmed" });
      }
      await pool.query(
        `UPDATE appointments SET status = 'confirmed' WHERE id = $1`,
        [id],
      );
      res.json({ success: true });
    } catch (err) {
      console.error("Portal appointment confirm error:", err);
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

// ==================== CONTESTS & GIFT CARDS SCHEMA ====================
// Sequential IIFE: later steps (ALTER/indexes) depend on tables created earlier,
// so these cannot run as independent fire-and-forget promises.
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contests (
        id SERIAL PRIMARY KEY,
        shop_id UUID NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        start_date TIMESTAMP NOT NULL,
        end_date TIMESTAMP NOT NULL,
        image_url TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS gift_cards (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        card_number VARCHAR(50) NOT NULL,
        client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
        customer_name VARCHAR(255) NOT NULL,
        initial_amount NUMERIC(10,2) NOT NULL,
        remaining_balance NUMERIC(10,2) NOT NULL,
        purchase_payment_method VARCHAR(50),
        shop_id UUID NOT NULL REFERENCES shops(id),
        issued_at TIMESTAMP NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS gift_card_id UUID REFERENCES gift_cards(id) ON DELETE SET NULL`,
    );
    // Shared across the two rows created by a single "split" payment (e.g. part
    // gift-card + part cash in one visit), so reports can flag them as linked.
    await pool.query(
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS split_group_id UUID`,
    );
    // Lets a service be retired (menu no longer offers it) without breaking
    // past appointments that still reference it — same pattern as staff.is_active.
    await pool.query(
      `ALTER TABLE services ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true`,
    );
    // Lets a staff member keep their login/appointments without cluttering the
    // scheduler with a resource column (e.g. frontdesk-only accounts).
    await pool.query(
      `ALTER TABLE staff ADD COLUMN IF NOT EXISTS visible_in_calendar BOOLEAN NOT NULL DEFAULT true`,
    );

    // ==================== PERFORMANCE INDEXES ====================
    const startupIndexes = [
      "CREATE INDEX IF NOT EXISTS idx_transactions_appointment_id ON transactions (appointment_id)",
      "CREATE INDEX IF NOT EXISTS idx_transactions_shop_created ON transactions (shop_id, created_at)",
      "CREATE INDEX IF NOT EXISTS idx_product_sales_appointment_id ON product_sales (appointment_id)",
      "CREATE INDEX IF NOT EXISTS idx_appointments_shop_id ON appointments (shop_id)",
      "CREATE INDEX IF NOT EXISTS idx_appointments_client_id ON appointments (client_id)",
      "CREATE INDEX IF NOT EXISTS idx_clients_shop_id ON clients (shop_id)",
      "CREATE INDEX IF NOT EXISTS idx_client_files_client_id ON client_files (client_id)",
      "CREATE INDEX IF NOT EXISTS idx_gift_cards_shop_id ON gift_cards (shop_id)",
      "CREATE INDEX IF NOT EXISTS idx_gift_cards_card_number ON gift_cards (card_number)",
      "CREATE INDEX IF NOT EXISTS idx_gift_cards_client_id ON gift_cards (client_id)",
    ];
    for (const sql of startupIndexes) {
      await pool.query(sql);
    }
  } catch (err) {
    console.error("Failed to run startup schema/index setup:", err);
  }
})();

// ==================== PLATFORM / MULTI-TENANT ADMIN SCHEMA ====================
(async () => {
  try {
    await pool.query(`ALTER TABLE shops ADD COLUMN IF NOT EXISTS plan VARCHAR(50) NOT NULL DEFAULT 'trial'`);
    await pool.query(`ALTER TABLE shops ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active'`);
    await pool.query(`ALTER TABLE shops ADD COLUMN IF NOT EXISTS owner_name VARCHAR(255)`);
    await pool.query(`ALTER TABLE shops ADD COLUMN IF NOT EXISTS owner_email VARCHAR(255)`);
    await pool.query(`ALTER TABLE shops ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP`);
    await pool.query(`ALTER TABLE shops ADD COLUMN IF NOT EXISTS notes TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW()`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS platform_activity_log (
        id SERIAL PRIMARY KEY,
        actor_user_id UUID NOT NULL,
        action VARCHAR(50) NOT NULL,
        target_shop_id UUID REFERENCES shops(id) ON DELETE SET NULL,
        detail TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_platform_activity_log_shop ON platform_activity_log (target_shop_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_platform_activity_log_created ON platform_activity_log (created_at DESC)`);

    // Bootstrap the first platform owner account (shop-less) from env vars, once.
    if (process.env.OWNER_USERNAME && process.env.OWNER_PASSWORD) {
      const existing = await pool.query(`SELECT id FROM users WHERE role = 'owner' LIMIT 1`);
      if (existing.rows.length === 0) {
        const hashed = await bcrypt.hash(process.env.OWNER_PASSWORD, 12);
        await pool.query(
          `INSERT INTO users (username, password, role, shop_id) VALUES ($1, $2, 'owner', NULL)`,
          [process.env.OWNER_USERNAME, hashed],
        );
        console.log(`Bootstrapped owner account "${process.env.OWNER_USERNAME}"`);
      }
    }
  } catch (err) {
    console.error("Failed to run platform-admin schema setup:", err);
  }
})();

// ==================== LANDING PAGE / DEMO REQUESTS SCHEMA ====================
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS demo_requests (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        shop_name VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        message TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`ALTER TABLE demo_requests ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'new'`);
  } catch (err) {
    console.error("Failed to run demo-requests schema setup:", err);
  }
})();

// List all contests for the shop (admin)
app.get("/api/v1/contests", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin" && req.user.role !== "super_admin") {
    return res.status(403).json({ error: "Admins only" });
  }
  try {
    const { rows } = await pool.query(
      `SELECT id, name, description, start_date, end_date, image_url, created_at
       FROM contests WHERE shop_id = $1 ORDER BY start_date DESC`,
      [req.shopId],
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get active contest + client entry count (authenticated)
app.get("/api/v1/contests/active", authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, description, start_date, end_date, image_url
       FROM contests
       WHERE shop_id = $1 AND NOW() BETWEEN start_date AND end_date
       ORDER BY start_date DESC LIMIT 1`,
      [req.shopId],
    );
    if (rows.length === 0) return res.json(null);

    const contest = rows[0];
    const clientId = req.user.clientId || req.query.client_id;

    let entries = 0;
    if (clientId) {
      const entryRes = await pool.query(
        `SELECT COUNT(DISTINCT a.id) as entries
         FROM appointments a
         JOIN appointment_services aps ON aps.appointment_id = a.id
         WHERE a.client_id = $1
           AND a.shop_id = $2
           AND a.status = 'completed'
           AND a.payment_status = 'paid'
           AND aps.start_time >= $3
           AND aps.start_time <= $4`,
        [clientId, req.shopId, contest.start_date, contest.end_date],
      );
      entries = parseInt(entryRes.rows[0].entries) || 0;
    }

    res.json({ ...contest, entries });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create contest (admin) — image is optional
app.post(
  "/api/v1/contests",
  authenticateToken,
  dbFileUpload.single("image"),
  async (req, res) => {
    if (req.user.role !== "admin" && req.user.role !== "super_admin") {
      return res.status(403).json({ error: "Admins only" });
    }
    const { name, description, start_date, end_date } = req.body;
    if (!name || !start_date || !end_date) {
      return res
        .status(400)
        .json({ error: "name, start_date and end_date are required" });
    }
    const imageUrl = req.file
      ? `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`
      : null;
    try {
      const { rows } = await pool.query(
        `INSERT INTO contests (shop_id, name, description, start_date, end_date, image_url)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [req.shopId, name, description || null, start_date, end_date, imageUrl],
      );
      res.json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// Update contest (admin) — image is optional
app.put(
  "/api/v1/contests/:id",
  authenticateToken,
  dbFileUpload.single("image"),
  async (req, res) => {
    if (req.user.role !== "admin" && req.user.role !== "super_admin") {
      return res.status(403).json({ error: "Admins only" });
    }
    const { name, description, start_date, end_date } = req.body;
    const imageUrl = req.file
      ? `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`
      : undefined;

    try {
      const setClauses = [
        "name = $2",
        "description = $3",
        "start_date = $4",
        "end_date = $5",
      ];
      const params = [
        req.params.id,
        name,
        description || null,
        start_date,
        end_date,
        req.shopId,
      ];

      if (imageUrl !== undefined) {
        setClauses.push(`image_url = $${params.length}`);
        params.splice(params.length - 1, 0, imageUrl);
      }

      const { rows } = await pool.query(
        `UPDATE contests SET ${setClauses.join(", ")}
         WHERE id = $1 AND shop_id = $${params.length} RETURNING *`,
        params,
      );
      if (rows.length === 0)
        return res.status(404).json({ error: "Contest not found" });
      res.json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// Delete contest (admin)
app.delete("/api/v1/contests/:id", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin" && req.user.role !== "super_admin") {
    return res.status(403).json({ error: "Admins only" });
  }
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM contests WHERE id = $1 AND shop_id = $2`,
      [req.params.id, req.shopId],
    );
    if (rowCount === 0)
      return res.status(404).json({ error: "Contest not found" });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ==================== GIFT CARDS ====================

const giftCardStatus = (card) => {
  if (Number(card.remaining_balance) <= 0) return "depleted";
  if (new Date(card.expires_at) < new Date()) return "expired";
  return "active";
};

// List all gift cards for the shop (admin)
app.get("/api/v1/gift-cards", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin" && req.user.role !== "super_admin") {
    return res.status(403).json({ error: "Admins only" });
  }
  try {
    const { rows } = await pool.query(
      `SELECT id, card_number, client_id, customer_name, initial_amount,
              remaining_balance, purchase_payment_method, issued_at, expires_at
       FROM gift_cards WHERE shop_id = $1 ORDER BY issued_at DESC`,
      [req.shopId],
    );
    res.json(rows.map((c) => ({ ...c, status: giftCardStatus(c) })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Search redeemable gift cards (any authenticated staff — used at checkout)
app.get("/api/v1/gift-cards/search", authenticateToken, async (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) return res.json([]);
  try {
    const { rows } = await pool.query(
      `SELECT id, card_number, customer_name, remaining_balance, expires_at
         FROM gift_cards
         WHERE shop_id = $1
           AND remaining_balance > 0
           AND expires_at > NOW()
           AND (card_number ILIKE $2 OR customer_name ILIKE $2)
         ORDER BY issued_at DESC
         LIMIT 10`,
      [req.shopId, `%${q}%`],
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create (sell) a gift card — admin only
app.post("/api/v1/gift-cards", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin" && req.user.role !== "super_admin") {
    return res.status(403).json({ error: "Admins only" });
  }
  const {
    card_number,
    client_id,
    customer_name,
    initial_amount,
    purchase_payment_method,
  } = req.body;

  if (
    !card_number ||
    !customer_name ||
    !initial_amount ||
    Number(initial_amount) <= 0
  ) {
    return res.status(400).json({
      error:
        "card_number, customer_name and a positive initial_amount are required",
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `INSERT INTO gift_cards
         (card_number, client_id, customer_name, initial_amount, remaining_balance,
          purchase_payment_method, shop_id, issued_at, expires_at)
       VALUES ($1, $2, $3, $4, $4, $5, $6, NOW(), NOW() + INTERVAL '3 months')
       RETURNING *`,
      [
        card_number,
        client_id || null,
        customer_name,
        initial_amount,
        purchase_payment_method || "cash",
        req.shopId,
      ],
    );
    const card = rows[0];

    // Recognize revenue immediately at time of sale (no linked appointment)
    await client.query(
      `INSERT INTO transactions
         (appointment_id, client_id, amount, payment_method, transaction_type, shop_id, gift_card_id, created_at)
       VALUES (NULL, $1, $2, $3, 'gift_card_sale', $4, $5, NOW())`,
      [
        client_id || null,
        initial_amount,
        purchase_payment_method || "cash",
        req.shopId,
        card.id,
      ],
    );

    await client.query("COMMIT");
    res.json({ ...card, status: giftCardStatus(card) });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});

// Edit gift card metadata (admin only) — balance/expiry are not editable here
app.put("/api/v1/gift-cards/:id", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin" && req.user.role !== "super_admin") {
    return res.status(403).json({ error: "Admins only" });
  }
  const { card_number, customer_name, client_id } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE gift_cards
       SET card_number = $1, customer_name = $2, client_id = $3
       WHERE id = $4 AND shop_id = $5
       RETURNING *`,
      [
        card_number,
        customer_name,
        client_id || null,
        req.params.id,
        req.shopId,
      ],
    );
    if (rows.length === 0)
      return res.status(404).json({ error: "Gift card not found" });
    res.json({ ...rows[0], status: giftCardStatus(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete a gift card (admin only)
app.delete("/api/v1/gift-cards/:id", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin" && req.user.role !== "super_admin") {
    return res.status(403).json({ error: "Admins only" });
  }
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM gift_cards WHERE id = $1 AND shop_id = $2`,
      [req.params.id, req.shopId],
    );
    if (rowCount === 0)
      return res.status(404).json({ error: "Gift card not found" });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get(/(.*)/, (req, res) => {
  if (req.path.startsWith("/api")) {
    return res.status(404).json({ error: "API Route Not Found" });
  }
  res.sendFile(path.join(distPath, "index.html"));
});

if (require.main === module) {
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`Allowed Origins: ${allowedOrigins.join(", ")}`);
  });
}

module.exports = { app, server, pool };
