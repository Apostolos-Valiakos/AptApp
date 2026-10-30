// Discount codes: /api/v1/discount-codes, /discounts.
// Moved out of server.js; helpers that still live there are handed over when
// it mounts this router (see "Area routers" near the end of server.js).
const express = require("express");
const { asyncHandler } = require("../http");
const pool = require("../db");

module.exports = function discountsRouter({
  authenticateToken,
  notForClients,
  requireAnalyticsAccess,
}) {
  const router = express.Router();

  // --- Discount codes ---
  // Every non-client role can read active codes (to apply them in the booking
  // dialog); only admins manage them.
  router.get("/discount-codes", authenticateToken, notForClients, asyncHandler(async (req, res) => {
    if (req.user.role === "client") return res.status(403).json({ error: "Forbidden" });
    const isAdmin = req.user.role === "admin" || req.user.role === "super_admin";
    const { rows } = await pool.query(
      `SELECT dc.id, dc.name, dc.percentage, dc.is_active, dc.created_at,
              (SELECT COUNT(*) FROM appointments a
                WHERE a.discount_code_id = dc.id AND a.status != 'cancelled')::int AS usage_count
       FROM discount_codes dc
       WHERE dc.shop_id = $1 ${isAdmin ? "" : "AND dc.is_active = true"}
       ORDER BY dc.is_active DESC, LOWER(dc.name)`,
      [req.user.shopId],
    );
    res.json(rows);
  }));

  const parseDiscountCodeBody = (body, partial) => {
    const out = {};
    if (!partial || body.name !== undefined) {
      const name = String(body.name || "").trim();
      if (!name || name.length > 100) return { error: "Name is required (max 100 chars)" };
      out.name = name;
    }
    if (!partial || body.percentage !== undefined) {
      const pct = Number(body.percentage);
      if (!(pct > 0 && pct <= 100)) return { error: "Percentage must be between 0 and 100" };
      out.percentage = pct;
    }
    if (partial && body.is_active !== undefined) out.is_active = !!body.is_active;
    return { value: out };
  };

  router.post("/discount-codes", authenticateToken, requireAnalyticsAccess, asyncHandler(async (req, res) => {
    const parsed = parseDiscountCodeBody(req.body, false);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const { rows } = await pool.query(
      `INSERT INTO discount_codes (shop_id, name, percentage) VALUES ($1, $2, $3)
       RETURNING id, name, percentage, is_active, created_at, 0 AS usage_count`,
      [req.user.shopId, parsed.value.name, parsed.value.percentage],
    );
    res.status(201).json(rows[0]);
  }, { mapError: (err) => (err.code === "23505" ? { status: 409, body: { error: "A code with this name already exists" } } : null) }));

  router.put("/discount-codes/:id", authenticateToken, requireAnalyticsAccess, asyncHandler(async (req, res) => {
    const parsed = parseDiscountCodeBody(req.body, true);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const fields = Object.keys(parsed.value);
    if (fields.length === 0) return res.status(400).json({ error: "Nothing to update" });
    const sets = fields.map((f, i) => `${f} = $${i + 3}`).join(", ");
    const { rows } = await pool.query(
      `UPDATE discount_codes SET ${sets} WHERE id = $1 AND shop_id = $2
       RETURNING id, name, percentage, is_active, created_at`,
      [req.params.id, req.user.shopId, ...fields.map((f) => parsed.value[f])],
    );
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  }, { mapError: (err) => (err.code === "23505" ? { status: 409, body: { error: "A code with this name already exists" } } : null) }));

  router.delete("/discount-codes/:id", authenticateToken, requireAnalyticsAccess, asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query(
      "DELETE FROM discount_codes WHERE id = $1 AND shop_id = $2",
      [req.params.id, req.user.shopId],
    );
    if (!rowCount) return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  }));

  // Appointments that carry a discount (any type), newest first — admin tracking view.
  router.get("/discounts/usage", authenticateToken, requireAnalyticsAccess, asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const { rows } = await pool.query(
      `SELECT a.id, a.status, a.discount_type, a.discount_value, a.discount_scope,
              a.discount_code_name, a.discount_amount,
              c.first_name, c.last_name,
              (SELECT MIN(start_time) FROM appointment_services WHERE appointment_id = a.id) AS start_time
       FROM appointments a
       LEFT JOIN clients c ON c.id = a.client_id
       WHERE a.shop_id = $1 AND a.discount_amount > 0
       ORDER BY start_time DESC NULLS LAST
       LIMIT $2`,
      [req.user.shopId, limit],
    );
    res.json(rows);
  }));

  return router;
};
