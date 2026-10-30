// Sold packages: loading them, and giving back visits.

// Deletes package visits (and their $0-revenue 'package' transactions) for the
// given appointments, returning the visits to their packages. Called when an
// appointment is deleted or cancelled.
const releasePackageUsage = async (client, appointmentIds) => {
  const { rows } = await client.query(
    "DELETE FROM package_usage WHERE appointment_id = ANY($1) RETURNING transaction_id",
    [appointmentIds],
  );
  const txnIds = rows.map((r) => r.transaction_id).filter(Boolean);
  if (txnIds.length) {
    await client.query("DELETE FROM transactions WHERE id = ANY($1)", [txnIds]);
    await client.query(
      `UPDATE appointments a SET payment_status = 'unpaid'
       WHERE a.id = ANY($1) AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.appointment_id = a.id)`,
      [appointmentIds],
    );
  }
};

// Packages with computed usage. `activeOnly` keeps only usable ones.
const loadClientPackages = async (db, shopId, clientId, { activeOnly = false } = {}) => {
  const { rows } = await db.query(
    `SELECT cp.id, cp.name, cp.service_id, s.name AS service_name, cp.total_visits,
            cp.price_paid, cp.purchased_at, cp.expires_at, cp.status, cp.note,
            (SELECT COUNT(*) FROM package_usage pu WHERE pu.client_package_id = cp.id)::int AS used,
            COALESCE((
              SELECT json_agg(json_build_object(
                'id', pu.id, 'used_at', pu.used_at, 'appointment_id', pu.appointment_id, 'amount', pu.amount,
                'appointment_start', (SELECT MIN(start_time) FROM appointment_services WHERE appointment_id = pu.appointment_id)
              ) ORDER BY pu.used_at DESC)
              FROM package_usage pu WHERE pu.client_package_id = cp.id
            ), '[]') AS usage
     FROM client_packages cp
     JOIN services s ON s.id = cp.service_id
     WHERE cp.shop_id = $1 AND cp.client_id = $2
     ORDER BY cp.purchased_at DESC`,
    [shopId, clientId],
  );
  const now = Date.now();
  const list = rows.map((r) => {
    const expired = !!r.expires_at && new Date(r.expires_at).getTime() < now;
    const remaining = Math.max(0, r.total_visits - r.used);
    const state =
      r.status === "cancelled" ? "cancelled" : expired ? "expired" : remaining === 0 ? "used_up" : "active";
    return { ...r, remaining, state };
  });
  return activeOnly ? list.filter((p) => p.state === "active") : list;
};

module.exports = {
  releasePackageUsage,
  loadClientPackages,
};
