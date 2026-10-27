// Bookings with money on them: not deleted (cancelled instead), and what was
// paid on a cancelled booking is the client's credit.
//
// Run: node --test tests/server/payments.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { SHOP, api, createTestDb, dropTestDb, sql, startServer, token } from "../offline/helpers.mjs";

const DB = "payments_test";
const PORT = 3199;
let server;
let call;
const ids = {};
let slot = 0;
// Far-future slots nobody has booked; each test gets its own hour.
const nextStart = () => `2027-04-${String(10 + Math.floor(slot / 8)).padStart(2, "0")}T${String(9 + (slot++ % 8)).padStart(2, "0")}:00:00+03:00`;
const book = async (extra = {}) => {
  const r = await call("POST", "/api/v1/appointments", {
    client_id: ids.client,
    status: "confirmed",
    save_receipt: true,
    allow_unavailable: true,
    services: [{ service_id: ids.service, staff_id: ids.staff, start_time: nextStart(), duration_override: 60, price_override: 40 }],
    ...extra,
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data.id;
};
const pay = (appointment_id, amount) =>
  call("POST", "/api/v1/transactions", { appointment_id, client_id: ids.client, amount, payment_method: "cash" });
const exists = (id) => sql(DB, `SELECT count(*) FROM appointments WHERE id = '${id}'`) === "1";
const balance = async () => Number((await call("GET", `/api/v1/clients/${ids.client}/balance`)).data.balance);

before(async () => {
  const uri = createTestDb(DB);
  ids.admin = sql(DB, `SELECT id FROM users WHERE shop_id = '${SHOP}' AND role = 'admin' LIMIT 1`);
  ids.staff = sql(DB, `SELECT id FROM staff WHERE shop_id = '${SHOP}' ORDER BY id LIMIT 1`);
  ids.service = sql(DB, `SELECT id FROM services WHERE shop_id = '${SHOP}' AND is_active AND price > 0 ORDER BY id LIMIT 1`);
  ids.client = sql(DB, `INSERT INTO clients (first_name, last_name, shop_id) VALUES ('Payments', 'Test', '${SHOP}') RETURNING id`).split("\n")[0];
  server = await startServer(uri, PORT);
  call = api(PORT, token(ids.admin, "admin"));
});
after(() => {
  server?.stop();
  dropTestDb(DB);
});

test("a booking with a payment can't be deleted", async () => {
  const id = await book();
  assert.equal((await pay(id, 15)).status, 200);
  const r = await call("DELETE", `/api/v1/appointments/${id}`);
  assert.equal(r.status, 409);
  assert.equal(r.data.error, "has_payments");
  assert.ok(exists(id), "still there");
  assert.equal(sql(DB, `SELECT count(*) FROM transactions WHERE appointment_id = '${id}'`), "1", "payment still linked");
});

test("nor one whose payments were refunded back to zero", async () => {
  const id = await book();
  await pay(id, 15);
  assert.equal((await call("POST", `/api/v1/appointments/${id}/refund`, { amount: 15, payment_method: "cash", reason: "test" })).status, 200);
  assert.equal((await call("DELETE", `/api/v1/appointments/${id}`)).status, 409);
  assert.ok(exists(id));
});

test("a booking without payments still deletes", async () => {
  const id = await book();
  assert.equal((await call("DELETE", `/api/v1/appointments/${id}`)).status, 200);
  assert.ok(!exists(id));
});

test("a series isn't deleted if any of its bookings has a payment", async () => {
  const first = await book({ recurrence: { freq: "weekly", end_date: "2027-06-30" } });
  const group = sql(DB, `SELECT group_id FROM appointments WHERE id = '${first}'`);
  const later = sql(DB, `SELECT a.id FROM appointments a JOIN appointment_services s ON s.appointment_id = a.id
                         WHERE a.group_id = '${group}' AND a.id <> '${first}' ORDER BY s.start_time LIMIT 1`);
  await pay(later, 10);
  const before = sql(DB, `SELECT count(*) FROM appointments WHERE group_id = '${group}'`);
  assert.equal((await call("DELETE", `/api/v1/appointments/${first}?scope=series`)).status, 409);
  assert.equal(sql(DB, `SELECT count(*) FROM appointments WHERE group_id = '${group}'`), before, "no instance deleted");
});

test("a completed, paid booking can be cancelled; what was paid becomes credit", async () => {
  const id = await book();
  await pay(id, 40); // fully paid → completed
  assert.equal(sql(DB, `SELECT status FROM appointments WHERE id = '${id}'`), "completed");
  const before = await balance();
  const r = await call("POST", `/api/v1/appointments/${id}/cancel`, {});
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(sql(DB, `SELECT status FROM appointments WHERE id = '${id}'`), "cancelled");
  assert.equal(sql(DB, `SELECT count(*) FROM transactions WHERE appointment_id = '${id}'`), "1", "payment kept");
  assert.equal(await balance(), before - 40, "the €40 paid is now the client's credit");
});

test("a cancelled booking that was refunded leaves no credit", async () => {
  const id = await book();
  await pay(id, 20);
  await call("POST", `/api/v1/appointments/${id}/refund`, { amount: 20, payment_method: "cash", reason: "given back" });
  const before = await balance();
  await call("POST", `/api/v1/appointments/${id}/cancel`, {});
  assert.equal(await balance(), before);
});
