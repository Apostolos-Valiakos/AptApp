// Who each role-gated route lets through, and what it answers the others
// (403 and its message). Written before the role checks moved into shared
// middleware (code review proposal 4), so that move can't change who gets in.
//
// Run: node --test tests/server/roleGates.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { ROOT, SHOP, api, createTestDb, dropTestDb, sql, startServer, token } from "../offline/helpers.mjs";

const require = createRequire(import.meta.url);
require("dotenv").config({ path: path.join(ROOT, ".env"), quiet: true });
const jwt = require("jsonwebtoken");

const DB = "role_gates_test";
const PORT = 3190;
const X = "11111111-1111-4111-8111-111111111111"; // no such record
const ROLES = ["client", "staff", "frontdesk", "admin", "super_admin"];
let server;
const as = {};
const ids = {};

before(async () => {
  const uri = createTestDb(DB);
  const one = (role) => sql(DB, `SELECT id FROM users WHERE shop_id = '${SHOP}' AND role = '${role}' ORDER BY id LIMIT 1`);
  const clientUser = sql(DB, `SELECT id || '|' || client_id FROM users WHERE shop_id = '${SHOP}' AND role = 'client' AND client_id IS NOT NULL ORDER BY id LIMIT 1`);
  const staffUser = sql(DB, `SELECT id || '|' || staff_id FROM users WHERE shop_id = '${SHOP}' AND role = 'staff' AND staff_id IS NOT NULL ORDER BY id LIMIT 1`);
  ids.ownClient = clientUser.split("|")[1];
  const sign = (userId, role, extra) => jwt.sign({ userId, role, shopId: SHOP, ...extra }, process.env.JWT_SECRET);
  server = await startServer(uri, PORT);
  as.client = api(PORT, sign(clientUser.split("|")[0], "client", { clientId: ids.ownClient }));
  as.staff = api(PORT, sign(staffUser.split("|")[0], "staff", { staffId: staffUser.split("|")[1] }));
  for (const role of ["frontdesk", "admin", "super_admin"]) as[role] = api(PORT, token(one(role), role));
});
after(() => {
  server?.stop();
  dropTestDb(DB);
});

const ADMINS_ONLY = { staff: "Admins only", frontdesk: "Admins only" };
const NOT_CLIENTS = { client: "Forbidden" };
const NOT_STAFF = { staff: "Forbidden" };
const CLIENTS_ONLY = { staff: "Clients only", frontdesk: "Clients only", admin: "Clients only", super_admin: "Clients only" };

// [method, url, body, { role: message } for the roles turned away, options]
// `tryAllowed: false`: the roles let in aren't sent (the call would change
// something that matters to the other checks, e.g. log everyone out).
const ROUTES = [
  ["PUT", `/api/v1/appointments/${X}`, {}, { ...NOT_STAFF, client: "forbidden" }],
  ["POST", `/api/v1/appointments/${X}/cancel`, {}, { ...NOT_STAFF, ...NOT_CLIENTS }],
  ["POST", `/api/v1/appointments/${X}/package-redemptions`, {}, { ...NOT_STAFF, ...NOT_CLIENTS }],

  ["GET", "/api/v1/clients?slim=true", undefined, NOT_CLIENTS],
  ["GET", "/api/v1/clients/walk-in", undefined, NOT_CLIENTS],
  ["PUT", `/api/v1/clients/${X}/notes`, { notes: "x" }, { ...NOT_STAFF, ...NOT_CLIENTS }],
  ["GET", `/api/v1/clients/${X}/balance`, undefined, NOT_CLIENTS],
  ["GET", `/api/v1/clients/${X}/past-appointments`, undefined, NOT_CLIENTS],
  ["GET", `/api/v1/clients/${X}/membership`, undefined, { client: "Unauthorized to view this membership" }],
  ["POST", `/api/v1/clients/${X}/membership`, {}, { client: "Admins only", ...ADMINS_ONLY }],
  ["POST", `/api/v1/clients/${X}/membership/renew`, {}, { client: "Admins only", ...ADMINS_ONLY }],
  ["DELETE", `/api/v1/clients/${X}/membership`, undefined, { client: "Admins only", ...ADMINS_ONLY }],
  ["GET", `/api/v1/clients/${X}/packages`, undefined, { client: "Unauthorized to view these packages" }],

  ["GET", "/api/v1/contests", undefined, { ...NOT_CLIENTS, ...ADMINS_ONLY }],
  ["POST", "/api/v1/contests", {}, { ...NOT_CLIENTS, ...ADMINS_ONLY }],
  ["PUT", `/api/v1/contests/${X}`, {}, { ...NOT_CLIENTS, ...ADMINS_ONLY }],
  ["DELETE", `/api/v1/contests/${X}`, undefined, { ...NOT_CLIENTS, ...ADMINS_ONLY }],
  ["GET", "/api/v1/discount-codes", undefined, NOT_CLIENTS],
  ["DELETE", `/api/v1/exercises/${X}`, undefined, { ...NOT_CLIENTS, staff: "Unauthorized: Admins only" }],
  ["PUT", `/api/v1/gift-cards/${X}`, {}, { ...NOT_CLIENTS, ...ADMINS_ONLY }],
  ["DELETE", `/api/v1/gift-cards/${X}`, undefined, { ...NOT_CLIENTS, ...ADMINS_ONLY }],
  ["POST", "/api/v1/membership-tiers", {}, { ...NOT_CLIENTS, staff: "Admins only" }],
  ["PUT", `/api/v1/membership-tiers/${X}`, {}, { ...NOT_CLIENTS, staff: "Admins only" }],
  ["DELETE", `/api/v1/membership-tiers/${X}`, undefined, { ...NOT_CLIENTS, staff: "Admins only" }],
  ["GET", "/api/v1/package-types", undefined, NOT_CLIENTS],
  ["DELETE", `/api/v1/package-usage/${X}`, undefined, NOT_CLIENTS],
  ["POST", `/api/v1/staff/${X}/photo`, {}, { ...NOT_CLIENTS, staff: "Admins only" }],
  ["DELETE", `/api/v1/staff/${X}/photo`, undefined, { ...NOT_CLIENTS, staff: "Admins only" }],

  ["GET", "/api/v1/platform/shops", undefined, Object.fromEntries(ROLES.map((r) => [r, "Owner only"]))],

  ["PUT", "/api/v1/portal/profile", {}, CLIENTS_ONLY, { tryAllowed: false }],
  ["PUT", "/api/v1/portal/password", {}, CLIENTS_ONLY, { tryAllowed: false }],
  ["POST", `/api/v1/portal/appointments/${X}/cancel`, {}, CLIENTS_ONLY],
  ["POST", `/api/v1/portal/appointments/${X}/confirm`, {}, CLIENTS_ONLY],
  ["PUT", "/api/v1/portal/notifications", {}, CLIENTS_ONLY, { tryAllowed: false }],
  ["GET", "/api/v1/portal/services", undefined, CLIENTS_ONLY],
  ["GET", "/api/v1/portal/staff", undefined, CLIENTS_ONLY],
  ["GET", "/api/v1/portal/notifications", undefined, CLIENTS_ONLY],
  ["PUT", "/api/v1/portal/notifications/read-all", {}, CLIENTS_ONLY],
  ["PUT", `/api/v1/portal/notifications/${X}/read`, {}, CLIENTS_ONLY],
  ["POST", "/api/v1/portal/push-subscription", {}, CLIENTS_ONLY, { tryAllowed: false }],
  ["DELETE", "/api/v1/portal/push-subscription", {}, CLIENTS_ONLY, { tryAllowed: false }],

  ["POST", "/api/v1/shop/cash-filter", { hidden: false }, { ...NOT_CLIENTS, ...ADMINS_ONLY }, { tryAllowed: false }],
  ["POST", "/api/v1/shop/release-cash-lock", {}, { ...NOT_CLIENTS, staff: "Super admins only", frontdesk: "Super admins only", admin: "Super admins only" }, { tryAllowed: false }],
  ["POST", "/api/v1/shop/force-logout", {}, { ...NOT_CLIENTS, staff: "Super admins only", frontdesk: "Super admins only", admin: "Super admins only" }, { tryAllowed: false }],
];

for (const [method, url, body, denied, { tryAllowed = true } = {}] of ROUTES) {
  test(`${method} ${url}`, async () => {
    for (const role of ROLES) {
      if (!(role in denied) && !tryAllowed) continue;
      const r = await as[role](method, url, body);
      if (role in denied) {
        assert.equal(r.status, 403, `${role}: ${r.status} ${JSON.stringify(r.data)}`);
        assert.equal(r.data?.error, denied[role], `${role}'s message`);
      } else {
        assert.notEqual(r.status, 403, `${role} is let in: ${JSON.stringify(r.data)}`);
      }
    }
  });
}

test("a client reads their own membership and packages", async () => {
  assert.notEqual((await as.client("GET", `/api/v1/clients/${ids.ownClient}/membership`)).status, 403);
  assert.notEqual((await as.client("GET", `/api/v1/clients/${ids.ownClient}/packages`)).status, 403);
});
