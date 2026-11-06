// Database migrations: server/migrations/NNNN_name.sql, each run once, in
// order, in its own transaction, and recorded in schema_migrations. If one
// fails the server doesn't start (instead of running on a half-updated
// schema).
//
// 0001_baseline.sql is the whole schema for a new, empty database. An
// existing database (anything with an appointments table) already has it, so
// there it is recorded as applied without running.
//
// All schema changes go here. (The statements that used to run on every start
// became 0006_startup_schema.sql.)
const fs = require("fs");
const path = require("path");
const pool = require("./db");

const DIR = path.join(__dirname, "migrations");
const BASELINE = "0001_baseline.sql";

async function runMigrations() {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  const done = new Set((await pool.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name));

  if (!done.has(BASELINE)) {
    const { rows } = await pool.query("SELECT to_regclass('public.appointments') IS NOT NULL AS existing");
    if (rows[0].existing) {
      await pool.query("INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING", [BASELINE]);
      done.add(BASELINE);
    }
  }

  const files = fs.readdirSync(DIR).filter((f) => /^\d{4}_[\w-]+\.sql$/.test(f)).sort();
  for (const file of files) {
    if (done.has(file)) continue;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(fs.readFileSync(path.join(DIR, file), "utf8"));
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`Migration applied: ${file}`);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw new Error(`Migration ${file} failed: ${err.message}`);
    } finally {
      // A migration may change session settings (search_path): don't hand
      // this connection back to the app.
      client.release(true);
    }
  }
}

module.exports = { runMigrations };
