// Each service of a booking has its own note, for that service and its staff
// member: saved, returned to the shop, kept when the calendar moves a card,
// and never sent to the client portal.
//
// Run: node --test tests/server/serviceNotes.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { SHOP, api, createTestDb, dropTestDb, sql, startServer, token } from "../offline/helpers.mjs";

const require = createRequire(import.meta.url);
const jwt = require("jsonwebtoken");
const DB = "service_notes_test";
const PORT = 3217;
let server;
let admin;
let portal;
const ids = {};

before(async () => {
  const uri = createTestDb(DB);
  ids.admin = sql(DB, `SELECT id FROM users WHERE shop_id = '${SHOP}' AND role = 'admin' LIMIT 1`);
  const [userId, clientId] = sql(DB, `SELECT id || '|' || client_id FROM users WHERE shop_id = '${SHOP}' AND role = 'client' AND client_id IS NOT NULL ORDER BY id LIMIT 1`).split("|");
  ids.client = clientId;
  [ids.staffA, ids.staffB] = sql(DB, `SELECT id FROM staff WHERE shop_id = '${SHOP}' AND is_active AND COALESCE(capacity, 1) = 1 ORDER BY id LIMIT 2`).split("\n");
  ids.service = sql(DB, `SELECT id FROM services WHERE shop_id = '${SHOP}' AND is_active AND price > 0 ORDER BY id LIMIT 1`);
  server = await startServer(uri, PORT);
  admin = api(PORT, token(ids.admin, "admin"));
  require("dotenv").config({ path: new URL("../../.env", import.meta.url).pathname, quiet: true });
  portal = api(PORT, jwt.sign({ userId, role: "client", shopId: SHOP, clientId }, process.env.JWT_SECRET));
});
after(() => {
  server?.stop();
  dropTestDb(DB);
});

const DAY = "2027-09-14";
const line = (staff, hhmm, notes) => ({
  service_id: ids.service,
  staff_id: staff,
  start_time: `${DAY}T${hhmm}:00+03:00`,
  duration_override: 60,
  price_override: 30,
  notes,
});
const stored = (id) =>
  sql(DB, `SELECT string_agg(COALESCE(notes, '-'), ' | ' ORDER BY start_time) FROM appointment_services WHERE appointment_id = '${id}'`);

test("each service keeps its own note; blank is none", async () => {
  const made = await admin("POST", "/api/v1/appointments", {
    client_id: ids.client, status: "confirmed", save_receipt: true, allow_unavailable: true, allow_overtime: true,
    services: [line(ids.staffA, "10:00", "  Πίεση στον αριστερό ώμο  "), line(ids.staffB, "11:00", "   ")],
  });
  assert.equal(made.status, 200, JSON.stringify(made.data));
  ids.appt = made.data.id;
  assert.equal(stored(ids.appt), "Πίεση στον αριστερό ώμο | -");

  const list = (await admin("GET", `/api/v1/appointments?date=${DAY}`)).data;
  const appt = list.find((a) => a.id === ids.appt);
  assert.deepEqual(appt.services.map((s) => s.notes), ["Πίεση στον αριστερό ώμο", null]);

  // The client's history (the profile) shows it to the shop.
  const card = (await admin("GET", `/api/v1/clients/${ids.client}/full`)).data;
  const visit = card.history.find((h) => h.id === ids.appt);
  assert.equal(visit.services_paid[0].notes, "Πίεση στον αριστερό ώμο");
});

test("moving a card on the calendar keeps the note (it sends the services back as loaded)", async () => {
  const appt = (await admin("GET", `/api/v1/appointments?date=${DAY}`)).data.find((a) => a.id === ids.appt);
  const services = appt.services.map((s, i) => ({
    ...s,
    price_override: s.price,
    duration_override: s.duration_minutes,
    ...(i === 0 ? { staff_id: ids.staffB, start_time: `${DAY}T12:00:00+03:00` } : {}),
  }));
  const body = { ...appt, services, allow_overtime: true, allow_unavailable: true, base_version: appt.version };
  delete body.version;
  const moved = await admin("PUT", `/api/v1/appointments/${ids.appt}`, body);
  assert.equal(moved.status, 200, JSON.stringify(moved.data));
  assert.match(stored(ids.appt), /Πίεση στον αριστερό ώμο/);
});

test("the client portal never gets the notes", async () => {
  const list = await portal("GET", `/api/v1/appointments?date=${DAY}`);
  assert.equal(list.status, 200);
  const mine = list.data.find((a) => a.id === ids.appt);
  assert.ok(mine, "the client sees their booking");
  assert.ok(mine.services.every((s) => !("notes" in s)), JSON.stringify(mine.services));
  const card = await portal("GET", `/api/v1/clients/${ids.client}/full`);
  assert.equal(card.status, 200);
  const visit = card.data.history.find((h) => h.id === ids.appt);
  assert.ok(visit.services_paid.every((s) => !("notes" in s)));
});
