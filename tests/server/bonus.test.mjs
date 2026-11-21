// The staff bonus report and rules: who may see and change them, which
// bookings count (completed ones, by shop day), and a rule kept from its date.
//
// Run: node --test tests/server/bonus.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { SHOP, api, createTestDb, dropTestDb, sql, startServer, token } from "../offline/helpers.mjs";

const DB = "bonus_test";
const PORT = 3216;
let server;
let admin;
let frontdesk;
const ids = {};

// A booking with one service for the test staff member, in shop time.
const book = (local, minutes, price, status = "completed", staffId = ids.staff, serviceId = ids.service) => {
  const appt = sql(
    DB,
    `INSERT INTO appointments (client_id, status, shop_id) VALUES ('${ids.client}', '${status}', '${SHOP}') RETURNING id`,
  ).split("\n")[0];
  sql(
    DB,
    `INSERT INTO appointment_services (appointment_id, service_id, staff_id, start_time, duration_override, price_override, shop_id)
     VALUES ('${appt}', '${serviceId}', '${staffId}', TIMESTAMP '${local}' AT TIME ZONE 'Europe/Athens', ${minutes}, ${price}, '${SHOP}')`,
  );
  return appt;
};
const report = async (from, to, as = admin) => as("GET", `/api/v1/reports/bonus?from=${from}&to=${to}`);
const mine = (r) => r.data.staff.find((s) => s.staff_id === ids.staff);

before(async () => {
  const uri = createTestDb(DB);
  server = await startServer(uri, PORT);
  const adminId = sql(DB, `SELECT id FROM users WHERE shop_id = '${SHOP}' AND role = 'admin' LIMIT 1`);
  admin = api(PORT, token(adminId, "admin"));
  frontdesk = api(PORT, token(adminId, "frontdesk"));
  ids.staff = sql(DB, `INSERT INTO staff (name, shop_id) VALUES ('Bonus Tester', '${SHOP}') RETURNING id`).split("\n")[0];
  ids.place = sql(DB, `INSERT INTO staff (name, shop_id, capacity) VALUES ('Bonus Place', '${SHOP}', 4) RETURNING id`).split("\n")[0];
  ids.client = sql(DB, `INSERT INTO clients (first_name, last_name, shop_id) VALUES ('Bonus', 'Client', '${SHOP}') RETURNING id`).split("\n")[0];
  ids.service = sql(DB, `SELECT id FROM services WHERE shop_id = '${SHOP}' ORDER BY id LIMIT 1`);
});
after(() => {
  server?.stop();
  dropTestDb(DB);
});

test("after 5 hours of completed services in a day, 10% of the price of the time past them", async () => {
  book("2030-03-04 09:00", 120, 40);
  book("2030-03-04 11:00", 120, 40);
  book("2030-03-04 13:00", 90, 45); // crosses at 5h: 30 of 90 minutes past, €1.50
  book("2030-03-04 14:30", 60, 30); // €3
  // Not completed: don't count towards the hours or the bonus.
  book("2030-03-04 15:30", 60, 100, "confirmed");
  book("2030-03-04 16:30", 60, 100, "cancelled");
  book("2030-03-04 17:30", 60, 100, "no-show");

  const r = await report("2030-03-04", "2030-03-04");
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const row = mine(r);
  assert.deepEqual([row.days_worked, row.minutes, row.extra_minutes, row.bonus], [1, 390, 90, 4.5]);
  assert.deepEqual(row.days[0].services.map((s) => s.bonus), [1.5, 3]);
});

test("the day is the shop's day: a service late in the evening stays on that day", async () => {
  book("2030-03-05 19:00", 300, 50);
  book("2030-03-05 23:30", 60, 40); // 00:30 the next day, but started on the 5th
  const row = mine(await report("2030-03-05", "2030-03-05"));
  assert.equal(row.bonus, 4);
  assert.equal(mine(await report("2030-03-06", "2030-03-06")), undefined);
});

test("a changed rule applies from its date; earlier days keep the old one", async () => {
  book("2030-04-01 09:00", 360, 60); // 1h past of 6h at €60: €1 at 10%
  book("2030-04-02 09:00", 360, 60);
  const saved = await admin("POST", `/api/v1/staff/${ids.staff}/bonus-rules`, { effective_from: "2030-04-02", enabled: true, threshold_minutes: 240, percent: 15 });
  assert.equal(saved.status, 201, JSON.stringify(saved.data));
  const row = mine(await report("2030-04-01", "2030-04-02"));
  // The 2nd: 2h past of 6h at 15% of €60 = €3.
  assert.deepEqual(row.days.map((d) => [d.date, d.percent, d.bonus]), [["2030-04-01", 10, 1], ["2030-04-02", 15, 3]]);

  // The same date again replaces that rule rather than adding a second.
  await admin("POST", `/api/v1/staff/${ids.staff}/bonus-rules`, { effective_from: "2030-04-02", enabled: false, threshold_minutes: 240, percent: 15 });
  const rules = (await admin("GET", `/api/v1/staff/${ids.staff}/bonus-rules`)).data.rules;
  assert.equal(rules.filter((x) => x.effective_from === "2030-04-02").length, 1);
  assert.deepEqual(mine(await report("2030-04-01", "2030-04-02")).days.map((d) => d.date), ["2030-04-01"], "off from the 2nd");

  const removed = await admin("DELETE", `/api/v1/staff/${ids.staff}/bonus-rules/${rules[0].id}`);
  assert.equal(removed.status, 200);
  assert.equal(mine(await report("2030-04-02", "2030-04-02")).bonus, 1, "back to the default");
});

test("shared places get no bonus unless an admin turns it on", async () => {
  book("2030-05-01 09:00", 600, 100, "completed", ids.place);
  const place = (r) => r.data.staff.find((s) => s.staff_id === ids.place);
  assert.equal(place(await report("2030-05-01", "2030-05-01")), undefined);
  const current = (await admin("GET", `/api/v1/staff/${ids.place}/bonus-rules`)).data.current;
  assert.equal(current.enabled, false);
  await admin("POST", `/api/v1/staff/${ids.place}/bonus-rules`, { effective_from: "2030-01-01", enabled: true, threshold_minutes: 300, percent: 10 });
  assert.equal(place(await report("2030-05-01", "2030-05-01")).bonus, 5);
});

test("admins only, with the password retyped for the report; bad input is refused", async () => {
  assert.equal((await report("2030-03-04", "2030-03-04", frontdesk)).status, 403);
  assert.equal((await frontdesk("GET", `/api/v1/staff/${ids.staff}/bonus-rules`)).status, 403);
  assert.equal((await frontdesk("POST", `/api/v1/staff/${ids.staff}/bonus-rules`, { effective_from: "2030-01-01", threshold_minutes: 300, percent: 10 })).status, 403);
  const bare = api(PORT, token(sql(DB, `SELECT id FROM users WHERE shop_id = '${SHOP}' AND role = 'admin' LIMIT 1`), "admin"), { reauth: false });
  assert.equal((await report("2030-03-04", "2030-03-04", bare)).data.error, "reauth_required");

  assert.equal((await report("2030-03", "2030-03-04")).status, 400);
  assert.equal((await report("2030-03-05", "2030-03-04")).status, 400);
  const bad = (body) => admin("POST", `/api/v1/staff/${ids.staff}/bonus-rules`, { effective_from: "2030-01-01", threshold_minutes: 300, percent: 10, ...body });
  assert.equal((await bad({ percent: 101 })).status, 400);
  assert.equal((await bad({ threshold_minutes: -1 })).status, 400);
  assert.equal((await bad({ effective_from: "soon" })).status, 400);
  // Days that don't exist are refused, not an error 500.
  assert.equal((await bad({ effective_from: "2030-02-30" })).status, 400);
  assert.equal((await report("2030-02-30", "2030-03-04")).status, 400);
  assert.equal((await report("2030-11-01", "2030-11-31")).status, 400);
  assert.equal((await report("2028-02-29", "2028-02-29")).status, 200, "a leap day is a day");
  assert.equal((await admin("GET", "/api/v1/staff/00000000-0000-4000-8000-000000000000/bonus-rules")).status, 404);
});

test("the gift-card column ΔΩΡΟΚΑΡΤΑ gets no bonus from the start", async () => {
  const id = sql(DB, `SELECT id FROM staff WHERE shop_id = '${SHOP}' AND trim(name) = 'ΔΩΡΟΚΑΡΤΑ' LIMIT 1`);
  assert.ok(id, "ΔΩΡΟΚΑΡΤΑ exists in the dev data");
  book("2030-06-01 09:00", 600, 100, "completed", id);
  const r = await report("2030-06-01", "2030-06-01");
  assert.equal(r.data.staff.find((s) => s.staff_id === id), undefined);
});

test("a rule can pay a fixed amount per extra hour; overlapping time counts once", async () => {
  const saved = await admin("POST", `/api/v1/staff/${ids.staff}/bonus-rules`, {
    effective_from: "2030-07-01", enabled: true, kind: "per_hour", threshold_minutes: 240, amount_per_hour: 4,
  });
  assert.equal(saved.status, 201, JSON.stringify(saved.data));
  book("2030-07-01 09:00", 240, 500);
  book("2030-07-01 13:00", 60, 0);
  book("2030-07-01 13:00", 90, 0); // overlaps the one before: 13:00–14:30 is 1.5h, not 2.5h
  const row = mine(await report("2030-07-01", "2030-07-01"));
  assert.deepEqual([row.days[0].kind, row.minutes, row.extra_minutes, row.bonus], ["per_hour", 330, 90, 6]);
  // A per-hour rule needs its amount.
  assert.equal((await admin("POST", `/api/v1/staff/${ids.staff}/bonus-rules`, { effective_from: "2030-07-02", kind: "per_hour", threshold_minutes: 240 })).status, 400);
});

test("product commission: only staff with it on are offered as sellers; the seller earns it on the day of the sale", async () => {
  const product = sql(DB, `SELECT pi.id FROM product_inventory pi JOIN products p ON p.id = pi.product_id WHERE p.shop_id = '${SHOP}' LIMIT 1`);
  assert.ok(product, "the dev database has a product");
  sql(DB, `UPDATE product_inventory SET stock_quantity = 100 WHERE id = '${product}'`);
  const seller = sql(DB, `INSERT INTO staff (name, shop_id) VALUES ('Product Seller', '${SHOP}') RETURNING id`).split("\n")[0];

  const offered = async () => (await frontdesk("GET", "/api/v1/product-sellers")).data.map((s) => s.id);
  assert.ok(!(await offered()).includes(seller), "off until an admin turns it on");
  assert.equal((await frontdesk("POST", `/api/v1/staff/${seller}/product-commission-rules`, { effective_from: "2020-01-01", percent: 10 })).status, 403);
  const on = await admin("POST", `/api/v1/staff/${seller}/product-commission-rules`, { effective_from: "2020-01-01", enabled: true, percent: 10 });
  assert.equal(on.status, 201, JSON.stringify(on.data));
  assert.ok((await offered()).includes(seller));

  // Sold today in a booking for another therapist, with the seller picked.
  const services = [{ service_id: ids.service, staff_id: ids.staff, start_time: "2030-08-01T10:00:00+03:00", duration_override: 30, price_override: 20 }];
  const made = await frontdesk("POST", "/api/v1/appointments", {
    client_id: ids.client, status: "confirmed", save_receipt: true, allow_unavailable: true, services,
    products: [{ product_id: product, quantity: 2, price: 12.5, staff_id: seller }],
  });
  assert.equal(made.status, 200, JSON.stringify(made.data));
  const saleOf = () => sql(DB, `SELECT staff_id || ' ' || sale_date FROM product_sales WHERE appointment_id = '${made.data.id}'`);
  const first = saleOf();
  assert.ok(first.startsWith(seller), "stored with the seller picked, not the therapist");

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens" }).format(new Date());
  const row = (await report(today, today)).data.staff.find((s) => s.staff_id === seller);
  assert.deepEqual([row.products_bonus, row.products[0].total_price], [2.5, 25], "10% of the €25 it sold for, the booking not even done");

  // An edit keeps the sale's date and seller, also from a screen that doesn't send the seller.
  sql(DB, `UPDATE product_sales SET sale_date = sale_date - INTERVAL '3 days' WHERE appointment_id = '${made.data.id}'`);
  const before = saleOf();
  const edit = (products) =>
    frontdesk("PUT", `/api/v1/appointments/${made.data.id}`, { client_id: ids.client, status: "confirmed", save_receipt: true, allow_unavailable: true, services, products });
  assert.equal((await edit([{ product_id: product, quantity: 2, price: 12.5 }])).status, 200);
  assert.equal(saleOf(), before, "same seller and day after the edit");
  // Picking nobody leaves it without a seller; a seller from elsewhere is stored as none.
  assert.equal((await edit([{ product_id: product, quantity: 2, price: 12.5, staff_id: null }])).status, 200);
  assert.equal(sql(DB, `SELECT staff_id IS NULL FROM product_sales WHERE appointment_id = '${made.data.id}'`), "t", "no seller");
  assert.equal((await edit([{ product_id: product, quantity: 2, price: 12.5, staff_id: "00000000-0000-4000-8000-000000000123" }])).status, 200);
  assert.equal(sql(DB, `SELECT staff_id IS NULL FROM product_sales WHERE appointment_id = '${made.data.id}'`), "t");

  // A booking from an older screen (no seller sent) still gets the therapist, as before.
  const old = await frontdesk("POST", "/api/v1/appointments", {
    client_id: ids.client, status: "confirmed", save_receipt: true, allow_unavailable: true,
    services: [{ ...services[0], start_time: "2030-08-02T10:00:00+03:00" }], products: [{ product_id: product, quantity: 1, price: 5 }],
  });
  assert.equal(sql(DB, `SELECT staff_id FROM product_sales WHERE appointment_id = '${old.data.id}'`), ids.staff);
});

test("product commission is on the profit over the bulk price with VAT, as it was when sold", async () => {
  // A product of its own, so the other tests' sales don't get its bulk price.
  const created = await frontdesk("POST", "/api/v1/products", {
    name: "Bulk Test Oil", description: "", variations: [{ variation_name: "100ml", price: 30, stock_quantity: 50 }],
  });
  assert.equal(created.status, 200, JSON.stringify(created.data));
  const productId = created.data.productId;
  const variation = sql(DB, `SELECT id FROM product_inventory WHERE product_id = '${productId}'`);
  assert.equal(sql(DB, `SELECT bulk_price IS NULL FROM product_inventory WHERE id = '${variation}'`), "t", "none until filled in");

  const seller = sql(DB, `INSERT INTO staff (name, shop_id) VALUES ('Bulk Seller', '${SHOP}') RETURNING id`).split("\n")[0];
  await admin("POST", `/api/v1/staff/${seller}/product-commission-rules`, { effective_from: "2020-01-01", enabled: true, percent: 10 });
  const services = [{ service_id: ids.service, staff_id: ids.staff, start_time: "2030-09-01T10:00:00+03:00", duration_override: 30, price_override: 20 }];
  // Each sale in a booking of its own, a day apart (bookings mustn't overlap).
  let nextDay = 1;
  const sell = async (price) => {
    const made = await frontdesk("POST", "/api/v1/appointments", {
      client_id: ids.client, status: "confirmed", save_receipt: true, allow_unavailable: true,
      services: [{ ...services[0], start_time: `2030-09-${String(nextDay++).padStart(2, "0")}T10:00:00+03:00` }],
      products: [{ product_id: variation, quantity: 1, price, staff_id: seller }],
    });
    assert.equal(made.status, 200, JSON.stringify(made.data));
    return made;
  };
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens" }).format(new Date());
  const sales = async () => (await report(today, today)).data.staff.find((s) => s.staff_id === seller).products;

  // Sold before a bulk price was filled in: on the full price, until one is.
  const early = await sell(30);
  assert.deepEqual((await sales()).map((p) => p.bonus), [3]);

  const save = (bulk_price, extra = {}) =>
    frontdesk("PUT", `/api/v1/products/${productId}`, {
      name: "Bulk Test Oil", description: "", variations: [{ id: variation, variation_name: "100ml", price: 30, stock_quantity: 49, ...extra, ...(bulk_price === undefined ? {} : { bulk_price }) }],
    });
  assert.equal((await save(-1)).status, 400);
  assert.equal((await save(15)).status, 200);
  const listed = (await frontdesk("GET", "/api/v1/products")).data.find((p) => p.id === productId);
  assert.equal(Number(listed.variations[0].bulk_price), 15, "frontdesk sees and edits it");
  assert.deepEqual((await sales()).map((p) => [p.cost, p.base, p.bonus]), [[18.6, 11.4, 1.14]], "the earlier sale gets it when it's first filled in");

  // A later change applies to new sales only; an edit of a booking keeps its sale's price.
  assert.equal((await save(20)).status, 200);
  assert.equal((await save(undefined)).status, 200, "a screen that doesn't send it keeps it");
  assert.equal(sql(DB, `SELECT bulk_price FROM product_inventory WHERE id = '${variation}'`), "20.00");
  await sell(25);
  const edited = await frontdesk("PUT", `/api/v1/appointments/${early.data.id}`, {
    client_id: ids.client, status: "confirmed", save_receipt: true, allow_unavailable: true, services,
    products: [{ product_id: variation, quantity: 1, price: 30 }],
  });
  assert.equal(edited.status, 200, JSON.stringify(edited.data));
  const now = (await sales()).sort((a, b) => b.total_price - a.total_price);
  assert.deepEqual(now.map((p) => [p.cost, p.bonus]), [[18.6, 1.14], [24.8, 0.02]]);

  // Sold below cost: nothing. Clearing the bulk price leaves past sales as they are.
  await sell(20);
  assert.ok((await sales()).some((p) => p.total_price === 20 && p.bonus === 0));
  assert.equal((await save(null)).status, 200);
  assert.equal(sql(DB, `SELECT bulk_price IS NULL FROM product_inventory WHERE id = '${variation}'`), "t");
  assert.equal(sql(DB, `SELECT count(*) FROM product_sales WHERE inventory_id = '${variation}' AND unit_bulk_price IS NULL`), "0");
});

test("a redemption counts at the price of the service it stands for, as it was when booked", async () => {
  const serviceId = (name) => sql(DB, `SELECT id FROM services WHERE shop_id = '${SHOP}' AND trim(name) = '${name}' LIMIT 1`);
  const holistic = serviceId("ΕΞΑΓΥΡΩΣΗ HOLISTIC");
  const hotStones = serviceId("ΕΞΑΓΥΡΩΣΗ HOT STONES");
  assert.ok(holistic && hotStones, "the redemptions exist in the dev data");
  // The migration links exact name matches only.
  assert.equal(sql(DB, `SELECT b.name || ' ' || b.price FROM services r JOIN services b ON b.id = r.bonus_service_id WHERE r.id = '${holistic}'`), "HOLISTIC 32.00");
  assert.equal(sql(DB, `SELECT bonus_service_id IS NULL FROM services WHERE id = '${hotStones}'`), "t");

  // Linked in the service form; only a redemption, and not to another redemption.
  const hotStonesMassage = serviceId("Hot Stones Massage");
  const put = (id, body) => admin("PUT", `/api/v1/services/${id}`, { name: "ΕΞΑΓΥΡΩΣΗ HOT STONES", duration_minutes: 60, price: 0, category: "Εξαργύρωση", ...body });
  assert.equal((await put(hotStones, { bonus_service_id: holistic })).status, 200);
  assert.equal(sql(DB, `SELECT bonus_service_id IS NULL FROM services WHERE id = '${hotStones}'`), "t", "not to a redemption");
  assert.equal((await put(hotStones, { bonus_service_id: hotStonesMassage })).status, 200);
  assert.equal(sql(DB, `SELECT bonus_service_id FROM services WHERE id = '${hotStones}'`), hotStonesMassage);
  assert.equal((await put(hotStones, {})).status, 200);
  assert.equal(sql(DB, `SELECT bonus_service_id FROM services WHERE id = '${hotStones}'`), hotStonesMassage, "an older screen keeps the link");

  // Booked after 5 hours of work for a staff member on the 10% rule.
  const staffId = sql(DB, `INSERT INTO staff (name, shop_id) VALUES ('Redemption Tester', '${SHOP}') RETURNING id`).split("\n")[0];
  book("2030-09-02 09:00", 300, 0, "completed", staffId);
  const line = { service_id: holistic, staff_id: staffId, start_time: "2030-09-02T14:00:00+03:00", duration_override: 60, price_override: 0 };
  const made = await admin("POST", "/api/v1/appointments", { client_id: ids.client, status: "completed", save_receipt: true, allow_unavailable: true, services: [line] });
  assert.equal(made.status, 200, JSON.stringify(made.data));
  const value = () => sql(DB, `SELECT bonus_value FROM appointment_services WHERE appointment_id = '${made.data.id}'`);
  assert.equal(value(), "32.00");

  // A later price change doesn't change it, even when the booking is edited.
  const regular = serviceId("HOLISTIC");
  sql(DB, `UPDATE services SET price = 50 WHERE id = '${regular}'`);
  const edited = await admin("PUT", `/api/v1/appointments/${made.data.id}`, { client_id: ids.client, status: "completed", save_receipt: true, allow_unavailable: true, services: [line], products: [] });
  assert.equal(edited.status, 200, JSON.stringify(edited.data));
  assert.equal(value(), "32.00");

  const row = (await report("2030-09-02", "2030-09-02")).data.staff.find((s) => s.staff_id === staffId);
  const earned = row.days[0].services[0];
  assert.deepEqual([earned.is_redemption, earned.price, earned.bonus], [true, 32, 3.2]);
  sql(DB, `UPDATE services SET price = 32 WHERE id = '${regular}'`);
});

test("a sales target pays the highest step reached in the month; review counts pay front desk per new review", async () => {
  const seller = sql(DB, `INSERT INTO staff (name, shop_id) VALUES ('Target Tester', '${SHOP}') RETURNING id`).split("\n")[0];
  const desk = sql(DB, `INSERT INTO staff (name, shop_id) VALUES ('Desk Tester', '${SHOP}') RETURNING id`).split("\n")[0];
  const rules = (id, kind, body) => admin("POST", `/api/v1/staff/${id}/${kind}`, { effective_from: "2031-01-01", ...body });

  // Bad steps are refused; the steps are kept lowest target first.
  assert.equal((await rules(seller, "target-rules", { enabled: true, steps: [] })).status, 400);
  assert.equal((await rules(seller, "target-rules", { enabled: true, steps: [{ target: 0, bonus: 10 }] })).status, 400);
  assert.equal((await rules(seller, "target-rules", { enabled: true, steps: [{ target: 100, bonus: 1 }, { target: 100, bonus: 2 }] })).status, 400);
  assert.equal((await frontdesk("POST", `/api/v1/staff/${seller}/target-rules`, { effective_from: "2031-01-01", steps: [{ target: 1, bonus: 1 }] })).status, 403);
  const saved = await rules(seller, "target-rules", { enabled: true, steps: [{ target: 150, bonus: 50 }, { target: 100, bonus: 20 }] });
  assert.equal(saved.status, 201, JSON.stringify(saved.data));
  assert.deepEqual(saved.data.rules[0].steps, [{ target: 100, bonus: 20 }, { target: 150, bonus: 50 }]);
  assert.equal((await rules(desk, "review-rules", { enabled: true, amount_per_review: 3 })).status, 201);
  assert.equal((await rules(desk, "review-rules", { enabled: true, amount_per_review: -1 })).status, 400);

  // January: €120 of completed services (one cancelled booking doesn't count) → the €100 step.
  book("2031-01-10 10:00", 60, 70, "completed", seller);
  book("2031-01-20 10:00", 60, 50, "completed", seller);
  book("2031-01-21 10:00", 60, 500, "cancelled", seller);
  // Review counts: refused when the end is below the start, or as frontdesk.
  const counts = (month, body, as = admin) => as("PUT", `/api/v1/reports/bonus/reviews/${month}`, body);
  assert.equal((await counts("2031-01", { start_count: 50, end_count: 40 })).status, 400);
  assert.equal((await counts("2031-13", { start_count: 1, end_count: 2 })).status, 400);
  assert.equal((await counts("2031-01", { start_count: 1, end_count: 2 }, frontdesk)).status, 403);
  assert.equal((await counts("2031-01", { start_count: 40, end_count: 47 })).status, 200);
  assert.equal((await counts("2031-02", { start_count: 47, end_count: null })).status, 200);

  // A report on part of January still counts the whole month for the target.
  const r = (await report("2031-01-01", "2031-02-28")).data;
  assert.deepEqual(r.review_months, [
    { month: "2031-01", start_count: 40, end_count: 47 },
    { month: "2031-02", start_count: 47, end_count: null },
  ]);
  const of = (id) => r.staff.find((s) => s.staff_id === id);
  assert.deepEqual(of(seller).targets.map((m) => [m.month, m.sales, m.bonus]), [["2031-01", 120, 20], ["2031-02", 0, 0]]);
  assert.equal(of(seller).target_bonus, 20);
  assert.deepEqual(of(desk).reviews.map((m) => [m.month, m.reviews, m.bonus]), [["2031-01", 7, 21], ["2031-02", null, 0]]);
  assert.equal(of(desk).bonus, 21);
  const part = (await report("2031-01-15", "2031-01-31")).data.staff.find((s) => s.staff_id === seller);
  assert.equal(part.targets[0].sales, 120, "the whole month, not only the 15th on");
});

test("laser by the hour, a deduction per service and a fixed short last service; aestheticians set up by the migration", async () => {
  // The migration made ΕΥΗ's (Αισθητικός) per-hour rule: percent, laser at €4 an hour, €15 off, €2.20 last.
  const evi = sql(DB, `SELECT laser_amount_per_hour || ' ' || deduction_per_service || ' ' || last_service_fixed || ' ' || kind FROM staff_bonus_rules r JOIN staff st ON st.id = r.staff_id WHERE st.shop_id = '${SHOP}' AND upper(st.specialty) LIKE '%ΑΙΣΘΗΤΙΚ%' ORDER BY r.effective_from LIMIT 1`);
  assert.equal(evi, "4.00 15.00 2.20 percent");

  const member = sql(DB, `INSERT INTO staff (name, shop_id) VALUES ('Laser Tester', '${SHOP}') RETURNING id`).split("\n")[0];
  const service = (name, category) =>
    sql(DB, `INSERT INTO services (name, category, duration_minutes, price, shop_id) VALUES ('${name}', '${category}', 60, 50, '${SHOP}') RETURNING id`).split("\n")[0];
  const laser = service("Αποτρίχωση test", "Λειζερ");
  const facial = service("Facial test", "Πρόσωπο");
  const rule = (body) => admin("POST", `/api/v1/staff/${member}/bonus-rules`, { effective_from: "2032-01-01", enabled: true, kind: "percent", threshold_minutes: 240, percent: 10, ...body });
  assert.equal((await rule({ laser_amount_per_hour: -1 })).status, 400);
  const saved = await rule({ laser_amount_per_hour: 4, deduction_per_service: 15, last_service_fixed: 2.2 });
  assert.equal(saved.status, 201, JSON.stringify(saved.data));
  assert.deepEqual(
    [saved.data.rules[0].laser_amount_per_hour, saved.data.rules[0].deduction_per_service, saved.data.rules[0].last_service_fixed],
    [4, 15, 2.2],
  );

  // 3h laser, a 2h €45 facial (1h past 4h), 1h laser, then a 30-min €45 facial last.
  book("2032-01-05 09:00", 180, 300, "completed", member, laser);
  book("2032-01-05 12:00", 120, 45, "completed", member, facial);
  book("2032-01-05 14:00", 60, 70, "completed", member, laser);
  book("2032-01-05 15:00", 30, 45, "completed", member, facial);
  const day = (await report("2032-01-05", "2032-01-05")).data.staff.find((s) => s.staff_id === member).days[0];
  assert.deepEqual(day.services.map((s) => [s.how, s.extra_minutes, s.bonus]), [
    ["percent", 60, 1.5],
    ["laser", 60, 4],
    ["last", 30, 2.2],
  ]);
  assert.equal(day.bonus, 7.7);

  // Empty amounts switch them off: everything by percent of the full price.
  await rule({ laser_amount_per_hour: null, deduction_per_service: 0, last_service_fixed: null });
  const plain = (await report("2032-01-05", "2032-01-05")).data.staff.find((s) => s.staff_id === member).days[0];
  assert.deepEqual(plain.services.map((s) => s.bonus), [2.25, 7, 4.5]);
});
