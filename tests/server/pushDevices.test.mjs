// What the server allows the Android app (docs/redesign/ANDROID_HANDOFF.md
// step 7.3): its origin through CORS, App Links' assetlinks.json, the device
// tokens it registers, and shop announcements (not reminders) sent to them
// through Firebase Cloud Messaging, here with a fake sender, never Google.
//
// Run: node --test tests/server/pushDevices.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { ROOT, SHOP, api, createTestDb, dropTestDb, sql, startServer } from "../offline/helpers.mjs";

const require = createRequire(import.meta.url);
require("dotenv").config({ path: path.join(ROOT, ".env"), quiet: true });
const jwt = require("jsonwebtoken");

const DB = "push_devices_test";
const PORT = 3219; // without ANDROID_APP_SHA256
const PORT_KEYED = 3220; // with it
const FINGERPRINT = "AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89";
let server;
let keyedServer;
let dbUri;
const ids = {};
const as = {};
const TOKEN_A = "fcm-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TOKEN_B = "fcm-token-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const devicesOf = (clientId) => sql(DB, `SELECT token FROM push_devices WHERE client_id = '${clientId}' ORDER BY token`);

before(async () => {
  dbUri = createTestDb(DB);
  const client = (name) => {
    const id = sql(DB, `INSERT INTO clients (first_name, last_name, shop_id) VALUES ('${name}', 'App', '${SHOP}') RETURNING id`).split("\n")[0];
    const user = sql(DB, `INSERT INTO users (username, password, role, shop_id, client_id) VALUES ('push.${name}', 'x', 'client', '${SHOP}', '${id}') RETURNING id`).split("\n")[0];
    return { id, call: api(PORT, jwt.sign({ userId: user, role: "client", shopId: SHOP, clientId: id }, process.env.JWT_SECRET)) };
  };
  const anna = client("anna");
  const maria = client("maria");
  ids.anna = anna.id;
  ids.maria = maria.id;
  as.anna = anna.call;
  as.maria = maria.call;
  const admin = sql(DB, `SELECT id FROM users WHERE shop_id = '${SHOP}' AND role = 'admin' ORDER BY id LIMIT 1`);
  as.admin = api(PORT, jwt.sign({ userId: admin, role: "admin", shopId: SHOP }, process.env.JWT_SECRET));
  server = await startServer(dbUri, PORT);
  process.env.ANDROID_APP_SHA256 = FINGERPRINT.toLowerCase();
  keyedServer = await startServer(dbUri, PORT_KEYED);
  delete process.env.ANDROID_APP_SHA256;
});
after(() => {
  server?.stop();
  keyedServer?.stop();
  dropTestDb(DB);
});

test("a client registers the app's token, again without a duplicate, and removes it", async () => {
  assert.equal((await as.anna("POST", "/api/v1/portal/push-device", { token: TOKEN_A, platform: "android" })).status, 201);
  assert.equal((await as.anna("POST", "/api/v1/portal/push-device", { token: TOKEN_A })).status, 201);
  assert.equal(devicesOf(ids.anna), TOKEN_A);
  assert.equal((await as.anna("POST", "/api/v1/portal/push-device", { token: "short" })).status, 400);
  assert.equal((await as.anna("DELETE", "/api/v1/portal/push-device", { token: TOKEN_A })).status, 200);
  assert.equal(devicesOf(ids.anna), "");
});

test("a phone's token moves to whoever signs in on it; one can't remove another's", async () => {
  await as.anna("POST", "/api/v1/portal/push-device", { token: TOKEN_B });
  await as.maria("POST", "/api/v1/portal/push-device", { token: TOKEN_B });
  assert.equal(devicesOf(ids.anna), "");
  assert.equal(devicesOf(ids.maria), TOKEN_B);
  await as.anna("DELETE", "/api/v1/portal/push-device", { token: TOKEN_B });
  assert.equal(devicesOf(ids.maria), TOKEN_B, "Anna's logout doesn't remove Maria's phone");
  await as.maria("DELETE", "/api/v1/portal/push-device", { token: TOKEN_B });
});

test("only clients register devices", async () => {
  assert.equal((await as.admin("POST", "/api/v1/portal/push-device", { token: TOKEN_A })).status, 403);
});

test("assetlinks.json: 404 without the signing key's fingerprint, the app's package with it", async () => {
  assert.equal((await fetch(`http://localhost:${PORT}/.well-known/assetlinks.json`)).status, 404);
  const res = await fetch(`http://localhost:${PORT_KEYED}/.well-known/assetlinks.json`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: "com.purespaexperience.app", sha256_cert_fingerprints: [FINGERPRINT] },
    },
  ]);
});

test("the Android app's origin (https://localhost) is let through; other sites aren't", async () => {
  const preflight = (origin) =>
    fetch(`http://localhost:${PORT}/api/v1/portal/push-device`, {
      method: "OPTIONS",
      headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type" },
    });
  assert.equal((await preflight("https://localhost")).headers.get("access-control-allow-origin"), "https://localhost");
  assert.equal((await preflight("https://evil.example")).headers.get("access-control-allow-origin"), null);
});

test("sendPushToClient: announcements reach the client's app devices, reminders don't, dead tokens are dropped", async () => {
  // pushService runs here, in the test, on the same database copy.
  process.env.POSTGRES_URI = dbUri;
  const push = require("../../server/pushService.js");
  const sent = [];
  push.setFcmSender(async (token, payload) => {
    if (token === TOKEN_B) throw Object.assign(new Error("gone"), { code: "messaging/registration-token-not-registered" });
    sent.push({ token, ...payload });
  });
  sql(DB, `INSERT INTO push_devices (client_id, shop_id, token) VALUES ('${ids.anna}', '${SHOP}', '${TOKEN_A}'), ('${ids.anna}', '${SHOP}', '${TOKEN_B}')`);

  const announcement = { title: "Κλειστά αύριο", body: "Λόγω αργίας", url: "/portal/home" };
  assert.equal(await push.sendPushToClient(ids.anna, announcement), 1);
  assert.deepEqual(sent, [{ token: TOKEN_A, ...announcement }], "only title, body and url");
  assert.equal(devicesOf(ids.anna), TOKEN_A, "the token FCM says is gone is removed");

  sent.length = 0;
  await push.sendPushToClient(ids.anna, { title: "Υπενθύμιση", body: "Αύριο 10:00", url: "/portal/bookings/x" }, { appDevices: false });
  assert.deepEqual(sent, [], "the app schedules its own reminders");

  await push.sendPushToShop(SHOP, announcement);
  assert.deepEqual(sent.map((s) => s.token), [TOKEN_A], "a shop announcement reaches the app too");

  // No Firebase set up (no FIREBASE_SERVICE_ACCOUNT): app devices are skipped, nothing fails.
  push.setFcmSender(null);
  assert.equal(await push.sendPushToClient(ids.anna, announcement), 0);
  await require("../../server/db.js").end();
});
