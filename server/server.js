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
require("./membershipService");

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
// Thrown by assertStaffAvailable below — an unconditional, no-override
// rejection (distinct from the conflicts_found/force pattern used when
// SAVING new time-off/working-hours over existing appointments).
class StaffUnavailableError extends Error {
  constructor(reason, staffId) {
    super("staff_unavailable");
    this.reason = reason; // "time_off" | "outside_working_hours"
    this.staffId = staffId;
  }
}

// Hard-blocks booking a staff member during their leave/break (staff_time_off)
// or, if they've opted into a configured schedule, outside their weekly
// working hours (staff_working_hours). Staff who never configured working
// hours (working_hours_enabled = false, the default) are unrestricted by that
// second check — only time-off applies to them, exactly as it always has.
// Uses the same timestamptz -> date/time cast convention as the existing
// (pre-existing, working) time-off conflict-check query for consistency.
const assertStaffAvailable = async (client, { staffId, shopId, startTime, durationMinutes }) => {
  if (!staffId) return;
  // Deliberately unconditional, regardless of staff_working_hours now having
  // effective-dated versions: editing an unrelated field on a past
  // appointment (recording a payment, marking a no-show) must never start
  // failing just because a staff member's schedule has since changed, since
  // every save re-validates staffId/start_time/duration whether or not the
  // time itself is being touched. Only future/current-moment bookings need
  // to respect the live schedule.
  if (new Date(startTime).getTime() < Date.now()) return;
  const duration = durationMinutes || 60;

  const timeOff = await client.query(
    `SELECT 1 FROM staff_time_off
     WHERE staff_id = $1 AND shop_id = $2
       AND (
         (type = 'leave' AND $3::timestamptz::date BETWEEN start_date AND end_date)
         OR (type = 'break' AND $3::timestamptz::date = start_date
             AND $3::timestamptz < (start_date + end_time)
             AND ($3::timestamptz + ($4 || ' minutes')::interval) > (start_date + start_time))
       )
     LIMIT 1`,
    [staffId, shopId, startTime, duration],
  );
  if (timeOff.rows.length > 0) throw new StaffUnavailableError("time_off", staffId);

  const staffRow = await client.query(
    `SELECT working_hours_enabled FROM staff WHERE id = $1 AND shop_id = $2`,
    [staffId, shopId],
  );
  if (!staffRow.rows[0]?.working_hours_enabled) return;

  // Version-scoped: resolves whichever schedule was/will be active as of this
  // appointment's own date, not necessarily "today's" pattern — a booking for
  // a date on/after a staged future version's effective_from must be checked
  // against THAT version, since by then it's the one actually governing.
  //
  // Two queries, not one: if no version can be resolved at all for this date
  // (e.g. working_hours_enabled was just turned on with only a staged FUTURE
  // version and no "current" one yet, leaving a gap before it), MAX(...)
  // returns NULL, and "effective_from = NULL" would never match any row in a
  // single combined query — silently blocking the booking instead of failing
  // open. Resolving the version first makes "no data for this date" explicit.
  const versionRow = await client.query(
    `SELECT MAX(effective_from) AS latest FROM staff_working_hours
     WHERE staff_id = $1 AND effective_from <= $2::timestamptz::date`,
    [staffId, startTime],
  );
  const latestVersion = versionRow.rows[0]?.latest;
  if (!latestVersion) return; // no schedule data as of this date — fail open

  const fits = await client.query(
    `SELECT 1 FROM staff_working_hours
     WHERE staff_id = $1 AND effective_from = $2
       AND day_of_week = EXTRACT(DOW FROM $3::timestamptz)
       AND $3::timestamptz::time >= start_time
       AND ($3::timestamptz + ($4 || ' minutes')::interval)::time <= end_time
       AND ($3::timestamptz + ($4 || ' minutes')::interval)::date = $3::timestamptz::date
     LIMIT 1`,
    [staffId, latestVersion, startTime, duration],
  );
  if (fits.rows.length === 0) throw new StaffUnavailableError("outside_working_hours", staffId);
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

        await assertStaffAvailable(client, {
          staffId: validStaffId,
          shopId,
          startTime: instanceStartIso,
          durationMinutes: svc.duration_override,
        });

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
      await assertStaffAvailable(client, {
        staffId: safeUUID(svc.staff_id),
        shopId,
        startTime: svc.start_time,
        durationMinutes: svc.duration_override,
      });
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
    allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
  }),
);
app.use(express.json());

// ==================== HEALTH CHECK ====================
// Used by the Docker healthcheck and external uptime monitoring.
// Deliberately unauthenticated (monitors won't have a JWT) and does a real
// DB round-trip so a hung/unreachable Postgres is reported as unhealthy,
// not just "the Node process is still running".
app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.status(200).json({ status: "ok" });
  } catch (err) {
    res.status(503).json({ status: "error", error: err.message });
  }
});

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

// --- HELPERS: Idempotency for the client's offline write queue ---
// Call inside an open transaction, right after BEGIN. If a cached response
// exists for this key, the caller should ROLLBACK and return it as-is
// without re-running the write.
const checkIdempotency = async (client, key, shopId) => {
  if (!key) return null;
  const { rows } = await client.query(
    "SELECT response_status, response_body FROM idempotency_keys WHERE key = $1 AND shop_id = $2",
    [key, shopId],
  );
  return rows[0] || null;
};
// Call right before COMMIT, once the response body is final.
const saveIdempotency = async (client, key, shopId, status, body) => {
  if (!key) return;
  await client.query(
    `INSERT INTO idempotency_keys (key, shop_id, response_status, response_body)
     VALUES ($1, $2, $3, $4) ON CONFLICT (key) DO NOTHING`,
    [key, shopId, status, JSON.stringify(body)],
  );
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

// --- REVENUE EXCLUSION HELPERS (Ctrl+1 hides cash + gift-cards that were themselves
// bought with cash, Ctrl+8 hides card — independent toggles). A gift-card payment is
// only cash-equivalent if the card's own purchase_payment_method was cash; a card- or
// bank-transfer-funded gift card is left alone.
//
// payment_method = 'membership' is excluded UNCONDITIONALLY, regardless of the
// Ctrl+1/Ctrl+8 toggles — this isn't a privacy setting, it's correctness: a
// membership-covered visit isn't new revenue, the money was already recognized
// as a 'membership_sale' transaction when the client bought/renewed the plan
// (that transaction uses a real payment_method like cash/card, so it's counted
// normally and is unaffected by this exclusion).
const buildRevenueExclusionClause = (excludeCash, excludeCard, alias = "a") => {
  const conditions = [`_t.payment_method = 'membership'`];
  if (excludeCash === "true") {
    conditions.push(`_t.payment_method = 'cash'`);
    conditions.push(
      `(_t.payment_method = 'gift-card' AND EXISTS (SELECT 1 FROM gift_cards _gc WHERE _gc.id = _t.gift_card_id AND _gc.purchase_payment_method = 'cash'))`,
    );
  }
  if (excludeCard === "true") conditions.push(`_t.payment_method = 'card'`);
  return `AND NOT (${alias}.payment_status = 'paid' AND EXISTS (SELECT 1 FROM transactions _t WHERE _t.appointment_id = ${alias}.id AND (${conditions.join(" OR ")})))`;
};

const buildTxnMethodExclusionClause = (excludeCash, excludeCard, columnPrefix = "") => {
  const conditions = [`${columnPrefix}payment_method = 'membership'`];
  if (excludeCash === "true") {
    conditions.push(`${columnPrefix}payment_method = 'cash'`);
    conditions.push(
      `(${columnPrefix}payment_method = 'gift-card' AND EXISTS (SELECT 1 FROM gift_cards _gc WHERE _gc.id = ${columnPrefix}gift_card_id AND _gc.purchase_payment_method = 'cash'))`,
    );
  }
  if (excludeCard === "true") conditions.push(`${columnPrefix}payment_method = 'card'`);
  return `AND NOT (${conditions.join(" OR ")})`;
};

// --- MIDDLEWARE ---

// In-memory cache of shops.force_logout_at (shopId -> ms timestamp), so the
// "disconnect all users" revocation check below never costs a DB round trip
// on the hot path. Populated at startup and refreshed only when an admin
// actually triggers a force-logout (see POST /api/v1/shop/force-logout).
const forceLogoutCache = new Map();

// Last-known live Ctrl+1/Ctrl+8 broadcast state per shop (shopId -> boolean).
// The live broadcast itself is fire-and-forget over the socket — anyone
// disconnected at the exact moment a super_admin toggles it (flaky wifi, a
// dev-server WS proxy hiccup, etc.) never receives that event and has no
// other way to learn the current state. Caching it here lets a (re)connecting
// socket be synced immediately instead of waiting for the next toggle.
const cashFilterCache = new Map();
const cardFilterCache = new Map();

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = (authHeader && authHeader.split(" ")[1]) || req.query.token;

  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);

    if (user.shopId) {
      const forcedAt = forceLogoutCache.get(user.shopId);
      if (forcedAt && user.iat * 1000 < forcedAt) {
        return res.status(401).json({ error: "session_revoked" });
      }
    }

    req.user = user;
    req.shopId = user.shopId;
    next();
  });
};

// Whether `userRole` is allowed to change the cash-hide filter given who
// currently holds the lock. An admin's lock can be released by any admin (or
// a super_admin); a super_admin's lock is exclusive to super_admin — a
// deliberate safety valve so the shop can never get stuck hidden waiting on
// one specific person.
const canUnlockCashFilter = (userRole, lockedBy) => {
  if (!lockedBy) return true;
  if (userRole === "super_admin") return true;
  return userRole === lockedBy;
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
        st.visible_in_calendar, st.working_hours_enabled,
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

// ==================== STAFF TIME OFF (LEAVE / BREAK) ====================

// All time-off entries for the shop (used to render calendar background blocks)
app.get("/api/v1/time-off", authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, staff_id, type, start_date, end_date, start_time, end_time, reason
       FROM staff_time_off WHERE shop_id = $1
       ORDER BY start_date DESC`,
      [req.shopId],
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Time-off entries for a single staff member (used by the Staff page dialog)
app.get("/api/v1/staff/:id/time-off", authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, type, start_date, end_date, start_time, end_time, reason, created_at
       FROM staff_time_off WHERE staff_id = $1 AND shop_id = $2
       ORDER BY start_date DESC`,
      [req.params.id, req.shopId],
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create a leave or break — warns about conflicting appointments unless force=true
app.post("/api/v1/staff/:id/time-off", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { type, start_date, end_date, start_time, end_time, reason, force } = req.body;

  if (!type || !["leave", "break"].includes(type)) {
    return res.status(400).json({ error: "type must be 'leave' or 'break'" });
  }
  if (!start_date || !end_date) {
    return res.status(400).json({ error: "start_date and end_date are required" });
  }
  if (type === "break" && (!start_time || !end_time)) {
    return res.status(400).json({ error: "start_time and end_time are required for a break" });
  }

  try {
    const staffCheck = await pool.query(
      `SELECT id FROM staff WHERE id = $1 AND shop_id = $2`,
      [id, req.shopId],
    );
    if (staffCheck.rows.length === 0) {
      return res.status(404).json({ error: "Staff member not found" });
    }

    // Find appointments that would conflict with this time-off window
    let conflictQuery;
    let conflictParams;
    if (type === "leave") {
      conflictQuery = `
        SELECT a.id, aps.start_time, s.name as service_name,
               c.first_name || ' ' || c.last_name as client_name
        FROM appointment_services aps
        JOIN appointments a ON a.id = aps.appointment_id
        LEFT JOIN services s ON s.id = aps.service_id
        LEFT JOIN clients c ON c.id = a.client_id
        WHERE aps.staff_id = $1 AND a.shop_id = $2 AND a.status != 'cancelled'
          AND aps.start_time::date BETWEEN $3::date AND $4::date
        ORDER BY aps.start_time`;
      conflictParams = [id, req.shopId, start_date, end_date];
    } else {
      conflictQuery = `
        SELECT a.id, aps.start_time, s.name as service_name,
               c.first_name || ' ' || c.last_name as client_name
        FROM appointment_services aps
        JOIN appointments a ON a.id = aps.appointment_id
        LEFT JOIN services s ON s.id = aps.service_id
        LEFT JOIN clients c ON c.id = a.client_id
        WHERE aps.staff_id = $1 AND a.shop_id = $2 AND a.status != 'cancelled'
          AND aps.start_time::date = $3::date
          AND aps.start_time < ($3::date + $5::time)
          AND (aps.start_time + (COALESCE(aps.duration_override, 60) || ' minutes')::interval) > ($3::date + $4::time)
        ORDER BY aps.start_time`;
      conflictParams = [id, req.shopId, start_date, start_time, end_time];
    }

    const conflicts = await pool.query(conflictQuery, conflictParams);

    if (conflicts.rows.length > 0 && force !== true) {
      return res.status(409).json({
        error: "conflicts_found",
        conflicts: conflicts.rows,
      });
    }

    const { rows } = await pool.query(
      `INSERT INTO staff_time_off
         (staff_id, shop_id, type, start_date, end_date, start_time, end_time, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        id,
        req.shopId,
        type,
        start_date,
        end_date,
        type === "break" ? start_time : null,
        type === "break" ? end_time : null,
        reason || null,
      ],
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.delete("/api/v1/staff/:id/time-off/:timeOffId", authenticateToken, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM staff_time_off WHERE id = $1 AND staff_id = $2 AND shop_id = $3`,
      [req.params.timeOffId, req.params.id, req.shopId],
    );
    if (rowCount === 0) return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Shop-wide working hours — one shot fetch for the calendar (day-view resource
// visibility + off-hours shading), mirrors the shop-wide /api/v1/time-off.
// Returns EVERY version (past/current/upcoming) unfiltered — the client
// resolves whichever one applies to the currently-displayed calendar date
// itself (see client/src/utils/staffAvailability.ts's getWorkingRangesForDate),
// so a single fetch here covers navigating to any past or future week without
// a new date-scoped endpoint. The ::text cast avoids a known bug: pg parses
// DATE into a local-midnight JS Date, which serializes to JSON in UTC and can
// silently shift the date by a day depending on timezone.
app.get("/api/v1/working-hours", authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT staff_id, day_of_week, start_time, end_time, effective_from::text AS effective_from
       FROM staff_working_hours WHERE shop_id = $1`,
      [req.shopId],
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// "current" = the version active as of today (MAX effective_from <= today);
// "upcoming" = a staged future version (MIN effective_from > today), if any —
// by construction of the POST handler below, at most one distinct future
// effective_from ever exists per staff, so this is safely a single version.
app.get("/api/v1/staff/:id/working-hours", authenticateToken, async (req, res) => {
  try {
    const staff = await pool.query(
      `SELECT working_hours_enabled FROM staff WHERE id = $1 AND shop_id = $2`,
      [req.params.id, req.shopId],
    );
    if (staff.rows.length === 0) {
      return res.status(404).json({ error: "Staff member not found" });
    }

    const current = await pool.query(
      `SELECT day_of_week, start_time, end_time, effective_from::text AS effective_from
       FROM staff_working_hours
       WHERE staff_id = $1 AND shop_id = $2
         AND effective_from = (
           SELECT MAX(effective_from) FROM staff_working_hours
           WHERE staff_id = $1 AND shop_id = $2 AND effective_from <= CURRENT_DATE)
       ORDER BY day_of_week, start_time`,
      [req.params.id, req.shopId],
    );
    const upcoming = await pool.query(
      `SELECT day_of_week, start_time, end_time, effective_from::text AS effective_from
       FROM staff_working_hours
       WHERE staff_id = $1 AND shop_id = $2
         AND effective_from = (
           SELECT MIN(effective_from) FROM staff_working_hours
           WHERE staff_id = $1 AND shop_id = $2 AND effective_from > CURRENT_DATE)
       ORDER BY day_of_week, start_time`,
      [req.params.id, req.shopId],
    );

    res.json({
      enabled: staff.rows[0].working_hours_enabled,
      current: current.rows.length > 0 ? { effective_from: current.rows[0].effective_from, ranges: current.rows } : null,
      upcoming: upcoming.rows.length > 0 ? { effective_from: upcoming.rows[0].effective_from, ranges: upcoming.rows } : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

const TIME_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_YYYYMMDD = /^\d{4}-\d{2}-\d{2}$/;

// Saves exactly ONE effective-dated version — either "current" (effective_from
// = today) or "upcoming" (effective_from in the future); which one is decided
// entirely by the submitted date, not a separate flag. Warns about
// appointments on/after this version's effective_from that it would no
// longer cover (same conflicts_found/force pattern as staff_time_off) unless
// force=true — appointments before effective_from are governed by whatever
// version applies there instead, untouched by this save. enabled=false always
// clears everything (current AND any staged upcoming version) with no
// conflict check, since disabling can only ever loosen restrictions.
app.post("/api/v1/staff/:id/working-hours", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { enabled, effective_from, schedule, force } = req.body;

  if (typeof enabled !== "boolean") {
    return res.status(400).json({ error: "enabled must be a boolean" });
  }

  let proposed = [];
  if (enabled) {
    if (!DATE_YYYYMMDD.test(effective_from || "")) {
      return res.status(400).json({ error: "effective_from must be YYYY-MM-DD" });
    }
    if (!Array.isArray(schedule)) {
      return res.status(400).json({ error: "schedule must be an array" });
    }
    const seenDays = new Set();
    for (const day of schedule) {
      const dow = day?.day_of_week;
      if (!Number.isInteger(dow) || dow < 0 || dow > 6) {
        return res.status(400).json({ error: "day_of_week must be an integer between 0 and 6" });
      }
      if (seenDays.has(dow)) {
        return res.status(400).json({ error: "duplicate day_of_week in schedule", day_of_week: dow });
      }
      seenDays.add(dow);
      if (!Array.isArray(day.ranges) || day.ranges.length === 0) {
        return res.status(400).json({ error: "each day must have at least one range", day_of_week: dow });
      }
      const sorted = [...day.ranges].sort((a, b) => (a.start_time > b.start_time ? 1 : -1));
      for (let i = 0; i < sorted.length; i++) {
        const r = sorted[i];
        if (!TIME_HHMM.test(r.start_time) || !TIME_HHMM.test(r.end_time)) {
          return res.status(400).json({ error: "start_time/end_time must be HH:MM", day_of_week: dow });
        }
        if (r.end_time <= r.start_time) {
          return res.status(400).json({ error: "end_time must be after start_time", day_of_week: dow });
        }
        if (i > 0 && r.start_time < sorted[i - 1].end_time) {
          return res.status(400).json({ error: "overlapping_ranges", day_of_week: dow });
        }
        proposed.push({ day_of_week: dow, start_time: r.start_time, end_time: r.end_time });
      }
    }
  }

  try {
    const staffCheck = await pool.query(
      `SELECT id FROM staff WHERE id = $1 AND shop_id = $2`,
      [id, req.shopId],
    );
    if (staffCheck.rows.length === 0) {
      return res.status(404).json({ error: "Staff member not found" });
    }

    let isCurrentSlot = false;
    if (enabled) {
      // Server's CURRENT_DATE (not Node's clock) is authoritative — matches
      // the timezone convention every other date/time check in this guard uses.
      const todayRow = await pool.query(`SELECT CURRENT_DATE::text AS today`);
      const today = todayRow.rows[0].today;
      if (effective_from < today) {
        return res.status(400).json({ error: "effective_from cannot be in the past" });
      }
      isCurrentSlot = effective_from === today;
    }

    if (enabled && force !== true) {
      // Asymmetric bound: saving "current" while an upcoming version is
      // already staged must not flag appointments on/after that staged
      // version's effective_from — those are its concern, not this save's.
      // Saving "upcoming" has no upper bound (nothing can exist beyond the
      // single staged slot).
      let upperBound = null;
      if (isCurrentSlot) {
        const upcomingRow = await pool.query(
          `SELECT MIN(effective_from)::text AS ef FROM staff_working_hours
           WHERE staff_id = $1 AND effective_from > CURRENT_DATE`,
          [id],
        );
        upperBound = upcomingRow.rows[0]?.ef || null;
      }

      const conflicts = await pool.query(
        `
        WITH proposed(day_of_week, start_time, end_time) AS (
          SELECT * FROM json_to_recordset($4::json) AS x(day_of_week int, start_time time, end_time time)
        )
        SELECT a.id, aps.start_time, s.name AS service_name,
               c.first_name || ' ' || c.last_name AS client_name
        FROM appointment_services aps
        JOIN appointments a ON a.id = aps.appointment_id
        LEFT JOIN services s ON s.id = aps.service_id
        LEFT JOIN clients c ON c.id = a.client_id
        WHERE aps.staff_id = $1 AND a.shop_id = $2
          AND a.status != 'cancelled' AND COALESCE(a.is_block, false) = false
          AND aps.start_time >= $3::date
          AND ($5::date IS NULL OR aps.start_time < $5::date)
          AND NOT EXISTS (
            SELECT 1 FROM proposed p
            WHERE p.day_of_week = EXTRACT(DOW FROM aps.start_time)
              AND aps.start_time::time >= p.start_time
              AND (aps.start_time + (COALESCE(aps.duration_override, 60) || ' minutes')::interval)::time <= p.end_time
              AND (aps.start_time + (COALESCE(aps.duration_override, 60) || ' minutes')::interval)::date = aps.start_time::date
          )
        ORDER BY aps.start_time`,
        [id, req.shopId, effective_from, JSON.stringify(proposed), upperBound],
      );
      if (conflicts.rows.length > 0) {
        return res.status(409).json({ error: "conflicts_found", conflicts: conflicts.rows });
      }
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (!enabled) {
        // Disabling wipes everything — current and any staged upcoming version.
        await client.query(`DELETE FROM staff_working_hours WHERE staff_id = $1`, [id]);
      } else if (isCurrentSlot) {
        // Only today's slot — never touches superseded (past) versions, which
        // must persist as the historical record the calendar's Day view relies on.
        await client.query(
          `DELETE FROM staff_working_hours WHERE staff_id = $1 AND effective_from = CURRENT_DATE`,
          [id],
        );
      } else {
        // Removes any previously-staged version regardless of its exact date —
        // this is what enforces "at most one staged upcoming version."
        await client.query(
          `DELETE FROM staff_working_hours WHERE staff_id = $1 AND effective_from > CURRENT_DATE`,
          [id],
        );
      }
      if (enabled) {
        for (const r of proposed) {
          await client.query(
            `INSERT INTO staff_working_hours (staff_id, shop_id, day_of_week, start_time, end_time, effective_from)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [id, req.shopId, r.day_of_week, r.start_time, r.end_time, effective_from],
          );
        }
      }
      await client.query(`UPDATE staff SET working_hours_enabled = $1 WHERE id = $2 AND shop_id = $3`, [
        enabled,
        id,
        req.shopId,
      ]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    res.json({ success: true, enabled, effective_from: enabled ? effective_from : null, schedule: proposed });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Cancels a staged upcoming version, leaving "current" to govern indefinitely.
// Not the same as saving an empty schedule for it (which would mean "day off
// every day starting then") — this removes the staged change entirely. No
// conflict check needed: canceling only ever loosens a not-yet-active
// restriction, same reasoning as enabled=false.
app.delete("/api/v1/staff/:id/working-hours/upcoming", authenticateToken, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM staff_working_hours WHERE staff_id = $1 AND shop_id = $2 AND effective_from > CURRENT_DATE`,
      [req.params.id, req.shopId],
    );
    res.json({ success: true, cleared: rowCount });
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
  const { slim, search, limit, offset, id } = req.query;
  try {
    // Slim mode: lightweight list for dropdowns (scheduler, booking dialog).
    // With `search` + `limit` it becomes a fast autocomplete lookup instead of
    // shipping the entire client table (used by the Gift Cards client picker).
    // With `id` it's an exact single-row lookup (used to re-hydrate the booking
    // dialog's already-selected client without loading the full client list).
    if (slim === "true") {
      const slimParams = [req.shopId];
      let slimSearchClause = "";
      if (id) {
        slimParams.push(id);
        slimSearchClause = ` AND id = $${slimParams.length}`;
      } else if (search) {
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

    // 4. Plain "staff" (not frontdesk/admin/super_admin) can only ever see their
    // own appointments, and never anything before today. Enforced here — not
    // just hidden client-side — so it can't be bypassed by calling the API
    // directly with a different date range or another staff member's id.
    let staffOwnClause = "";
    if (req.user.role === "staff") {
      if (req.user.staffId) {
        params.push(req.user.staffId);
        staffOwnClause = ` AND EXISTS (SELECT 1 FROM appointment_services aps_staff WHERE aps_staff.appointment_id = a.id AND aps_staff.staff_id = $${params.length})`;
      } else {
        // No linked staff profile — nothing to show.
        staffOwnClause = " AND FALSE";
      }
      staffOwnClause += ` AND (SELECT MIN(start_time) FROM appointment_services WHERE appointment_id = a.id) >= CURRENT_DATE`;
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
        -- True only on a client's earliest-ever appointment (by created_at,
        -- tie-broken by id) — powers the "new client" badge on the
        -- scheduler's appointment hover card. NULL-safe: a client_id-less
        -- block/hold naturally yields no match.
        (
          a.client_id IS NOT NULL AND a.id = (
            SELECT a2.id FROM appointments a2
            WHERE a2.client_id = a.client_id AND a2.shop_id = a.shop_id
            ORDER BY a2.created_at ASC, a2.id ASC
            LIMIT 1
          )
        ) as is_new_client,
        (SELECT payment_method FROM transactions WHERE appointment_id = a.id ORDER BY created_at DESC LIMIT 1) as payment_method,
        (
          SELECT gc.purchase_payment_method FROM transactions t
          JOIN gift_cards gc ON gc.id = t.gift_card_id
          WHERE t.appointment_id = a.id AND t.payment_method = 'gift-card'
          ORDER BY t.created_at DESC LIMIT 1
        ) as gift_card_source_method,
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
      WHERE a.shop_id = $1 ${visibilityClause} ${dateFilter} ${threeMonthClause} ${staffOwnClause}
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
  const idempotencyKey = req.headers["idempotency-key"] || null;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const cached = await checkIdempotency(client, idempotencyKey, req.shopId);
    if (cached) {
      await client.query("ROLLBACK");
      return res.status(cached.response_status).json(cached.response_body);
    }

    const { firstAppointmentId, validClientId } = await createAppointmentSeries(
      client,
      req.body,
      req.shopId,
    );

    let newBalance = 0;
    if (validClientId) {
      newBalance = await recalculateClientBalance(client, validClientId);
    }

    const responseBody = {
      id: firstAppointmentId,
      success: true,
      new_balance: newBalance,
    };
    await saveIdempotency(client, idempotencyKey, req.shopId, 200, responseBody);

    await client.query("COMMIT");
    res.json(responseBody);
  } catch (err) {
    await client.query("ROLLBACK");
    if (err instanceof StaffUnavailableError) {
      return res.status(422).json({ error: "staff_unavailable", reason: err.reason, staff_id: err.staffId });
    }
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
  const idempotencyKey = req.headers["idempotency-key"] || null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const cached = await checkIdempotency(client, idempotencyKey, req.shopId);
    if (cached) {
      await client.query("ROLLBACK");
      return res.status(cached.response_status).json(cached.response_body);
    }

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

    const responseBody = { success: true, new_balance: newBalance };
    await saveIdempotency(client, idempotencyKey, req.shopId, 200, responseBody);

    await client.query("COMMIT");
    res.json(responseBody);
  } catch (err) {
    await client.query("ROLLBACK");
    if (err instanceof StaffUnavailableError) {
      return res.status(422).json({ error: "staff_unavailable", reason: err.reason, staff_id: err.staffId });
    }
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
    redemptions, // [{ service_id, count }] — required when payment_method === 'membership'
    amount2,
    payment_method2,
    gift_card_id2,
    redemptions2,
  } = req.body;

  // Membership legs derive their own amount server-side from validated
  // quota redemptions — the client never gets to assert an amount for them.
  if (payment_method !== "membership" && (!amount || Number(amount) <= 0)) {
    return res.status(400).json({ error: "Invalid payment amount" });
  }
  if (payment_method === "gift-card" && !gift_card_id) {
    return res
      .status(400)
      .json({ error: "gift_card_id is required for gift-card payments" });
  }
  if (payment_method === "membership" && (!redemptions || !redemptions.length)) {
    return res.status(400).json({ error: "redemptions is required for membership payments" });
  }
  const hasSecondLeg =
    (amount2 !== undefined && amount2 !== null && Number(amount2) > 0) ||
    (payment_method2 === "membership" && redemptions2 && redemptions2.length > 0);
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
    if (payment_method2 === "membership" && (!redemptions2 || !redemptions2.length)) {
      return res.status(400).json({ error: "redemptions2 is required for a membership second payment" });
    }
  }

  const idempotencyKey = req.headers["idempotency-key"] || null;
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

  // Membership redemption is deliberately its own path rather than a variant
  // of processLeg above: it only ever pays for services in THIS appointment
  // (never old debt — quota is tied to specific covered services in this
  // visit), and its "amount" is derived from validated quota usage, not
  // asserted by the client. Mirrors applyPaymentToAppointment's bookkeeping
  // (transactions row + appointment payment_status/deposit_amount) without
  // touching the FIFO cash/card/gift-card logic above at all.
  const processMembershipLeg = async (redemptionList, splitGroupId) => {
    const membershipRes = await client.query(
      `SELECT * FROM client_memberships WHERE client_id = $1 AND shop_id = $2 AND status = 'active'`,
      [client_id, req.shopId],
    );
    if (membershipRes.rows.length === 0) return { error: "No active membership found for this client" };
    const membership = membershipRes.rows[0];

    const tierServicesRes = await client.query(
      `SELECT service_id, quota_per_month FROM membership_tier_services WHERE tier_id = $1`,
      [membership.tier_id],
    );
    const coverage = new Map(tierServicesRes.rows.map((r) => [r.service_id, r.quota_per_month]));

    let totalAmount = 0;
    const usageRowsToInsert = []; // { service_id }

    for (const redemption of redemptionList) {
      const { service_id, count } = redemption;
      const qty = Number(count) || 0;
      if (qty <= 0) continue;

      if (!coverage.has(service_id)) {
        return { error: "One of the selected services isn't covered by this membership" };
      }
      const quotaPerMonth = coverage.get(service_id);

      if (quotaPerMonth !== null) {
        const usedRes = await client.query(
          `SELECT COUNT(*) FROM membership_usage
           WHERE client_membership_id = $1 AND service_id = $2 AND used_at >= date_trunc('month', NOW())`,
          [membership.id, service_id],
        );
        const usedThisMonth = parseInt(usedRes.rows[0].count);
        if (usedThisMonth + qty > quotaPerMonth) {
          return { error: "Not enough remaining membership quota for one of the selected services" };
        }
      }

      const apptServicesRes = await client.query(
        `SELECT id, COALESCE(price_override, (SELECT price FROM services WHERE id = $2)) as price
         FROM appointment_services WHERE appointment_id = $1 AND service_id = $2
         ORDER BY id LIMIT $3`,
        [appointment_id, service_id, qty],
      );
      if (apptServicesRes.rows.length < qty) {
        return { error: "This appointment doesn't have that many occurrences of one of the selected services" };
      }

      for (const row of apptServicesRes.rows) {
        totalAmount += Number(row.price);
        usageRowsToInsert.push({ service_id });
      }
    }

    if (usageRowsToInsert.length === 0) {
      return { error: "Nothing was selected to redeem via membership" };
    }

    for (const usage of usageRowsToInsert) {
      await client.query(
        `INSERT INTO membership_usage (client_membership_id, service_id, appointment_id, used_at)
         VALUES ($1, $2, $3, NOW())`,
        [membership.id, usage.service_id, appointment_id],
      );
    }

    await client.query(
      `INSERT INTO transactions (appointment_id, client_id, amount, payment_method, transaction_type, shop_id, split_group_id, created_at)
       VALUES ($1, $2, $3, 'membership', 'payment', $4, $5, NOW())`,
      [appointment_id, client_id, totalAmount, req.shopId, splitGroupId],
    );

    const priceRes = await client.query(
      `SELECT
         COALESCE((SELECT SUM(price_override) FROM appointment_services WHERE appointment_id = $1), 0)
         + COALESCE((SELECT SUM(total_price) FROM product_sales WHERE appointment_id = $1), 0) as total_price`,
      [appointment_id],
    );
    const totalPrice = Number(priceRes.rows[0].total_price);

    const alreadyPaidRes = await client.query(
      `SELECT COALESCE(SUM(amount), 0) as paid FROM transactions WHERE appointment_id = $1`,
      [appointment_id],
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
        totalAmount,
        appointment_id,
        req.shopId,
      ],
    );

    return { error: null };
  };

  try {
    await client.query("BEGIN");

    const cached = await checkIdempotency(client, idempotencyKey, req.shopId);
    if (cached) {
      await client.query("ROLLBACK");
      return res.status(cached.response_status).json(cached.response_body);
    }

    // A shared id links both rows of a split payment so reports can flag them
    const splitGroupId = hasSecondLeg ? crypto.randomUUID() : null;

    const leg1Error =
      payment_method === "membership"
        ? (await processMembershipLeg(redemptions, splitGroupId)).error
        : await processLeg({
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
      const leg2Error =
        payment_method2 === "membership"
          ? (await processMembershipLeg(redemptions2, splitGroupId)).error
          : await processLeg({
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

    const responseBody = { success: true, new_balance: newBalance };
    await saveIdempotency(client, idempotencyKey, req.shopId, 200, responseBody);

    await client.query("COMMIT");
    res.json(responseBody);
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
  const params = [req.shopId]; // $1, shared by both subqueries below

  // --- Service revenue/hours per staff (existing behavior) ---
  let svcWhere = "WHERE a.shop_id = $1" + getVisibilityClause(req.user, "a");
  svcWhere += " " + buildRevenueExclusionClause(excludeCash, excludeCard, "a");
  if (from) {
    params.push(from);
    svcWhere += ` AND aps.start_time >= $${params.length}`;
  }
  if (to) {
    params.push(to);
    svcWhere += ` AND aps.start_time <= $${params.length}`;
  }

  // --- Gift cards sold per staff member (Frontdesk / null sales are excluded —
  // there's no staff member to attribute them to in a per-staff breakdown) ---
  let gcWhere = "WHERE gc.shop_id = $1 AND gc.sold_by_staff_id IS NOT NULL";
  if (excludeCash === "true") gcWhere += " AND gc.purchase_payment_method != 'cash'";
  if (excludeCard === "true") gcWhere += " AND gc.purchase_payment_method != 'card'";
  if (from) {
    params.push(from);
    gcWhere += ` AND gc.issued_at >= $${params.length}`;
  }
  if (to) {
    params.push(to);
    gcWhere += ` AND gc.issued_at <= $${params.length}`;
  }

  try {
    const { rows } = await pool.query(
      `SELECT st.id as staff_id, st.name as staff_name,
        COALESCE(ss.appointment_count, 0) as appointment_count,
        COALESCE(ss.total_hours, 0) as total_hours,
        COALESCE(ss.total_revenue, 0) as total_revenue,
        COALESCE(gcs.gift_card_count, 0) as gift_card_count,
        COALESCE(gcs.gift_card_revenue, 0) as gift_card_revenue
      FROM staff st
      LEFT JOIN (
        SELECT aps.staff_id, COUNT(aps.id) as appointment_count,
          SUM(COALESCE(aps.duration_override, s.duration_minutes)) as total_hours,
          SUM(COALESCE(aps.price_override, s.price)) as total_revenue
        FROM appointment_services aps
        JOIN services s ON aps.service_id = s.id
        JOIN appointments a ON aps.appointment_id = a.id
        ${svcWhere}
        GROUP BY aps.staff_id
      ) ss ON ss.staff_id = st.id
      LEFT JOIN (
        SELECT gc.sold_by_staff_id, COUNT(*) as gift_card_count, SUM(gc.initial_amount) as gift_card_revenue
        FROM gift_cards gc
        ${gcWhere}
        GROUP BY gc.sold_by_staff_id
      ) gcs ON gcs.sold_by_staff_id = st.id
      WHERE st.shop_id = $1 AND (ss.staff_id IS NOT NULL OR gcs.sold_by_staff_id IS NOT NULL)
      ORDER BY total_revenue DESC`,
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
io.on("connection", async (socket) => {
  socket.join(`shop:${socket.user.shopId}`);

  // Sync this (re)connecting socket to the shop's current cash/card-filter
  // state. A live broadcast only reaches sockets connected at the exact
  // moment it fires — anyone who was mid-reconnect otherwise stays stuck on
  // stale state (visible cash appointments that should be hidden, or vice
  // versa) until someone happens to toggle it again. Checked fresh on every
  // connection rather than only at login, since a release can also be
  // missed while disconnected.
  try {
    const shopId = socket.user.shopId;
    if (shopId) {
      const shopRes = await pool.query(
        `SELECT force_hide_cash, force_hide_cash_locked_by FROM shops WHERE id = $1`,
        [shopId],
      );
      const hardLocked = !!shopRes.rows[0]?.force_hide_cash;
      if (hardLocked) {
        socket.emit("cash:filter:set", {
          hidden: true,
          lockedBy: shopRes.rows[0]?.force_hide_cash_locked_by || null,
        });
      } else {
        socket.emit("cash:lock:released");
        if (cashFilterCache.has(shopId)) {
          socket.emit("cash:filter:set", { hidden: cashFilterCache.get(shopId), lockedBy: null });
        }
      }
      if (cardFilterCache.has(shopId)) {
        socket.emit("card:filter:set", { hidden: cardFilterCache.get(shopId) });
      }
    }
  } catch (err) {
    console.error("Failed to sync filter state on connect:", err);
  }

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
    cashFilterCache.set(socket.user.shopId, !!hidden);
    io.to(`shop:${socket.user.shopId}`).emit("cash:filter:set", {
      hidden: !!hidden,
    });
  });

  // Remote card-filter broadcast — super_admin only, independent of cash
  socket.on("card:filter:broadcast", ({ hidden }) => {
    if (socket.user.role !== "super_admin") return;
    cardFilterCache.set(socket.user.shopId, !!hidden);
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

// Force-logout every user in this shop (revokes all previously-issued tokens
// on their next request) and locks Ctrl+1 (hide cash) shop-wide. The calling
// admin is transparently re-issued a fresh token so their own session survives.
app.post("/api/v1/shop/force-logout", authenticateToken, async (req, res) => {
  if (req.user.role !== "super_admin") {
    return res.status(403).json({ error: "Super admins only" });
  }
  try {
    // Truncated to whole seconds to match JWT `iat` granularity — otherwise the
    // admin's own token, re-issued a few milliseconds later in this same
    // request, could land in the same second but "before" a sub-second NOW()
    // and get spuriously rejected as revoked.
    const { rows } = await pool.query(
      `UPDATE shops SET force_logout_at = date_trunc('second', NOW()), force_hide_cash = true, force_hide_cash_locked_by = 'super_admin'
       WHERE id = $1 RETURNING force_logout_at`,
      [req.shopId],
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Shop not found" });
    }

    forceLogoutCache.set(req.shopId, new Date(rows[0].force_logout_at).getTime());
    cashFilterCache.set(req.shopId, true);

    // Re-issue the calling admin a fresh token (new iat) so their own session
    // survives the revocation that just invalidated everyone else's.
    const freshToken = jwt.sign(
      {
        userId: req.user.userId,
        username: req.user.username,
        role: req.user.role,
        shopId: req.user.shopId,
        staffId: req.user.staffId,
        clientId: req.user.clientId,
      },
      process.env.JWT_SECRET,
      { expiresIn: "24h" },
    );

    // Immediate effect for anyone currently connected; the revocation above
    // guarantees it for everyone else on their next request regardless.
    io.to(`shop:${req.shopId}`).emit("force:logout");
    io.to(`shop:${req.shopId}`).emit("cash:filter:set", { hidden: true, lockedBy: "super_admin" });

    res.json({ token: freshToken });
  } catch (err) {
    console.error("Error forcing shop logout:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Releases the shop-wide Ctrl+1 lock set by force-logout above.
app.post("/api/v1/shop/release-cash-lock", authenticateToken, async (req, res) => {
  if (req.user.role !== "super_admin") {
    return res.status(403).json({ error: "Super admins only" });
  }
  try {
    const { rowCount } = await pool.query(
      `UPDATE shops SET force_hide_cash = false, force_hide_cash_locked_by = NULL WHERE id = $1`,
      [req.shopId],
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: "Shop not found" });
    }
    cashFilterCache.delete(req.shopId);

    // Distinct from cash:filter:set on purpose — releasing the lock hands
    // control back to each staff member, it should not also force-unhide
    // cash figures for everyone the instant an admin clicks it.
    io.to(`shop:${req.shopId}`).emit("cash:lock:released");

    res.json({ success: true });
  } catch (err) {
    console.error("Error releasing cash lock:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Toggles the shop-wide cash-hide filter and broadcasts it live — used by
// both admin and super_admin (via Ctrl+1). Turning it ON locks it to the
// caller's tier (see canUnlockCashFilter); turning it OFF clears the lock
// entirely. Persisted in shops.force_hide_cash(_locked_by) — not just a live
// socket push — so it's also correct for anyone who logs in fresh or
// reconnects later (see the socket connection handler and /filter-state).
app.post("/api/v1/shop/cash-filter", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin" && req.user.role !== "super_admin") {
    return res.status(403).json({ error: "Admins only" });
  }
  const hidden = !!req.body.hidden;
  try {
    const shopRes = await pool.query(
      `SELECT force_hide_cash_locked_by FROM shops WHERE id = $1`,
      [req.shopId],
    );
    if (shopRes.rows.length === 0) {
      return res.status(404).json({ error: "Shop not found" });
    }
    const lockedBy = shopRes.rows[0].force_hide_cash_locked_by;
    if (!canUnlockCashFilter(req.user.role, lockedBy)) {
      return res.status(403).json({
        error:
          lockedBy === "super_admin"
            ? "This filter is locked by a super admin. Only a super admin can change it."
            : "This filter is locked by another admin. Ask them, or a super admin can override it.",
      });
    }

    const newLockedBy = hidden ? req.user.role : null;
    await pool.query(
      `UPDATE shops SET force_hide_cash = $1, force_hide_cash_locked_by = $2 WHERE id = $3`,
      [hidden, newLockedBy, req.shopId],
    );
    if (hidden) {
      cashFilterCache.set(req.shopId, true);
    } else {
      cashFilterCache.delete(req.shopId);
    }

    if (hidden) {
      io.to(`shop:${req.shopId}`).emit("cash:filter:set", { hidden: true, lockedBy: newLockedBy });
    } else {
      io.to(`shop:${req.shopId}`).emit("cash:lock:released");
      io.to(`shop:${req.shopId}`).emit("cash:filter:set", { hidden: false, lockedBy: null });
    }

    res.json({ success: true, hidden, lockedBy: newLockedBy });
  } catch (err) {
    console.error("Error updating cash filter:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Plain-HTTP fallback for the cash/card-filter socket broadcasts above.
// A phone browser suspends JS and silently drops its WebSocket while
// backgrounded — the socket-connect sync only helps once the app is running
// again to receive it, which can lag well behind the user actually reopening
// the tab. A normal fetch on foreground/mount doesn't depend on a live
// socket at all, so the client calls this instead of waiting on one.
app.get("/api/v1/shop/filter-state", authenticateToken, async (req, res) => {
  try {
    if (!req.shopId) {
      return res.json({ cashLocked: false, cashLockedBy: null, cashHidden: null, cardHidden: null });
    }
    const { rows } = await pool.query(
      `SELECT force_hide_cash, force_hide_cash_locked_by FROM shops WHERE id = $1`,
      [req.shopId],
    );
    const hardLocked = !!rows[0]?.force_hide_cash;
    const lockedBy = rows[0]?.force_hide_cash_locked_by || null;
    res.json({
      cashLocked: hardLocked,
      cashLockedBy: hardLocked ? lockedBy : null,
      cashHidden: hardLocked
        ? true
        : cashFilterCache.has(req.shopId)
          ? cashFilterCache.get(req.shopId)
          : null,
      cardHidden: cardFilterCache.has(req.shopId) ? cardFilterCache.get(req.shopId) : null,
    });
  } catch (err) {
    console.error("Error fetching filter state:", err);
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
             WHERE aps.appointment_id = a.id) as service_names,
            (SELECT string_agg(DISTINCT st.name, ', ')
             FROM appointment_services aps
             JOIN staff st ON aps.staff_id = st.id
             WHERE aps.appointment_id = a.id) as staff_names
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
          ) as payment_method,

          (
            SELECT gc.purchase_payment_method FROM transactions t
            JOIN gift_cards gc ON gc.id = t.gift_card_id
            WHERE t.appointment_id = a.id AND t.payment_method = 'gift-card'
            ORDER BY t.created_at DESC LIMIT 1
          ) as gift_card_source_method

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

// Lightens a shop's brand color into a subtle background tint for email
// templates (e.g. "#ff93d4" -> "rgba(255, 147, 212, 0.08)"). Falls back to a
// neutral gray tint if the color is missing/malformed.
const hexToRgba = (hex, alpha) => {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!match) return `rgba(17, 24, 39, ${alpha})`;
  const int = parseInt(match[1], 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

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

    // Fetch shop branding
    const shopRes = await pool.query(
      "SELECT name, reply_email, primary_color FROM shops WHERE id = $1",
      [req.shopId],
    );
    const shopRow = shopRes.rows[0] || {};
    const replyEmail = shopRow.reply_email || null;
    const shopName = shopRow.name || req.user.shopName || process.env.APP_NAME || "Booking";
    const brandColor = shopRow.primary_color || "#111827";
    const brandTint = hexToRgba(brandColor, 0.08);
    const brandTintBorder = hexToRgba(brandColor, 0.2);
    const brandShadow = hexToRgba(brandColor, 0.3);

    // Generate temporary token for signup
    const inviteToken = jwt.sign(
      { clientId: id, shopId: req.shopId, email: client.email },
      process.env.JWT_SECRET,
      { expiresIn: "48h" },
    );

    const signupUrl = `${process.env.FRONTEND_URL}/signup?token=${inviteToken}`;
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
      from: `"${shopName}" <${process.env.EMAIL_USER}>`,
      ...(replyEmail && { replyTo: replyEmail }),
      to: client.email,
      subject: "Invitation to your Client Portal",
      attachments: [
        {
          filename: "logo.png",
          path: path.join(__dirname, "../client/static/logo for photos-02.png"),
          cid: "brand-logo",
        },
      ],
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
      .btn-hover:hover { opacity: 0.9 !important; transform: translateY(-2px); }
    </style>
  </head>
  <body style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: ${brandTint}; padding: 40px 10px; margin: 0; -webkit-font-smoothing: antialiased;">
    <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 32px; overflow: hidden; box-shadow: 0 20px 25px -5px ${hexToRgba(brandColor, 0.1)}, 0 10px 10px -5px rgba(0, 0, 0, 0.04);">

      <div style="padding: 40px 40px 20px 40px; text-align: left">
        <img src="cid:brand-logo" alt="${shopName}" width="48" height="48" style="width: 48px; height: 48px; object-fit: contain; margin-bottom: 16px;" />
        <div style="display: inline-block; background-color: ${brandColor}; color: white; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 700; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.05em;">
          Πρόσκληση
        </div>
        <h2 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.025em;">
          <span style="color: #111827">${shopName}</span><span style="color: ${brandColor}"> Portal</span>
        </h2>
      </div>

      <div class="inner-padding" style="padding: 0 40px 40px 40px">
        <h1 style="color: #111827; font-size: 32px; font-weight: 800; margin-bottom: 24px; line-height: 1.1; letter-spacing: -1px;">
          Καλώς ήρθατε στο <span style="color: ${brandColor}">Online Portal</span> μας
        </h1>

        <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin-bottom: 16px;">
          Γεια σας ${client.first_name},
        </p>
        <p style="color: #4b5563; font-size: 16px; line-height: 1.6">
          Είμαστε ενθουσιασμένοι που σας προσκαλούμε στη νέα μας πλατφόρμα. Εδώ μπορείτε να διαχειρίζεστε τα ραντεβού σας και να έχετε πρόσβαση στα έγγραφά σας 24/7.
        </p>

        <div style="background-color: ${brandTint}; border-radius: 24px; padding: 30px; margin: 32px 0; border: 1px solid ${brandTintBorder};">
          <ul style="color: #374151; font-size: 15px; padding-left: 0; list-style: none; margin: 0;">
            <li style="margin-bottom: 12px; display: flex; align-items: center;">
              <span style="color: ${brandColor}; margin-right: 12px; font-size: 18px;">📅</span>
              <strong>Προβολή ραντεβού:</strong> Δείτε τα επόμενα ραντεβού σας.
            </li>
            <li style="margin-bottom: 12px; display: flex; align-items: center;">
              <span style="color: ${brandColor}; margin-right: 12px; font-size: 18px;">🕒</span>
              <strong>Ιστορικό:</strong> Πλήρης έλεγχος των επισκέψεών σας.
            </li>
            <li style="display: flex; align-items: center;">
              <span style="color: ${brandColor}; margin-right: 12px; font-size: 18px;">📁</span>
              <strong>Αρχεία:</strong> Κατεβάστε σημαντικά έγγραφα και οδηγίες.
            </li>
          </ul>
        </div>

        <div style="text-align: center; margin-top: 40px;">
          <a href="${signupUrl}" class="btn-hover button-stack" style="display: inline-block; background-color: ${brandColor}; color: white; padding: 18px 40px; border-radius: 16px; text-decoration: none; font-weight: 700; font-size: 16px; transition: all 0.2s ease; box-shadow: 0 10px 15px -3px ${brandShadow};">
            Ενεργοποίηση Λογαριασμού
          </a>
          <p style="color: #9ca3af; font-size: 12px; margin-top: 25px;">
             Αυτός ο σύνδεσμος θα λήξει σε 48 ώρες για την ασφάλειά σας.
          </p>
        </div>
      </div>

      <div style="background-color: #fff; padding: 40px; text-align: center; border-top: 1px solid ${hexToRgba(brandColor, 0.1)};">
        <p style="color: #111827; font-size: 16px; font-weight: 700; margin-bottom: 8px;">
          ${shopName}<span style="color: ${brandColor}"> Booking</span>
        </p>
        <p style="color: #9ca3af; font-size: 12px; margin: 0;">
          © ${new Date().getFullYear()} Powered by ${process.env.APP_NAME || "Booking"}
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
    // Which staff member sold the card. NULL means "Frontdesk" (no specific
    // staff member attributed) — the app always sends an explicit value (a
    // staff id or null-for-frontdesk), this is just nullable at the DB level.
    await pool.query(
      `ALTER TABLE gift_cards ADD COLUMN IF NOT EXISTS sold_by_staff_id UUID REFERENCES staff(id) ON DELETE SET NULL`,
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

    // Staff leave (full day(s) off) and breaks (a time window on one day).
    // start_time/end_time are NULL for a leave entry (the whole day is off).
    await pool.query(`
      CREATE TABLE IF NOT EXISTS staff_time_off (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
        shop_id UUID NOT NULL REFERENCES shops(id),
        type VARCHAR(10) NOT NULL CHECK (type IN ('leave', 'break')),
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        start_time TIME,
        end_time TIME,
        reason TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Recurring weekly working-hours pattern. false (default) means "never
    // configured" — fully unrestricted, exactly today's behavior for every
    // pre-existing staff member. Once true, staff_working_hours rows become
    // authoritative: a day with no rows is a day off; a day with rows is only
    // bookable within them (multiple rows per day = a split shift).
    await pool.query(
      `ALTER TABLE staff ADD COLUMN IF NOT EXISTS working_hours_enabled BOOLEAN NOT NULL DEFAULT false`,
    );
    await pool.query(`
      CREATE TABLE IF NOT EXISTS staff_working_hours (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
        shop_id UUID NOT NULL REFERENCES shops(id),
        day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        CHECK (end_time > start_time)
      )
    `);
    // Effective-dated schedule versions: rows sharing (staff_id, effective_from)
    // collectively form one version. "Current" and "upcoming" aren't stored
    // states — they're just whichever version has the latest effective_from
    // <=/> CURRENT_DATE at query time, so a staged version becomes current
    // automatically the day it arrives, with no rollover job needed. Existing
    // rows default to today, which resolves identically to the old
    // single-pattern behavior for every past date (no version found -> unrestricted).
    await pool.query(
      `ALTER TABLE staff_working_hours ADD COLUMN IF NOT EXISTS effective_from DATE NOT NULL DEFAULT CURRENT_DATE`,
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
      "CREATE INDEX IF NOT EXISTS idx_gift_cards_sold_by_staff_id ON gift_cards (sold_by_staff_id)",
      "CREATE INDEX IF NOT EXISTS idx_staff_time_off_staff_id ON staff_time_off (staff_id)",
      "CREATE INDEX IF NOT EXISTS idx_staff_time_off_dates ON staff_time_off (start_date, end_date)",
      "CREATE INDEX IF NOT EXISTS idx_staff_working_hours_staff_id ON staff_working_hours (staff_id)",
      "CREATE INDEX IF NOT EXISTS idx_staff_working_hours_staff_day ON staff_working_hours (staff_id, day_of_week)",
      "CREATE INDEX IF NOT EXISTS idx_staff_working_hours_shop_id ON staff_working_hours (shop_id)",
      "CREATE INDEX IF NOT EXISTS idx_staff_working_hours_staff_effective ON staff_working_hours (staff_id, effective_from)",
    ];
    for (const sql of startupIndexes) {
      await pool.query(sql);
    }
  } catch (err) {
    console.error("Failed to run startup schema/index setup:", err);
  }
})();

// ==================== OFFLINE-SYNC IDEMPOTENCY ====================
// Backs the client's IndexedDB offline write queue: a queued
// appointment/payment write carries an Idempotency-Key header, and if the
// same key is replayed (e.g. a flaky reconnect causes a retry after the
// first attempt already succeeded), the cached response is returned instead
// of re-running the write.
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS idempotency_keys (
        key VARCHAR(100) PRIMARY KEY,
        shop_id UUID NOT NULL REFERENCES shops(id),
        response_status INT NOT NULL,
        response_body JSONB NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created_at ON idempotency_keys (created_at)",
    );
  } catch (err) {
    console.error("Failed to run idempotency_keys schema setup:", err);
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
    // "Disconnect all users" admin action: any JWT issued before this timestamp
    // is rejected by authenticateToken (see forceLogoutCache below). Combined
    // with force_hide_cash, a persisted shop-wide Ctrl+1 lock applied at login.
    await pool.query(`ALTER TABLE shops ADD COLUMN IF NOT EXISTS force_logout_at TIMESTAMP`);
    await pool.query(`ALTER TABLE shops ADD COLUMN IF NOT EXISTS force_hide_cash BOOLEAN NOT NULL DEFAULT false`);
    // Which tier currently owns the cash-hide lock ('admin' | 'super_admin' |
    // NULL when unlocked) — an admin's lock can be released by any admin or a
    // super_admin, but a super_admin's lock can only be released by a
    // super_admin. See canUnlockCashFilter.
    await pool.query(`ALTER TABLE shops ADD COLUMN IF NOT EXISTS force_hide_cash_locked_by VARCHAR(20)`);
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

    // Warm the in-memory force-logout cache so a restart doesn't silently
    // re-accept tokens that were revoked before the server went down.
    const { rows: forcedShops } = await pool.query(
      `SELECT id, force_logout_at FROM shops WHERE force_logout_at IS NOT NULL`,
    );
    for (const s of forcedShops) {
      forceLogoutCache.set(s.id, new Date(s.force_logout_at).getTime());
    }
  } catch (err) {
    console.error("Failed to run platform-admin schema setup:", err);
  }
})();

// ==================== MEMBERSHIP CLUB SCHEMA ====================
// Sequential IIFE: later tables/columns reference earlier ones.
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS membership_tiers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        shop_id UUID NOT NULL REFERENCES shops(id),
        name VARCHAR(100) NOT NULL,
        monthly_price NUMERIC(10,2) NOT NULL DEFAULT 0,
        yearly_price NUMERIC(10,2) NOT NULL DEFAULT 0,
        color VARCHAR(20),
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT true,
        grace_period_days INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // What a tier covers. quota_per_month = NULL means unlimited.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS membership_tier_services (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tier_id UUID NOT NULL REFERENCES membership_tiers(id) ON DELETE CASCADE,
        service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
        quota_per_month INTEGER,
        UNIQUE (tier_id, service_id)
      )
    `);

    // A client's enrollment. billing_cycle is payment frequency only — quotas
    // always reset monthly regardless of monthly/yearly billing (see plan).
    await pool.query(`
      CREATE TABLE IF NOT EXISTS client_memberships (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        shop_id UUID NOT NULL REFERENCES shops(id),
        tier_id UUID NOT NULL REFERENCES membership_tiers(id),
        billing_cycle VARCHAR(10) NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
        status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled', 'expired')),
        started_at TIMESTAMP NOT NULL DEFAULT NOW(),
        current_period_start TIMESTAMP NOT NULL DEFAULT NOW(),
        current_period_end TIMESTAMP NOT NULL,
        last_payment_recorded_at TIMESTAMP,
        renewal_reminder_sent_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // One row per redeemed visit. Remaining quota for the current month is
    // always computed as quota_per_month - COUNT(rows with used_at in the
    // current calendar month) — no separate "reset" write needed.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS membership_usage (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_membership_id UUID NOT NULL REFERENCES client_memberships(id) ON DELETE CASCADE,
        service_id UUID NOT NULL REFERENCES services(id),
        appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
        used_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Every client gets a QR code, independent of membership — used for staff
    // lookup and (per the contest rework below) registering contest entries.
    await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS qr_token UUID DEFAULT gen_random_uuid()`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_qr_token ON clients (qr_token)`);

    // Contest participation via QR scan — replaces the old computed
    // "1 entry per completed+paid appointment" mechanic entirely. The unique
    // constraint enforces at most one scan-entry per client per contest per day.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contest_entries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        contest_id INTEGER NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
        client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        shop_id UUID NOT NULL REFERENCES shops(id),
        entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE (contest_id, client_id, entry_date)
      )
    `);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_membership_tier_services_tier ON membership_tier_services (tier_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_client_memberships_client ON client_memberships (client_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_client_memberships_shop_status ON client_memberships (shop_id, status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_membership_usage_membership ON membership_usage (client_membership_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_membership_usage_used_at ON membership_usage (used_at)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_contest_entries_contest_client ON contest_entries (contest_id, client_id)`);
  } catch (err) {
    console.error("Failed to run membership-club schema setup:", err);
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

    // Entries now come exclusively from QR-scan check-ins at the front desk
    // (contest_entries) — the old "1 entry per completed+paid appointment"
    // auto-count has been retired entirely.
    let entries = 0;
    if (clientId) {
      const entryRes = await pool.query(
        `SELECT COUNT(*) FROM contest_entries WHERE contest_id = $1 AND client_id = $2`,
        [contest.id, clientId],
      );
      entries = parseInt(entryRes.rows[0].count) || 0;
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
      `SELECT gc.id, gc.card_number, gc.client_id, gc.customer_name, gc.initial_amount,
              gc.remaining_balance, gc.purchase_payment_method, gc.issued_at, gc.expires_at,
              gc.sold_by_staff_id, st.name as sold_by_name,
              (
                SELECT MAX(t.created_at) FROM transactions t
                WHERE t.gift_card_id = gc.id AND t.payment_method = 'gift-card'
              ) as last_used_at
       FROM gift_cards gc
       LEFT JOIN staff st ON st.id = gc.sold_by_staff_id
       WHERE gc.shop_id = $1 ORDER BY gc.issued_at DESC`,
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
    sold_by_staff_id,
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
  // sold_by_staff_id is a required field in the app: either a real staff id or
  // null for "Frontdesk". Only a genuinely missing key is rejected.
  if (sold_by_staff_id === undefined) {
    return res.status(400).json({
      error: "sold_by_staff_id is required (use null for Frontdesk)",
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `INSERT INTO gift_cards
         (card_number, client_id, customer_name, initial_amount, remaining_balance,
          purchase_payment_method, shop_id, issued_at, expires_at, sold_by_staff_id)
       VALUES ($1, $2, $3, $4, $4, $5, $6, NOW(), NOW() + INTERVAL '3 months', $7)
       RETURNING *`,
      [
        card_number,
        client_id || null,
        customer_name,
        initial_amount,
        purchase_payment_method || "cash",
        req.shopId,
        sold_by_staff_id || null,
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
  const { card_number, customer_name, client_id, sold_by_staff_id } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE gift_cards
       SET card_number = $1, customer_name = $2, client_id = $3, sold_by_staff_id = $4
       WHERE id = $5 AND shop_id = $6
       RETURNING *`,
      [
        card_number,
        customer_name,
        client_id || null,
        sold_by_staff_id || null,
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

// ==================== MEMBERSHIP TIERS ====================

// List all tiers for the shop, with their covered services + quotas (any
// authenticated user — needed by the booking dialog's membership picker).
app.get("/api/v1/membership-tiers", authenticateToken, async (req, res) => {
  try {
    const { rows: tiers } = await pool.query(
      `SELECT * FROM membership_tiers WHERE shop_id = $1 ORDER BY sort_order, created_at`,
      [req.shopId],
    );
    const { rows: tierServices } = await pool.query(
      `SELECT mts.tier_id, mts.service_id, mts.quota_per_month, s.name as service_name, s.price as service_price
       FROM membership_tier_services mts
       JOIN services s ON s.id = mts.service_id
       WHERE mts.tier_id = ANY($1)`,
      [tiers.map((t) => t.id)],
    );
    const byTier = new Map();
    for (const ts of tierServices) {
      if (!byTier.has(ts.tier_id)) byTier.set(ts.tier_id, []);
      byTier.get(ts.tier_id).push(ts);
    }
    res.json(tiers.map((t) => ({ ...t, services: byTier.get(t.id) || [] })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create a tier — admin only. Body: { name, monthly_price, yearly_price,
// color, grace_period_days, services: [{ service_id, quota_per_month }] }
app.post("/api/v1/membership-tiers", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin" && req.user.role !== "super_admin") {
    return res.status(403).json({ error: "Admins only" });
  }
  const { name, monthly_price, yearly_price, color, grace_period_days, services } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO membership_tiers (shop_id, name, monthly_price, yearly_price, color, grace_period_days)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        req.shopId,
        name,
        monthly_price || 0,
        yearly_price || 0,
        color || null,
        grace_period_days || 0,
      ],
    );
    const tier = rows[0];

    for (const svc of services || []) {
      await client.query(
        `INSERT INTO membership_tier_services (tier_id, service_id, quota_per_month) VALUES ($1, $2, $3)`,
        [tier.id, svc.service_id, svc.quota_per_month ?? null],
      );
    }

    await client.query("COMMIT");
    res.json(tier);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});

// Update a tier — admin only. Replaces the covered-services list wholesale
// (delete-then-reinsert), same pattern as staff_services.
app.put("/api/v1/membership-tiers/:id", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin" && req.user.role !== "super_admin") {
    return res.status(403).json({ error: "Admins only" });
  }
  const { name, monthly_price, yearly_price, color, grace_period_days, is_active, services } = req.body;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `UPDATE membership_tiers
       SET name = $1, monthly_price = $2, yearly_price = $3, color = $4,
           grace_period_days = $5, is_active = $6
       WHERE id = $7 AND shop_id = $8 RETURNING *`,
      [
        name,
        monthly_price || 0,
        yearly_price || 0,
        color || null,
        grace_period_days || 0,
        is_active !== false,
        req.params.id,
        req.shopId,
      ],
    );
    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Tier not found" });
    }

    await client.query(`DELETE FROM membership_tier_services WHERE tier_id = $1`, [req.params.id]);
    for (const svc of services || []) {
      await client.query(
        `INSERT INTO membership_tier_services (tier_id, service_id, quota_per_month) VALUES ($1, $2, $3)`,
        [req.params.id, svc.service_id, svc.quota_per_month ?? null],
      );
    }

    await client.query("COMMIT");
    res.json(rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});

// Delete a tier — admin only. Blocked once any client has EVER enrolled in
// it (any status, not just active/paused) — client_memberships.tier_id has
// no ON DELETE clause on purpose (deleting would either cascade away
// historical membership/usage/revenue records or violate the FK outright),
// so a tier that's ever been used can only be deactivated, never removed.
app.delete("/api/v1/membership-tiers/:id", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin" && req.user.role !== "super_admin") {
    return res.status(403).json({ error: "Admins only" });
  }
  try {
    const everUsedCount = await pool.query(
      `SELECT COUNT(*) FROM client_memberships WHERE tier_id = $1`,
      [req.params.id],
    );
    if (parseInt(everUsedCount.rows[0].count) > 0) {
      return res.status(400).json({ error: "This tier has enrollment history and can't be deleted. Deactivate it instead." });
    }
    const { rowCount } = await pool.query(
      `DELETE FROM membership_tiers WHERE id = $1 AND shop_id = $2`,
      [req.params.id, req.shopId],
    );
    if (rowCount === 0) return res.status(404).json({ error: "Tier not found" });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ==================== CLIENT MEMBERSHIPS ====================

// Current membership (any status, most recent) + per-covered-service usage
// for the current calendar month. Quotas always reset on the 1st of the
// month regardless of monthly/yearly billing — computed live, no reset job.
app.get("/api/v1/clients/:id/membership", authenticateToken, async (req, res) => {
  if (req.user.role === "client" && String(req.user.clientId) !== String(req.params.id)) {
    return res.status(403).json({ error: "Unauthorized to view this membership" });
  }
  try {
    const { rows } = await pool.query(
      `SELECT cm.*, mt.name as tier_name, mt.monthly_price, mt.yearly_price, mt.grace_period_days
       FROM client_memberships cm
       JOIN membership_tiers mt ON mt.id = cm.tier_id
       WHERE cm.client_id = $1 AND cm.shop_id = $2
       ORDER BY cm.created_at DESC LIMIT 1`,
      [req.params.id, req.shopId],
    );
    if (rows.length === 0) return res.json({ membership: null, usage: [] });

    const membership = rows[0];
    const { rows: usage } = await pool.query(
      `SELECT mts.service_id, s.name as service_name, mts.quota_per_month,
              COALESCE((
                SELECT COUNT(*) FROM membership_usage mu
                WHERE mu.client_membership_id = $1 AND mu.service_id = mts.service_id
                  AND mu.used_at >= date_trunc('month', NOW())
              ), 0) as used_this_month
       FROM membership_tier_services mts
       JOIN services s ON s.id = mts.service_id
       WHERE mts.tier_id = $2`,
      [membership.id, membership.tier_id],
    );

    res.json({
      membership,
      usage: usage.map((u) => ({
        ...u,
        used_this_month: parseInt(u.used_this_month),
        remaining: u.quota_per_month === null ? null : Math.max(0, u.quota_per_month - parseInt(u.used_this_month)),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Assign/change a client's membership tier — admin only. Cancels any
// existing active/paused enrollment and starts a fresh one. Payment is
// recorded manually, same pattern as gift-card sales (no payment gateway).
app.post("/api/v1/clients/:id/membership", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin" && req.user.role !== "super_admin") {
    return res.status(403).json({ error: "Admins only" });
  }
  const { tier_id, billing_cycle, payment_method } = req.body;
  if (!tier_id || !["monthly", "yearly"].includes(billing_cycle)) {
    return res.status(400).json({ error: "tier_id and a valid billing_cycle are required" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const tierRes = await client.query(
      `SELECT * FROM membership_tiers WHERE id = $1 AND shop_id = $2`,
      [tier_id, req.shopId],
    );
    if (tierRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Tier not found" });
    }
    const tier = tierRes.rows[0];

    await client.query(
      `UPDATE client_memberships SET status = 'cancelled'
       WHERE client_id = $1 AND status IN ('active', 'paused')`,
      [req.params.id],
    );

    const periodInterval = billing_cycle === "yearly" ? "1 year" : "1 month";
    const { rows } = await client.query(
      `INSERT INTO client_memberships
         (client_id, shop_id, tier_id, billing_cycle, status, started_at, current_period_start, current_period_end, last_payment_recorded_at)
       VALUES ($1, $2, $3, $4, 'active', NOW(), NOW(), NOW() + $5::interval, NOW())
       RETURNING *`,
      [req.params.id, req.shopId, tier_id, billing_cycle, periodInterval],
    );

    const amount = billing_cycle === "yearly" ? tier.yearly_price : tier.monthly_price;
    await client.query(
      `INSERT INTO transactions (appointment_id, client_id, amount, payment_method, transaction_type, shop_id, created_at)
       VALUES (NULL, $1, $2, $3, 'membership_sale', $4, NOW())`,
      [req.params.id, amount, payment_method || "cash", req.shopId],
    );

    await client.query("COMMIT");
    res.json(rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});

// Renew the client's current (active or lapsed-within-grace) membership for
// another billing cycle — admin only.
app.post("/api/v1/clients/:id/membership/renew", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin" && req.user.role !== "super_admin") {
    return res.status(403).json({ error: "Admins only" });
  }
  const { payment_method } = req.body;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT cm.*, mt.monthly_price, mt.yearly_price
       FROM client_memberships cm
       JOIN membership_tiers mt ON mt.id = cm.tier_id
       WHERE cm.client_id = $1 AND cm.shop_id = $2 AND cm.status IN ('active', 'expired')
       ORDER BY cm.created_at DESC LIMIT 1`,
      [req.params.id, req.shopId],
    );
    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "No renewable membership found" });
    }
    const membership = rows[0];
    const periodInterval = membership.billing_cycle === "yearly" ? "1 year" : "1 month";

    const updated = await client.query(
      `UPDATE client_memberships
       SET status = 'active',
           current_period_start = GREATEST(current_period_end, NOW()),
           current_period_end = GREATEST(current_period_end, NOW()) + $2::interval,
           last_payment_recorded_at = NOW(),
           renewal_reminder_sent_at = NULL
       WHERE id = $1
       RETURNING *`,
      [membership.id, periodInterval],
    );

    const amount = membership.billing_cycle === "yearly" ? membership.yearly_price : membership.monthly_price;
    await client.query(
      `INSERT INTO transactions (appointment_id, client_id, amount, payment_method, transaction_type, shop_id, created_at)
       VALUES (NULL, $1, $2, $3, 'membership_sale', $4, NOW())`,
      [req.params.id, amount, payment_method || "cash", req.shopId],
    );

    await client.query("COMMIT");
    res.json(updated.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});

// Cancel a client's membership — admin only.
app.delete("/api/v1/clients/:id/membership", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin" && req.user.role !== "super_admin") {
    return res.status(403).json({ error: "Admins only" });
  }
  try {
    const { rowCount } = await pool.query(
      `UPDATE client_memberships SET status = 'cancelled'
       WHERE client_id = $1 AND shop_id = $2 AND status IN ('active', 'paused')`,
      [req.params.id, req.shopId],
    );
    if (rowCount === 0) return res.status(404).json({ error: "No active membership found" });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ==================== QR SCAN (front-desk identification + contest entry) ====================
// Every client has a QR code, not just members — this is a general
// identification/lookup tool. If a contest is currently active, scanning
// also registers a contest entry (capped at one per client per day).
app.post("/api/v1/qr/scan", authenticateToken, async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: "token is required" });

  try {
    const clientRes = await pool.query(
      `SELECT id, first_name, last_name, phone, email
       FROM clients WHERE qr_token = $1 AND shop_id = $2 AND is_deleted IS NOT TRUE`,
      [token, req.shopId],
    );
    if (clientRes.rows.length === 0) {
      return res.status(404).json({ error: "No client found for this code" });
    }
    const foundClient = clientRes.rows[0];

    const membershipRes = await pool.query(
      `SELECT cm.status, mt.name as tier_name
       FROM client_memberships cm
       JOIN membership_tiers mt ON mt.id = cm.tier_id
       WHERE cm.client_id = $1 AND cm.shop_id = $2
       ORDER BY cm.created_at DESC LIMIT 1`,
      [foundClient.id, req.shopId],
    );

    const contestRes = await pool.query(
      `SELECT id, name FROM contests
       WHERE shop_id = $1 AND NOW() BETWEEN start_date AND end_date
       ORDER BY start_date DESC LIMIT 1`,
      [req.shopId],
    );

    let contestResult = null;
    if (contestRes.rows.length > 0) {
      const contest = contestRes.rows[0];
      const insertRes = await pool.query(
        `INSERT INTO contest_entries (contest_id, client_id, shop_id, entry_date)
         VALUES ($1, $2, $3, CURRENT_DATE)
         ON CONFLICT (contest_id, client_id, entry_date) DO NOTHING
         RETURNING id`,
        [contest.id, foundClient.id, req.shopId],
      );
      contestResult = {
        name: contest.name,
        entry_added: insertRes.rows.length > 0,
      };
    }

    res.json({
      client: {
        id: foundClient.id,
        first_name: foundClient.first_name,
        last_name: foundClient.last_name,
        full_name: `${foundClient.first_name} ${foundClient.last_name}`,
        phone: foundClient.phone,
      },
      membership: membershipRes.rows[0] || null,
      contest: contestResult,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ==================== MEMBERSHIP REPORT ====================
app.get("/api/v1/reports/membership", authenticateToken, requireAnalyticsAccess, async (req, res) => {
  const { from, to } = req.query;
  try {
    const byTierRes = await pool.query(
      `SELECT mt.id, mt.name, mt.monthly_price, mt.yearly_price,
              COUNT(*) FILTER (WHERE cm.status = 'active') as active_count,
              COUNT(*) FILTER (WHERE cm.status = 'paused') as paused_count
       FROM membership_tiers mt
       LEFT JOIN client_memberships cm ON cm.tier_id = mt.id
       WHERE mt.shop_id = $1
       GROUP BY mt.id
       ORDER BY mt.sort_order`,
      [req.shopId],
    );

    const mrrRes = await pool.query(
      `SELECT COALESCE(SUM(
         CASE WHEN cm.billing_cycle = 'yearly' THEN mt.yearly_price / 12 ELSE mt.monthly_price END
       ), 0) as mrr
       FROM client_memberships cm
       JOIN membership_tiers mt ON mt.id = cm.tier_id
       WHERE cm.shop_id = $1 AND cm.status = 'active'`,
      [req.shopId],
    );

    const nearExpiryRes = await pool.query(
      `SELECT cm.id, cm.current_period_end, c.first_name, c.last_name, mt.name as tier_name
       FROM client_memberships cm
       JOIN clients c ON c.id = cm.client_id
       JOIN membership_tiers mt ON mt.id = cm.tier_id
       WHERE cm.shop_id = $1 AND cm.status = 'active'
         AND cm.current_period_end <= NOW() + INTERVAL '7 days'
       ORDER BY cm.current_period_end ASC`,
      [req.shopId],
    );

    const mostUsedRes = await pool.query(
      `SELECT s.name as service_name, COUNT(*) as uses
       FROM membership_usage mu
       JOIN client_memberships cm ON cm.id = mu.client_membership_id
       JOIN services s ON s.id = mu.service_id
       WHERE cm.shop_id = $1 AND mu.used_at >= date_trunc('month', NOW())
       GROUP BY s.name
       ORDER BY uses DESC
       LIMIT 10`,
      [req.shopId],
    );

    const revenueParams = [req.shopId];
    let revenueDateClause = "";
    if (from) {
      revenueParams.push(from);
      revenueDateClause += ` AND created_at >= $${revenueParams.length}`;
    }
    if (to) {
      revenueParams.push(to);
      revenueDateClause += ` AND created_at <= $${revenueParams.length}`;
    }
    const revenueRes = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM transactions
       WHERE shop_id = $1 AND transaction_type = 'membership_sale' ${revenueDateClause}`,
      revenueParams,
    );

    res.json({
      by_tier: byTierRes.rows.map((r) => ({
        ...r,
        active_count: parseInt(r.active_count),
        paused_count: parseInt(r.paused_count),
      })),
      total_active: byTierRes.rows.reduce((sum, r) => sum + parseInt(r.active_count), 0),
      mrr_estimate: Number(mrrRes.rows[0].mrr),
      membership_revenue: Number(revenueRes.rows[0].total),
      near_expiry: nearExpiryRes.rows,
      most_used_services: mostUsedRes.rows.map((r) => ({ ...r, uses: parseInt(r.uses) })),
    });
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
