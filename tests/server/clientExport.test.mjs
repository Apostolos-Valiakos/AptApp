// The Clients page's Excel export: every client, counts from the appointments
// the caller may see, and only for those who can open the export.
//
// Run: node --test tests/server/clientExport.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { SHOP, api, createTestDb, dropTestDb, sql, startServer, token } from "../offline/helpers.mjs";

const DB = "client_export_test";
const PORT = 3182;
let server;
let call;
const ids = {};
const one = (role) => sql(DB, `SELECT id FROM users WHERE shop_id = '${SHOP}' AND role = '${role}' LIMIT 1`);
const row = async (last, as = call) => (await as("GET", "/api/v1/clients/export")).data.find((c) => c.last_name === last);

const book = async (start, status, saveReceipt = true) => {
  const r = await call("POST", "/api/v1/appointments", {
    client_id: ids.client,
    status: "confirmed",
    save_receipt: true,
    allow_unavailable: true,
    services: [{ service_id: ids.service, staff_id: ids.staff, start_time: start, duration_override: 30, price_override: 20 }],
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  sql(DB, `UPDATE appointments SET status = '${status}', save_receipt = ${saveReceipt} WHERE id = '${r.data.id}'`);
};

before(async () => {
  const uri = createTestDb(DB);
  ids.staff = sql(DB, `SELECT id FROM staff WHERE shop_id = '${SHOP}' ORDER BY id LIMIT 1`);
  ids.service = sql(DB, `SELECT id FROM services WHERE shop_id = '${SHOP}' AND is_active AND price > 0 ORDER BY id LIMIT 1`);
  ids.client = sql(DB, `INSERT INTO clients (first_name, last_name, shop_id, date_of_birth)
                        VALUES ('Excel', 'Exported', '${SHOP}', '1990-02-03') RETURNING id`).split("\n")[0];
  server = await startServer(uri, PORT);
  call = api(PORT, token(one("frontdesk"), "frontdesk"));
  await book("2026-03-10T10:00:00+02:00", "completed");
  await book("2026-03-12T10:00:00+02:00", "confirmed");
  await book("2026-03-14T10:00:00+02:00", "no-show");
  await book("2026-03-15T10:00:00+02:00", "cancelled");
  await book("2099-03-15T10:00:00+02:00", "confirmed"); // not a visit yet
  await book("2026-03-20T10:00:00+02:00", "completed", false); // hidden from all but super admin
});
after(() => {
  server?.stop();
  dropTestDb(DB);
});

test("it holds every client, past the list's page limit", async () => {
  const r = await call("GET", "/api/v1/clients/export");
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const walkIn = sql(DB, `SELECT walk_in_client_id FROM shops WHERE id = '${SHOP}'`);
  const expected = sql(DB, `SELECT count(*) FROM active_clients WHERE shop_id = '${SHOP}' AND id IS DISTINCT FROM ${walkIn ? `'${walkIn}'` : "NULL"}`);
  assert.equal(r.data.length, Number(expected));
});

test("visits, last visit and no-shows come from the appointments", async () => {
  const c = await row("Exported");
  assert.equal(c.visits, 2, "completed and confirmed in the past");
  assert.equal(c.last_visit, "2026-03-12");
  assert.equal(c.no_shows, 1);
  assert.equal(c.date_of_birth, "1990-02-03");
  assert.equal(Number(c.outstanding_balance), Number(sql(DB, `SELECT outstanding_balance FROM clients WHERE id = '${ids.client}'`)));
});

test("a hidden appointment counts only for the super admin", async () => {
  const superAdmin = one("super_admin");
  if (!superAdmin) return;
  const c = await row("Exported", api(PORT, token(superAdmin, "super_admin")));
  assert.equal(c.visits, 3);
  assert.equal(c.last_visit, "2026-03-20");
});

test("only admin, super admin and front desk may export", async () => {
  const staff = one("staff");
  if (staff) {
    const r = await api(PORT, token(staff, "staff"))("GET", "/api/v1/clients/export");
    assert.equal(r.status, 403);
  }
  const anon = await fetch(`http://localhost:${PORT}/api/v1/clients/export`);
  assert.equal(anon.status, 401);
});
