// Membership tiers and QR check-in: /api/v1/membership-tiers, /qr.
// Moved out of server.js; helpers that still live there are handed over when
// it mounts this router (see "Area routers" near the end of server.js).
const express = require("express");
const { HttpError, asyncHandler, withTransaction } = require("../http");
const pool = require("../db");

module.exports = function membershipsRouter({
  authenticateToken,
  loadClientPackages,
  notForClients,
}) {
  const router = express.Router();

  // List all tiers for the shop, with their covered services + quotas (any
  // authenticated user — needed by the booking dialog's membership picker).
  router.get("/membership-tiers", authenticateToken, notForClients, asyncHandler(async (req, res) => {
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
  }));

  // Create a tier — admin only. Body: { name, monthly_price, yearly_price,
  // color, grace_period_days, services: [{ service_id, quota_per_month }] }
  router.post("/membership-tiers", authenticateToken, notForClients, asyncHandler(async (req, res) => {
    if (!["admin", "super_admin", "frontdesk"].includes(req.user.role)) {
      return res.status(403).json({ error: "Admins only" });
    }
    const { name, monthly_price, yearly_price, color, grace_period_days, services } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });

    const answer = await withTransaction(async (client) => {
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

      return tier;
    });
    res.json(answer);
  }));

  // Update a tier — admin only. Replaces the covered-services list wholesale
  // (delete-then-reinsert), same pattern as staff_services.
  router.put("/membership-tiers/:id", authenticateToken, notForClients, asyncHandler(async (req, res) => {
    if (!["admin", "super_admin", "frontdesk"].includes(req.user.role)) {
      return res.status(403).json({ error: "Admins only" });
    }
    const { name, monthly_price, yearly_price, color, grace_period_days, is_active, services } = req.body;

    const answer = await withTransaction(async (client) => {
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
        throw new HttpError(404, { error: "Tier not found" });
      }

      await client.query(`DELETE FROM membership_tier_services WHERE tier_id = $1`, [req.params.id]);
      for (const svc of services || []) {
        await client.query(
          `INSERT INTO membership_tier_services (tier_id, service_id, quota_per_month) VALUES ($1, $2, $3)`,
          [req.params.id, svc.service_id, svc.quota_per_month ?? null],
        );
      }

      return rows[0];
    });
    res.json(answer);
  }));

  // Delete a tier — admin only. Blocked once any client has EVER enrolled in
  // it (any status, not just active/paused) — client_memberships.tier_id has
  // no ON DELETE clause on purpose (deleting would either cascade away
  // historical membership/usage/revenue records or violate the FK outright),
  // so a tier that's ever been used can only be deactivated, never removed.
  router.delete("/membership-tiers/:id", authenticateToken, notForClients, asyncHandler(async (req, res) => {
    if (!["admin", "super_admin", "frontdesk"].includes(req.user.role)) {
      return res.status(403).json({ error: "Admins only" });
    }
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
  }));

  // ==================== QR SCAN (front-desk identification + contest entry) ====================
  // Every client has a QR code, not just members — this is a general
  // identification/lookup tool. If a contest is currently active, scanning
  // also registers a contest entry (capped at one per client per day).
  router.post("/qr/scan", authenticateToken, notForClients, asyncHandler(async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "token is required" });
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

    const packages = await loadClientPackages(pool, req.shopId, foundClient.id);

    const upcomingRes = await pool.query(
      `SELECT a.id, a.status,
              (SELECT MIN(start_time) FROM appointment_services WHERE appointment_id = a.id) AS start_time,
              COALESCE((
                SELECT json_agg(json_build_object('name', s.name, 'staff', st.name) ORDER BY aps.start_time)
                FROM appointment_services aps
                LEFT JOIN services s ON s.id = aps.service_id
                LEFT JOIN staff st ON st.id = aps.staff_id
                WHERE aps.appointment_id = a.id
              ), '[]') AS services
       FROM appointments a
       WHERE a.client_id = $1 AND a.shop_id = $2 AND a.is_block = false AND a.status != 'cancelled'
         AND EXISTS (SELECT 1 FROM appointment_services x WHERE x.appointment_id = a.id AND x.start_time >= NOW())
       ORDER BY start_time ASC LIMIT 3`,
      [foundClient.id, req.shopId],
    );

    const historyRes = await pool.query(
      `SELECT a.id, a.status,
              (SELECT MIN(start_time) FROM appointment_services WHERE appointment_id = a.id) AS start_time,
              COALESCE((
                SELECT json_agg(json_build_object('name', s.name) ORDER BY aps.start_time)
                FROM appointment_services aps LEFT JOIN services s ON s.id = aps.service_id
                WHERE aps.appointment_id = a.id
              ), '[]') AS services
       FROM appointments a
       WHERE a.client_id = $1 AND a.shop_id = $2 AND a.is_block = false AND a.status = 'completed'
       ORDER BY start_time DESC LIMIT 5`,
      [foundClient.id, req.shopId],
    );

    // Balance is financial info — hidden from plain "staff", visible to
    // frontdesk/admin/super_admin (mirrors requireAnalyticsAccess-adjacent
    // roles already trusted with money elsewhere, e.g. the daily report).
    let outstandingBalance = null;
    if (req.user.role !== "staff") {
      const balRes = await pool.query(
        "SELECT outstanding_balance FROM clients WHERE id = $1 AND shop_id = $2",
        [foundClient.id, req.shopId],
      );
      outstandingBalance = Number(balRes.rows[0]?.outstanding_balance || 0);
    }

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
      packages,
      upcoming_appointments: upcomingRes.rows,
      recent_history: historyRes.rows,
      outstanding_balance: outstandingBalance,
    });
  }));

  return router;
};
