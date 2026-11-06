// Plan-tier limits (trial / basic / pro), set per shop from the owner console.
const pool = require("../db");

const PLAN_LIMITS = {
  trial: { maxStaff: 2, portal: false, reports: false, giftCards: false },
  basic: { maxStaff: Infinity, portal: true, reports: false, giftCards: false },
  pro: { maxStaff: Infinity, portal: true, reports: true, giftCards: true },
};

const getPlanLimits = (plan) => PLAN_LIMITS[plan] || PLAN_LIMITS.trial;

const shopPlan = async (shopId) => {
  const { rows } = await pool.query("SELECT plan FROM shops WHERE id = $1", [shopId]);
  return rows[0]?.plan || "trial";
};

// Checks the caller's shop's plan on every request (not cached in the JWT) so
// upgrades/downgrades from the owner console take effect immediately.
const requirePlanFeature = (feature) => async (req, res, next) => {
  try {
    if (!getPlanLimits(await shopPlan(req.shopId))[feature]) {
      return res.status(403).json({ error: "This feature isn't available on your current plan. Please upgrade." });
    }
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Trial shops are capped at a fixed staff headcount (bodies, not login accounts).
const requireStaffCapacity = async (req, res, next) => {
  try {
    const limits = getPlanLimits(await shopPlan(req.shopId));
    if (limits.maxStaff !== Infinity) {
      const { rows } = await pool.query(
        "SELECT COUNT(*) FROM staff WHERE shop_id = $1 AND is_active = true",
        [req.shopId],
      );
      if (parseInt(rows[0].count) >= limits.maxStaff) {
        return res.status(403).json({
          error: `Your plan allows up to ${limits.maxStaff} staff members. Please upgrade to add more.`,
        });
      }
    }
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = { PLAN_LIMITS, getPlanLimits, shopPlan, requirePlanFeature, requireStaffCapacity };
