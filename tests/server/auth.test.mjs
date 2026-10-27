// Which tokens open the API: login tokens only. The client invite link is
// signed with the same secret but must not work as a login.
//
// Run: node --test tests/server/auth.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { ROOT, SHOP, api, createTestDb, dropTestDb, sql, startServer, token } from "../offline/helpers.mjs";

const require = createRequire(import.meta.url);
require("dotenv").config({ path: path.join(ROOT, ".env"), quiet: true });
const jwt = require("jsonwebtoken");
const sign = (payload, opts = { expiresIn: "1h" }) => jwt.sign(payload, process.env.JWT_SECRET, opts);

const DB = "auth_test";
const PORT = 3198;
let server;
let clientId;
const READS = ["/api/v1/appointments?date=2026-10-27", "/api/v1/clients?slim=true", "/api/v1/staff"];

before(async () => {
  const uri = createTestDb(DB);
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
