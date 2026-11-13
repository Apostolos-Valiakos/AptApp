// Two people in one booking can be in a shared place (the sauna) at the same
// time: two identical sauna rows. An ordinary therapist can't do the same
// service twice at once, so that is refused with a clear answer, not a crash.
//
// Run: node --test tests/server/sharedPlaceRows.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { SHOP, api, createTestDb, dropTestDb, sql, startServer, token } from "../offline/helpers.mjs";

const DB = "shared_place_rows_test";
const PORT = 3214;
let server;
let call;
const ids = {};
let day = 0;
const nextDay = () => `2027-06-${String(10 + day++).padStart(2, "0")}`;
const at = (date, hhmm) => `${date}T${hhmm}:00+03:00`;
const row = (staffId, start, minutes = 30) => ({
  service_id: ids.service,
  staff_id: staffId,
  start_time: start,
  duration_override: minutes,
  price_override: 15,
  persons: 1,
});
let clients = 0;
const newClient = () =>
  sql(DB, `INSERT INTO clients (first_name, last_name, shop_id) VALUES ('Rows', 'Test ${++clients}', '${SHOP}') RETURNING id`).split("\n")[0];
const payload = (clientId, services, extra = {}) => ({
  client_id: clientId,
  status: "confirmed",
  save_receipt: true,
  allow_unavailable: true,
  allow_overtime: true,
  services,
  ...extra,
});

before(async () => {
  const uri = createTestDb(DB);
  ids.admin = sql(DB, `SELECT id FROM users WHERE shop_id = '${SHOP}' AND role = 'admin' LIMIT 1`);
  ids.service = sql(DB, `SELECT id FROM services WHERE shop_id = '${SHOP}' AND is_active AND price > 0 ORDER BY id LIMIT 1`);
  ids.place = sql(DB, `INSERT INTO staff (name, shop_id, capacity) VALUES ('Rows Place', '${SHOP}', 5) RETURNING id`).split("\n")[0];
  ids.therapist = sql(DB, `INSERT INTO staff (name, shop_id) VALUES ('Rows Therapist', '${SHOP}') RETURNING id`).split("\n")[0];
  server = await startServer(uri, PORT);
  call = api(PORT, token(ids.admin, "admin"));
});
after(() => {
  server?.stop();
  dropTestDb(DB);
});

test("two people in the sauna at the same time: booked and edited", async () => {
  const date = nextDay();
  const clientId = newClient();
  // Booked 10 minutes apart (what reception did to get round the error)...
  const created = await call("POST", "/api/v1/appointments", payload(clientId, [
    row(ids.place, at(date, "10:00")),
    row(ids.place, at(date, "10:10")),
  ]));
  assert.equal(created.status, 200, JSON.stringify(created.data));
  // ...then both moved to the same time.
  const edited = await call("PUT", `/api/v1/appointments/${created.data.id}`, payload(clientId, [
    row(ids.place, at(date, "10:00")),
    row(ids.place, at(date, "10:00")),
  ]));
  assert.equal(edited.status, 200, JSON.stringify(edited.data));
  const list = (await call("GET", `/api/v1/appointments?date=${date}`)).data;
  assert.equal(list.find((a) => a.id === created.data.id).services.length, 2);
});

test("two people in the sauna at the same time: booked that way from the start", async () => {
  const date = nextDay();
  const r = await call("POST", "/api/v1/appointments", payload(newClient(), [
    row(ids.place, at(date, "10:00")),
    row(ids.place, at(date, "10:00")),
  ]));
  assert.equal(r.status, 200, JSON.stringify(r.data));
});

test("the same service twice at once with one therapist is refused clearly", async () => {
  const date = nextDay();
  const clientId = newClient();
  const twice = [row(ids.therapist, at(date, "12:00")), row(ids.therapist, at(date, "12:00"))];
  const created = await call("POST", "/api/v1/appointments", payload(clientId, twice));
  assert.equal(created.status, 422);
  assert.equal(created.data.error, "repeated_service");

  const ok = await call("POST", "/api/v1/appointments", payload(clientId, [row(ids.therapist, at(date, "14:00"))]));
  assert.equal(ok.status, 200);
  const edited = await call("PUT", `/api/v1/appointments/${ok.data.id}`, payload(clientId, twice));
  assert.equal(edited.status, 422);
  assert.equal(edited.data.error, "repeated_service");
});
