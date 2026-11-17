// What a client owes: their balance, manual debts, and past visits with what each cost and what was paid.
const express = require("express");
const { asyncHandler } = require("../../http");
const { appointmentCostSql, appointmentPaidSql } = require("../../domain/moneySql");

module.exports = function accountRouter({
  authenticateToken,
  clientInShop,
  pool,
  recalculateClientBalance,
  requireShopAdminAccess,
  safeUUID,
  notForClients,
}) {
  const router = express.Router();

  router.get("/:id/balance", authenticateToken, notForClients, asyncHandler(async (req, res) => {
    const id = safeUUID(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });
    if (!(await clientInShop(pool, id, req.shopId))) return res.status(404).json({ error: "Not found" });
    res.json({ balance: await recalculateClientBalance(pool, id) });
  }));
  router.get("/:id/debts", authenticateToken, requireShopAdminAccess, asyncHandler(async (req, res) => {
    const id = safeUUID(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });
    const { rows } = await pool.query(
      `SELECT d.id, d.amount::float AS amount, to_char(d.debt_date, 'YYYY-MM-DD') AS debt_date, d.note,
              GREATEST(0, d.amount - COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.client_debt_id = d.id), 0))::float AS remaining
       FROM client_debts d
       WHERE d.client_id = $1 AND d.shop_id = $2
       ORDER BY d.debt_date DESC, d.created_at DESC`,
      [id, req.shopId],
    );
    res.json(rows);
  }, { log: "List client debts error:" }));
  router.post("/:id/debts", authenticateToken, requireShopAdminAccess, asyncHandler(async (req, res) => {
    const id = safeUUID(req.params.id);
    const amount = Math.round(Number(req.body.amount) * 100) / 100;
    const date = String(req.body.debt_date || "");
    const note = String(req.body.note || "").trim();
    if (!id || !(amount > 0) || amount > 1e7) return res.status(400).json({ error: "amount must be a positive number" });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "debt_date must be YYYY-MM-DD" });
    if (!note || note.length > 500) return res.status(400).json({ error: "note is required (max 500 characters)" });
    if (!(await clientInShop(pool, id, req.shopId))) return res.status(404).json({ error: "Not found" });
    await pool.query(
      `INSERT INTO client_debts (shop_id, client_id, amount, debt_date, note, created_by_user_id) VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.shopId, id, amount, date, note, String(req.user.userId || "")],
    );
    res.status(201).json({ success: true, new_balance: await recalculateClientBalance(pool, id) });
  }, { log: "Add client debt error:" }));
  router.get(
    "/:id/past-appointments",
    authenticateToken,
    notForClients,
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const limit = Math.min(parseInt(req.query.limit) || 10, 20);
      const threeMonthClause =
        req.user.role !== "super_admin"
          ? "AND (SELECT MIN(start_time) FROM appointment_services WHERE appointment_id = a.id) >= NOW() - INTERVAL '3 months'"
          : "";
      // Filters for the booking sidebar. "completed" = the visit took place
      // (including past bookings never marked completed); "unpaid" = not
      // cancelled and still owing, partly paid included.
      const STATUS_FILTERS = {
        all: "",
        completed: "AND a.status IN ('completed', 'new', 'confirmed', 'arrived', 'started')",
        cancelled: "AND a.status = 'cancelled'",
        "no-show": "AND a.status = 'no-show'",
        unpaid: "AND a.status <> 'cancelled' AND x.owed > 0",
      };
      const statusClause = STATUS_FILTERS[req.query.status] ?? "";
      const { rows } = await pool.query(
        `SELECT x.* FROM (
           SELECT
              a.id,
              a.status,
              a.internal_notes,
              a.booking_notes,
              (SELECT MIN(start_time) FROM appointment_services WHERE appointment_id = a.id) as start_time,
              (${appointmentCostSql("a.id")})::float AS total,
              ${appointmentPaidSql("a.id")}::float AS paid,
              (SELECT string_agg(s.name, ', ')
               FROM appointment_services aps
               JOIN services s ON aps.service_id = s.id
               WHERE aps.appointment_id = a.id) as service_names,
              (
            SELECT COALESCE(json_agg(json_build_object(
              'name', s.name,
              'staff', st.name,
              'charged', COALESCE(aps.price_override, s.price, 0),
              'paid_with', (SELECT paid_with FROM appointment_service_payments WHERE appointment_service_id = aps.id),
              'hidden', (SELECT json_build_object('cash', hidden_cash, 'card', hidden_card, 'both', hidden_both)
                         FROM appointment_service_payments WHERE appointment_service_id = aps.id)
            ) ORDER BY aps.start_time), '[]')
            FROM appointment_services aps
            LEFT JOIN services s ON s.id = aps.service_id
            LEFT JOIN staff st ON st.id = aps.staff_id
            WHERE aps.appointment_id = a.id
          ) as services_paid,
              (SELECT string_agg(DISTINCT st.name, ', ')
               FROM appointment_services aps
               JOIN staff st ON aps.staff_id = st.id
               WHERE aps.appointment_id = a.id) as staff_names,
              GREATEST(0,
                ${appointmentCostSql("a.id")}
                - ${appointmentPaidSql("a.id")}
              )::float AS owed
           FROM appointments a
           WHERE a.client_id = $1 AND a.shop_id = $2
         ) x
         JOIN appointments a ON a.id = x.id
         WHERE (x.start_time < NOW()
                OR (a.status = 'completed'
                    AND (x.start_time AT TIME ZONE '${process.env.TZ || "Europe/Athens"}')::date
                        <= (NOW() AT TIME ZONE '${process.env.TZ || "Europe/Athens"}')::date))
           ${threeMonthClause}
           ${statusClause}
         ORDER BY x.start_time DESC
         LIMIT $3`,
        [id, req.shopId, limit],
      );
      res.json(rows);
    }, { log: "Past appointments fetch error:" }),
  );

  return router;
};
