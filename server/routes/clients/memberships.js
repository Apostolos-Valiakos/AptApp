// A client's membership (sell, renew, cancel) and packages.
const express = require("express");
const { HttpError, asyncHandler, withTransaction } = require("../../http");
const { MONEY_METHODS } = require("../../domain/common");

module.exports = function membershipsRouter({
  authenticateToken,
  canSellExtras,
  loadClientPackages,
  pool,
  safeUUID,
  onlyAdmins,
  ownClientOnly,
}) {
  const router = express.Router();

  // Current membership (any status, most recent) + per-covered-service usage
  // for the current calendar month. Quotas always reset on the 1st of the
  // month regardless of monthly/yearly billing — computed live, no reset job.
  router.get("/:id/membership", authenticateToken, ownClientOnly("Unauthorized to view this membership"), asyncHandler(async (req, res) => {
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
  }));
  // Assign/change a client's membership tier — admin only. Cancels any
  // existing active/paused enrollment and starts a fresh one. Payment is
  // recorded manually, same pattern as gift-card sales (no payment gateway).
  router.post("/:id/membership", authenticateToken, onlyAdmins, asyncHandler(async (req, res) => {
    const { tier_id, billing_cycle, payment_method } = req.body;
    if (!tier_id || !["monthly", "yearly"].includes(billing_cycle)) {
      return res.status(400).json({ error: "tier_id and a valid billing_cycle are required" });
    }

    const { status, body } = await withTransaction(async (client) => {

      const tierRes = await client.query(
        `SELECT * FROM membership_tiers WHERE id = $1 AND shop_id = $2`,
        [tier_id, req.shopId],
      );
      if (tierRes.rows.length === 0) {
        throw new HttpError(404, { error: "Tier not found" });
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

      return { status: 200, body: rows[0] };
    });
    res.status(status).json(body);
  }));
  // Renew the client's current (active or lapsed-within-grace) membership for
  // another billing cycle — admin only.
  router.post("/:id/membership/renew", authenticateToken, onlyAdmins, asyncHandler(async (req, res) => {
    const { payment_method } = req.body;

    const { status, body } = await withTransaction(async (client) => {

      const { rows } = await client.query(
        `SELECT cm.*, mt.monthly_price, mt.yearly_price
         FROM client_memberships cm
         JOIN membership_tiers mt ON mt.id = cm.tier_id
         WHERE cm.client_id = $1 AND cm.shop_id = $2 AND cm.status IN ('active', 'expired')
         ORDER BY cm.created_at DESC LIMIT 1`,
        [req.params.id, req.shopId],
      );
      if (rows.length === 0) {
        throw new HttpError(404, { error: "No renewable membership found" });
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

      return { status: 200, body: updated.rows[0] };
    });
    res.status(status).json(body);
  }));
  // Cancel a client's membership — admin only.
  router.delete("/:id/membership", authenticateToken, onlyAdmins, asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query(
      `UPDATE client_memberships SET status = 'cancelled'
       WHERE client_id = $1 AND shop_id = $2 AND status IN ('active', 'paused')`,
      [req.params.id, req.shopId],
    );
    if (rowCount === 0) return res.status(404).json({ error: "No active membership found" });
    res.json({ success: true });
  }));
  // A client's packages (staff, or the client themselves).
  router.get("/:id/packages", authenticateToken, ownClientOnly("Unauthorized to view these packages"), asyncHandler(async (req, res) => {
    const list = await loadClientPackages(pool, req.shopId, req.params.id, {
      activeOnly: req.query.active === "true",
    });
    res.json(list);
  }));
  // Sell a package to a client: records the package plus one 'package_sale'
  // transaction (revenue counted today; later visits are $0 'package' payments).
  router.post("/:id/packages", authenticateToken, asyncHandler(async (req, res) => {
    if (!canSellExtras(req.user)) return res.status(403).json({ error: "Not allowed" });
    const { package_type_id, payment_method = "cash", note } = req.body;
    if (!safeUUID(package_type_id)) return res.status(400).json({ error: "package_type_id is required" });
    if (!MONEY_METHODS.includes(payment_method)) {
      return res.status(400).json({ error: "Invalid payment method" });
    }
    const { status, body } = await withTransaction(async (client) => {
      const c = await client.query("SELECT 1 FROM clients WHERE id = $1 AND shop_id = $2", [req.params.id, req.shopId]);
      if (!c.rows[0]) {
        throw new HttpError(404, { error: "Client not found" });
      }
      const t = await client.query(
        "SELECT * FROM package_types WHERE id = $1 AND shop_id = $2 AND is_active = true",
        [package_type_id, req.shopId],
      );
      if (!t.rows[0]) {
        throw new HttpError(404, { error: "Package type not found" });
      }
      const pt = t.rows[0];
      const { rows } = await client.query(
        `INSERT INTO client_packages
           (shop_id, client_id, package_type_id, name, service_id, total_visits, price_paid, expires_at, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7,
                 CASE WHEN $8::int IS NULL THEN NULL ELSE NOW() + ($8::int * INTERVAL '1 day') END, $9)
         RETURNING id`,
        [req.shopId, req.params.id, pt.id, pt.name, pt.service_id, pt.visits, pt.price, pt.validity_days, note || null],
      );
      await client.query(
        `INSERT INTO transactions (appointment_id, client_id, amount, payment_method, transaction_type, shop_id, created_at)
         VALUES (NULL, $1, $2, $3, 'package_sale', $4, NOW())`,
        [req.params.id, pt.price, payment_method, req.shopId],
      );
      return { status: 201, body: { id: rows[0].id } };
    });
    res.status(status).json(body);
  }));

  return router;
};
