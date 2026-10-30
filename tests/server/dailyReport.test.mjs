// The daily report for a chosen day.
//
// Run: node --test tests/server/dailyReport.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { SHOP, api, createTestDb, dropTestDb, sql, startServer, token } from "../offline/helpers.mjs";

const DB = "daily_report_test";
const PORT = 3181;
const DAY = "2026-03-17";
let server;
let call;
const ids = {};

before(async () => {
  const uri = createTestDb(DB);
  ids.frontdesk = sql(DB, `SELECT id FROM users WHERE shop_id = '${SHOP}' AND role = 'frontdesk' LIMIT 1`);
  ids.staffUser = sql(DB, `SELECT id FROM users WHERE shop_id = '${SHOP}' AND role = 'staff' LIMIT 1`);
  ids.staff = sql(DB, `SELECT id FROM staff WHERE shop_id = '${SHOP}' ORDER BY id LIMIT 1`);
  ids.service = sql(DB, `SELECT id FROM services WHERE shop_id = '${SHOP}' AND is_active AND price > 0 ORDER BY id LIMIT 1`);
  ids.client = sql(DB, `INSERT INTO clients (first_name, last_name, shop_id) VALUES ('Daily', 'Report', '${SHOP}') RETURNING id`).split("\n")[0];
  // A clean day, then one booking on it with a payment made that day.
  sql(DB, `UPDATE appointments SET save_receipt = false WHERE id IN (SELECT appointment_id FROM appointment_services WHERE start_time::date = '${DAY}');
           DELETE FROM transactions WHERE created_at::date = '${DAY}'`);
  server = await startServer(uri, PORT);
  call = api(PORT, token(ids.frontdesk, "frontdesk"));
  const made = await call("POST", "/api/v1/appointments", {
    client_id: ids.client,
    status: "confirmed",
    save_receipt: true,
    allow_unavailable: true,
    services: [{ service_id: ids.service, staff_id: ids.staff, start_time: `${DAY}T10:00:00+02:00`, duration_override: 60, price_override: 40 }],
  });
  assert.equal(made.status, 200, JSON.stringify(made.data));
  ids.appt = made.data.id;
  const paid = await call("POST", "/api/v1/transactions", { appointment_id: ids.appt, client_id: ids.client, amount: 25, payment_method: "cash" });
  assert.equal(paid.status, 200, JSON.stringify(paid.data));
  ids.payment = sql(DB, `UPDATE transactions SET created_at = '${DAY} 10:30:00' WHERE appointment_id = '${ids.appt}' RETURNING id`).split("\n")[0];
});
after(() => {
  server?.stop();
  dropTestDb(DB);
});

test("a chosen day shows that day's bookings and money", async () => {
  const r = await call("GET", `/api/v1/reports/daily?date=${DAY}`);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.date, DAY);
  assert.equal(r.data.total_collected, 25);
  assert.deepEqual(r.data.by_method, [{ method: "cash", amount: 25 }]);
  assert.equal(r.data.appointment_count, 1);
  assert.deepEqual(r.data.by_status, { confirmed: 1 });
  assert.equal(r.data.payments.length, 1);
  assert.equal(Number(r.data.payments[0].amount), 25);
  assert.equal(r.data.payments[0].first_name, "Daily");
  assert.equal(r.data.appointments, undefined, "the appointments list is no longer sent");
});

test("another day doesn't include them; no date means today", async () => {
  const other = await call("GET", "/api/v1/reports/daily?date=2026-03-18");
  assert.equal(other.status, 200);
  assert.ok(!other.data.payments.some((p) => p.id === ids.payment));
  const today = await call("GET", "/api/v1/reports/daily");
  assert.equal(today.status, 200);
  assert.ok(!today.data.payments.some((p) => p.id === ids.payment));
});

test("a bad date is refused", async () => {
  for (const bad of ["yesterday", "2026-02-31", "2026-13-01", "17/03/2026"]) {
    const r = await call("GET", `/api/v1/reports/daily?date=${encodeURIComponent(bad)}`);
    assert.equal(r.status, 400, bad);
    assert.equal(r.data.error, "invalid_date");
  }
});

test("still only for admin, super admin and front desk", async () => {
  if (!ids.staffUser) return;
  const r = await api(PORT, token(ids.staffUser, "staff"))("GET", `/api/v1/reports/daily?date=${DAY}`);
  assert.equal(r.status, 403);
});
