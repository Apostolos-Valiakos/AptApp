// A client's balance: what they owe, from bookings, manual debts and credit.
const pool = require("../db");

// --- HELPER: Recalculate Outstanding Balance for a Client ---
// A client's balance: what past, non-cancelled appointments (since March 2026)
// cost minus what was recorded against them, plus manual debts minus what was
// recorded against those, minus what was paid on cancelled appointments
// (credit). Write-offs are payment records too, so they clear debt without
// counting as revenue (see the revenue exclusion helpers).
const clientBalanceSql = (clientRef) => `(
  COALESCE((
    SELECT SUM(x.total_cost - x.total_paid) FROM (
      SELECT
        COALESCE(SUM(COALESCE(aps.price_override, s.price)), 0)
          + COALESCE((SELECT SUM(total_price) FROM product_sales WHERE appointment_id = a.id), 0) AS total_cost,
        COALESCE((SELECT SUM(amount) FROM transactions WHERE appointment_id = a.id), 0) AS total_paid,
        (SELECT MIN(start_time) FROM appointment_services WHERE appointment_id = a.id) AS appt_time
      FROM appointments a
      LEFT JOIN appointment_services aps ON a.id = aps.appointment_id
      LEFT JOIN services s ON aps.service_id = s.id
      WHERE a.client_id = ${clientRef} AND a.status != 'cancelled'
      GROUP BY a.id
    ) x
    WHERE x.appt_time <= CURRENT_TIMESTAMP AND x.appt_time >= '2026-03-01 00:00:00'
  ), 0)
  + COALESCE((
    SELECT SUM(d.amount - COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.client_debt_id = d.id), 0))
    FROM client_debts d
    WHERE d.client_id = ${clientRef} AND d.debt_date <= CURRENT_DATE
  ), 0)
  -- A cancelled booking costs nothing, but what was paid on it (less any
  -- refunds) stays the client's credit.
  - COALESCE((
    SELECT SUM(t.amount)
    FROM transactions t
    JOIN appointments a ON a.id = t.appointment_id
    WHERE a.client_id = ${clientRef} AND a.status = 'cancelled'
      AND (SELECT MIN(start_time) FROM appointment_services WHERE appointment_id = a.id) >= '2026-03-01 00:00:00'
  ), 0)
)`;

const recalculateClientBalance = async (client, clientId) => {
  try {
    const balanceRes = await client.query(`SELECT ${clientBalanceSql("$1")} AS new_balance`, [clientId]);
    const newBalance = Number(balanceRes.rows[0].new_balance) || 0;
    await client.query("UPDATE clients SET outstanding_balance = $1 WHERE id = $2", [newBalance, clientId]);
    return newBalance;
  } catch (err) {
    console.error("Error recalculating balance:", err);
    throw err;
  }
};

// Stored balances only change on writes, but debt also appears when an
// appointment's time passes. Refreshing every client at startup keeps the
// stored figure (clients list, etc.) from drifting.
const recalculateAllClientBalances = async () => {
  const started = Date.now();
  const { rowCount } = await pool.query(
    `UPDATE clients c SET outstanding_balance = ${clientBalanceSql("c.id")}`,
  );
  console.log(`Recalculated ${rowCount} client balances in ${Date.now() - started} ms`);
};

module.exports = {
  clientBalanceSql,
  recalculateClientBalance,
  recalculateAllClientBalances,
};
