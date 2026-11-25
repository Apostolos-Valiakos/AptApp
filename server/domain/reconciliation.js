// The Daily Report's reconciliation: does the day's money add up?
//
//   Sales − Uncollected = Expected, compared with the day's Payments.
//
// - Sales: the Analytics "Σύνολο Πωλήσεων" for the day (periodAppointments):
//   the value of the bookings with a service that day, completed or past and
//   not cancelled, services and products.
// - Uncollected: what those bookings still owed at the end of the day: their
//   value less every transaction recorded for them up to that day, money or
//   not (package or membership visits, write-offs). So Expected is what those
//   transactions add up to, and a past day's check never changes.
// - Payments: the Daily Report's "Εισπράξεις ημέρας" (dailyPaymentsSql), the
//   same as Analytics "Πληρωμές"/"Καθαρό" without expenses for that day.
//
// Payments and Expected differ for known reasons, each a line: money taken
// that day for something else (other days' bookings, gift cards, packages,
// memberships, manual debts) and, the other way, the day's bookings settled
// without that day's money (paid on an earlier day, package or membership
// visits, write-offs). What's left after the lines is "unexplained" and should
// be 0. Payments made after the day for its bookings are shown for
// information; they aren't part of the sum.
const { periodAppointments, bookingsSql, dailyPaymentsSql, buildRevenueExclusionClause } = require("./reportSql");

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const sum = (rows) => round2(rows.reduce((n, r) => n + Number(r.amount ?? r.value ?? 0), 0));
// Not money: settled another way.
const NOT_MONEY = new Set(["membership", "package", "write-off"]);

/**
 * The reconciliation from rows. `day`: YYYY-MM-DD; `bookings`: the day's sales
 * ({ appointment_id, value, ... }); `bookingTransactions`: every transaction
 * of those bookings ({ id, appointment_id, amount, payment_method, day });
 * `payments`: the day's payments ({ id, appointment_id, amount,
 * transaction_type, client_debt_id, gift_card_id }).
 */
const reconcile = ({ day, bookings, bookingTransactions, payments }) => {
  const inSales = new Set(bookings.map((b) => String(b.appointment_id)));
  const byEnd = bookingTransactions.filter((t) => t.day <= day);
  const sales = sum(bookings.map((b) => ({ amount: b.value })));
  const paidByEnd = sum(byEnd);
  const uncollected = round2(sales - paidByEnd);
  const expected = round2(sales - uncollected);
  const paymentsTotal = sum(payments);

  // Money taken that day for something other than the day's bookings (+).
  const other = payments.filter((p) => !(p.appointment_id && inSales.has(String(p.appointment_id))));
  const kindOf = (p) => {
    if (p.transaction_type === "gift_card_sale") return "giftCardSales";
    if (p.transaction_type === "package_sale") return "packageSales";
    if (p.transaction_type === "membership_sale") return "membershipSales";
    if (p.client_debt_id) return "manualDebts";
    if (p.appointment_id) return "otherDaysBookings";
    return "otherPayments";
  };
  // The day's bookings settled without that day's money (−).
  const settledElsewhere = {
    paidEarlier: byEnd.filter((t) => t.day < day && !NOT_MONEY.has(t.payment_method)),
    visits: byEnd.filter((t) => t.payment_method === "membership" || t.payment_method === "package"),
    writeOffs: byEnd.filter((t) => t.payment_method === "write-off"),
  };

  const lines = [];
  for (const key of ["otherDaysBookings", "giftCardSales", "packageSales", "membershipSales", "manualDebts", "otherPayments"]) {
    const rows = other.filter((p) => kindOf(p) === key);
    if (rows.length) lines.push({ key, sign: 1, amount: sum(rows), rows });
  }
  for (const [key, rows] of Object.entries(settledElsewhere)) {
    if (rows.length) lines.push({ key, sign: -1, amount: round2(-sum(rows)), rows });
  }

  const delta = round2(paymentsTotal - expected);
  const explained = round2(lines.reduce((n, l) => n + l.amount, 0));
  const later = bookingTransactions.filter((t) => t.day > day && !NOT_MONEY.has(t.payment_method));
  return {
    day,
    sales,
    uncollected,
    expected,
    payments: paymentsTotal,
    delta,
    lines,
    unexplained: round2(delta - explained),
    paid_later: { amount: sum(later), rows: later },
  };
};

/** Loads the rows for `day` (YYYY-MM-DD) and reconciles them. `req`: shopId and user. */
const dailyReconciliation = async (db, req, day, tz) => {
  // The shop's day as moments in time, for the Sales query (start_time has a time zone).
  const { rows: [bounds] } = await db.query(
    `SELECT (($1::date)::timestamp AT TIME ZONE $2) AS start, ((($1::date) + 1)::timestamp AT TIME ZONE $2) - INTERVAL '1 millisecond' AS stop`,
    [day, tz],
  );
  const salesReq = { shopId: req.shopId, user: req.user, query: { from: bounds.start.toISOString(), to: bounds.stop.toISOString() } };
  // The same bookings as the Analytics sales tile, no filters (bookings paid
  // whole by package or membership visits aren't sales).
  const { params, sql } = periodAppointments(salesReq, buildRevenueExclusionClause(undefined, undefined, "a2"));
  const { rows: bookings } = await db.query(`${bookingsSql(sql)} ORDER BY date`, params);

  const ids = bookings.map((b) => b.appointment_id);
  const { rows: bookingTransactions } = ids.length
    ? await db.query(
        `SELECT t.id, t.appointment_id, ROUND(t.amount, 2)::float AS amount, t.payment_method, t.transaction_type,
                t.created_at, to_char(t.created_at, 'YYYY-MM-DD') AS day
         FROM transactions t WHERE t.appointment_id = ANY($1::uuid[]) ORDER BY t.created_at`,
        [ids],
      )
    : { rows: [] };
  const { rows: payments } = await db.query(dailyPaymentsSql(req.user), [req.shopId, day]);

  const named = new Map(bookings.map((b) => [String(b.appointment_id), b.client]));
  const result = reconcile({
    day,
    bookings,
    bookingTransactions: bookingTransactions.map((t) => ({ ...t, client: named.get(String(t.appointment_id)) || null })),
    payments: payments.map((p) => ({ ...p, amount: Number(p.amount) })),
  });
  return { ...result, bookings };
};

module.exports = { reconcile, dailyReconciliation };
