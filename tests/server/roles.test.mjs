// Who may call what: client portal logins only reach the portal's routes and
// the few it reads; writes behind the admin-only pages need admin, super
// admin or front desk; plain staff keep what their screens use.
//
// Run: node --test tests/server/roles.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { ROOT, SHOP, api, createTestDb, dropTestDb, sql, startServer, token } from "../offline/helpers.mjs";

const require = createRequire(import.meta.url);
require("dotenv").config({ path: path.join(ROOT, ".env"), quiet: true });
const jwt = require("jsonwebtoken");

const DB = "roles_test";
const PORT = 3183;
let server;
const ids = {};
const as = {};

before(async () => {
  const uri = createTestDb(DB);
  const one = (role, extra = "") => sql(DB, `SELECT id FROM users WHERE shop_id = '${SHOP}' AND role = '${role}' ${extra} ORDER BY id LIMIT 1`);
  ids.staff = sql(DB, `SELECT id FROM staff WHERE shop_id = '${SHOP}' ORDER BY id LIMIT 1`);
  ids.service = sql(DB, `SELECT id FROM services WHERE shop_id = '${SHOP}' AND is_active ORDER BY id LIMIT 1`);
  const clientUser = sql(DB, `SELECT id || '|' || client_id FROM users WHERE shop_id = '${SHOP}' AND role = 'client' AND client_id IS NOT NULL ORDER BY id LIMIT 1`);
  const staffUser = sql(DB, `SELECT id || '|' || staff_id FROM users WHERE shop_id = '${SHOP}' AND role = 'staff' AND staff_id IS NOT NULL ORDER BY id LIMIT 1`);
  ids.client = clientUser.split("|")[1];
  const sign = (userId, role, extra) => jwt.sign({ userId, role, shopId: SHOP, ...extra }, process.env.JWT_SECRET);
  server = await startServer(uri, PORT);
  as.admin = api(PORT, token(one("admin"), "admin"));
  as.frontdesk = api(PORT, token(one("frontdesk"), "frontdesk"));
  as.staff = api(PORT, sign(staffUser.split("|")[0], "staff", { staffId: staffUser.split("|")[1] }));
  as.client = api(PORT, sign(clientUser.split("|")[0], "client", { clientId: ids.client }));
});
after(() => {
  server?.stop();
  dropTestDb(DB);
});

test("a client login is turned away from every staff route", async () => {
  const routes = [
    ["GET", "/api/v1/staff"], ["POST", "/api/v1/staff/reorder", { orders: [] }], ["GET", "/api/v1/time-off"], ["GET", "/api/v1/working-hours"],
    ["GET", "/api/v1/services"], ["POST", "/api/v1/services", { name: "X", duration_minutes: 30, price: 1, category: "X" }],
    ["PUT", `/api/v1/services/${ids.service}`, { name: "X" }], ["DELETE", `/api/v1/services/${ids.service}`],
    ["GET", "/api/v1/service-categories"], ["PUT", "/api/v1/service-categories/color", { name: "X", color_code: null }],
    ["GET", "/api/v1/products"], ["POST", "/api/v1/products", { name: "X", variations: [] }],
    ["GET", "/api/v1/exercises"], ["GET", "/api/v1/profile"], ["GET", "/api/v1/gift-cards"], ["GET", "/api/v1/gift-cards/search?q=1"],
    ["GET", "/api/v1/membership-tiers"], ["GET", "/api/v1/chat/channels"], ["GET", "/api/v1/shop/filter-state"], ["GET", "/api/v1/shop-hours"],
    ["PUT", "/api/v1/shop/theme", { primaryColor: "#000000" }], ["PUT", "/api/v1/shop/contact", { phone: "1" }],
    ["PUT", "/api/v1/shop/calendar-settings", {}], ["GET", "/api/v1/reports/daily"], ["GET", "/api/v1/discount-codes"],
  ];
  for (const [method, url, body] of routes) {
    const r = await as.client(method, url, body);
    assert.equal(r.status, 403, `${method} ${url}: ${r.status} ${JSON.stringify(r.data)?.slice(0, 80)}`);
  }
  assert.equal(sql(DB, `SELECT count(*) FROM services WHERE id = '${ids.service}' AND name = 'X'`), "0", "nothing changed");
});

test("the portal keeps what it uses", async () => {
  for (const url of [
    "/api/v1/shop", "/api/v1/contests/active", "/api/v1/portal/notifications", "/api/v1/push/vapid-public-key",
    `/api/v1/clients/${ids.client}/full`, `/api/v1/clients/${ids.client}/membership`, `/api/v1/clients/${ids.client}/packages`,
    "/api/v1/appointments", "/api/v1/portal/services",
  ]) {
    const r = await as.client("GET", url);
    assert.equal(r.status, 200, `${url}: ${r.status} ${JSON.stringify(r.data)?.slice(0, 80)}`);
  }
  // Open to clients even if this shop's self-booking is off (then 404/empty, not 403).
  const r = await as.client("GET", `/api/v1/availability?service_id=${ids.service}&staff_id=${ids.staff}&date=2027-03-10`);
  assert.notEqual(r.status, 403);
});

test("plain staff can't change what's behind the admin-only pages", async () => {
  for (const [method, url, body] of [
    ["POST", "/api/v1/staff", { first_name: "X", last_name: "Y" }],
    ["PUT", `/api/v1/staff/${ids.staff}`, { first_name: "X", last_name: "Y" }],
    ["DELETE", `/api/v1/staff/${ids.staff}`],
    ["POST", `/api/v1/staff/${ids.staff}/login`, { username: "x", password: "y" }],
    ["POST", "/api/v1/services", { name: "X", duration_minutes: 30, price: 1, category: "X" }],
    ["PUT", `/api/v1/services/${ids.service}`, { name: "X" }],
    ["DELETE", `/api/v1/services/${ids.service}`],
    ["PUT", "/api/v1/services/reorder", { order: [] }],
    ["PUT", "/api/v1/service-categories/color", { name: "X", color_code: null }],
    ["PUT", "/api/v1/service-categories/reorder", { order: [] }],
    ["POST", "/api/v1/products", { name: "X", variations: [] }],
    ["PUT", "/api/v1/shop/theme", { primaryColor: "#000000" }],
    ["PUT", "/api/v1/shop/contact", { phone: "1" }],
    ["PUT", "/api/v1/shop/reply-email", { reply_email: null }],
    ["PUT", "/api/v1/shop/calendar-settings", {}],
  ]) {
    const r = await as.staff(method, url, body);
    assert.equal(r.status, 403, `${method} ${url}: ${r.status} ${JSON.stringify(r.data)?.slice(0, 80)}`);
  }
});

test("plain staff keep what their screens use", async () => {
  for (const url of ["/api/v1/staff", "/api/v1/services", "/api/v1/products", "/api/v1/time-off", "/api/v1/working-hours", "/api/v1/shop", "/api/v1/shop-hours", "/api/v1/shop/filter-state", "/api/v1/profile", "/api/v1/exercises", "/api/v1/chat/channels"]) {
    const r = await as.staff("GET", url);
    assert.equal(r.status, 200, `${url}: ${r.status} ${JSON.stringify(r.data)?.slice(0, 80)}`);
  }
  assert.equal((await as.staff("POST", "/api/v1/staff/reorder", { orders: [] })).status, 200);
  const added = await as.staff("POST", `/api/v1/staff/${ids.staff}/time-off`, { type: "break", start_date: "2027-03-11", end_date: "2027-03-11", start_time: "10:00", end_time: "11:00" });
  assert.equal(added.status, 200, JSON.stringify(added.data));
});

test("admin and front desk can make those changes", async () => {
  for (const who of ["admin", "frontdesk"]) {
    const made = await as[who]("POST", "/api/v1/services", { name: `Role ${who}`, duration_minutes: 30, price: 1, category: "Roles" });
    assert.equal(made.status, 200, JSON.stringify(made.data));
    assert.equal((await as[who]("DELETE", `/api/v1/services/${made.data.id}`)).status, 200);
  }
});

test("reordering staff only touches this shop's staff", async () => {
  const other = sql(DB, `SELECT id FROM staff WHERE shop_id <> '${SHOP}' ORDER BY id LIMIT 1`);
  if (!other) return;
  const before = sql(DB, `SELECT sort_order FROM staff WHERE id = '${other}'`);
  await as.admin("POST", "/api/v1/staff/reorder", { orders: [{ id: other, sort_order: 987 }] });
  assert.equal(sql(DB, `SELECT sort_order FROM staff WHERE id = '${other}'`), before);
});
