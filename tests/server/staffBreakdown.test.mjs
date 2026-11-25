// The staff performance table's breakdown: one staff member's lines, which
// always add up to that staff member's numbers in the table.
//
// Run: node --test tests/server/staffBreakdown.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { SHOP, api, createTestDb, dropTestDb, sql, startServer, token } from "../offline/helpers.mjs";

const DB = "staff_breakdown_test";
const PORT = 3218;
let server;
let call;
const ids = {};
const range = "from=2027-10-04T00:00:00%2B03:00&to=2027-10-04T23:59:59%2B03:00";

before(async () => {
  const uri = createTestDb(DB);
  ids.admin = sql(DB, `SELECT id FROM users WHERE shop_id = '${SHOP}' AND role = 'admin' LIMIT 1`);
  ids.staff = sql(DB, `INSERT INTO staff (name, shop_id) VALUES ('Breakdown Tester', '${SHOP}') RETURNING id`).split("\n")[0];
  ids.service = sql(DB, `SELECT id FROM services WHERE shop_id = '${SHOP}' AND is_active AND price > 0 ORDER BY id LIMIT 1`);
  ids.client = sql(DB, `INSERT INTO clients (first_name, last_name, shop_id) VALUES ('Break', 'Down', '${SHOP}') RETURNING id`).split("\n")[0];
  const book = (hhmm, minutes, price, status = "completed") => {
    const appt = sql(DB, `INSERT INTO appointments (client_id, status, shop_id, save_receipt) VALUES ('${ids.client}', '${status}', '${SHOP}', true) RETURNING id`).split("\n")[0];
    sql(DB, `INSERT INTO appointment_services (appointment_id, service_id, staff_id, start_time, duration_override, price_override, shop_id)
             VALUES ('${appt}', '${ids.service}', '${ids.staff}', TIMESTAMP '2027-10-04 ${hhmm}' AT TIME ZONE 'Europe/Athens', ${minutes}, ${price}, '${SHOP}')`);
  };
  book("10:00", 30, 5);
  book("11:00", 30, 5);
  book("12:00", 5, 0); // a stray €0 line of 5 minutes
  book("13:00", 30, 5, "cancelled"); // not counted
  server = await startServer(uri, PORT);
  call = api(PORT, token(ids.admin, "admin"));
});
after(() => {
  server?.stop();
  dropTestDb(DB);
});

test("the lines add up to the table's row, and the stray line is there to see", async () => {
  const table = (await call("GET", `/api/v1/reports/analytics?${range}`)).data.staff_utilization.find((r) => r.id === ids.staff);
  assert.ok(table, "the staff member is in the table, with their id");
  const lines = (await call("GET", `/api/v1/reports/staff-performance/${ids.staff}?${range}`)).data;
  assert.equal(lines.length, Number(table.appt_count));
  assert.equal(lines.reduce((n, l) => n + l.revenue, 0), Number(table.total_revenue));
  assert.equal(lines.reduce((n, l) => n + l.minutes, 0) / 60, Number(table.hours_booked));
  assert.deepEqual(lines.map((l) => [l.minutes, l.revenue]), [[30, 5], [30, 5], [5, 0]]);
});

test("a bad staff id is refused", async () => {
  assert.equal((await call("GET", `/api/v1/reports/staff-performance/nope?${range}`)).status, 400);
});
