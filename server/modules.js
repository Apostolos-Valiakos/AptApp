// Optional parts of the app the owner can switch off per shop, in the platform
// console (shops.disabled_modules, migration 0012). Everything is on unless
// listed there. Keep in step with client/src/utils/modules.ts.
const pool = require("./db");

const MODULES = [
  "gift_cards",
  "packages",
  "products",
  "memberships",
  "cash_filter", // Ctrl+1 / Ctrl+8, CASH, per-service hiding
  "client_portal", // client logins, self-booking, push
  "discounts", // discounts at checkout and discount codes
  "shared_places", // staff with several places (sauna, hammam)
  "contests",
];

// Read on every request to a module's routes, so kept for a few seconds; the
// platform console clears a shop's entry when it changes it.
const CACHE_MS = 15000;
const cache = new Map();

const disabledModules = async (shopId) => {
  if (!shopId) return [];
  const hit = cache.get(shopId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.list;
  const { rows } = await pool.query("SELECT disabled_modules FROM shops WHERE id = $1", [shopId]);
  const list = rows[0]?.disabled_modules || [];
  cache.set(shopId, { list, at: Date.now() });
  return list;
};

const forgetShopModules = (shopId) => cache.delete(shopId);

const moduleOn = async (shopId, key) => !(await disabledModules(shopId)).includes(key);

// Route guard, after authenticateToken: a switched-off module answers 403.
// The platform owner has no shop and is never blocked.
const requireModule = (key) => async (req, res, next) => {
  try {
    if (req.shopId && !(await moduleOn(req.shopId, key))) {
      return res.status(403).json({ error: "This feature is switched off for this shop", code: "module_disabled", module: key });
    }
    next();
  } catch (err) {
    next(err);
  }
};

const cleanModuleList = (list) => [...new Set((Array.isArray(list) ? list : []).filter((m) => MODULES.includes(m)))];

module.exports = { MODULES, disabledModules, forgetShopModules, moduleOn, requireModule, cleanModuleList };
