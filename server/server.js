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
const compression = require("compression");
const http = require("http");
const pool = require("./db");
const { runMigrations } = require("./migrate");
const { safeUUID, getVisibilityClause, clientInShop, walkInClientRow } = require("./domain/common");
const { recalculateClientBalance, recalculateAllClientBalances } = require("./domain/balances");
const { checkIdempotency, saveIdempotency } = require("./domain/idempotency");
const { releasePackageUsage, loadClientPackages } = require("./domain/packages");
const { parseDebtResolution, settleAmount } = require("./domain/debts");
const { StaffUnavailableError, MissingStaffError, getGroupDetails, DiscountError, createAppointmentSeries, performSingleUpdate, SelfBookingNotAllowedError, sanitizeClientBookingPayload, OfflineConflictError, assertCapacity, assertNoNewOverlaps, assertBaseVersion } = require("./domain/bookings");
const { forceLogoutCache, userRevokedCache, revokeUserSessions, isSessionToken, authenticateToken, requireAnalyticsAccess, notForClients, requireShopAdminAccess, isAdminRole, canSellExtras } = require("./middleware/auth");
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const fs = require("fs");
const { Server } = require("socket.io");
const bcrypt = require("bcrypt");
const { allocate, round2 } = require("./discounts");

const app = express();
// The app always sits behind exactly one reverse proxy — Nginx in production
// (see DEPLOY.md), an ngrok tunnel in local phone testing — so it must trust
// the single immediate hop's X-Forwarded-For to get the real client IP for
// rate limiting. Without this, express-rate-limit refuses to trust that
// header at all (ERR_ERL_UNEXPECTED_X_FORWARDED_FOR) and rate-limits by the
// proxy's own IP instead of the actual caller's.
app.set("trust proxy", 1);
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

require("./reminderService"); // starts the reminder jobs
require("./membershipService");

// ==================== MIDDLEWARE ====================
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        // Google Fonts: the app's Manrope (client/index.html) loads its CSS from
        // fonts.googleapis.com and the font files from fonts.gstatic.com.
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "ws:", "wss:"],
        fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
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
// Compress responses (code, styles, HTML, JSON) — about 70-75% smaller on the
// wire. Images and video are already compressed and are skipped.
app.use(compression());
app.use(express.json());

// Live calendars: after a successful change to bookings, payments or clients,
// every open screen of that shop is told to reload what it shows (the
// message carries no data). `io` is created further down; this only runs
// once requests arrive.
const CALENDAR_WRITE_PATHS = [
  "/api/v1/appointments",
  "/api/v1/transactions",
  "/api/v1/clients",
  "/api/v1/client-debts",
  "/api/v1/portal/appointments",
  "/api/v1/package-usage",
  "/api/v1/qr",
];
app.use(CALENDAR_WRITE_PATHS, (req, res, next) => {
  if (req.method !== "GET") {
    res.on("finish", () => {
      if (res.statusCode < 300 && req.shopId) io.to(`shop:${req.shopId}`).emit("appointments:changed");
    });
  }
  next();
});

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

// Dynamic per-shop PWA manifest for the client portal's "Save as an app"
// install flow — a static file at this path would be served instead by
// express.static below, so this route is registered first. No auth: the
// browser fetches this as a plain <link rel="manifest"> request with no
// custom headers, so the shop is identified via ?shop_id= instead of a JWT.
// Icons are shared across shops (no per-shop logo exists in the schema yet);
// only the name and theme color are shop-specific.
app.get("/manifest.webmanifest", async (req, res) => {
  const shopId = safeUUID(req.query.shop_id);
  let name = "Pure Spa & Massage Experience";
  let themeColor = "#8B6F4E";

  if (shopId) {
    try {
      const { rows } = await pool.query(
        "SELECT name, primary_color FROM shops WHERE id = $1",
        [shopId],
      );
      if (rows[0]) {
        name = rows[0].name || name;
        themeColor = rows[0].primary_color || themeColor;
      }
    } catch (err) {
      console.error("Manifest lookup error:", err);
    }
  }

  res.set("Content-Type", "application/manifest+json");
  res.json({
    name,
    short_name: name.length > 20 ? name.slice(0, 17) + "…" : name,
    start_url: "/portal/home",
    scope: "/portal/",
    display: "standalone",
    background_color: "#F9F5F0",
    theme_color: themeColor,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  });
});

// APP_DIST_PATH: another build folder (the browser tests use client/dist).
const distPath = process.env.APP_DIST_PATH || path.join(__dirname, "../dist");
// Caching: build files carry a hash in their name that changes with every
// build, so browsers can keep them for a year without asking again;
// index.html never (so a refresh after a rebuild always gets the new names).
const noCacheIndex = (res) => res.setHeader("Cache-Control", "no-cache");
const ONE_YEAR_IMMUTABLE = "public, max-age=31536000, immutable";
const cacheHeaders = (res, filePath) => {
  const p = filePath.split(path.sep).join("/");
  if (p.endsWith(".html")) noCacheIndex(res);
  else if (p.includes("/assets/")) res.setHeader("Cache-Control", ONE_YEAR_IMMUTABLE);
};
app.use(express.static(distPath, { setHeaders: cacheHeaders }));
const dbFileStorage = multer.memoryStorage();
const dbFileUpload = multer({
  storage: dbFileStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB Limit
});

// Last-known live Ctrl+1/Ctrl+8 broadcast state per shop (shopId -> boolean).
// The live broadcast itself is fire-and-forget over the socket — anyone
// disconnected at the exact moment a super_admin toggles it (flaky wifi, a
// dev-server WS proxy hiccup, etc.) never receives that event and has no
// other way to learn the current state. Caching it here lets a (re)connecting
// socket be synced immediately instead of waiting for the next toggle.
const cashFilterCache = new Map();
const cardFilterCache = new Map();

const TIME_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

// Services whose name IS the sauna/hamam resource itself (the "...ΣΕ
// ΥΠΗΡΕΣΙΑ" ones used as the carve-out component below, plus the plain
// standalone room-booking services) — these must never auto-split
// themselves even though their own name matches the keyword pattern.
const SAUNA_HAMAM_BASE_NAMES = new Set([
  "σαουνα", "σαουνα σε υπηρεσια", "χαμαμ", "χαμμαμ", "ηαμαμ σε υπηρεσια", "hammam", "hamam",
]);

const io = new Server(server, {
  cors: {
    // You can use an array or a single string from your .env
    origin: allowedOrigins,
    credentials: true,
  },
});

require("./sockets")(io, { cardFilterCache, cashFilterCache });
console.log("✅ Socket.IO initialized");

const fileStorage = multer.memoryStorage();
const fileUpload = multer({
  storage: fileStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
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

// Every start, once the migrations are done. (The schema itself lives in
// server/migrations/.)
const atStartup = async () => {
  try {
    recalculateAllClientBalances().catch((err) => console.error("Startup balance recalculation failed:", err));

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
    const { rows: revokedUsers } = await pool.query(
      `SELECT id, sessions_revoked_at FROM users WHERE sessions_revoked_at IS NOT NULL`,
    );
    for (const u of revokedUsers) {
      userRevokedCache.set(u.id, new Date(u.sessions_revoked_at).getTime());
    }
  } catch (err) {
    console.error("Failed to run the startup steps:", err);
  }
};

// ==================== Area routers ====================
// Areas with a file of their own in server/routes/. Mounted here, after every
// helper above is defined, and before the catch-all below. Their paths don't
// overlap any route in this file, so the order is otherwise irrelevant.
app.use(
  "/api/v1/appointments",
  require("./routes/appointments")({
    DiscountError,
    MissingStaffError,
    OfflineConflictError,
    SelfBookingNotAllowedError,
    StaffUnavailableError,
    allocate,
    assertBaseVersion,
    assertCapacity,
    assertNoNewOverlaps,
    authenticateToken,
    canSellExtras,
    checkIdempotency,
    createAppointmentSeries,
    getGroupDetails,
    getVisibilityClause,
    parseDebtResolution,
    performSingleUpdate,
    pool,
    recalculateClientBalance,
    releasePackageUsage,
    requireShopAdminAccess,
    round2,
    safeUUID,
    sanitizeClientBookingPayload,
    saveIdempotency,
    settleAmount,
  }),
);
app.use(
  "/api/v1/transactions",
  require("./routes/transactions")({
    authenticateToken,
    canSellExtras,
    checkIdempotency,
    pool,
    recalculateClientBalance,
    safeUUID,
    saveIdempotency,
  }),
);
app.use(
  "/api/v1/clients",
  require("./routes/clients")({
    authenticateToken,
    canSellExtras,
    checkIdempotency,
    clientInShop,
    dbFileUpload,
    hexToRgba,
    loadClientPackages,
    pool,
    recalculateClientBalance,
    requireShopAdminAccess,
    safeUUID,
    saveIdempotency,
    walkInClientRow,
  }),
);

// More area routers: every remaining /api/v1 route, one file per area, in
// the order they were first registered. Each gets the server.js helpers it
// uses.
app.use(
  "/api/v1",
  require("./routes/staff")({
    authenticateToken,
    io,
    revokeUserSessions,
    dbFileUpload,
    notForClients,
    requireShopAdminAccess,
    TIME_HHMM,
  }),
);
app.use(
  "/api/v1",
  require("./routes/services")({
    authenticateToken,
    notForClients,
    requireAnalyticsAccess,
    requireShopAdminAccess,
    safeUUID,
    SAUNA_HAMAM_BASE_NAMES,
  }),
);
app.use(
  "/api/v1",
  require("./routes/reports")({
    authenticateToken,
    getVisibilityClause,
    notForClients,
    requireAnalyticsAccess,
  }),
);
app.use(
  "/api/v1",
  require("./routes/platform")({
    authenticateToken,
    io,
    revokeUserSessions,
  }),
);
app.use(
  "/api/v1",
  require("./routes/account")({
    authenticateToken,
    isSessionToken,
    loginLimiter,
    notForClients,
    signupLimiter,
  }),
);
app.use(
  "/api/v1",
  require("./routes/shop")({
    authenticateToken,
    cardFilterCache,
    cashFilterCache,
    forceLogoutCache,
    io,
    notForClients,
    requireAnalyticsAccess,
    requireShopAdminAccess,
    TIME_HHMM,
  }),
);
app.use(
  "/api/v1",
  require("./routes/chat")({
    authenticateToken,
    fileUpload,
    notForClients,
  }),
);
app.use(
  "/api/v1",
  require("./routes/products")({
    authenticateToken,
    notForClients,
    requireAnalyticsAccess,
    requireShopAdminAccess,
  }),
);
app.use(
  "/api/v1",
  require("./routes/portal")({
    authenticateToken,
    safeUUID,
  }),
);
app.use(
  "/api/v1",
  require("./routes/giftCards")({
    authenticateToken,
    canSellExtras,
    notForClients,
  }),
);
app.use(
  "/api/v1",
  require("./routes/memberships")({
    authenticateToken,
    loadClientPackages,
    notForClients,
  }),
);
app.use(
  "/api/v1",
  require("./routes/packages")({
    authenticateToken,
    isAdminRole,
    notForClients,
    recalculateClientBalance,
    requireAnalyticsAccess,
    requireShopAdminAccess,
    safeUUID,
  }),
);
app.use(
  "/api/v1",
  require("./routes/discounts")({
    authenticateToken,
    notForClients,
    requireAnalyticsAccess,
  }),
);
app.use(
  "/api/v1",
  require("./routes/expenses")({
    authenticateToken,
    requireShopAdminAccess,
    safeUUID,
  }),
);
app.use(
  "/api/v1",
  require("./routes/exercises")({
    authenticateToken,
    notForClients,
  }),
);
app.use(
  "/api/v1",
  require("./routes/contests")({
    authenticateToken,
    dbFileUpload,
    notForClients,
  }),
);
app.use(
  "/api/v1",
  require("./routes/publicLinks")({
    io,
    publicActionLimiter,
  }),
);
app.use(
  "/api/v1",
  require("./routes/debts")({
    authenticateToken,
    parseDebtResolution,
    recalculateClientBalance,
    requireShopAdminAccess,
    safeUUID,
    settleAmount,
  }),
);

app.get(/(.*)/, (req, res) => {
  if (req.path.startsWith("/api")) {
    return res.status(404).json({ error: "API Route Not Found" });
  }
  // A missing build file (e.g. from a tab opened before a rebuild) must fail
  // as a real 404, not come back as index.html, so the app can reload itself.
  if (req.path.startsWith("/assets/")) {
    return res.status(404).end();
  }
  noCacheIndex(res);
  res.sendFile(path.join(distPath, "index.html"));
});

// Migrations first (server/migrate.js): if one fails, the server doesn't
// start. Then the startup tasks above, and the server listens.
const migrated = runMigrations();
migrated
  .then(atStartup)
  .catch(() => {});

if (require.main === module) {
  migrated
    .then(() => {
      server.listen(PORT, "0.0.0.0", () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`Allowed Origins: ${allowedOrigins.join(", ")}`);
      });
    })
    .catch((err) => {
      console.error("Not starting:", err.message);
      process.exit(1);
    });
}

module.exports = { app, server, pool };
