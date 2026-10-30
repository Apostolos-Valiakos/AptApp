// Bugs found checking the architecture review: a series edit replacing paid
// bookings, removed staff keeping access, old confirmation links changing a
// booking's status, and duplicate reminders.
//
// Run: node --test tests/server/reviewFixes.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { readFileSync } from "node:fs";
import { ROOT, SHOP, api, createTestDb, dropTestDb, sql, startServer, token } from "../offline/helpers.mjs";

const require = createRequire(import.meta.url);
const { io } = require("socket.io-client");
const bcrypt = require("bcrypt");

const DB = "review_fixes_test";
const PORT = 3184;
const SECRET = process.env.JWT_SECRET || readFileSync(path.join(ROOT, ".env"), "utf8").match(/^JWT_SECRET=(.*)$/m)[1].trim();
const URL_BASE = `http://localhost:${PORT}`;
let uri;
let server;
let call;
const ids = {};
const q = (query) => sql(DB, query);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const newClient = (last, email = null) =>
  q(`INSERT INTO clients (first_name, last_name, shop_id, email, receive_emails)
     VALUES ('Fix', '${last}', '${SHOP}', ${email ? `'${email}'` : "NULL"}, true) RETURNING id`).split("\n")[0];
const line = (start, staff = ids.staff) => ({ service_id: ids.service, staff_id: staff, start_time: start, duration_override: 30, price_override: 20 });
const book = async (clientId, services, extra = {}) => {
  const r = await call("POST", "/api/v1/appointments", { client_id: clientId, status: "confirmed", save_receipt: true, allow_unavailable: true, services, ...extra });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data.id;
};
const bookingsOf = (clientId) =>
  q(`SELECT a.id FROM appointments a WHERE a.client_id = '${clientId}'
     ORDER BY (SELECT MIN(start_time) FROM appointment_services x WHERE x.appointment_id = a.id)`).split("\n").filter(Boolean);
const newSeries = async (last, start, end) => {
  const clientId = newClient(last);
  await book(clientId, [line(start)], { recurrence: { freq: "Weekly", end_date: end } });
  return { clientId, bookings: bookingsOf(clientId) };
};
const editSeries = (id, clientId, start, end, extra = {}) =>
  call("PUT", `/api/v1/appointments/${id}?scope=series`, {
    client_id: clientId, status: "confirmed", save_receipt: true, allow_unavailable: true,
    services: [line(start)], recurrence: { freq: "Weekly", end_date: end }, ...extra,
  });
const pay = (clientId, id) => call("POST", "/api/v1/transactions", { appointment_id: id, client_id: clientId, amount: 20, payment_method: "card" });
const linkedPayments = (clientId) => Number(q(`SELECT count(*) FROM transactions WHERE client_id = '${clientId}' AND appointment_id IS NOT NULL`));

before(async () => {
  uri = createTestDb(DB);
  const staff = q(`SELECT id FROM staff WHERE shop_id = '${SHOP}' AND is_active ORDER BY id LIMIT 2`).split("\n");
  ids.staff = staff[0];
  ids.staff2 = staff[1];
  ids.service = q(`SELECT id FROM services WHERE shop_id = '${SHOP}' AND is_active AND price > 0 ORDER BY id LIMIT 1`);
  ids.admin = q(`SELECT id FROM users WHERE shop_id = '${SHOP}' AND role = 'admin' LIMIT 1`);
  server = await startServer(uri, PORT);
  call = api(PORT, token(ids.admin, "admin"));
});
after(() => {
  server?.stop();
  dropTestDb(DB);
});

// --- Series edits ---
test("'this and future' is refused when it would replace a paid booking, later or this one", async () => {
  const { clientId, bookings } = await newSeries("Paid", "2027-05-03T10:00:00+03:00", "2027-05-24T23:00:00+03:00");
  assert.equal(bookings.length, 4);
  assert.equal((await pay(clientId, bookings[2])).status, 200);

  for (const id of [bookings[1], bookings[2]]) {
    const r = await editSeries(id, clientId, "2027-05-10T12:00:00+03:00", "2027-05-24T23:00:00+03:00");
    assert.equal(r.status, 409, JSON.stringify(r.data));
    assert.equal(r.data.error, "series_has_payments");
    assert.equal(r.data.appointment_id, bookings[2]);
  }
  assert.deepEqual(bookingsOf(clientId), bookings, "nothing changed");
  assert.equal(linkedPayments(clientId), 1);
});

test("an earlier paid booking doesn't stop it; the payment stays where it is", async () => {
  const { clientId, bookings } = await newSeries("Earlier", "2027-06-07T10:00:00+03:00", "2027-06-28T23:00:00+03:00");
  await pay(clientId, bookings[0]);
  const r = await editSeries(bookings[1], clientId, "2027-06-14T10:00:00+03:00", "2027-06-28T23:00:00+03:00");
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(linkedPayments(clientId), 1);
  assert.equal(q(`SELECT appointment_id FROM transactions WHERE client_id = '${clientId}'`), bookings[0]);
});

test("the answer gives the booking's new id and version, and a later time leaves no old copy", async () => {
  const { clientId, bookings } = await newSeries("NewId", "2027-07-05T10:00:00+03:00", "2027-07-26T23:00:00+03:00");
  const r = await editSeries(bookings[1], clientId, "2027-07-12T12:00:00+03:00", "2027-07-26T23:00:00+03:00");
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const after = bookingsOf(clientId);
  assert.equal(after.length, 4, "the same number of bookings, not an extra one at the old time");
  assert.equal(after[0], bookings[0], "the earlier booking is untouched");
  assert.equal(r.data.id, after[1], "the row now holding this booking");
  assert.notEqual(r.data.version, null);
  assert.equal(q(`SELECT count(*) FROM appointment_services aps JOIN appointments a ON a.id = aps.appointment_id
                  WHERE a.client_id = '${clientId}' AND aps.start_time = '2027-07-12T10:00:00+03:00'`), "0");
});

test("products on replaced bookings go back into stock before being sold again", async () => {
  const product = q(`SELECT id FROM product_inventory LIMIT 1`);
  assert.ok(product, "the dev database has a product");
  q(`UPDATE product_inventory SET stock_quantity = 100 WHERE id = '${product}'`);
  const products = [{ product_id: product, price: 5, quantity: 1 }];
  const clientId = newClient("Stock");
  await book(clientId, [line("2027-08-02T10:00:00+03:00")], { recurrence: { freq: "Weekly", end_date: "2027-08-16T23:00:00+03:00" }, products });
  const stock = () => Number(q(`SELECT stock_quantity FROM product_inventory WHERE id = '${product}'`));
  const sold = 100 - stock();
  assert.ok(sold > 0);
  const r = await editSeries(bookingsOf(clientId)[0], clientId, "2027-08-02T10:00:00+03:00", "2027-08-16T23:00:00+03:00", { products });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(stock(), 100 - sold, "same stock as before the edit, not sold twice");
});

// --- Removing staff ---
const staffLogin = (label) => {
  const staffId = q(`INSERT INTO staff (name, shop_id, is_active) VALUES ('${label}', '${SHOP}', true) RETURNING id`).split("\n")[0];
  const username = `${label}_${Date.now()}`;
  const hash = bcrypt.hashSync("removed-pass", 4);
  const userId = q(`INSERT INTO users (username, password, role, staff_id, shop_id, is_active)
                    VALUES ('${username}', '${hash}', 'staff', '${staffId}', '${SHOP}', true) RETURNING id`).split("\n")[0];
  return { staffId, username, userId };
};
const logIn = (username) =>
  fetch(`${URL_BASE}/api/v1/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: "removed-pass" }),
  }).then((r) => r.status);

test("a removed staff member can't log in, and the login they hold stops working at once", async () => {
  const { staffId, username, userId } = staffLogin("Leaver");
  assert.equal(await logIn(username), 200);
  const heldToken = token(userId, "staff");
  const held = api(PORT, heldToken);
  assert.equal((await held("GET", "/api/v1/clients?limit=1")).status, 200);

  const socket = io(URL_BASE, { auth: { token: heldToken }, transports: ["websocket"], reconnection: false });
  await new Promise((resolve) => socket.on("connect", resolve));
  const closed = new Promise((resolve) => socket.on("disconnect", resolve));

  await sleep(1100); // tokens carry whole seconds
  assert.equal((await call("DELETE", `/api/v1/staff/${staffId}`)).status, 200);

  await closed;
  assert.equal(await logIn(username), 403);
  const r = await held("GET", "/api/v1/clients?limit=1");
  assert.equal(r.status, 401);
  assert.equal(r.data.error, "session_revoked");

  const again = io(URL_BASE, { auth: { token: heldToken }, transports: ["websocket"], reconnection: false });
  const refused = await new Promise((resolve) => {
    again.on("connect", () => resolve(false));
    again.on("connect_error", () => resolve(true));
  });
  again.close();
  assert.equal(refused, true);
});

test("the revocation survives a restart", async () => {
  const { staffId, userId } = staffLogin("Restart");
  const heldToken = token(userId, "staff");
  await sleep(1100);
  await call("DELETE", `/api/v1/staff/${staffId}`);
  server.stop();
  await sleep(500);
  server = await startServer(uri, PORT);
  call = api(PORT, token(ids.admin, "admin"));
  assert.equal((await api(PORT, heldToken)("GET", "/api/v1/clients?limit=1")).status, 401);
});

test("removing an admin from the calendar leaves their account alone", async () => {
  const staffId = q(`INSERT INTO staff (name, shop_id, is_active) VALUES ('Boss', '${SHOP}', true) RETURNING id`).split("\n")[0];
  const userId = q(`INSERT INTO users (username, password, role, staff_id, shop_id, is_active)
                    VALUES ('boss_${Date.now()}', 'x', 'admin', '${staffId}', '${SHOP}', true) RETURNING id`).split("\n")[0];
  const held = token(userId, "admin");
  await sleep(1100);
  await call("DELETE", `/api/v1/staff/${staffId}`);
  assert.equal(q(`SELECT is_active FROM users WHERE id = '${userId}'`), "t");
  assert.equal((await api(PORT, held)("GET", "/api/v1/clients?limit=1")).status, 200);
});

// --- Confirmation link ---
const confirmLink = (id) =>
  fetch(`${URL_BASE}/api/v1/confirm-appointment?id=${id}&token=${createHmac("sha256", SECRET).update(id).digest("hex")}`);
const statusOf = (id) => q(`SELECT status FROM appointments WHERE id = '${id}'`);

test("an old confirmation link can't undo what happened since", async () => {
  const id = await book(newClient("OldLink"), [line("2026-03-02T10:00:00+02:00")]);
  for (const status of ["completed", "no-show", "arrived"]) {
    q(`UPDATE appointments SET status = '${status}' WHERE id = '${id}'`);
    const r = await confirmLink(id);
    assert.equal(r.status, 200, "the client still sees a thank-you page");
    assert.equal(statusOf(id), status);
  }
  q(`UPDATE appointments SET status = 'cancelled' WHERE id = '${id}'`);
  assert.equal((await confirmLink(id)).status, 404);
  assert.equal(statusOf(id), "cancelled");
});

test("a booking still waiting is confirmed, and open calendars hear about it", async () => {
  const id = await book(newClient("Waiting"), [line("2027-09-06T10:00:00+03:00")]);
  q(`UPDATE appointments SET status = 'new' WHERE id = '${id}'`);
  const socket = io(URL_BASE, { auth: { token: token(ids.admin, "admin") }, transports: ["websocket"] });
  await new Promise((resolve) => socket.on("connect", resolve));
  await sleep(200);
  let changes = 0;
  socket.on("appointments:changed", () => changes++);
  assert.equal((await confirmLink(id)).status, 200);
  await sleep(300);
  assert.equal(statusOf(id), "confirmed");
  assert.equal(changes, 1);
  // Clicked again: nothing to tell anyone.
  await confirmLink(id);
  await sleep(300);
  assert.equal(changes, 1);
  socket.close();
});
