// The analytics page's booking insights (GET /api/v1/reports/insights).
//
// Run: node --test tests/server/insights.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { SHOP, api, createTestDb, dropTestDb, sql, startServer, token } from "../offline/helpers.mjs";

const DB = "insights_test";
const PORT = 3195;
let server;
let call;
const ids = {};
// A far-future Saturday nobody has booked.
const DAY = "2027-06-12";
const range = `from=${DAY}T00:00:00%2B03:00&to=${DAY}T23:59:59%2B03:00`;

before(async () => {
  const uri = createTestDb(DB);
  ids.admin = sql(DB, `SELECT id FROM users WHERE shop_id = '${SHOP}' AND role = 'admin' LIMIT 1`);
  ids.staff = sql(DB, `SELECT id FROM staff WHERE shop_id = '${SHOP}' ORDER BY id LIMIT 1`);
  ids.service = sql(DB, `SELECT id FROM services WHERE shop_id = '${SHOP}' AND is_active AND price > 0 ORDER BY id LIMIT 1`);
  ids.serviceName = sql(DB, `SELECT name FROM services WHERE id = '${ids.service}'`);
  server = await startServer(uri, PORT);
  call = api(PORT, token(ids.admin, "admin"));
});
after(() => {
  server?.stop();
  dropTestDb(DB);
});

const book = async (hhmm, price) => {
  const client = sql(DB, `INSERT INTO clients (first_name, last_name, shop_id) VALUES ('Insights', 'Test', '${SHOP}') RETURNING id`).split("\n")[0];
  const r = await call("POST", "/api/v1/appointments", {
    client_id: client,
    status: "confirmed",
    save_receipt: true,
    allow_unavailable: true,
    services: [{ service_id: ids.service, staff_id: ids.staff, start_time: `${DAY}T${hhmm}:00+03:00`, duration_override: 60, price_override: price }],
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data.id;
};

test("counts the period's bookings by weekday, date, hour and service, without cancelled ones", async () => {
  await book("10:00", 40);
  await book("10:30", 20);
  const cancelled = await book("12:00", 99);
  assert.equal((await call("POST", `/api/v1/appointments/${cancelled}/cancel`)).status, 200);

  const r = await call("GET", `/api/v1/reports/insights?${range}`);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const d = r.data;
  assert.deepEqual(d.weekdays, [{ weekday: 6, bookings: 2, days: 1 }], "Saturday, 2 bookings");
  assert.deepEqual(d.busiest_date, { date: DAY, bookings: 2 });
  assert.deepEqual(d.heatmap, [{ weekday: 6, hour: 10, bookings: 2 }]);
  assert.equal(d.averages.bookings, 2);
  assert.equal(d.averages.avg_value, 30);
  assert.deepEqual(d.top_services, [{ service_name: ids.serviceName, bookings: 2, value: 60 }]);
  assert.equal(d.top_clients_by_visits.length, 2);
  assert.ok(Array.isArray(d.lapsed_regulars));
});

test("analytics only for the roles that see analytics", async () => {
  const staff = sql(DB, `SELECT id FROM users WHERE shop_id = '${SHOP}' AND role = 'staff' LIMIT 1`);
  if (!staff) return;
  const r = await api(PORT, token(staff, "staff"))("GET", `/api/v1/reports/insights?${range}`);
  assert.equal(r.status, 403);
});
