// Shared set-up for the offline-sync tests: a throwaway copy of the dev
// database (POSTGRES_URI in .env) and a test server on its own port. The dev
// database itself is only read (pg_dump).
import { execSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const env = Object.fromEntries(
  readFileSync(path.join(ROOT, ".env"), "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map(([, k, v]) => [k, v.replace(/\s+#.*$/, "").trim()]),
);
export const SHOP = "00000000-0000-0000-0000-000000000001";
const DEV_URI = env.POSTGRES_URI;
const SERVER = DEV_URI.slice(0, DEV_URI.lastIndexOf("/"));

const psql = (db, sql) =>
  execSync(`psql "${SERVER}/${db}" -X -At -v ON_ERROR_STOP=1`, { input: sql, encoding: "utf8" }).trim();

export const sql = (db, query) => psql(db, query);

/** Copies the dev database into `name` (dropping any old copy). */
export const createTestDb = (name) => {
  psql("postgres", `DROP DATABASE IF EXISTS ${name}; CREATE DATABASE ${name};`);
  execSync(`pg_dump "${DEV_URI}" | psql "${SERVER}/${name}" -X -q >/dev/null 2>&1`, { shell: "/bin/bash" });
  return `${SERVER}/${name}`;
};
export const dropTestDb = (name) =>
  psql(
    "postgres",
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${name}' AND pid <> pg_backend_pid();
     DROP DATABASE IF EXISTS ${name};`,
  );

/** Starts server/server.js against the test database; resolves once /health answers. */
export const startServer = async (dbUri, port) => {
  const child = spawn("node", ["server/server.js"], {
    cwd: ROOT,
    env: { ...process.env, POSTGRES_URI: dbUri, PORT: String(port), NODE_ENV: "test" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://localhost:${port}/health`);
      if (r.ok) {
        // Startup schema setup (versions, triggers) runs right after listen.
        await new Promise((r2) => setTimeout(r2, 1500));
        return { child, log: () => log, stop: () => child.kill() };
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  child.kill();
  throw new Error(`server did not start:\n${log}`);
};

export const token = (userId, role) => {
  require("dotenv").config({ path: path.join(ROOT, ".env"), quiet: true });
  return require("jsonwebtoken").sign({ userId, role, shopId: SHOP }, process.env.JWT_SECRET);
};

export const api = (port, tok) => async (method, url, body, headers = {}) => {
  const res = await fetch(`http://localhost:${port}${url}`, {
    method,
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, data };
};
