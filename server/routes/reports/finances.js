// The money tiles (finances) and the lists behind them.
const express = require("express");
const { asyncHandler } = require("../../http");
const pool = require("../../db");
const { transactionVisibilityClause, localDateOf, localTimeOf, shownPriceSql, buildServiceExclusionClause, hiddenCostSql, buildRevenueExclusionClause, buildTxnMethodExclusionClause, periodAppointments, paymentsWindow, expensesWindow, analyticsWindow, RETURNING_SQL, DETAIL_KINDS, clientName, bookingsSql, paymentsSql } = require("../../domain/reportSql");

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
      let { params, filter } = kind === "today"
        ? { params: [req.shopId], filter: " AND t.created_at >= CURRENT_DATE" }
        : paymentsWindow(req, "t.");
      if (kind === "today") filter += transactionVisibilityClause(req.user, "t.");
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
       WHERE a.shop_id = $1 AND a.created_at >= ${localDateOf(2)} AND a.created_at <= ${localDateOf(3)} AND a.client_id IS NOT NULL
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
    const { excludeCash, excludeCard } = req.query;
    const shopId = req.shopId;
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
      // What the period's bookings cost: services and the products sold on
      // them. The period's debt is worked out from this, not from the total
      // below (a gift card sold isn't money a booking owes).
      const bookingSales =
        (Number(salesRes.rows[0].total) || 0) +
        (Number(productSalesRes.rows[0].total) || 0);

      // Gift cards, packages and memberships count when sold, in the period
      // they were paid for. So a service later paid by gift card or package
      // visit isn't counted again: what those paid on the period's bookings
      // comes off. (Bookings fully paid by package or membership are already
      // left out; a gift card bought with cash is already hidden by Ctrl+1.)
      const usedRes = await client.query(
        `SELECT
           COALESCE(SUM(t.amount) FILTER (WHERE t.payment_method = 'package'), 0) AS package_used,
           COALESCE(SUM(t.amount) FILTER (
             WHERE t.payment_method = 'gift-card'
             ${excludeCash === "true" ? "AND NOT EXISTS (SELECT 1 FROM gift_cards gc WHERE gc.id = t.gift_card_id AND gc.purchase_payment_method = 'cash')" : ""}
           ), 0) AS gift_card_used
         FROM transactions t
         WHERE t.appointment_id IN (${appointmentSubquery})`,
        apptParams,
      );
      const { from, to } = req.query;
      const saleParams = [shopId];
      let saleWindow = "";
      if (from) {
        saleParams.push(from);
        saleWindow += ` AND created_at >= ${localTimeOf(saleParams.length)}`;
      }
      if (to) {
        saleParams.push(to);
        saleWindow += ` AND created_at <= ${localTimeOf(saleParams.length)}`;
      }
      const soldRes = await client.query(
        `SELECT transaction_type AS kind, COALESCE(SUM(amount), 0) AS total
         FROM transactions
         WHERE shop_id = $1 AND appointment_id IS NULL
           AND transaction_type IN ('gift_card_sale', 'package_sale', 'membership_sale')
           ${saleWindow} ${cashTxnClause}
         GROUP BY transaction_type`,
        saleParams,
      );
      const sold = Object.fromEntries(soldRes.rows.map((r) => [r.kind, Number(r.total) || 0]));
      // Products sold on their own, not on a booking (sale_date has a time zone).
      const productParams = [shopId];
      let productWindow = "";
      if (from) {
        productParams.push(from);
        productWindow += ` AND sale_date >= $${productParams.length}::timestamptz`;
      }
      if (to) {
        productParams.push(to);
        productWindow += ` AND sale_date <= $${productParams.length}::timestamptz`;
      }
      const ownProductsRes = await client.query(
        `SELECT COALESCE(SUM(total_price), 0) AS total FROM product_sales
         WHERE shop_id = $1 AND appointment_id IS NULL ${productWindow}`,
        productParams,
      );
      const salesParts = {
        services: Number(salesRes.rows[0].total) || 0,
        booking_products: Number(productSalesRes.rows[0].total) || 0,
        own_products: Number(ownProductsRes.rows[0].total) || 0,
        gift_cards_sold: sold.gift_card_sale || 0,
        packages_sold: sold.package_sale || 0,
        memberships_sold: sold.membership_sale || 0,
        gift_card_used: Number(usedRes.rows[0].gift_card_used) || 0,
        package_used: Number(usedRes.rows[0].package_used) || 0,
      };
      const round2 = (n) => Math.round(n * 100) / 100;
      const totalSales = round2(
        bookingSales + salesParts.own_products
          + salesParts.gift_cards_sold + salesParts.packages_sold + salesParts.memberships_sold
          - salesParts.gift_card_used - salesParts.package_used,
      );

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
      const totalDebt = bookingSales - periodPaymentsApplied;

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
        WHERE shop_id = $1 AND created_at >= CURRENT_DATE ${cashTxnClause} ${transactionVisibilityClause(req.user, "transactions.")}
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
        // What the total is made of, for the tile's explanation.
        total_sales_parts: salesParts,
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
