// Shared places (staff.capacity, e.g. ΣΑΟΥΝΑ with 5): persons per service
// row, and over_capacity unless booked anyway.
//
// Run: node --test tests/server/capacity.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { SHOP, api, createTestDb, dropTestDb, sql, startServer, token } from "../offline/helpers.mjs";

const DB = "capacity_test";
const PORT = 3189;
let server;
let call;
const ids = {};
let day = 0;
// Each test gets its own far-future day nobody has booked.
const nextDay = () => `2027-05-${String(10 + day++).padStart(2, "0")}`;
const at = (date, hhmm) => `${date}T${hhmm}:00+03:00`;
const row = (staffId, start, persons = 1, minutes = 60) => ({
  service_id: ids.service,
  staff_id: staffId,
  start_time: start,
  duration_override: minutes,
  price_override: 15,
  persons,
});
// A new client per booking: the same client at the same time and staff
// would be taken as the same booking again (createAppointmentSeries).
let clients = 0;
const newClient = () =>
  sql(DB, `INSERT INTO clients (first_name, last_name, shop_id) VALUES ('Capacity', 'Test ${++clients}', '${SHOP}') RETURNING id`).split("\n")[0];
const book = (services, extra = {}) =>
  call("POST", "/api/v1/appointments", {
    client_id: newClient(),
    status: "confirmed",
    save_receipt: true,
    allow_unavailable: true,
    services,
    ...extra,
  });
const bookOk = async (services, extra) => {
  const r = await book(services, extra);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data.id;
};

before(async () => {
  const uri = createTestDb(DB);
  ids.admin = sql(DB, `SELECT id FROM users WHERE shop_id = '${SHOP}' AND role = 'admin' LIMIT 1`);
  ids.service = sql(DB, `SELECT id FROM services WHERE shop_id = '${SHOP}' AND is_active AND price > 0 ORDER BY id LIMIT 1`);
  ids.ordinary = sql(DB, `INSERT INTO staff (name, shop_id) VALUES ('Capacity Ordinary', '${SHOP}') RETURNING id`).split("\n")[0];
  server = await startServer(uri, PORT);
  call = api(PORT, token(ids.admin, "admin"));
  // After the start, so the migration has run.
  ids.sauna = sql(DB, `SELECT id FROM staff WHERE shop_id = '${SHOP}' AND trim(name) = 'ΣΑΟΥΝΑ' LIMIT 1`);
});
after(() => {
  server?.stop();
  dropTestDb(DB);
});

test("the migration gives ΣΑΟΥΝΑ 5 places, everyone else 1", async () => {
  assert.ok(ids.sauna, "ΣΑΟΥΝΑ exists in the dev data");
  const staff = (await call("GET", "/api/v1/staff")).data;
  assert.equal(staff.find((s) => s.id === ids.sauna).capacity, 5);
  assert.equal(staff.find((s) => s.id === ids.ordinary).capacity, 1);
});

test("persons are saved and returned", async () => {
  const date = nextDay();
  const id = await bookOk([row(ids.sauna, at(date, "10:00"), 3)]);
  const list = (await call("GET", `/api/v1/appointments?date=${date}`)).data;
  assert.equal(list.find((a) => a.id === id).services[0].persons, 3);
});

test("up to the places is fine; one more is over_capacity, unless booked anyway", async () => {
  const date = nextDay();
  await bookOk([row(ids.sauna, at(date, "10:00"), 2)]);
  await bookOk([row(ids.sauna, at(date, "10:30"), 2)]);
  await bookOk([row(ids.sauna, at(date, "10:15"), 1)]);
  const r = await book([row(ids.sauna, at(date, "10:45"), 1)]);
  assert.equal(r.status, 409);
  assert.equal(r.data.error, "over_capacity");
  assert.equal(r.data.persons, 6);
  assert.equal(r.data.capacity, 5);
  assert.equal(r.data.staff_name.trim(), "ΣΑΟΥΝΑ");
  await bookOk([row(ids.sauna, at(date, "10:45"), 1)], { allow_over_capacity: true });
});

test("only persons there at the same moment count", async () => {
  const date = nextDay();
  await bookOk([row(ids.sauna, at(date, "10:00"), 5)]);
  // Starts when the others leave.
  await bookOk([row(ids.sauna, at(date, "11:00"), 5)]);
  const r = await book([row(ids.sauna, at(date, "10:30"), 1)]);
  assert.equal(r.data.error, "over_capacity");
});

test("cancelled bookings free their places", async () => {
  const date = nextDay();
  const id = await bookOk([row(ids.sauna, at(date, "10:00"), 5)]);
  assert.equal((await book([row(ids.sauna, at(date, "10:00"))])).status, 409);
  assert.equal((await call("POST", `/api/v1/appointments/${id}/cancel`)).status, 200);
  await bookOk([row(ids.sauna, at(date, "10:00"))]);
});

test("editing something else on a full booking doesn't ask; more persons does", async () => {
  const date = nextDay();
  await bookOk([row(ids.sauna, at(date, "10:00"), 4)]);
  const services = [row(ids.sauna, at(date, "10:00"), 1)];
  const clientId = newClient();
  const id = await bookOk(services, { client_id: clientId });
  const edit = (svcs, extra = {}) =>
    call("PUT", `/api/v1/appointments/${id}`, {
      client_id: clientId,
      save_receipt: true,
      status: "confirmed",
      allow_overtime: true,
      internal_notes: "edited",
      services: svcs,
      ...extra,
    });
  assert.equal((await edit(services)).status, 200);
  const more = await edit([row(ids.sauna, at(date, "10:00"), 2)]);
  assert.equal(more.status, 409);
  assert.equal(more.data.error, "over_capacity");
  assert.equal((await edit([row(ids.sauna, at(date, "10:00"), 2)], { allow_over_capacity: true })).status, 200);
});

test("ordinary staff: overlaps are allowed as before", async () => {
  const date = nextDay();
  await bookOk([row(ids.ordinary, at(date, "10:00"), 1)]);
  await bookOk([row(ids.ordinary, at(date, "10:00"), 1)]);
});

test("offline: sauna overlaps sync while there's room; over is a conflict that keep mine resolves", async () => {
  const date = nextDay();
  const other = await bookOk([row(ids.sauna, at(date, "10:00"), 3)]);
  // Another booking made online meanwhile — not in the device's known overlaps.
  await bookOk([row(ids.sauna, at(date, "10:00"), 1)]);
  await bookOk([row(ids.sauna, at(date, "10:00"), 1)], { offline_known_overlaps: [other] });
  const over = await book([row(ids.sauna, at(date, "10:00"), 1)], { offline_known_overlaps: [other] });
  assert.equal(over.status, 409);
  assert.equal(over.data.error, "over_capacity");
  await bookOk([row(ids.sauna, at(date, "10:00"), 1)], { offline_known_overlaps: [other], force: true });
});

test("repeat bookings aren't checked", async () => {
  const date = nextDay();
  await bookOk([row(ids.sauna, at(date, "10:00"), 5)]);
  await bookOk([row(ids.sauna, at(date, "10:00"), 1)], { instance_starts: [at(date, "10:00")] });
});

test("places are set in the staff form", async () => {
  const r = await call("PUT", `/api/v1/staff/${ids.ordinary}`, { first_name: "Capacity", last_name: "Ordinary", capacity: 3 });
  assert.equal(r.status, 200);
  assert.equal(sql(DB, `SELECT capacity FROM staff WHERE id = '${ids.ordinary}'`), "3");
  // An older screen that doesn't send it keeps what's stored.
  await call("PUT", `/api/v1/staff/${ids.ordinary}`, { first_name: "Capacity", last_name: "Ordinary" });
  assert.equal(sql(DB, `SELECT capacity FROM staff WHERE id = '${ids.ordinary}'`), "3");
});
