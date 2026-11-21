// A combination with a price on each part (Holistic 28 + Sauna & scrub 7 =
// 35): saving it, and booked lines remembering the combination they came
// from. CP1–CP4 and CP8 in test-report.html.
//
// Run: node --test tests/server/comboPrices.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { SHOP, api, createTestDb, dropTestDb, sql, startServer, token } from "../offline/helpers.mjs";

const DB = "combo_prices_test";
const PORT = 3186;
let server;
let admin;
const ids = {};

const serviceById = async (id) => (await admin("GET", "/api/v1/services")).data.find((s) => s.id === id);
const comboBody = (parts, extra = {}) => ({
  name: "Holistic + Sauna offer",
  duration_minutes: 90,
  price: 99,
  category: "Combo tests",
  combo_parts: parts,
  ...extra,
});

before(async () => {
  const uri = createTestDb(DB);
  server = await startServer(uri, PORT);
  admin = api(PORT, token(sql(DB, `SELECT id FROM users WHERE shop_id = '${SHOP}' AND role = 'admin' ORDER BY id LIMIT 1`), "admin"));
  ids.staff = sql(DB, `SELECT id FROM staff WHERE shop_id = '${SHOP}' AND is_active ORDER BY id LIMIT 1`);
  ids.client = sql(DB, `SELECT id FROM clients WHERE shop_id = '${SHOP}' ORDER BY id LIMIT 1`);
  for (const [key, name, price, minutes] of [["holistic", "Holistic test", 32, 60], ["sauna", "Sauna and scrub test", 8, 30]]) {
    const r = await admin("POST", "/api/v1/services", { name, duration_minutes: minutes, price, category: "Combo tests" });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    ids[key] = r.data.id;
  }
});
after(() => {
  server?.stop();
  dropTestDb(DB);
});

test("CP1 a price on every part: the combination costs their sum, whatever price was typed", async () => {
  const r = await admin("POST", "/api/v1/services", comboBody([{ id: ids.holistic, price: 28 }, { id: ids.sauna, price: 7 }]));
  assert.equal(r.status, 200, JSON.stringify(r.data));
  ids.combo = r.data.id;
  const combo = await serviceById(ids.combo);
  assert.equal(Number(combo.price), 35);
  assert.deepEqual(
    combo.combo_components.map((c) => [c.id, Number(c.combo_price), Number(c.price)]),
    [[ids.holistic, 28, 32], [ids.sauna, 7, 8]],
    "each part keeps its own normal price too",
  );
});

test("CP1 changing the part prices changes the combination's price", async () => {
  const r = await admin("PUT", `/api/v1/services/${ids.combo}`, comboBody([{ id: ids.holistic, price: 30.5 }, { id: ids.sauna, price: 6 }]));
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(Number((await serviceById(ids.combo)).price), 36.5);
});

test("CP2 some parts priced and others not is refused, and nothing changes", async () => {
  const r = await admin("PUT", `/api/v1/services/${ids.combo}`, comboBody([{ id: ids.holistic, price: 28 }, { id: ids.sauna, price: null }]));
  assert.equal(r.status, 400);
  assert.equal(r.data.error, "combo_prices_incomplete");
  assert.equal(Number((await serviceById(ids.combo)).price), 36.5);
});

test("CP3 a negative part price is refused", async () => {
  const r = await admin("PUT", `/api/v1/services/${ids.combo}`, comboBody([{ id: ids.holistic, price: 40 }, { id: ids.sauna, price: -5 }]));
  assert.equal(r.status, 400);
  assert.equal(r.data.error, "combo_price_invalid");
});

test("CP4 no part prices: works as before, with the price typed for the combination", async () => {
  const r = await admin("PUT", `/api/v1/services/${ids.combo}`, comboBody([{ id: ids.holistic, price: null }, { id: ids.sauna, price: null }], { price: 37 }));
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const combo = await serviceById(ids.combo);
  assert.equal(Number(combo.price), 37);
  assert.deepEqual(combo.combo_components.map((c) => c.combo_price), [null, null]);
});

test("CP4 a screen still sending only the parts' ids keeps working", async () => {
  const r = await admin("PUT", `/api/v1/services/${ids.combo}`, {
    ...comboBody(undefined, { price: 38 }),
    combo_parts: undefined,
    combo_component_ids: [ids.holistic, ids.sauna],
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const combo = await serviceById(ids.combo);
  assert.equal(Number(combo.price), 38);
  assert.equal(combo.combo_components.length, 2);
});

test("CP8 booked lines keep their prices and the combination they came from", async () => {
  const day = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
  const line = (serviceId, hhmm, minutes, price) => ({
    service_id: serviceId,
    staff_id: ids.staff,
    start_time: `${day}T${hhmm}:00+02:00`,
    duration_override: minutes,
    price_override: price,
    combo_service_id: ids.combo,
  });
  const made = await admin("POST", "/api/v1/appointments", {
    client_id: ids.client,
    status: "confirmed",
    save_receipt: true, // as the calendar sends it; only these are listed
    allow_unavailable: true,
    allow_overtime: true,
    services: [line(ids.holistic, "10:00", 60, 28), line(ids.sauna, "11:00", 30, 7)],
  });
  assert.equal(made.status, 200, JSON.stringify(made.data));
  const list = await admin("GET", `/api/v1/appointments?start=${day}T00:00:00Z&end=${day}T23:59:59Z`);
  const booking = list.data.find((a) => (a.services || []).some((s) => s.service_id === ids.holistic));
  assert.ok(booking, "the booking is listed");
  assert.deepEqual(
    booking.services.map((s) => [s.service_id, Number(s.charged), s.combo_service_id, s.combo_name]),
    [
      [ids.holistic, 28, ids.combo, "HOLISTIC + SAUNA OFFER"],
      [ids.sauna, 7, ids.combo, "HOLISTIC + SAUNA OFFER"],
    ],
  );
  assert.equal(Number(booking.total_cost), 35);
});

test("CP8 a line booked on its own has no combination", async () => {
  const day = new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10);
  const made = await admin("POST", "/api/v1/appointments", {
    client_id: ids.client,
    status: "confirmed",
    save_receipt: true, // as the calendar sends it; only these are listed
    allow_unavailable: true,
    allow_overtime: true,
    services: [{ service_id: ids.holistic, staff_id: ids.staff, start_time: `${day}T10:00:00+02:00`, duration_override: 60, price_override: 32 }],
  });
  assert.equal(made.status, 200, JSON.stringify(made.data));
  const list = await admin("GET", `/api/v1/appointments?start=${day}T00:00:00Z&end=${day}T23:59:59Z`);
  const line = list.data.flatMap((a) => a.services || []).find((s) => s.service_id === ids.holistic);
  assert.equal(line.combo_service_id, null);
  assert.equal(line.combo_name, null);
});
