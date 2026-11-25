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
  assert.deepEqual(r.data.by_status, { completed: 1 }, "a part payment completes a booking whose day has come");
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

test("the day's reconciliation: Sales − Uncollected = Expected, against Payments, each difference explained; the same figures as Analytics", async () => {
  const D = "2031-03-11";
  const admin = api(PORT, token(sql(DB, `SELECT id FROM users WHERE shop_id = '${SHOP}' AND role = 'admin' LIMIT 1`), "admin"));
  // A booking at a local time, and a payment recorded at a local time.
  const booking = (local, price, receipt = true) => {
    const id = sql(DB, `INSERT INTO appointments (client_id, status, shop_id, save_receipt) VALUES ('${ids.client}', 'completed', '${SHOP}', ${receipt}) RETURNING id`).split("\n")[0];
    sql(DB, `INSERT INTO appointment_services (appointment_id, service_id, staff_id, start_time, duration_override, price_override, shop_id)
             VALUES ('${id}', '${ids.service}', '${ids.staff}', TIMESTAMP '${local}' AT TIME ZONE 'Europe/Athens', 60, ${price}, '${SHOP}')`);
    return id;
  };
  const payment = (local, amount, extra = {}) =>
    sql(DB, `INSERT INTO transactions (appointment_id, client_id, amount, payment_method, transaction_type, created_at, shop_id)
             VALUES (${extra.appt ? `'${extra.appt}'` : "NULL"}, '${ids.client}', ${amount}, 'cash', '${extra.type || "payment"}', TIMESTAMP '${local}', '${SHOP}')`);
  const a = booking(`${D} 10:00`, 40);
  const b = booking(`${D} 12:00`, 30);
  const evening = booking("2031-03-10 21:30", 35);
  const hidden = booking(`${D} 13:00`, 50, false);
  payment(`${D} 10:30`, 25, { appt: a });
  payment("2031-03-13 11:00", 15, { appt: a }); // the rest, two days later
  payment("2031-03-10 18:00", 30, { appt: b }); // a deposit the day before
  payment("2031-03-10 22:30", 0.5, { appt: evening }); // the evening before: not the day's
  payment(`${D} 09:00`, 34.5, { appt: evening }); // the rest of the evening before's booking
  payment(`${D} 13:30`, 50, { appt: hidden }); // kept off the receipts: super admins only
  payment(`${D} 16:00`, 20, { type: "gift_card_sale" });

  assert.equal((await call("GET", `/api/v1/reports/daily/reconciliation?date=${D}`)).status, 403, "front desk doesn't get it");
  assert.equal((await admin("GET", "/api/v1/reports/daily/reconciliation?date=2031-02-30")).status, 400);
  const r = await admin("GET", `/api/v1/reports/daily/reconciliation?date=${D}`);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const { sales, uncollected, expected, payments, delta, unexplained } = r.data;
  assert.deepEqual({ sales, uncollected, expected, payments, delta, unexplained }, { sales: 70, uncollected: 15, expected: 55, payments: 79.5, delta: 24.5, unexplained: 0 });
  assert.deepEqual(Object.fromEntries(r.data.lines.map((l) => [l.key, l.amount])), { otherDaysBookings: 34.5, giftCardSales: 20, paidEarlier: -30 });
  assert.equal(r.data.paid_later.amount, 15);

  // The same day on the Daily Report and on Analytics (as the page sends it: Athens midnight to midnight).
  assert.equal((await admin("GET", `/api/v1/reports/daily?date=${D}`)).data.total_collected, 79.5);
  const range = "from=2031-03-10T22:00:00.000Z&to=2031-03-11T21:59:59.999Z";
  const tiles = (await admin("GET", `/api/v1/reports/finances?${range}`)).data;
  // Requirement changed (Nov 2026): Analytics' total sales also counts gift
  // cards, packages and memberships sold, so the day's €20 gift card is in it;
  // the reconciliation keeps its sales to the bookings (70) and lists gift card
  // sales as their own line.
  assert.equal(tiles.total_sales, 90);
  assert.equal(tiles.total_sales_parts.services + tiles.total_sales_parts.booking_products, 70);
  assert.equal(tiles.total_payments, 79.5, "Πληρωμές: not the evening before, not the booking kept off the receipts");
  assert.equal((await admin("GET", `/api/v1/reports/finances/details?kind=net&${range}`)).data.total, 79.5);
});
