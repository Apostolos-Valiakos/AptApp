// SQL for the reports: the cash and card filters (what each hides), the periods the money tiles count, and the rows their lists show.
const { appointmentPaidSql, productsCostSql } = require("./moneySql");
const { getVisibilityClause } = require("./common");

// --- REVENUE EXCLUSION HELPERS (Ctrl+1 hides cash + gift-cards that were themselves
// bought with cash, Ctrl+8 hides card — independent toggles). A gift-card payment is
// only cash-equivalent if the card's own purchase_payment_method was cash; a card- or
// bank-transfer-funded gift card is left alone.
//
// payment_method = 'membership' is excluded UNCONDITIONALLY, regardless of the
// Ctrl+1/Ctrl+8 toggles — this isn't a privacy setting, it's correctness: a
// membership-covered visit isn't new revenue, the money was already recognized
// as a 'membership_sale' transaction when the client bought/renewed the plan
// (that transaction uses a real payment_method like cash/card, so it's counted
// normally and is unaffected by this exclusion).
// The cash and card filters (Ctrl+1 / Ctrl+8) hide services, or part of
// one, not whole bookings: appointment_service_payments holds how much of
// each service each filter hides (migration 0011; a cash-bought gift card
// counts as cash, CASH never).
const hiddenColumn = (excludeCash, excludeCard) => {
  if (excludeCash === "true" && excludeCard === "true") return "hidden_both";
  if (excludeCash === "true") return "hidden_cash";
  if (excludeCard === "true") return "hidden_card";
  return null;
};
/** How much of a service the filters hide, in money. */
const hiddenAmountSql = (apsRef, excludeCash, excludeCard) => {
  const col = hiddenColumn(excludeCash, excludeCard);
  if (!col) return "0";
  return `COALESCE((SELECT _sp.${col} FROM appointment_service_payments _sp WHERE _sp.appointment_service_id = ${apsRef}.id), 0)`;
};
/** What a service shows under the filters: its price less the hidden part. */
const shownPriceSql = (excludeCash, excludeCard, apsRef = "aps", sRef = "s") => {
  const price = `COALESCE(${apsRef}.price_override, ${sRef}.price, 0)`;
  const hidden = hiddenAmountSql(apsRef, excludeCash, excludeCard);
  return hidden === "0" ? price : `(${price} - ${hidden})`;
};
/** True when the filters hide all of a service. */
const serviceHidden = (apsRef, excludeCash, excludeCard) => {
  const col = hiddenColumn(excludeCash, excludeCard);
  if (!col) return "FALSE";
  return `EXISTS (SELECT 1 FROM appointment_service_payments _sp WHERE _sp.appointment_service_id = ${apsRef}.id
            AND _sp.${col} > 0
            AND _sp.${col} >= COALESCE(${apsRef}.price_override, (SELECT price FROM services WHERE id = ${apsRef}.service_id), 0) - 0.005)`;
};
/** For queries over appointment_services: leaves out the services the filters hide whole. */
const buildServiceExclusionClause = (excludeCash, excludeCard, apsRef = "aps") => {
  const hidden = serviceHidden(apsRef, excludeCash, excludeCard);
  return hidden === "FALSE" ? "" : `AND NOT ${hidden}`;
};
/** What the filters hide of a booking, in money. */
const hiddenCostSql = (apptRef, excludeCash, excludeCard) => {
  const col = hiddenColumn(excludeCash, excludeCard);
  if (!col) return "0";
  return `COALESCE((SELECT SUM(_hp.${col}) FROM appointment_service_payments _hp WHERE _hp.appointment_id = ${apptRef}), 0)`;
};
/**
 * For queries over bookings: a booking paid by membership or package visit
 * isn't revenue at all, and one whose every service is hidden by the filters
 * is left out. Sums of its services also need buildServiceExclusionClause.
 */
const buildRevenueExclusionClause = (excludeCash, excludeCard, alias = "a") => {
  // A written-off visit still happened: it stays in sales and staff figures.
  // The write-off itself is never money collected (buildTxnMethodExclusionClause).
  let clause = `AND NOT (${alias}.payment_status = 'paid' AND EXISTS (SELECT 1 FROM transactions _t WHERE _t.appointment_id = ${alias}.id AND _t.payment_method IN ('membership', 'package')))`;
  const hidden = serviceHidden("_vs", excludeCash, excludeCard);
  if (hidden !== "FALSE") {
    clause += ` AND EXISTS (SELECT 1 FROM appointment_services _vs WHERE _vs.appointment_id = ${alias}.id AND NOT ${hidden})`;
  }
  return clause;
};
const buildTxnMethodExclusionClause = (excludeCash, excludeCard, columnPrefix = "") => {
  const conditions = [`${columnPrefix}payment_method IN ('membership', 'package', 'write-off')`];
  if (excludeCash === "true") {
    conditions.push(`${columnPrefix}payment_method = 'cash'`);
    conditions.push(
      `(${columnPrefix}payment_method = 'gift-card' AND EXISTS (SELECT 1 FROM gift_cards _gc WHERE _gc.id = ${columnPrefix}gift_card_id AND _gc.purchase_payment_method = 'cash'))`,
    );
  }
  if (excludeCard === "true") conditions.push(`${columnPrefix}payment_method = 'card'`);
  return `AND NOT (${conditions.join(" OR ")})`;
};
// A from/to bound arrives as an ISO timestamp of local midnight; expenses are
// plain calendar dates, so compare against that timestamp's local date.
// The screens send a period as moments in time (ISO, e.g. 20/11 00:00 in Athens
// is 2026-11-19T22:00:00Z). Columns stored without a time zone (payments'
// created_at, gift cards' issued_at, ...) hold the shop's local time, so the
// moment is turned into local time first; compared as is, PostgreSQL drops the
// "Z" and the period starts and ends 2 hours early (3 in summer).
const SHOP_TZ = process.env.TZ || "Europe/Athens";
const localTimeOf = (paramIndex) => `(($${paramIndex})::timestamptz AT TIME ZONE '${SHOP_TZ}')`;
const localDateOf = (paramIndex) => `${localTimeOf(paramIndex)}::date`;
const expenseDateOf = localDateOf;
// The bookings the Analytics money tiles count for a period: completed ones,
// and past ones not cancelled or no-show (new, confirmed, started), with the
// revenue exclusion given (alias a2). Shared by the tiles and their details.
const periodAppointments = (req, cashApptClause) => {
  const { from, to } = req.query;
  const apptParams = [req.shopId];
  let apptDateFilter = "";
  if (from) {
    apptParams.push(from);
    apptDateFilter += ` AND aps2.start_time >= $${apptParams.length}`;
  }
  if (to) {
    apptParams.push(to);
    apptDateFilter += ` AND aps2.start_time <= $${apptParams.length}`;
  }

  // Subquery to find appointments in the date range.
  // Includes completed appointments and any past appointment that is not cancelled/no-show
  // (covers 'new', 'confirmed', and 'started' statuses that have already occurred).
  const appointmentSubquery = `
    SELECT DISTINCT a2.id FROM appointments a2
    JOIN appointment_services aps2 ON a2.id = aps2.appointment_id
    WHERE a2.shop_id = $1
    AND (
      a2.status = 'completed'
      OR (a2.status IN ('new', 'confirmed', 'started') AND aps2.start_time < CURRENT_TIMESTAMP)
    )
    ${getVisibilityClause(req.user, "a2")}
    ${apptDateFilter}
    ${cashApptClause}
  `;

  return { params: apptParams, sql: appointmentSubquery };
};
// Payments of bookings kept off the receipts (save_receipt false) are for
// super admins only, like the bookings themselves; payments without a booking
// (gift cards, packages...) are for everyone. `ref` qualifies the table.
const transactionVisibilityClause = (user, ref = "t.") =>
  user?.role === "super_admin"
    ? ""
    : ` AND NOT EXISTS (SELECT 1 FROM appointments _va WHERE _va.id = ${ref}appointment_id AND _va.save_receipt IS DISTINCT FROM true)`;
// Payments received in the period (Πληρωμές περιόδου, Καθαρό), by when they
// were recorded. `col` qualifies the column names.
const paymentsWindow = (req, col = "") => {
  const { from, to } = req.query;
  const params = [req.shopId];
  let filter = transactionVisibilityClause(req.user, col || "transactions.");
  if (from) {
    params.push(from);
    filter += ` AND ${col}created_at >= ${localTimeOf(params.length)}`;
  }
  if (to) {
    params.push(to);
    filter += ` AND ${col}created_at <= ${localTimeOf(params.length)}`;
  }
  return { params, filter };
};
// Expenses for the period, hidden by the same cash/card toggles. A monthly
// expense (on the 1st) counts only if the period covers its whole month.
const expensesWindow = (req, col = "") => {
  const { from, to, excludeCash, excludeCard } = req.query;
  const params = [req.shopId];
  let filter = "";
  if (from) {
    params.push(from);
    filter += ` AND ${col}expense_date >= ${expenseDateOf(params.length)}`;
  }
  if (to) {
    params.push(to);
    filter += ` AND CASE WHEN ${col}kind = 'monthly'
                         THEN (date_trunc('month', ${col}expense_date) + INTERVAL '1 month - 1 day')::date
                         ELSE ${col}expense_date END <= ${expenseDateOf(params.length)}`;
  }
  if (excludeCash === "true") filter += ` AND ${col}payment_method <> 'cash'`;
  if (excludeCard === "true") filter += ` AND ${col}payment_method <> 'card'`;
  return { params, filter };
};
// The Daily Report's payments for a shop day ($1 shop, $2 YYYY-MM-DD or null
// for today): money recorded that local day (created_at holds local time),
// not package or membership visits or write-offs, nor what the filters hide.
// The reconciliation uses the same rows.
const dailyPaymentsSql = (user, methodExclusion = buildTxnMethodExclusionClause(undefined, undefined, "t.")) => `
  SELECT t.id, t.appointment_id, t.amount, t.payment_method, t.transaction_type, t.created_at,
         t.client_debt_id, t.gift_card_id, c.first_name, c.last_name
  FROM transactions t
  LEFT JOIN clients c ON c.id = t.client_id
  WHERE t.shop_id = $1 AND t.created_at::date = COALESCE($2::date, CURRENT_DATE)
    AND COALESCE(t.payment_method, '') NOT IN ('membership', 'package', 'write-off')
    ${methodExclusion}
    ${transactionVisibilityClause(user, "t.")}
  ORDER BY t.created_at DESC`;
// The cancellation and retention tiles: the last 30 days unless dates are given.
const analyticsWindow = (req) => ({
  start: req.query.from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  end: req.query.to || new Date().toISOString(),
});
// A client counts as returning if they had a completed booking before the
// period; the clients are those with bookings made in the period.
const RETURNING_SQL = `EXISTS (
  SELECT 1 FROM appointments old
  JOIN appointment_services aps_old ON old.id = aps_old.appointment_id
  WHERE old.client_id = a.client_id
  AND aps_old.start_time < $2
  AND old.status = 'completed'
)`;
// What makes up each money and client tile on the Analytics page, one row
// per booking, payment, expense or client, for the same dates and filters
// as the tile, so the rows always add up to it.
const DETAIL_KINDS = ["sales", "payments", "today", "debts", "expenses", "net", "cancellations", "retention"];
const clientName = "TRIM(COALESCE(c.last_name, '') || ' ' || COALESCE(c.first_name, ''))";
const serviceNames = (ref, extra = "") => `(SELECT string_agg(COALESCE(s.name, '—'), ', ' ORDER BY aps.start_time)
  FROM appointment_services aps LEFT JOIN services s ON s.id = aps.service_id WHERE aps.appointment_id = ${ref} ${extra})`;
const bookingsSql = (sql, excludeCash, excludeCard) => `
  SELECT a.id AS appointment_id, a.client_id, ${clientName} AS client, c.phone, a.status,
         (SELECT MIN(start_time) FROM appointment_services WHERE appointment_id = a.id) AS date,
         ${serviceNames("a.id", buildServiceExclusionClause(excludeCash, excludeCard))} AS services,
         ROUND(COALESCE((SELECT SUM(${shownPriceSql(excludeCash, excludeCard)}) FROM appointment_services aps
                         LEFT JOIN services s ON s.id = aps.service_id
                         WHERE aps.appointment_id = a.id ${buildServiceExclusionClause(excludeCash, excludeCard)}), 0)
           + ${productsCostSql("a.id")}, 2)::float AS value,
         ROUND(${appointmentPaidSql("a.id")}
           - ${hiddenCostSql("a.id", excludeCash, excludeCard)}, 2)::float AS paid
  FROM appointments a LEFT JOIN clients c ON c.id = a.client_id
  WHERE a.id IN (${sql})`;
const paymentsSql = (filter) => `
  SELECT t.id, t.client_id, ${clientName} AS client, c.phone, t.created_at AS date,
         t.payment_method AS method, t.transaction_type AS type, ROUND(t.amount, 2)::float AS amount
  FROM transactions t LEFT JOIN clients c ON c.id = t.client_id
  WHERE t.shop_id = $1 ${filter}`;

module.exports = { transactionVisibilityClause, dailyPaymentsSql, localTimeOf, localDateOf, hiddenColumn, hiddenAmountSql, shownPriceSql, serviceHidden, buildServiceExclusionClause, hiddenCostSql, buildRevenueExclusionClause, buildTxnMethodExclusionClause, expenseDateOf, periodAppointments, paymentsWindow, expensesWindow, analyticsWindow, RETURNING_SQL, DETAIL_KINDS, clientName, serviceNames, bookingsSql, paymentsSql };
