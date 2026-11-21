// Plain staff only look at appointments: the server itself refuses their
// changes, whatever the screen shows. They keep reordering the calendar's
// columns, but not their own time off. U6 in test-report.html.
//
// Run: node --test tests/server/staffReadOnly.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { ROOT, SHOP, api, createTestDb, dropTestDb, sql, startServer, token } from "../offline/helpers.mjs";

const require = createRequire(import.meta.url);
require("dotenv").config({ path: path.join(ROOT, ".env"), quiet: true });
const jwt = require("jsonwebtoken");

const DB = "staff_read_only_test";
const PORT = 3185;
let server;
let asStaff;
let asFrontdesk;
const ids = {};

const counts = () =>
  sql(DB, `SELECT (SELECT count(*) FROM appointments), (SELECT count(*) FROM staff_time_off), (SELECT max(updated_at) FROM appointments)`);

before(async () => {
  const uri = createTestDb(DB);
  const staffUser = sql(DB, `SELECT id || '|' || staff_id FROM users WHERE shop_id = '${SHOP}' AND role = 'staff' AND staff_id IS NOT NULL ORDER BY id LIMIT 1`).split("|");
  const frontdesk = sql(DB, `SELECT id FROM users WHERE shop_id = '${SHOP}' AND role = 'frontdesk' ORDER BY id LIMIT 1`);
  ids.staff = staffUser[1];
  ids.appointment = sql(DB, `SELECT id FROM appointments WHERE shop_id = '${SHOP}' ORDER BY created_at DESC NULLS LAST LIMIT 1`);
  ids.client = sql(DB, `SELECT id FROM clients WHERE shop_id = '${SHOP}' ORDER BY id LIMIT 1`);
  ids.timeOff = sql(DB, `SELECT id FROM staff_time_off WHERE staff_id = '${ids.staff}' LIMIT 1`) || "00000000-0000-0000-0000-000000000000";
  server = await startServer(uri, PORT);
  asStaff = api(PORT, jwt.sign({ userId: staffUser[0], role: "staff", shopId: SHOP, staffId: staffUser[1] }, process.env.JWT_SECRET));
  asFrontdesk = api(PORT, token(frontdesk, "frontdesk"));
});
after(() => {
  server?.stop();
  dropTestDb(DB);
});

test("staff can't create, change, cancel, delete or swap appointments", async () => {
  const before = counts();
  const allowed = [];
  for (const [method, url, body] of [
    ["POST", "/api/v1/appointments", { services: [] }],
    ["PUT", `/api/v1/appointments/${ids.appointment}`, { notes: "changed by staff" }],
    ["POST", "/api/v1/appointments/swap", { appointmentAId: ids.appointment, appointmentBId: ids.appointment }],
    ["POST", `/api/v1/appointments/${ids.appointment}/package-redemptions`, {}],
    ["POST", `/api/v1/appointments/${ids.appointment}/cancel`, {}],
    ["DELETE", `/api/v1/appointments/${ids.appointment}`],
  ]) {
    const r = await asStaff(method, url, body);
    if (r.status !== 403) allowed.push(`${method} ${url.replace(ids.appointment, ":id")}: ${r.status}`);
  }
  assert.deepEqual(allowed, [], "every one refused");
  assert.equal(counts(), before, "nothing changed");
});

test("staff can't change a client's record", async () => {
  const before = sql(DB, `SELECT count(*), md5(string_agg(c::text, ',' ORDER BY c.id)) FROM clients c`);
  const allowed = [];
  for (const [method, url, body] of [
    ["POST", "/api/v1/clients", { first_name: "New", last_name: "Client", phone: "6900000000" }],
    ["PUT", `/api/v1/clients/${ids.client}`, { first_name: "Changed" }],
    ["DELETE", `/api/v1/clients/${ids.client}`],
    ["POST", `/api/v1/clients/${ids.client}/files`, {}],
    ["DELETE", "/api/v1/clients/files/00000000-0000-0000-0000-000000000000"],
    ["POST", `/api/v1/clients/${ids.client}/exercises/toggle`, {}],
    ["POST", `/api/v1/clients/${ids.client}/invite`, {}],
  ]) {
    const r = await asStaff(method, url, body);
    if (r.status !== 403) allowed.push(`${method} ${url.replace(ids.client, ":id")}: ${r.status}`);
  }
  assert.deepEqual(allowed, [], "every one refused");
  assert.equal(sql(DB, `SELECT count(*), md5(string_agg(c::text, ',' ORDER BY c.id)) FROM clients c`), before, "nothing changed");
  assert.equal((await asStaff("GET", "/api/v1/clients?slim=true")).status, 200, "they can still read them");
});

test("a product quantity below 1 is refused, whoever sends it", async () => {
  for (const quantity of [0, -1, "0"]) {
    const r = await asFrontdesk("POST", "/api/v1/appointments", { services: [], products: [{ product_id: null, quantity, price: 5 }] });
    assert.equal(r.status, 400, `${quantity}: ${r.status} ${JSON.stringify(r.data)?.slice(0, 100)}`);
    assert.equal(r.data.error, "invalid_quantity");
    const edit = await asFrontdesk("PUT", `/api/v1/appointments/${ids.appointment}`, { services: [], products: [{ product_id: null, quantity, price: 5 }] });
    assert.equal(edit.status, 400, `edit ${quantity}: ${edit.status} ${JSON.stringify(edit.data)?.slice(0, 100)}`);
  }
});

test("staff can't take a payment", async () => {
  const before = sql(DB, `SELECT count(*) FROM transactions`);
  const r = await asStaff("POST", "/api/v1/transactions", { appointment_id: ids.appointment, amount: 1, payment_method: "cash" });
  assert.equal(r.status, 403, `${r.status} ${JSON.stringify(r.data)?.slice(0, 100)}`);
  assert.equal(sql(DB, `SELECT count(*) FROM transactions`), before, "nothing changed");
});

test("staff can't add or remove time off, even their own", async () => {
  const before = counts();
  for (const [method, url, body] of [
    ["POST", `/api/v1/staff/${ids.staff}/time-off`, { type: "break", start_date: "2027-03-11", end_date: "2027-03-11", start_time: "10:00", end_time: "11:00" }],
    ["DELETE", `/api/v1/staff/${ids.staff}/time-off/${ids.timeOff}`],
  ]) {
    const r = await asStaff(method, url, body);
    assert.equal(r.status, 403, `${method} ${url}: ${r.status} ${JSON.stringify(r.data)?.slice(0, 100)}`);
  }
  assert.equal(counts(), before, "nothing changed");
});

test("staff can still see the calendar and reorder its columns", async () => {
  for (const url of ["/api/v1/appointments", "/api/v1/staff", "/api/v1/services", "/api/v1/time-off", "/api/v1/working-hours"]) {
    const r = await asStaff("GET", url);
    assert.equal(r.status, 200, `${url}: ${r.status}`);
  }
  assert.equal((await asStaff("POST", "/api/v1/staff/reorder", { orders: [] })).status, 200);
});

test("front desk isn't caught by the same rule", async () => {
  const r = await asFrontdesk("PUT", `/api/v1/appointments/${ids.appointment}`, { notes: "changed by front desk" });
  assert.notEqual(r.status, 403, JSON.stringify(r.data)?.slice(0, 100));
});
