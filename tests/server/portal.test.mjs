// The redesigned client portal's server side: the client's bookings with
// what's needed to book the same again (PV1), and the shop's online-booking
// rules (PR, RT, RV, CP-P: added with phase 3 of docs/redesign/IMPLEMENTATION_PLAN.md).
//
// Run: node --test tests/server/portal.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { ROOT, SHOP, api, createTestDb, dropTestDb, sql, startServer, token } from "../offline/helpers.mjs";

const require = createRequire(import.meta.url);
require("dotenv").config({ path: path.join(ROOT, ".env"), quiet: true });
const jwt = require("jsonwebtoken");

const DB = "portal_test";
const PORT = 3218;
let server;
const ids = {};
const as = {};
let day; // a Wednesday next week
const offset = (date) => sql(DB, `SELECT to_char('${date}'::date::timestamptz, 'TZH:TZM')`);
const at = (date, hhmm) => new Date(`${date}T${hhmm}:00${offset(date)}`).toISOString();

before(async () => {
  const uri = createTestDb(DB);
  const one = (role) => sql(DB, `SELECT id FROM users WHERE shop_id = '${SHOP}' AND role = '${role}' ORDER BY id LIMIT 1`);
  [ids.anna, ids.eleni] = sql(DB, `SELECT id FROM staff WHERE shop_id = '${SHOP}' AND is_active AND visible_in_calendar AND COALESCE(capacity, 1) = 1 ORDER BY id LIMIT 2`).split("\n");
  ids.service = sql(DB, `SELECT id FROM services WHERE shop_id = '${SHOP}' AND is_active AND duration_minutes = 60 ORDER BY id LIMIT 1`);
  sql(DB, `UPDATE services SET bookable_online = true WHERE id = '${ids.service}'`);
  ids.client = sql(DB, `INSERT INTO clients (first_name, last_name, shop_id) VALUES ('Πύλη', 'Δοκιμή', '${SHOP}') RETURNING id`).split("\n")[0];
  ids.clientUser = sql(DB, `INSERT INTO users (username, password, role, shop_id, client_id) VALUES ('portal.test.client', 'x', 'client', '${SHOP}', '${ids.client}') RETURNING id`).split("\n")[0];
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

const bookAs = async (who, clientId, services, extra = {}) => {
  const r = await who("POST", "/api/v1/appointments", {
    client_id: clientId, status: "confirmed", save_receipt: true, allow_overtime: true, allow_unavailable: true, services, ...extra,
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data.id;
};
const svc = (staffId, start, extra = {}) => ({ service_id: ids.service, staff_id: staffId, start_time: start, duration_override: 60, price_override: 40, ...extra });

test("PV1 the client's bookings: to come and past, with what to book again, the price and what was paid", async () => {
  sql(DB, `DELETE FROM appointments WHERE client_id = '${ids.client}'`);
  const coming = await bookAs(as.frontdesk, ids.client, [svc(ids.anna, at(day, "10:00"))]);
  const past = await bookAs(as.frontdesk, ids.client, [svc(ids.eleni, new Date(Date.now() - 5 * 864e5).toISOString(), { price_override: 35 })]);
  sql(DB, `INSERT INTO transactions (appointment_id, amount, payment_method, shop_id) VALUES ('${past}', 20, 'cash', '${SHOP}')`);
  const old = await bookAs(as.frontdesk, ids.client, [svc(ids.anna, new Date(Date.now() - 400 * 864e5).toISOString())]);
  const someoneElse = sql(DB, `INSERT INTO clients (first_name, last_name, shop_id) VALUES ('Άλλη', 'Πελάτισσα', '${SHOP}') RETURNING id`).split("\n")[0];
  await bookAs(as.frontdesk, someoneElse, [svc(ids.anna, at(day, "12:00"))]);

  const r = await as.client("GET", "/api/v1/portal/appointments");
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(r.data.map((a) => a.id), [coming, past], "newest first; not over a year old, not someone else's");
  assert.ok(!r.data.map((a) => a.id).includes(old));
  const p = r.data[1];
  assert.deepEqual({ paid: p.paid, total: p.total }, { paid: 20, total: 35 });
  assert.deepEqual(
    { service_id: p.services[0].service_id, staff_id: p.services[0].staff_id, duration: p.services[0].duration_minutes },
    { service_id: ids.service, staff_id: ids.eleni, duration: 60 },
  );
  assert.equal(new Date(r.data[0].end_time).getTime() - new Date(r.data[0].start_time).getTime(), 3600e3);
  assert.equal(r.data[0].internal_notes, undefined, "the shop's notes are never sent");
  assert.equal((await as.frontdesk("GET", "/api/v1/portal/appointments")).status, 403);
});

test("PV2 a client reads only the shop details the portal shows", async () => {
  const r = await as.client("GET", "/api/v1/shop");
  assert.equal(r.status, 200);
  for (const hidden of ["owner_email", "owner_name", "notes", "plan", "trial_ends_at", "force_hide_cash", "reply_email", "walk_in_client_id"]) {
    assert.ok(!(hidden in r.data), `${hidden} is not sent to clients`);
  }
  assert.ok(["id", "name", "phone", "address", "self_booking_enabled", "ai_assistant_enabled"].every((k) => k in r.data));
  assert.ok("owner_email" in (await as.admin("GET", "/api/v1/shop")).data, "staff still get the whole shop");
});
