// Shared plumbing for route handlers: one way to run a database transaction,
// one way to turn errors into responses. Behaviour matches what each route
// did by hand before (same status codes, same JSON).
const pool = require("./db");

/** An error that is meant for the caller: sent as `status` with `body`. */
class HttpError extends Error {
  constructor(status, body) {
    super(body?.error || `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

/**
 * BEGIN … COMMIT around `fn(client)`; ROLLBACK on any error (which is then
 * rethrown), and the connection always goes back to the pool.
 */
const withTransaction = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

// A malformed id (e.g. /clients/not-a-uuid/full): Postgres refuses to read it
// as a uuid or a number (code 22P02). That's the caller's mistake, not a
// server error.
const isMalformedId = (err) =>
  err?.code === "22P02" && /\b(uuid|integer|bigint|smallint)\b/.test(String(err.message));

/**
 * Wraps an async route handler. A thrown HttpError is sent as is;
 * `mapError(err)` may turn known domain errors into `{ status, body }`; a
 * malformed id is answered 400 invalid_id; anything else is logged (with
 * `log` as the label) and answered with a 500 carrying `message`.
 */
const asyncHandler = (fn, { message = "Internal server error", log, mapError } = {}) =>
  async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (err) {
      if (res.headersSent) return next(err);
      const mapped = err instanceof HttpError ? { status: err.status, body: err.body } : mapError?.(err);
      if (mapped) return res.status(mapped.status).json(mapped.body);
      if (isMalformedId(err)) return res.status(400).json({ error: "invalid_id" });
      if (log) console.error(log, err);
      else console.error(err);
      res.status(500).json({ error: message });
    }
  };

module.exports = { HttpError, withTransaction, asyncHandler, isMalformedId };
