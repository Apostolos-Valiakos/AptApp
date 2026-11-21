// Which tokens open the API: login tokens only. The client invite link is
// signed with the same secret but must not work as a login.
//
// Run: node --test tests/server/auth.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { ROOT, SHOP, api, createTestDb, dropTestDb, sql, startServer, token } from "../offline/helpers.mjs";

const require = createRequire(import.meta.url);
require("dotenv").config({ path: path.join(ROOT, ".env"), quiet: true });
const jwt = require("jsonwebtoken");
const sign = (payload, opts = { expiresIn: "1h" }) => jwt.sign(payload, process.env.JWT_SECRET, opts);

const DB = "auth_test";
const PORT = 3198;
let server;
let clientId;
let dbUri;
const READS = ["/api/v1/appointments?date=2026-10-27", "/api/v1/clients?slim=true", "/api/v1/staff"];

before(async () => {
  const uri = createTestDb(DB);
  dbUri = uri;
  clientId = sql(DB, `SELECT id FROM clients WHERE shop_id = '${SHOP}' LIMIT 1`);
  server = await startServer(uri, PORT);
});
after(() => {
  server?.stop();
  dropTestDb(DB);
});

test("an invite link token (old, without typ) is refused everywhere", async () => {
  const call = api(PORT, sign({ clientId, shopId: SHOP, email: "x@example.com" }, { expiresIn: "48h" }));
  for (const url of READS) assert.equal((await call("GET", url)).status, 401, url);
  assert.equal((await call("POST", "/api/v1/clients", { first_name: "A", last_name: "B" })).status, 401);
});

test("an invite link token (new, typ: invite) is refused everywhere", async () => {
  const call = api(PORT, sign({ typ: "invite", clientId, shopId: SHOP, email: "x@example.com" }, { expiresIn: "48h" }));
  for (const url of READS) assert.equal((await call("GET", url)).status, 401, url);
});

test("a refused login says why with a code the app can translate", async () => {
  const username = sql(DB, `SELECT username FROM users WHERE shop_id = '${SHOP}' ORDER BY id LIMIT 1`);
  const login = (name) =>
    fetch(`http://localhost:${PORT}/api/v1/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: name, password: "not-the-password" }),
    }).then(async (r) => ({ status: r.status, ...(await r.json()) }));
  for (const name of [username, "nobody-with-this-name"]) {
    const r = await login(name);
    assert.equal(r.status, 401);
    assert.equal(r.code, "invalid_credentials");
  }
});

test("a login token still works", async () => {
  const admin = sql(DB, `SELECT id FROM users WHERE shop_id = '${SHOP}' AND role = 'admin' LIMIT 1`);
  const call = api(PORT, token(admin, "admin"));
  for (const url of READS) assert.equal((await call("GET", url)).status, 200, url);
});

test("signup refuses a login token", async () => {
  const admin = sql(DB, `SELECT id FROM users WHERE shop_id = '${SHOP}' AND role = 'admin' LIMIT 1`);
  const r = await api(PORT, "")("POST", "/api/v1/signup", { token: token(admin, "admin"), password: "whatever-123" });
  assert.equal(r.status, 400);
});

test("the live socket refuses an invite token and accepts a login token", async () => {
  const { io } = require("socket.io-client");
  const connect = (tok) =>
    new Promise((resolve) => {
      const s = io(`http://localhost:${PORT}`, { auth: { token: tok }, transports: ["websocket"], reconnection: false });
      s.on("connect", () => (s.close(), resolve("connected")));
      s.on("connect_error", (e) => (s.close(), resolve(e.message)));
    });
  assert.equal(await connect(sign({ clientId, shopId: SHOP, email: "x@example.com" })), "Authentication error");
  const admin = sql(DB, `SELECT id FROM users WHERE shop_id = '${SHOP}' AND role = 'admin' LIMIT 1`);
  assert.equal(await connect(token(admin, "admin")), "connected");
});

// One password rule wherever a password is set: at least 8 characters with a
// digit (passwordProblem in server/domain/common.js; the screens check the
// same, client/src/utils/password.ts). A refused one saves nothing.
test("every password that's set must be 8+ characters with a digit; a refused one saves nothing", async () => {
  const bcrypt = require("bcrypt");
  const RULE = "Password must be at least 8 characters and include a number";
  const adminId = sql(DB, `SELECT id FROM users WHERE shop_id = '${SHOP}' AND role = 'admin' ORDER BY id LIMIT 1`);
  const ownerId = sql(DB, "SELECT id FROM users WHERE role = 'owner' LIMIT 1");
  const admin = api(PORT, token(adminId, "admin"));
  const owner = api(PORT, ownerId ? sign({ userId: ownerId, role: "owner", shopId: null }) : token(adminId, "owner"));
  const weak = ["short1", "longbutnodigits", "", null];

  // A staff member's own password.
  sql(DB, `UPDATE users SET password = '${bcrypt.hashSync("Current-pass1", 4)}' WHERE id = '${adminId}'`);
  for (const pw of weak) {
    const r = await admin("PUT", "/api/v1/profile/password", { currentPassword: "Current-pass1", newPassword: pw });
    assert.equal(r.status, 400, `profile ${pw}`);
    assert.equal(r.data.error, RULE);
  }
  assert.equal((await admin("PUT", "/api/v1/profile/password", { currentPassword: "Current-pass1", newPassword: "Better-pass2" })).status, 200);

  // A client signing up from an invitation (checked before the link itself).
  const signup = await fetch(`http://localhost:${PORT}/api/v1/signup`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: "x", password: "abc" }),
  });
  assert.equal(signup.status, 400);
  assert.equal((await signup.json()).error, RULE);

  // A new staff member with a login: refused, and no staff member is left behind.
  const staffBefore = sql(DB, `SELECT count(*) FROM staff WHERE shop_id = '${SHOP}'`);
  const created = await admin("POST", "/api/v1/staff", { first_name: "Weak", last_name: "Pass", username: "weak.pass", password: "1234" });
  assert.equal(created.status, 400);
  assert.equal(sql(DB, `SELECT count(*) FROM staff WHERE shop_id = '${SHOP}'`), staffBefore);
  const staffId = sql(DB, `SELECT id FROM staff WHERE shop_id = '${SHOP}' ORDER BY id LIMIT 1`);
  assert.equal((await admin("POST", `/api/v1/staff/${staffId}/login`, { username: "weak.login", password: "password" })).status, 400);
  assert.equal(sql(DB, "SELECT count(*) FROM users WHERE username = 'weak.login'"), "0");

  // The platform owner: a new shop with its admin, another admin, a reset.
  const shopsBefore = sql(DB, "SELECT count(*) FROM shops");
  const shop = await owner("POST", "/api/v1/platform/shops", { name: "Weak Shop", admin_username: "weak.shop", admin_password: "abcdefgh" });
  assert.equal(shop.status, 400, JSON.stringify(shop.data));
  assert.equal(sql(DB, "SELECT count(*) FROM shops"), shopsBefore, "no shop left behind");
  assert.equal((await owner("POST", `/api/v1/platform/shops/${SHOP}/admins`, { username: "weak.admin", password: "short" })).status, 400);
  assert.equal((await owner("POST", `/api/v1/platform/admins/${adminId}/reset-password`, { newPassword: "123456" })).status, 400);

  // A client's own password in the portal.
  const clientUser = sql(DB, `SELECT id || '|' || client_id FROM users WHERE shop_id = '${SHOP}' AND role = 'client' AND client_id IS NOT NULL LIMIT 1`);
  if (clientUser) {
    const [userId, cid] = clientUser.split("|");
    const client = api(PORT, sign({ userId, role: "client", shopId: SHOP, clientId: cid }));
    assert.equal((await client("PUT", "/api/v1/portal/password", { currentPassword: "x", newPassword: "abcdef" })).status, 400);
  }
});

// The startup steps load who was logged out by force and whose sessions were
// revoked. If that fails, the server doesn't start: otherwise a restart would
// quietly let those logins back in.
test("a server that can't load the revoked sessions doesn't start", async () => {
  sql(DB, "ALTER TABLE users RENAME COLUMN sessions_revoked_at TO sessions_revoked_at_hidden");
  try {
    const child = spawn("node", ["server/server.js"], {
      cwd: ROOT,
      env: { ...process.env, POSTGRES_URI: dbUri, PORT: "3234", NODE_ENV: "test", RUN_JOBS: "0", EMAIL_HOST: "mail.invalid", EMAIL_USER: "", EMAIL_PASS: "" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let log = "";
    child.stdout.on("data", (d) => (log += d));
    child.stderr.on("data", (d) => (log += d));
    const code = await new Promise((resolve) => {
      const timer = setTimeout(() => {
        child.kill();
        resolve("still running");
      }, 20000);
      child.on("exit", (c) => {
        clearTimeout(timer);
        resolve(c);
      });
    });
    assert.equal(code, 1, log.slice(-1500));
    assert.match(log, /Failed to run the startup steps/);
    assert.doesNotMatch(log, /Server running on port/);
  } finally {
    sql(DB, "ALTER TABLE users RENAME COLUMN sessions_revoked_at_hidden TO sessions_revoked_at");
  }
});
