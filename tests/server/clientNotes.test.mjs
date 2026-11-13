// The client's notes and an appointment's internal note and paid amount, as
// the server hands them out: to the shop's screens, never to a client's own
// portal login, and no money to plain staff.
//
// Run: node --test tests/server/clientNotes.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { ROOT, SHOP, api, createTestDb, dropTestDb, sql, startServer, token } from "../offline/helpers.mjs";

const require = createRequire(import.meta.url);
require("dotenv").config({ path: path.join(ROOT, ".env"), quiet: true });
const jwt = require("jsonwebtoken");

const DB = "client_notes_test";
const PORT = 3188;
let server;
const ids = {};
const as = {};

before(async () => {
  const uri = createTestDb(DB);
  const one = (role) => sql(DB, `SELECT id FROM users WHERE shop_id = '${SHOP}' AND role = '${role}' ORDER BY id LIMIT 1`);
  const clientUser = sql(DB, `SELECT id || '|' || client_id FROM users WHERE shop_id = '${SHOP}' AND role = 'client' AND client_id IS NOT NULL ORDER BY id LIMIT 1`);
  const staffUser = sql(DB, `SELECT id || '|' || staff_id FROM users WHERE shop_id = '${SHOP}' AND role = 'staff' AND staff_id IS NOT NULL ORDER BY id LIMIT 1`);
  ids.portalClient = clientUser.split("|")[1];
  // A client with a past visit that was partly paid (a payment record below its cost).
  ids.appt = sql(DB, `
    SELECT a.id FROM appointments a
    WHERE a.shop_id = '${SHOP}' AND a.client_id IS NOT NULL AND a.status <> 'cancelled'
      AND (SELECT MIN(start_time) FROM appointment_services WHERE appointment_id = a.id) BETWEEN NOW() - INTERVAL '2 months' AND NOW() - INTERVAL '1 day'
      AND EXISTS (SELECT 1 FROM appointment_services WHERE appointment_id = a.id AND price_override > 10)
    ORDER BY a.id LIMIT 1`);
  ids.client = sql(DB, `SELECT client_id FROM appointments WHERE id = '${ids.appt}'`);
  ids.day = sql(DB, `SELECT to_char(MIN(start_time) AT TIME ZONE 'Europe/Athens', 'YYYY-MM-DD') FROM appointment_services WHERE appointment_id = '${ids.appt}'`);
  ids.total = Number(sql(DB, `SELECT SUM(price_override) FROM appointment_services WHERE appointment_id = '${ids.appt}'`))
    + Number(sql(DB, `SELECT COALESCE(SUM(total_price), 0) FROM product_sales WHERE appointment_id = '${ids.appt}'`));
  sql(DB, `DELETE FROM transactions WHERE appointment_id = '${ids.appt}'`);
  sql(DB, `INSERT INTO transactions (shop_id, appointment_id, client_id, amount, payment_method) VALUES ('${SHOP}', '${ids.appt}', '${ids.client}', 10, 'cash')`);
  sql(DB, `UPDATE appointments SET internal_notes = 'Prefers a firm massage', booking_notes = 'Σχόλιο Ραντεβού' WHERE id = '${ids.appt}'`);
  sql(DB, `UPDATE clients SET notes = 'Allergic to almond oil', qr_token = '11111111-2222-4333-8444-555555555555' WHERE id = '${ids.client}'`);
  sql(DB, `UPDATE appointments SET internal_notes = 'Staff only' WHERE id IN (SELECT id FROM appointments WHERE client_id = '${ids.portalClient}' LIMIT 1)`);

  const sign = (userId, role, extra) => jwt.sign({ userId, role, shopId: SHOP, ...extra }, process.env.JWT_SECRET);
  server = await startServer(uri, PORT);
  as.admin = api(PORT, token(one("admin"), "admin"));
  as.frontdesk = api(PORT, token(one("frontdesk"), "frontdesk"));
  as.staff = api(PORT, sign(staffUser.split("|")[0], "staff", { staffId: staffUser.split("|")[1] }));
  as.client = api(PORT, sign(clientUser.split("|")[0], "client", { clientId: ids.portalClient }));
});
after(() => {
  server?.stop();
  dropTestDb(DB);
});

test("the shop's screens get the client's notes", async () => {
  const slim = await as.frontdesk("GET", `/api/v1/clients?slim=true&id=${ids.client}`);
  assert.equal(slim.status, 200);
  assert.equal(slim.data[0].notes, "Allergic to almond oil");
  const day = await as.admin("GET", `/api/v1/appointments?date=${ids.day}`);
  assert.equal(day.data.find((a) => a.id === ids.appt)?.client_notes, "Allergic to almond oil");
});

test("a past visit carries its internal note, its total and what was paid", async () => {
  const past = await as.admin("GET", `/api/v1/clients/${ids.client}/past-appointments?limit=20&status=all`);
  const row = past.data.find((a) => a.id === ids.appt);
  assert.ok(row, "the visit is listed");
  assert.equal(row.internal_notes, "Prefers a firm massage");
  assert.equal(row.booking_notes, "Σχόλιο Ραντεβού");
  assert.equal(row.paid, 10);
  assert.equal(row.total, ids.total);

  const full = await as.admin("GET", `/api/v1/clients/${ids.client}/full`);
  const visit = full.data.history.find((a) => a.id === ids.appt);
  assert.equal(visit.internal_notes, "Prefers a firm massage");
  assert.equal(visit.booking_notes, "Σχόλιο Ραντεβού");
  assert.equal(visit.paid, 10);
  const starts = full.data.history.map((a) => new Date(a.start_time).getTime());
  assert.deepEqual(starts, [...starts].sort((a, b) => b - a), "newest first");
});

test("the notes alone can be saved, leaving the rest of the client as it was", async () => {
  const before = sql(DB, `SELECT first_name || '|' || last_name || '|' || COALESCE(phone, '') || '|' || COALESCE(date_of_birth::text, '') || '|' || physiotherapia FROM clients WHERE id = '${ids.client}'`);
  const saved = await as.frontdesk("PUT", `/api/v1/clients/${ids.client}/notes`, { notes: "  Allergic to nuts  " });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(sql(DB, `SELECT notes FROM clients WHERE id = '${ids.client}'`), "Allergic to nuts");
  assert.equal(sql(DB, `SELECT first_name || '|' || last_name || '|' || COALESCE(phone, '') || '|' || COALESCE(date_of_birth::text, '') || '|' || physiotherapia FROM clients WHERE id = '${ids.client}'`), before);

  const cleared = await as.admin("PUT", `/api/v1/clients/${ids.client}/notes`, { notes: "" });
  assert.equal(cleared.status, 200);
  assert.equal(sql(DB, `SELECT COALESCE(notes, '<null>') FROM clients WHERE id = '${ids.client}'`), "<null>");

  assert.equal((await as.admin("PUT", `/api/v1/clients/${ids.client}/notes`, { notes: 5 })).status, 400);
  const otherShop = sql(DB, `SELECT id FROM clients WHERE shop_id <> '${SHOP}' ORDER BY id LIMIT 1`);
  if (otherShop) assert.equal((await as.admin("PUT", `/api/v1/clients/${otherShop}/notes`, { notes: "x" })).status, 404);
  sql(DB, `UPDATE clients SET notes = 'Allergic to almond oil' WHERE id = '${ids.client}'`);
});

test("plain staff and portal logins can't change the notes", async () => {
  assert.equal((await as.staff("PUT", `/api/v1/clients/${ids.client}/notes`, { notes: "x" })).status, 403);
  assert.equal((await as.client("PUT", `/api/v1/clients/${ids.portalClient}/notes`, { notes: "x" })).status, 403);
  assert.equal(sql(DB, `SELECT notes FROM clients WHERE id = '${ids.client}'`), "Allergic to almond oil");
});

test("a portal login reads neither the client list, nor visits, nor the shop's notes", async () => {
  assert.equal((await as.client("GET", "/api/v1/clients?slim=true")).status, 403);
  assert.equal((await as.client("GET", `/api/v1/clients?slim=true&id=${ids.client}`)).status, 403);
  assert.equal((await as.client("GET", `/api/v1/clients/${ids.client}/past-appointments`)).status, 403);
  assert.equal((await as.client("GET", `/api/v1/clients/${ids.portalClient}/past-appointments`)).status, 403);

  const own = await as.client("GET", `/api/v1/clients/${ids.portalClient}/full`);
  assert.equal(own.status, 200);
  assert.equal(own.data.client.notes, undefined);
  assert.ok(own.data.history.every((a) => a.internal_notes === undefined), "no internal notes");
  assert.ok(own.data.history.every((a) => typeof a.paid === "number"), "what they paid");

  const calendar = await as.client("GET", "/api/v1/appointments");
  assert.equal(calendar.status, 200);
  assert.ok(calendar.data.every((a) => a.client_notes == null && a.internal_notes == null));
});

test("the QR scan shows the notes, and money only to those who see money", async () => {
  const admin = await as.frontdesk("POST", "/api/v1/qr/scan", { token: "11111111-2222-4333-8444-555555555555" });
  assert.equal(admin.status, 200, JSON.stringify(admin.data));
  assert.equal(admin.data.client.notes, "Allergic to almond oil");
  for (const a of [...admin.data.upcoming_appointments, ...admin.data.recent_history]) {
    assert.equal(typeof a.paid, "number");
    assert.equal(typeof a.total, "number");
    assert.ok("internal_notes" in a);
  }
  const staff = await as.staff("POST", "/api/v1/qr/scan", { token: "11111111-2222-4333-8444-555555555555" });
  assert.equal(staff.status, 200);
  assert.equal(staff.data.client.notes, "Allergic to almond oil");
  for (const a of [...staff.data.upcoming_appointments, ...staff.data.recent_history]) {
    assert.equal(a.paid, undefined);
    assert.equal(a.total, undefined);
  }
});
