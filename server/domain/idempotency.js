// Idempotency keys: a write sent twice is answered once.

// --- HELPERS: Idempotency for the client's offline write queue ---
// Call inside an open transaction, right after BEGIN. If a cached response
// exists for this key, the caller should ROLLBACK and return it as-is
// without re-running the write.
// Claims the key inside the request's transaction before doing any work: a
// placeholder row is inserted, so a second request with the same key (a sync
// retry, or another tab replaying the same offline write at the same moment)
// waits on that row until the first commits, then gets its saved response
// instead of writing a second time. If the first rolls back, the placeholder
// goes with it and the second proceeds as the owner. Returns the saved
// response to replay, or null when this request should do the work.
const checkIdempotency = async (client, key, shopId) => {
  if (!key) return null;
  const claimed = await client.query(
    `INSERT INTO idempotency_keys (key, shop_id, response_status, response_body)
     VALUES ($1, $2, 0, '{}'::jsonb) ON CONFLICT (key) DO NOTHING RETURNING key`,
    [key, shopId],
  );
  if (claimed.rowCount > 0) return null;
  const { rows } = await client.query(
    "SELECT response_status, response_body FROM idempotency_keys WHERE key = $1 AND shop_id = $2",
    [key, shopId],
  );
  // status 0: a placeholder committed without a final response (a route that
  // didn't record one) — nothing to replay, so let this request proceed.
  return rows[0] && rows[0].response_status > 0 ? rows[0] : null;
};

// Call right before COMMIT, once the response body is final.
const saveIdempotency = async (client, key, shopId, status, body) => {
  if (!key) return;
  await client.query(
    `INSERT INTO idempotency_keys (key, shop_id, response_status, response_body)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (key) DO UPDATE SET response_status = EXCLUDED.response_status,
                                     response_body = EXCLUDED.response_body
     WHERE idempotency_keys.shop_id = EXCLUDED.shop_id`,
    [key, shopId, status, JSON.stringify(body)],
  );
};

module.exports = {
  checkIdempotency,
  saveIdempotency,
};
