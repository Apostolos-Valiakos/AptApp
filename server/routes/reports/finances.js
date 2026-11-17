// The money tiles (finances) and the lists behind them.
const express = require("express");
const { asyncHandler } = require("../../http");
const pool = require("../../db");
const { shownPriceSql, buildServiceExclusionClause, hiddenCostSql, buildRevenueExclusionClause, buildTxnMethodExclusionClause, periodAppointments, paymentsWindow, expensesWindow, analyticsWindow, RETURNING_SQL, DETAIL_KINDS, clientName, bookingsSql, paymentsSql } = require("../../domain/reportSql");

module.exports = function financesRouter({
  authenticateToken,
  requireAnalyticsAccess,
}) {
  const router = express.Router();

  router.get("/reports/finances/details", authenticateToken, requireAnalyticsAccess, asyncHandler(async (req, res) => {
    const { kind, excludeCash, excludeCard } = req.query;
    if (!DETAIL_KINDS.includes(kind)) return res.status(400).json({ error: "invalid_kind" });
    const txnClause = buildTxnMethodExclusionClause(excludeCash, excludeCard, "t.");
    const sum = (rows, key) => Math.round(rows.reduce((n, r) => n + Number(r[key] || 0), 0) * 100) / 100;

    if (kind === "sales" || kind === "debts") {
      const { params, sql } = periodAppointments(req, buildRevenueExclusionClause(excludeCash, excludeCard, "a2"));
      let { rows } = await pool.query(`${bookingsSql(sql, excludeCash, excludeCard)} ORDER BY date`, params);
      rows = rows.map((r) => ({ ...r, owed: Math.round((r.value - r.paid) * 100) / 100 }));
      if (kind === "debts") rows = rows.filter((r) => Math.abs(r.owed) > 0.005);
      return res.json({ rows, total: sum(rows, kind === "sales" ? "value" : "owed") });
    }
    if (kind === "payments" || kind === "today") {
      const { params, filter } = kind === "today"
        ? { params: [req.shopId], filter: " AND t.created_at >= CURRENT_DATE" }
        : paymentsWindow(req, "t.");
      const { rows } = await pool.query(`${paymentsSql(`${filter} ${txnClause}`)} ORDER BY t.created_at`, params);
      return res.json({ rows, total: sum(rows, "amount") });
    }
    if (kind === "expenses" || kind === "net") {
      const { params, filter } = expensesWindow(req, "e.");
      const { rows: expenses } = await pool.query(
        `SELECT e.id, e.expense_date AS date, e.description, ec.name AS category, e.payment_method AS method,
                e.kind AS expense_kind, ROUND(e.amount, 2)::float AS amount
         FROM expenses e LEFT JOIN expense_categories ec ON ec.id = e.category_id
         WHERE e.shop_id = $1 ${filter} ORDER BY e.expense_date, e.created_at`,
        params,
      );
      if (kind === "expenses") return res.json({ rows: expenses, total: sum(expenses, "amount") });
      const pw = paymentsWindow(req, "t.");
      const { rows: payments } = await pool.query(`${paymentsSql(`${pw.filter} ${txnClause}`)} ORDER BY t.created_at`, pw.params);
      const rows = [
        ...payments.map((p) => ({ ...p, line: "payment", description: p.client })),
        ...expenses.map((e) => ({ ...e, id: `e-${e.id}`, line: "expense", amount: -e.amount })),
      ].sort((x, y) => new Date(x.date) - new Date(y.date));
      return res.json({ rows, total: sum(rows, "amount") });
    }
    const { start, end } = analyticsWindow(req);
    if (kind === "cancellations") {
      // Counted per service, as in the tile.
      const { rows: counts } = await pool.query(
        `SELECT COUNT(*) FILTER (WHERE a.status IN ('cancelled', 'no-show'))::int AS negative, COUNT(*)::int AS total
         FROM appointments a JOIN appointment_services aps ON a.id = aps.appointment_id
         WHERE a.shop_id = $1 AND aps.start_time >= $2 AND aps.start_time <= $3`,
        [req.shopId, start, end],
      );
      const { rows } = await pool.query(
        `SELECT a.id AS appointment_id, a.client_id, ${clientName} AS client, c.phone, a.status,
                MIN(aps.start_time) AS date, COUNT(aps.id)::int AS service_count,
                string_agg(COALESCE(s.name, '—'), ', ' ORDER BY aps.start_time) AS services
         FROM appointments a
         JOIN appointment_services aps ON a.id = aps.appointment_id
         LEFT JOIN services s ON s.id = aps.service_id
         LEFT JOIN clients c ON c.id = a.client_id
         WHERE a.shop_id = $1 AND aps.start_time >= $2 AND aps.start_time <= $3
           AND a.status IN ('cancelled', 'no-show')
         GROUP BY a.id, c.id ORDER BY date`,
        [req.shopId, start, end],
      );
      const { negative, total } = counts[0];
      return res.json({ rows, summary: { negative, total, rate: total > 0 ? Math.round((negative / total) * 1000) / 10 : 0 } });
    }
    // retention
    const { rows } = await pool.query(
      `SELECT a.client_id, ${clientName} AS client, c.phone, COUNT(DISTINCT a.id)::int AS bookings,
              BOOL_OR(${RETURNING_SQL}) AS returning
       FROM appointments a LEFT JOIN clients c ON c.id = a.client_id
       WHERE a.shop_id = $1 AND a.created_at >= $2 AND a.created_at <= $3 AND a.client_id IS NOT NULL
       GROUP BY a.client_id, c.id ORDER BY client`,
      [req.shopId, start, end],
    );
    const returning = rows.filter((r) => r.returning).length;
    return res.json({
      rows,
      summary: { returning, new: rows.length - returning, rate: rows.length ? Math.round((returning / rows.length) * 1000) / 10 : 0 },
    });
  }, { log: "Finance details report error:" }));
  router.get("/reports/finances", authenticateToken, requireAnalyticsAccess, asyncHandler(async (req, res) => {
    const { from, to, excludeCash, excludeCard } = req.query;
    const shopId = req.shopId;
    const isSuperAdmin = req.user.role === "super_admin";
    const cashApptClause = buildRevenueExclusionClause(excludeCash, excludeCard, "a2");
    const cashTxnClause = buildTxnMethodExclusionClause(excludeCash, excludeCard);

    const { params: apptParams, sql: appointmentSubquery } = periodAppointments(req, cashApptClause);

    let client;
    try {
      client = await pool.connect();

      // --- A. TOTAL SALES (Services + Products) ---
      const salesRes = await client.query(
        `
        SELECT SUM(${shownPriceSql(excludeCash, excludeCard)}) as total
        FROM appointment_services aps
        LEFT JOIN services s ON aps.service_id = s.id
        WHERE aps.appointment_id IN (${appointmentSubquery})
          ${buildServiceExclusionClause(excludeCash, excludeCard)}
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
        SELECT COALESCE((SELECT SUM(amount) FROM transactions WHERE appointment_id IN (${appointmentSubquery})), 0)
               - COALESCE((SELECT SUM(${hiddenCostSql("_pa.id", excludeCash, excludeCard)}) FROM appointments _pa
                           WHERE _pa.id IN (${appointmentSubquery})), 0) as total
      `,
        apptParams,
      );
      const periodPaymentsApplied = Number(periodPaymentsRes.rows[0].total) || 0;
      const totalDebt = totalSales - periodPaymentsApplied;

      // --- C. TOTAL COLLECTED (Cash Flow for Period) ---
      const { params: flowParams, filter: flowFilter } = paymentsWindow(req);

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

      // --- E. EXPENSES for the period ---
      const { params: expParams, filter: expFilter } = expensesWindow(req);
      const expRes = await client.query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE shop_id = $1 ${expFilter}`,
        expParams,
      );
      const totalExpenses = Number(expRes.rows[0].total) || 0;

      // --- Final Response (All keys required by FinancialsView.vue) ---
      res.json({
        total_sales: totalSales,
        total_payments: totalPayments,
        collected_today: collectedToday,
        total_debt: totalDebt,
        total_expenses: totalExpenses,
        net_profit: totalPayments - totalExpenses,
      });
    } finally {
      if (client) client.release();
    }
  }, { log: "Finance Report Error:", message: "Failed to generate report" }));

  return router;
};
