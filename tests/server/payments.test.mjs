// Bookings with money on them: not deleted (cancelled instead), and what was
// paid on a cancelled booking is the client's credit.
//
// Run: node --test tests/server/payments.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
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

test("εξόφληση can settle part of a booking's debt, never more than owed", async () => {
  const id = await book(); // 40 €
  const settle = (body) => call("POST", `/api/v1/appointments/${id}/resolve-debt`, body);
  const part = await settle({ mode: "payment", payment_method: "cash", amount: 15 });
  assert.equal(part.status, 200, JSON.stringify(part.data));
  assert.equal(part.data.amount, 15);
  assert.equal(part.data.remaining, 25);
  assert.equal(sql(DB, `SELECT payment_status FROM appointments WHERE id = '${id}'`), "partial");

  const over = await settle({ mode: "payment", payment_method: "cash", amount: 30 });
  assert.equal(over.status, 400);
  assert.equal(over.data.error, "exceeds_owed");
  assert.equal(over.data.owed, 25);
  assert.equal((await settle({ mode: "payment", payment_method: "cash", amount: 0 })).data.error, "invalid_amount");

  // A partial write-off, then the rest with no amount (all that's left).
  assert.equal((await settle({ mode: "write_off", amount: 5 })).data.remaining, 20);
  const rest = await settle({ mode: "payment", payment_method: "card" });
  assert.equal(rest.data.amount, 20);
  assert.equal(rest.data.remaining, 0);
  assert.equal(sql(DB, `SELECT payment_status FROM appointments WHERE id = '${id}'`), "paid");
  assert.equal(sql(DB, `SELECT sum(amount)::numeric(10,2) FROM transactions WHERE appointment_id = '${id}'`), "40.00");
});

test("and part of a manual debt", async () => {
  const debt = await call("POST", `/api/v1/clients/${ids.client}/debts`, { amount: 100, debt_date: "2026-10-01", note: "partial test" });
  assert.equal(debt.status, 201, JSON.stringify(debt.data));
  const debtId = sql(DB, `SELECT id FROM client_debts WHERE client_id = '${ids.client}' AND note = 'partial test'`);
  const settle = (body) => call("POST", `/api/v1/client-debts/${debtId}/resolve`, body);
  const half = await settle({ mode: "payment", payment_method: "cash", amount: 50 });
  assert.equal(half.status, 200, JSON.stringify(half.data));
  assert.equal(half.data.remaining, 50);
  assert.equal((await settle({ mode: "payment", payment_method: "cash", amount: 60 })).data.error, "exceeds_owed");
  const remaining = (await call("GET", `/api/v1/clients/${ids.client}/debts`)).data.find((d) => d.id === debtId).remaining;
  assert.equal(Number(remaining), 50);
});

test("a package sold with a split payment: the second way can cover part of it, and nothing is refused or invented", async () => {
  const client = sql(DB, `INSERT INTO clients (first_name, last_name, shop_id) VALUES ('Split', 'Sale', '${SHOP}') RETURNING id`).split("\n")[0];
  const appt = await book({ client_id: client }); // 40 owed
  const type = sql(DB, `INSERT INTO package_types (shop_id, name, service_id, visits, price) VALUES ('${SHOP}', 'Split Test', '${ids.service}', 5, 100) RETURNING id`).split("\n")[0];

  // 140 due: 30 by cash, 110 by card. The cash and 70 of the card pay the package, 40 of the card the booking.
  const r = await call("POST", "/api/v1/transactions", {
    appointment_id: appt,
    client_id: client,
    amount: 0,
    payment_method: "cash",
    package_purchases: [{ package_type_id: type }],
    amount2: 40,
    extras_amount2: 70,
    payment_method2: "card",
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const rows = (where) => sql(DB, `SELECT string_agg(amount || ' ' || payment_method, ', ' ORDER BY payment_method DESC) FROM transactions WHERE client_id = '${client}' AND ${where}`);
  assert.equal(rows("transaction_type = 'package_sale'"), "30.00 cash, 70.00 card");
  assert.equal(rows(`appointment_id = '${appt}'`), "40.00 card");
  assert.equal(sql(DB, `SELECT COUNT(DISTINCT split_group_id) FROM transactions WHERE client_id = '${client}'`), "1");
});

test("the second way can't be said to cover more of a sale than was sold, or pay it by gift card", async () => {
  const client = sql(DB, `INSERT INTO clients (first_name, last_name, shop_id) VALUES ('Split', 'Refused', '${SHOP}') RETURNING id`).split("\n")[0];
  const appt = await book({ client_id: client });
  const type = sql(DB, `SELECT id FROM package_types WHERE name = 'Split Test' AND shop_id = '${SHOP}'`);
  const body = { appointment_id: appt, client_id: client, amount: 0, payment_method: "cash", package_purchases: [{ package_type_id: type }] };
  assert.equal((await call("POST", "/api/v1/transactions", { ...body, extras_amount2: 101, payment_method2: "card" })).status, 400);
  assert.equal((await call("POST", "/api/v1/transactions", { ...body, extras_amount2: 50, payment_method2: "gift-card" })).status, 400);
  assert.equal(sql(DB, `SELECT count(*) FROM client_packages WHERE client_id = '${client}'`), "0");
  assert.equal(sql(DB, `SELECT count(*) FROM transactions WHERE client_id = '${client}'`), "0");
});

test("a price can change until the appointment is completed", async () => {
  const appt = await book();
  const change = (new_total) => call("POST", `/api/v1/appointments/${appt}/price-change`, { new_total, reason: "test" });
  const total = () => sql(DB, `SELECT SUM(price_override) FROM appointment_services WHERE appointment_id = '${appt}'`);

  assert.equal((await change(25)).status, 200);
  assert.equal(total(), "25.00");

  sql(DB, `UPDATE appointments SET status = 'completed' WHERE id = '${appt}'`);
  const refused = await change(10);
  assert.equal(refused.status, 400);
  assert.equal(refused.data.error, "appointment_completed");
  assert.equal(total(), "25.00");
});

test("a price change's note is required, and goes in the appointment's notes on a new line", async () => {
  const client = sql(DB, `INSERT INTO clients (first_name, last_name, shop_id) VALUES ('Note', 'Line', '${SHOP}') RETURNING id`).split("\n")[0];
  const appt = await book({ client_id: client, booking_notes: "existing" });
  const notes = () => sql(DB, `SELECT booking_notes FROM appointments WHERE id = '${appt}'`);
  const change = (new_total, reason) => call("POST", `/api/v1/appointments/${appt}/price-change`, { new_total, reason });

  assert.equal((await change(30, "   ")).status, 400);
  assert.equal(notes(), "existing");

  const first = await change(30, "first note");
  assert.equal(first.status, 200);
  assert.equal(first.data.booking_notes, "existing\nfirst note");
  assert.equal(notes(), "existing\nfirst note");
  assert.equal((await change(25, " second note ")).status, 200);
  assert.equal(notes(), "existing\nfirst note\nsecond note");
  assert.equal((await change(25, "same price")).status, 200);
  assert.equal(notes(), "existing\nfirst note\nsecond note\nsame price", "the note is kept even if the total stayed the same");

  assert.equal(sql(DB, `SELECT COALESCE(notes, '') FROM clients WHERE id = '${client}'`), "", "not on the client's card");

  const jwt = createRequire(import.meta.url)("jsonwebtoken");
  const asClient = api(PORT, jwt.sign({ userId: ids.admin, role: "client", clientId: client, shopId: SHOP }, process.env.JWT_SECRET));
  const day = sql(DB, `SELECT to_char(MIN(start_time) AT TIME ZONE 'Europe/Athens', 'YYYY-MM-DD') FROM appointment_services WHERE appointment_id = '${appt}'`);
  const seen = await asClient("GET", `/api/v1/appointments?date=${day}`);
  assert.equal(seen.status, 200, JSON.stringify(seen.data));
  assert.equal(seen.data.find((x) => x.id === appt).booking_notes, null, "the client doesn't get it");
});

test("a client reading their own card doesn't get the shop's notes", async () => {
  const client = sql(DB, `INSERT INTO clients (first_name, last_name, shop_id, notes) VALUES ('Own', 'Card', '${SHOP}', 'staff only') RETURNING id`).split("\n")[0];
  const asAdmin = await call("GET", `/api/v1/clients/${client}/full`);
  assert.equal(asAdmin.data.client.notes, "staff only");
  const jwt = createRequire(import.meta.url)("jsonwebtoken");
  const tok = jwt.sign({ userId: ids.admin, role: "client", clientId: client, shopId: SHOP }, process.env.JWT_SECRET);
  const asClient = await api(PORT, tok)("GET", `/api/v1/clients/${client}/full`);
  assert.equal(asClient.status, 200, JSON.stringify(asClient.data));
  assert.equal("notes" in asClient.data.client, false);
});

test("a price change can cover the same-day appointments paid together: shared in proportion, noted on each", async () => {
  const client = sql(DB, `INSERT INTO clients (first_name, last_name, shop_id) VALUES ('Whole', 'Day', '${SHOP}') RETURNING id`).split("\n")[0];
  const [a, b] = [await book({ client_id: client }), await book({ client_id: client })]; // 40 each
  const r = await call("POST", `/api/v1/appointments/${a}/price-change`, { new_total: 60, reason: "whole day", also_appointment_ids: [b] });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const row = (id) => sql(DB, `SELECT SUM(price_override) FROM appointment_services WHERE appointment_id = '${id}'`);
  assert.equal(row(a), "30.00");
  assert.equal(row(b), "30.00");
  assert.deepEqual(r.data.totals, { [a]: 30, [b]: 30 });
  for (const id of [a, b]) {
    assert.equal(sql(DB, `SELECT booking_notes FROM appointments WHERE id = '${id}'`), "whole day");
    assert.equal(sql(DB, `SELECT old_total || ' ' || new_total FROM price_adjustments WHERE appointment_id = '${id}'`), "40.00 30.00");
  }
  assert.equal(await (async () => Number((await call("GET", `/api/v1/clients/${client}/balance`)).data.balance))(), 0, "future bookings aren't debt yet");
});

test("it stops if any of them is completed or another client's, changing nothing", async () => {
  const client = sql(DB, `INSERT INTO clients (first_name, last_name, shop_id) VALUES ('Whole', 'Stop', '${SHOP}') RETURNING id`).split("\n")[0];
  const a = await book({ client_id: client });
  const done = await book({ client_id: client });
  sql(DB, `UPDATE appointments SET status = 'completed' WHERE id = '${done}'`);
  const other = await book();
  const change = (id) => call("POST", `/api/v1/appointments/${a}/price-change`, { new_total: 10, reason: "x", also_appointment_ids: [id] });
  assert.equal((await change(done)).data.error, "appointment_completed");
  assert.equal((await change(other)).status, 400);
  assert.equal(sql(DB, `SELECT SUM(price_override) FROM appointment_services WHERE appointment_id = '${a}'`), "40.00");
});

test("the new price is what the booking loads with afterwards, and replaces a discount", async () => {
  const client = sql(DB, `INSERT INTO clients (first_name, last_name, shop_id) VALUES ('Price', 'Stays', '${SHOP}') RETURNING id`).split("\n")[0];
  const start = nextStart();
  const created = await call("POST", "/api/v1/appointments", {
    client_id: client, status: "confirmed", save_receipt: true, allow_unavailable: true,
    discount_type: "percent", discount_value: 10, discount_scope: "services",
    services: [{ service_id: ids.service, staff_id: ids.staff, start_time: start, duration_override: 60, price_override: 40 }],
  });
  assert.equal(created.status, 200, JSON.stringify(created.data));
  const appt = created.data.id;
  assert.equal((await call("POST", `/api/v1/appointments/${appt}/price-change`, { new_total: 25, reason: "stay" })).status, 200);

  const day = start.slice(0, 10);
  const loaded = (await call("GET", `/api/v1/appointments?date=${day}`)).data.find((x) => x.id === appt);
  assert.equal(Number(loaded.services[0].price), 25);
  assert.equal(loaded.discount_type, null);
  assert.equal(Number(loaded.discount_amount), 0);
});

const athensDay = (days = 0) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens" }).format(new Date(Date.now() + days * 86400000));
const clientFor = (last) => sql(DB, `INSERT INTO clients (first_name, last_name, shop_id) VALUES ('Part', '${last}', '${SHOP}') RETURNING id`).split("\n")[0];
const bookAt = (client, startSql, price = 100) => {
  const appt = sql(DB, `INSERT INTO appointments (client_id, shop_id, status) VALUES ('${client}', '${SHOP}', 'confirmed') RETURNING id`).split("\n")[0];
  sql(DB, `INSERT INTO appointment_services (appointment_id, service_id, staff_id, start_time, price_override, duration_override) VALUES ('${appt}', '${ids.service}', '${ids.staff}', ${startSql}, ${price}, 60)`);
  return appt;
};
const statusOf = (id) => sql(DB, `SELECT status || ' ' || payment_status FROM appointments WHERE id = '${id}'`);
const balanceOf = async (client) => Number((await call("GET", `/api/v1/clients/${client}/balance`)).data.balance);
const payPart = (client, appointment_id, amount, extra = {}) =>
  call("POST", "/api/v1/transactions", { appointment_id, client_id: client, amount, payment_method: "cash", ...extra });

test("a part payment on today's booking completes it, and the rest is owed at once, even if it starts later today", async () => {
  const client = clientFor("Today");
  // The last minute of today in Athens: still to come whenever this runs.
  const appt = bookAt(client, `'${athensDay()} 23:59:00+02'::timestamptz`);
  assert.equal(await balanceOf(client), 0);
  const r = await payPart(client, appt, 50);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(statusOf(appt), "completed partial");
  assert.equal(r.data.new_balance, 50);
  assert.equal(await balanceOf(client), 50);
});

test("a part payment on a past booking completes it too", async () => {
  const client = clientFor("Past");
  const appt = bookAt(client, "NOW() - INTERVAL '2 days'");
  const r = await payPart(client, appt, 30);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(statusOf(appt), "completed partial");
  assert.equal(r.data.new_balance, 70);
});

test("a part payment for a later day is a deposit: it stays confirmed and nothing is owed yet", async () => {
  const client = clientFor("Later");
  const appt = bookAt(client, "NOW() + INTERVAL '7 days'");
  const r = await payPart(client, appt, 50);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(statusOf(appt), "confirmed partial");
  assert.equal(await balanceOf(client), 0);
});

test("the ticked same-day bookings complete together, and the whole remainder is owed", async () => {
  const client = clientFor("Ticked");
  const a = bookAt(client, `'${athensDay()} 23:58:00+02'::timestamptz`, 50);
  const b = bookAt(client, `'${athensDay()} 23:59:00+02'::timestamptz`, 50);
  const r = await payPart(client, a, 50, { appointment_ids: [a, b] });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(statusOf(a), "completed paid");
  assert.match(statusOf(b), /^completed /);
  assert.equal(r.data.new_balance, 50);
});

test("a no-show paid in part stays a no-show", async () => {
  const client = clientFor("Noshow");
  const appt = bookAt(client, "NOW() - INTERVAL '2 days'");
  sql(DB, `UPDATE appointments SET status = 'no-show' WHERE id = '${appt}'`);
  assert.equal((await payPart(client, appt, 10)).status, 200);
  assert.match(statusOf(appt), /^no-show /);
});
