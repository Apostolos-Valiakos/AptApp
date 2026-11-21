// A new client with a phone another client already has: the server offers
// that client instead (409 phone_exists, with them), unless the screen says a
// new client is meant. Phones match however they're written. CPH1–CPH4.
//
// Run: node --test tests/server/clientPhones.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { ROOT, SHOP, api, createTestDb, dropTestDb, sql, startServer, token } from "../offline/helpers.mjs";

const require = createRequire(import.meta.url);
require("dotenv").config({ path: path.join(ROOT, ".env"), quiet: true });
const jwt = require("jsonwebtoken");

const DB = "client_phones_test";
const PORT = 3179;
let server;
const as = {};
const ids = {};

before(async () => {
  const uri = createTestDb(DB);
  const one = (role) => sql(DB, `SELECT id FROM users WHERE shop_id='${SHOP}' AND role='${role}' ORDER BY id LIMIT 1`);
  const cu = sql(DB, `SELECT id || '|' || client_id FROM users WHERE shop_id='${SHOP}' AND role='client' AND client_id IS NOT NULL ORDER BY id LIMIT 1`).split("|");
  ids.maria = sql(DB, `INSERT INTO clients (shop_id, first_name, last_name, phone) VALUES ('${SHOP}', 'MARIA', 'PHONETEST', '+30 690 000 1234') RETURNING id`).split("\n")[0];
  server = await startServer(uri, PORT);
  as.frontdesk = api(PORT, token(one("frontdesk"), "frontdesk"));
  as.client = api(PORT, jwt.sign({ userId: cu[0], role: "client", shopId: SHOP, clientId: cu[1] }, process.env.JWT_SECRET));
});
after(() => {
  server?.stop();
  dropTestDb(DB);
});

const create = (phone, extra = {}) => as.frontdesk("POST", "/api/v1/clients", { first_name: "Eleni", last_name: "Phonetest", phone, ...extra });
const countWith = (lastName) => Number(sql(DB, `SELECT count(*) FROM clients WHERE last_name = '${lastName}'`));

test("CPH1 the clients with a phone are found however it is written", async () => {
  for (const phone of ["+30 690 000 1234", "6900001234", "0030 6900001234", "306900001234", "690 000 1234"]) {
    const r = await as.frontdesk("GET", `/api/v1/clients/by-phone?phone=${encodeURIComponent(phone)}`);
    assert.deepEqual(r.data.map((c) => c.id), [ids.maria], phone);
  }
  assert.deepEqual((await as.frontdesk("GET", "/api/v1/clients/by-phone?phone=690000")).data, [], "not a whole number yet");
  assert.deepEqual((await as.frontdesk("GET", "/api/v1/clients/by-phone?phone=6900009999")).data, []);
});

test("CPH2 a new client with that phone is offered the existing one, and nothing is created", async () => {
  const before = countWith("PHONETEST");
  const r = await create("6900001234");
  assert.equal(r.status, 409);
  assert.equal(r.data.error, "phone_exists");
  assert.deepEqual(r.data.matches.map((c) => c.full_name), ["MARIA PHONETEST"]);
  assert.equal(countWith("PHONETEST"), before);
});

test("CPH3 unless a new client is meant; and other phones, or none, are created as before", async () => {
  const meant = await create("6900001234", { allow_same_phone: true });
  assert.equal(meant.status, 200, JSON.stringify(meant.data));
  assert.equal(meant.data.client.first_name, "ELENI");
  assert.equal((await create("6900005555")).status, 200);
  assert.equal((await create("")).status, 200, "no phone");
  // Two clients now share 6900001234: both are offered next time.
  assert.equal((await create("6900001234")).data.matches.length, 2);
});

test("CPH4 portal logins can neither look up phones nor create clients", async () => {
  assert.equal((await as.client("GET", "/api/v1/clients/by-phone?phone=6900001234")).status, 403);
  assert.equal((await as.client("POST", "/api/v1/clients", { first_name: "X", last_name: "Y", phone: "6900007777" })).status, 403);
});
