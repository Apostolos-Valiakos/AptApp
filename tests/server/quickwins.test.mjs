// Malformed ids, the "new client" badge, when a booking was made, renaming
// a category, and the login only in the header.
//
// Run: node --test tests/server/quickwins.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { SHOP, api, createTestDb, dropTestDb, sql, startServer, token } from "../offline/helpers.mjs";

const DB = "quickwins_test";
const PORT = 3187;
let server;
let call;
const ids = {};
const DAY = "2027-07-14";
const at = (hhmm, day = DAY) => `${day}T${hhmm}:00+03:00`;

const newClient = (last) =>
  sql(DB, `INSERT INTO clients (first_name, last_name, shop_id) VALUES ('Quick', '${last}', '${SHOP}') RETURNING id`).split("\n")[0];
const book = async (clientId, start, extra = {}) => {
  const r = await call("POST", "/api/v1/appointments", {
    client_id: clientId,
    status: "confirmed",
    save_receipt: true,
    allow_unavailable: true,
    services: [{ service_id: ids.service, staff_id: ids.staff, start_time: start, duration_override: 30, price_override: 20 }],
    ...extra,
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data.id;
};

before(async () => {
  const uri = createTestDb(DB);
  ids.admin = sql(DB, `SELECT id FROM users WHERE shop_id = '${SHOP}' AND role = 'admin' LIMIT 1`);
  ids.staffUser = sql(DB, `SELECT id FROM users WHERE shop_id = '${SHOP}' AND role = 'staff' LIMIT 1`);
  ids.staff = sql(DB, `SELECT id FROM staff WHERE shop_id = '${SHOP}' ORDER BY id LIMIT 1`);
  ids.service = sql(DB, `SELECT id FROM services WHERE shop_id = '${SHOP}' AND is_active AND price > 0 ORDER BY id LIMIT 1`);
  server = await startServer(uri, PORT);
  call = api(PORT, token(ids.admin, "admin"));
});
after(() => {
  server?.stop();
  dropTestDb(DB);
});

test("a malformed id answers 400 invalid_id, not 500", async () => {
  for (const url of ["/api/v1/clients/not-a-uuid/full", "/api/v1/appointments/not-a-uuid/cancel"]) {
    const r = await call(url.endsWith("cancel") ? "POST" : "GET", url);
    assert.equal(r.status, 400, `${url}: ${JSON.stringify(r.data)}`);
    assert.equal(r.data.error, "invalid_id");
  }
  // Routes that already checked the id keep their own answer.
  const own = await call("GET", "/api/v1/clients/not-a-uuid/balance");
  assert.equal(own.status, 400);
  assert.equal(own.data.error, "Invalid id");
  // A well-formed id that doesn't exist is still a 404.
  const r = await call("GET", "/api/v1/clients/11111111-1111-4111-8111-111111111111/full");
  assert.equal(r.status, 404);
});

test("'new client' marks the first visit, whatever order the bookings were made in", async () => {
  const clientId = newClient("Badge");
  // Made first, but for a later day; then one for earlier the same day: both
  // have the same created_at date, which used to decide by chance.
  const later = await book(clientId, at("12:00", "2027-07-20"));
  const first = await book(clientId, at("10:00"));
  const cancelledEarlier = await book(clientId, at("09:00", "2027-07-10"));
  await call("POST", `/api/v1/appointments/${cancelledEarlier}/cancel`);
  const shown = async (day) => (await call("GET", `/api/v1/appointments?date=${day}`)).data;
  const badge = async (id, day) => (await shown(day)).find((a) => a.id === id)?.is_new_client;
  assert.equal(await badge(first, DAY), true, "the earliest visit");
  assert.equal(await badge(later, "2027-07-20"), false);
  assert.equal(await badge(cancelledEarlier, "2027-07-10"), false, "a cancelled one doesn't count");
});

test("a booking records when it was made; offline, when it was made offline", async () => {
  const clientId = newClient("BookedAt");
  const before = Date.now();
  const now = await book(clientId, at("13:00"));
  const row = (id) => sql(DB, `SELECT extract(epoch FROM booked_at) * 1000 FROM appointments WHERE id = '${id}'`);
  assert.ok(Math.abs(Number(row(now)) - before) < 60000, "about now");

  const madeOffline = new Date(Date.now() - 3 * 3600000).toISOString();
  const offline = await book(newClient("Offline"), at("14:00"), { booked_at: madeOffline });
  assert.equal(Math.round(Number(row(offline)) / 1000), Math.round(Date.parse(madeOffline) / 1000));

  // Not in the future, nor months back: then it's now.
  const future = await book(newClient("Future"), at("15:00"), { booked_at: new Date(Date.now() + 86400000).toISOString() });
  assert.ok(Math.abs(Number(row(future)) - Date.now()) < 60000);

  const listed = (await call("GET", `/api/v1/appointments?date=${DAY}`)).data.find((a) => a.id === offline);
  assert.ok(listed.booked_at, "sent to the calendar");
});

