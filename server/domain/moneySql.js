// The money sums of one appointment, as SQL expressions, so every query
// counts them the same way (the balance, the calendar, payments, reports).
// `ref` is the SQL that names the appointment's id: "a.id", "$1", ….
//
// A service line costs its charged price (price_override), else the
// catalogue price; the screens count it the same (client/src/utils/money.ts).

/** What the appointment's service lines cost. */
const servicesCostSql = (ref) => `COALESCE((SELECT SUM(COALESCE(aps.price_override, s.price))
    FROM appointment_services aps LEFT JOIN services s ON s.id = aps.service_id
    WHERE aps.appointment_id = ${ref}), 0)`;

/** What the products sold with it cost. */
const productsCostSql = (ref) => `COALESCE((SELECT SUM(total_price) FROM product_sales WHERE appointment_id = ${ref}), 0)`;

/** What it costs in all: its services and its products. */
const appointmentCostSql = (ref) => `(${servicesCostSql(ref)} + ${productsCostSql(ref)})`;

/** What was recorded against it: payments, less refunds (negative), write-offs included. */
const appointmentPaidSql = (ref) => `COALESCE((SELECT SUM(amount) FROM transactions WHERE appointment_id = ${ref}), 0)`;

module.exports = { servicesCostSql, productsCostSql, appointmentCostSql, appointmentPaidSql };
