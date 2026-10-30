// Who may call a route: the login, and the role checks.
const jwt = require("jsonwebtoken");

// In-memory cache of shops.force_logout_at (shopId -> ms timestamp), so the
// "disconnect all users" revocation check below never costs a DB round trip
// on the hot path. Populated at startup and refreshed only when an admin
// actually triggers a force-logout (see POST /api/v1/shop/force-logout).
const forceLogoutCache = new Map();

// Login tokens (login, impersonation, refreshed after "disconnect all")
// always carry a role. Other tokens signed with the same secret — the client
// invite link ({ typ: "invite", clientId, shopId, email }) — only prove an
// email address and must never open the API or the live socket.
const isSessionToken = (user) => !!user && typeof user.role === "string" && user.typ !== "invite";

// The login travels only in the Authorization header. A ?token= in the URL
// used to work too (for file links), but URLs end up in server logs, browser
// history and referrers; files are now fetched with the header instead.
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    // 401 (not 403) so the app can tell an expired or invalid session apart
    // from "not allowed" and send the user back to the login page.
    if (err || !isSessionToken(user)) return res.status(401).json({ error: "invalid_token" });

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

// Analytics/financials/reports are admin-only — frontdesk has admin access everywhere else.
const requireAnalyticsAccess = (req, res, next) => {
  if (req.user.role !== "admin" && req.user.role !== "super_admin") {
    return res.status(403).json({ error: "Admins only" });
  }
  next();
};

// Client portal logins only reach the portal's own routes and the few it
// reads (the shop, the active contest, availability); every staff route
// turns them away. After authenticateToken.
const notForClients = (req, res, next) =>
  req.user?.role === "client" ? res.status(403).json({ error: "Forbidden" }) : next();

const requireShopAdminAccess = (req, res, next) => {
  if (!["admin", "super_admin", "frontdesk"].includes(req.user.role)) {
    return res.status(403).json({ error: "Admins only" });
  }
  next();
};

// ==================== PREPAID PACKAGES ====================
const isAdminRole = (u) => u.role === "admin" || u.role === "super_admin";

const canSellExtras = (u) => isAdminRole(u) || u.role === "frontdesk";

module.exports = {
  forceLogoutCache,
  isSessionToken,
  authenticateToken,
  requireAnalyticsAccess,
  notForClients,
  requireShopAdminAccess,
  isAdminRole,
  canSellExtras,
};
