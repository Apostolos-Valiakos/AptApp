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

