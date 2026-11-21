// The AI assistant's server side: the shop's switch, who's asking (/ai/context),
// and the client routes it and the portal share: the client's upcoming
// bookings, and moving one to another free time. AI1–AI5.
//
// Run: node --test tests/server/aiAssistant.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { ROOT, SHOP, api, createTestDb, dropTestDb, sql, startServer, token } from "../offline/helpers.mjs";

const require = createRequire(import.meta.url);
require("dotenv").config({ path: path.join(ROOT, ".env"), quiet: true });
const jwt = require("jsonwebtoken");

const DB = "ai_assistant_test";
const PORT = 3217;
let server;
const ids = {};
const as = {};
let day; // a Wednesday next week
const at = (date, hhmm) => new Date(`${date}T${hhmm}:00${sql(DB, `SELECT to_char('${date}'::date::timestamptz, 'TZH:TZM')`)}`).toISOString();

before(async () => {
  const uri = createTestDb(DB);
  const one = (role) => sql(DB, `SELECT id FROM users WHERE shop_id = '${SHOP}' AND role = '${role}' ORDER BY id LIMIT 1`);
  [ids.anna, ids.eleni] = sql(DB, `SELECT id FROM staff WHERE shop_id = '${SHOP}' AND is_active AND visible_in_calendar AND COALESCE(capacity, 1) = 1 ORDER BY id LIMIT 2`).split("\n");
  ids.service = sql(DB, `SELECT id FROM services WHERE shop_id = '${SHOP}' AND is_active AND duration_minutes = 60 ORDER BY id LIMIT 1`);
  ids.client = sql(DB, `INSERT INTO clients (first_name, last_name, shop_id) VALUES ('Αλίκη', 'Δοκιμή', '${SHOP}') RETURNING id`).split("\n")[0];
  ids.clientUser = sql(DB, `INSERT INTO users (username, password, role, shop_id, client_id) VALUES ('ai.test.client', 'x', 'client', '${SHOP}', '${ids.client}') RETURNING id`).split("\n")[0];
  day = sql(DB, "SELECT (CURRENT_DATE - ((EXTRACT(DOW FROM CURRENT_DATE)::int + 6) % 7) + 9)::text");
  for (const staffId of [ids.anna, ids.eleni]) {
    sql(DB, `UPDATE staff SET working_hours_enabled = true WHERE id = '${staffId}';
      DELETE FROM staff_services WHERE staff_id = '${staffId}';
      INSERT INTO staff_schedule_days (staff_id, shop_id, date, ranges) VALUES ('${staffId}', '${SHOP}', '${day}', '[{"start_time":"10:00","end_time":"14:00"}]')
      ON CONFLICT (staff_id, date) DO UPDATE SET ranges = EXCLUDED.ranges`);
  }
  sql(DB, `UPDATE shops SET self_booking_enabled = true WHERE id = '${SHOP}'`);
  server = await startServer(uri, PORT);
  as.admin = api(PORT, token(one("admin"), "admin"));
  as.frontdesk = api(PORT, token(one("frontdesk"), "frontdesk"));
  as.client = api(PORT, jwt.sign({ userId: ids.clientUser, role: "client", shopId: SHOP, clientId: ids.client }, process.env.JWT_SECRET));
});
after(() => {
  server?.stop();
  dropTestDb(DB);
});

const bookFor = async (staffId, hhmm, services) => {
  const r = await as.frontdesk("POST", "/api/v1/appointments", {
    client_id: ids.client, status: "confirmed", save_receipt: true, allow_overtime: true, allow_unavailable: true,
    services: services || [{ service_id: ids.service, staff_id: staffId, start_time: at(day, hhmm), duration_override: 60, price_override: 30 }],
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data.id;
};
const startOf = (id) => new Date(sql(DB, `SELECT MIN(start_time) FROM appointment_services WHERE appointment_id = '${id}'`)).toISOString();

test("AI1 the shop's switch: admins only", async () => {
  assert.equal((await as.frontdesk("PUT", "/api/v1/shop/ai-assistant", { ai_assistant_enabled: true })).status, 403);
  assert.equal((await as.admin("PUT", "/api/v1/shop/ai-assistant", { ai_assistant_enabled: true })).status, 200);
  assert.equal(sql(DB, `SELECT ai_assistant_enabled FROM shops WHERE id = '${SHOP}'`), "t");
  assert.equal((await as.admin("GET", "/api/v1/shop")).data.ai_assistant_enabled, true, "the portal reads it from /shop");
});

test("AI2 who's asking: the client, their shop and its settings", async () => {
  const r = await as.client("GET", "/api/v1/ai/context");
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(
    { role: r.data.role, client: r.data.client_id, name: r.data.client_first_name, ai: r.data.ai_assistant_enabled, self: r.data.self_booking_enabled },
    { role: "client", client: ids.client, name: "Αλίκη", ai: true, self: true },
  );
  assert.equal((await as.frontdesk("GET", "/api/v1/ai/context")).data.client_id, null);
  assert.equal((await api(PORT, "not-a-token")("GET", "/api/v1/ai/context")).status, 401);
});

test("AI3 a client's upcoming bookings, not the past or cancelled ones; staff can't call it", async () => {
  sql(DB, `DELETE FROM appointments WHERE client_id = '${ids.client}'`);
  const upcoming = await bookFor(ids.anna, "10:00");
  const cancelled = await bookFor(ids.anna, "12:00");
  await as.frontdesk("POST", `/api/v1/appointments/${cancelled}/cancel`);
  const r = await as.client("GET", "/api/v1/portal/appointments/upcoming");
  assert.deepEqual(r.data.map((a) => a.id), [upcoming]);
  assert.equal(r.data[0].services[0].duration_minutes, 60);
  assert.equal((await as.frontdesk("GET", "/api/v1/portal/appointments/upcoming")).status, 403);
});

test("AI4 moving a booking: only to a time the booking screens would offer", async () => {
  sql(DB, `DELETE FROM appointments WHERE client_id = '${ids.client}'`);
  const mine = await bookFor(ids.anna, "10:00");
  sql(DB, `UPDATE appointments SET email_reminder_sent = true, push_reminder_sent = true WHERE id = '${mine}'`);
  // Someone else holds Anna at 12:00.
  const other = sql(DB, `INSERT INTO clients (first_name, last_name, shop_id) VALUES ('Other', 'Client', '${SHOP}') RETURNING id`).split("\n")[0];
  assert.equal((await as.frontdesk("POST", "/api/v1/appointments", {
    client_id: other, status: "confirmed", save_receipt: true, allow_overtime: true, allow_unavailable: true,
    services: [{ service_id: ids.service, staff_id: ids.anna, start_time: at(day, "12:00"), duration_override: 60, price_override: 30 }],
  })).status, 200);
  const move = (body) => as.client("POST", `/api/v1/portal/appointments/${mine}/reschedule`, body);

  // A taken time, or one outside her hours: refused, nothing changes.
  assert.equal((await move({ start_time: at(day, "12:00") })).status, 409);
  assert.equal((await move({ start_time: at(day, "13:30") })).status, 409, "would end past 14:00");
  assert.equal(startOf(mine), at(day, "10:00"));
  // Overlapping its own old time is fine (it moves out of it).
  assert.equal((await move({ start_time: at(day, "10:30") })).status, 200);
  assert.equal(startOf(mine), at(day, "10:30"));
  // Its reminders are due again for the new time.
  assert.equal(sql(DB, `SELECT email_reminder_sent || ' ' || push_reminder_sent FROM appointments WHERE id = '${mine}'`), "false false");
  // To another staff member who does the service.
  assert.equal((await move({ start_time: at(day, "12:00"), staff_id: ids.eleni })).status, 200);
  assert.equal(sql(DB, `SELECT staff_id FROM appointment_services WHERE appointment_id = '${mine}'`), ids.eleni);
  // Refused: a past time, nothing given, another client's booking, the shop's self-booking off.
  assert.equal((await move({ start_time: new Date(Date.now() - 3600e3).toISOString() })).status, 422);
  assert.equal((await move({})).status, 400);
  const notMine = sql(DB, `SELECT a.id FROM appointments a WHERE a.client_id = '${other}' LIMIT 1`);
  assert.equal((await as.client("POST", `/api/v1/portal/appointments/${notMine}/reschedule`, { start_time: at(day, "13:00") })).status, 404);
  sql(DB, `UPDATE shops SET self_booking_enabled = false WHERE id = '${SHOP}'`);
  assert.equal((await move({ start_time: at(day, "13:00") })).status, 404);
  sql(DB, `UPDATE shops SET self_booking_enabled = true WHERE id = '${SHOP}'`);
});

test("AI5 a booking with several services is left to the shop", async () => {
  sql(DB, `DELETE FROM appointments WHERE client_id = '${ids.client}'`);
  const two = await bookFor(null, null, [
    { service_id: ids.service, staff_id: ids.anna, start_time: at(day, "10:00"), duration_override: 60, price_override: 30 },
    { service_id: ids.service, staff_id: ids.eleni, start_time: at(day, "11:00"), duration_override: 60, price_override: 30 },
  ]);
  const r = await as.client("POST", `/api/v1/portal/appointments/${two}/reschedule`, { start_time: at(day, "12:00") });
  assert.equal(r.status, 422);
  assert.equal(r.data.error, "multi_service");
});
