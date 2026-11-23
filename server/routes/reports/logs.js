// The daily report, deleted bookings and memberships.
const express = require("express");
const { asyncHandler } = require("../../http");
const pool = require("../../db");
const { localTimeOf, buildRevenueExclusionClause, buildTxnMethodExclusionClause } = require("../../domain/reportSql");
const { getVisibilityClause } = require("../../domain/common");

module.exports = function logsRouter({
  authenticateToken,
  notForClients,
  requireAnalyticsAccess,
}) {
  const router = express.Router();

  // Front desk's end-of-day view: today's takings and today's appointments only.
  // Deliberately fixed to "today" (no from/to) so front desk never gets historical
  // financials — the full analytics endpoints stay admin-only.
  router.get("/reports/daily", authenticateToken, notForClients, asyncHandler(async (req, res) => {
    const role = req.user.role;
    if (role !== "admin" && role !== "super_admin" && role !== "frontdesk") {
      return res.status(403).json({ error: "Forbidden" });
    }
    // The day to show: ?date=YYYY-MM-DD, or today.
    const day = req.query.date ? String(req.query.date) : null;
    if (day) {
      const parsed = new Date(`${day}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || isNaN(parsed) || !parsed.toISOString().startsWith(day)) {
        return res.status(400).json({ error: "invalid_date" });
      }
    }
    // Ctrl+1 (cash) / Ctrl+8 (card) hide-revenue toggles, same params as the other reports.
    const { excludeCash, excludeCard } = req.query;
    const methodExclusion = buildTxnMethodExclusionClause(excludeCash, excludeCard, "t.");
    const apptExclusion = buildRevenueExclusionClause(excludeCash, excludeCard, "a");
    const visibility = role === "super_admin" ? "" : " AND (a.id IS NULL OR a.save_receipt = true)";
    // Package/membership visits are prepaid earlier — not money collected today.
    const { rows: payments } = await pool.query(
      `SELECT t.id, t.amount, t.payment_method, t.transaction_type, t.created_at,
              c.first_name, c.last_name
       FROM transactions t
       LEFT JOIN clients c ON c.id = t.client_id
       LEFT JOIN appointments a ON a.id = t.appointment_id
       WHERE t.shop_id = $1 AND t.created_at::date = COALESCE($2::date, CURRENT_DATE)
         AND COALESCE(t.payment_method, '') NOT IN ('membership', 'package', 'write-off')
         ${methodExclusion}
         ${visibility}
       ORDER BY t.created_at DESC`,
      [req.shopId, day],
    );

    const { rows: appointments } = await pool.query(
      `SELECT a.status
       FROM appointments a
       WHERE a.shop_id = $1 AND a.is_block = false ${apptExclusion}
         AND EXISTS (SELECT 1 FROM appointment_services x WHERE x.appointment_id = a.id AND x.start_time::date = COALESCE($2::date, CURRENT_DATE))
         ${getVisibilityClause(req.user, "a")}`,
      [req.shopId, day],
    );

    const byMethod = {};
    let total = 0;
    for (const p of payments) {
      // CASH counts with cash here; only the filter treats them differently.
      const m = p.payment_method === "CASH" ? "cash" : p.payment_method || "other";
      byMethod[m] = (byMethod[m] || 0) + Number(p.amount);
      total += Number(p.amount);
    }
    const byStatus = {};
    for (const a of appointments) byStatus[a.status] = (byStatus[a.status] || 0) + 1;

    res.json({
      date: day || new Date().toISOString(),
      total_collected: Math.round(total * 100) / 100,
      by_method: Object.entries(byMethod).map(([method, amount]) => ({
        method,
        amount: Math.round(amount * 100) / 100,
      })),
      payments,
      appointment_count: appointments.length,
      by_status: byStatus,
    });
  }));
  // Backing report for the admin Financials "Payments Log" tab's new
  // Refunds & Price Changes section.
  // The log of deleted bookings, by when they were deleted.
  router.get(
    "/reports/deleted-appointments",
    authenticateToken,
    requireAnalyticsAccess,
    asyncHandler(async (req, res) => {
      const { from, to } = req.query;
      const params = [req.shopId];
      let whereClause = "WHERE shop_id = $1";
      if (from) {
        params.push(from);
        whereClause += ` AND deleted_at >= $${params.length}`;
      }
      if (to) {
        params.push(to);
        whereClause += ` AND deleted_at <= $${params.length}`;
      }
      const { rows } = await pool.query(
        `SELECT * FROM deleted_appointments ${whereClause} ORDER BY deleted_at DESC`,
        params,
      );
      res.json(rows);
    }, { log: "Deleted appointments report error:" }),
  );
  // ==================== MEMBERSHIP REPORT ====================
  router.get("/reports/membership", authenticateToken, requireAnalyticsAccess, asyncHandler(async (req, res) => {
    const { from, to } = req.query;
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
      revenueDateClause += ` AND created_at >= ${localTimeOf(revenueParams.length)}`;
    }
    if (to) {
      revenueParams.push(to);
      revenueDateClause += ` AND created_at <= ${localTimeOf(revenueParams.length)}`;
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
  }));

  return router;
};
