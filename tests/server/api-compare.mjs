// Refactoring safety net: runs the same fixed sequence of API requests
// against two versions of the server, each on its own fresh copy of the dev
// database, and reports every response that differs.
//
//   node tests/server/api-compare.mjs <reference-server-dir>
//
// <reference-server-dir> is a copy of an older server/ folder (e.g. taken
// before a refactor: cp -r server /tmp/ref/server). The current server/ is
// the one under test. Exit code 1 if anything differs.
//
// Ids created during the run (new bookings, clients, payments) and "now"
// timestamps differ between runs, so they're replaced by placeholders in
// order of appearance before comparing.
import { existsSync, symlinkSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { ROOT, SHOP, api, cloneTestDb, createTestDb, dropTestDb, sql, startServer, token } from "../offline/helpers.mjs";

const require = createRequire(import.meta.url);
require("dotenv").config({ path: path.join(ROOT, ".env"), quiet: true });
const jwt = require("jsonwebtoken");

const refDir = process.argv[2] && path.resolve(process.argv[2]);
if (!refDir || !existsSync(path.join(refDir, "server.js"))) {
  console.error("usage: node tests/server/api-compare.mjs <reference-server-dir>");
  process.exit(2);
}
// The reference copy needs the project's packages.
const refModules = path.join(refDir, "..", "node_modules");
if (!existsSync(refModules)) symlinkSync(path.join(ROOT, "node_modules"), refModules);

const PORTS = { ref: 3201, cur: 3202 };
const DAY = "2026-10-27";
const at = (hhmm, day = "2027-02-10") => `${day}T${hhmm}:00+02:00`;

const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const ISO_NOW = /\b20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z\b/g;

/** The sequence of requests: [label, token name, method, url, body?, headers?]. */
const scenario = (ids) => {
  const steps = [];
  const add = (label, who, method, url, body, headers) => steps.push({ label, who, method, url, body, headers });
  const idem = (n) => ({ "Idempotency-Key": `00000000-0000-4000-8000-${String(n).padStart(12, "0")}` });

  // --- reads: appointments, per role
  for (const who of ["admin", "frontdesk", "staff", "client", "super_admin"]) {
    add(`appointments by date as ${who}`, who, "GET", `/api/v1/appointments?date=${DAY}`);
  }
  add("appointments by range", "admin", "GET", "/api/v1/appointments?start=2026-10-01T00:00:00%2B03:00&end=2026-11-01T00:00:00%2B02:00");
  add("appointments by range (staff)", "staff", "GET", "/api/v1/appointments?start=2026-10-01T00:00:00%2B03:00&end=2026-12-01T00:00:00%2B02:00");
  add("appointments, no filter", "frontdesk", "GET", "/api/v1/appointments");

  // --- reads: clients
  add("clients slim", "admin", "GET", "/api/v1/clients?slim=true");
  add("clients search", "frontdesk", "GET", `/api/v1/clients?slim=true&search=${encodeURIComponent(ids.clientSearch)}&limit=10`);
  add("clients page", "admin", "GET", "/api/v1/clients?limit=25&offset=50");
  add("clients by id", "admin", "GET", `/api/v1/clients?id=${ids.client}`);
  add("clients as client", "client", "GET", "/api/v1/clients?slim=true");
  add("walk-in", "frontdesk", "GET", "/api/v1/clients/walk-in");
  for (const sub of ["full", "balance", "debts", "past-appointments", "exercises", "membership", "packages"]) {
    add(`client ${sub}`, "admin", "GET", `/api/v1/clients/${ids.client}/${sub}`);
  }
  add("client full as staff", "staff", "GET", `/api/v1/clients/${ids.client}/full`);
  add("client full as client (own)", "client", "GET", `/api/v1/clients/${ids.clientUserClient}/full`);
  add("client full as client (other)", "client", "GET", `/api/v1/clients/${ids.client}/full`);
  add("client debts as staff", "staff", "GET", `/api/v1/clients/${ids.client}/debts`);
  add("appointments on date", "admin", "GET", `/api/v1/clients/${ids.client}/appointments-on-date?date=${DAY}`);
  add("unknown client full", "admin", "GET", "/api/v1/clients/11111111-1111-4111-8111-111111111111/full");
  add("bad id full", "admin", "GET", "/api/v1/clients/not-a-uuid/full");

  // --- writes: clients
  add("create client: missing name", "frontdesk", "POST", "/api/v1/clients", { first_name: " ", last_name: "X" });
  add("create client", "frontdesk", "POST", "/api/v1/clients", { first_name: "Compare", last_name: "Test", phone: "6900000099" }, idem(1));
  add("create client: replay", "frontdesk", "POST", "/api/v1/clients", { first_name: "Compare", last_name: "Test", phone: "6900000099" }, idem(1));
  add("edit client", "frontdesk", "PUT", "/api/v1/clients/$client1", { first_name: "Compare", last_name: "Edited", phone: "6900000098", email: "" });
  add("edit walk-in", "frontdesk", "PUT", `/api/v1/clients/${ids.walkIn}`, { first_name: "Renamed", last_name: "Walk" });
  add("add debt", "admin", "POST", "/api/v1/clients/$client1/debts", { amount: 25, note: "compare" });
  add("debts after", "admin", "GET", "/api/v1/clients/$client1/debts");
  add("exercise toggle", "admin", "POST", "/api/v1/clients/$client1/exercises/toggle", { exercise_id: ids.exercise });
  add("membership: none to renew", "admin", "POST", "/api/v1/clients/$client1/membership/renew", {});
  add("packages: bad type", "admin", "POST", "/api/v1/clients/$client1/packages", { package_type_id: "11111111-1111-4111-8111-111111111111" });

  // --- writes: appointments and payments
  const booking = (hhmm, extra = {}) => ({
    client_id: "$client1",
    status: "confirmed",
    save_receipt: true,
    allow_unavailable: true,
    services: [{ service_id: ids.service, staff_id: ids.staff, start_time: at(hhmm), duration_override: 60, price_override: 40 }],
    ...extra,
  });
  add("book: no staff", "frontdesk", "POST", "/api/v1/appointments", { ...booking("09:00"), services: [{ service_id: ids.service, staff_id: null, start_time: at("09:00") }] });
  add("book", "frontdesk", "POST", "/api/v1/appointments", booking("10:00"), idem(2));
  add("book: replay", "frontdesk", "POST", "/api/v1/appointments", booking("10:00"), idem(2));
  add("book: duplicate", "frontdesk", "POST", "/api/v1/appointments", booking("10:00"));
  add("book second", "frontdesk", "POST", "/api/v1/appointments", booking("12:00", { internal_notes: "second" }), idem(3));
  add("book: offline slot taken", "frontdesk", "POST", "/api/v1/appointments", booking("10:30", { offline_known_overlaps: [] }));
  add("book as client (self-booking)", "client", "POST", "/api/v1/appointments", { services: [{ service_id: ids.service, staff_id: ids.staff, start_time: at("15:00") }] });
  add("day after booking", "admin", "GET", "/api/v1/appointments?date=2027-02-10");
  add("edit booking", "frontdesk", "PUT", "/api/v1/appointments/$appt1", booking("10:00", { internal_notes: "edited" }));
  add("edit: stale version", "frontdesk", "PUT", "/api/v1/appointments/$appt1", booking("10:00", { base_version: 1, internal_notes: "stale" }));
  add("edit: keep mine", "frontdesk", "PUT", "/api/v1/appointments/$appt1", booking("10:00", { base_version: 1, force: true, internal_notes: "forced" }));
  add("pay: no amount", "frontdesk", "POST", "/api/v1/transactions", { appointment_id: "$appt1", client_id: "$client1", payment_method: "cash" });
  add("pay part", "frontdesk", "POST", "/api/v1/transactions", { appointment_id: "$appt1", client_id: "$client1", amount: 15, payment_method: "cash" }, idem(4));
  add("pay part: replay", "frontdesk", "POST", "/api/v1/transactions", { appointment_id: "$appt1", client_id: "$client1", amount: 15, payment_method: "cash" }, idem(4));
  add("pay split", "frontdesk", "POST", "/api/v1/transactions", { appointment_id: "$appt1", client_id: "$client1", amount: 10, payment_method: "card", amount2: 15, payment_method2: "cash" });
  add("pay as staff", "staff", "POST", "/api/v1/transactions", { appointment_id: "$appt2", client_id: "$client1", amount: 5, payment_method: "cash" });
  add("refund too much", "admin", "POST", "/api/v1/appointments/$appt1/refund", { amount: 999, payment_method: "cash", reason: "x" });
  add("refund", "admin", "POST", "/api/v1/appointments/$appt1/refund", { amount: 5, payment_method: "cash", reason: "compare" });
  add("price change", "admin", "POST", "/api/v1/appointments/$appt2/price-change", { new_total: 30, reason: "compare" });
  add("price change as staff", "staff", "POST", "/api/v1/appointments/$appt2/price-change", { new_total: 20, reason: "x" });
  add("resolve debt", "admin", "POST", "/api/v1/appointments/$appt2/resolve-debt", { method: "cash" });
  add("package redemption: none", "frontdesk", "POST", "/api/v1/appointments/$appt2/package-redemptions", { client_package_id: "11111111-1111-4111-8111-111111111111", service_id: ids.service });
  add("swap", "frontdesk", "POST", "/api/v1/appointments/swap", { appointment1_id: "$appt1", appointment2_id: "$appt2" });
  add("day after payments", "admin", "GET", "/api/v1/appointments?date=2027-02-10");
  add("client full after", "admin", "GET", "/api/v1/clients/$client1/full");
  add("balance after", "admin", "GET", "/api/v1/clients/$client1/balance");
  add("cancel", "frontdesk", "POST", "/api/v1/appointments/$appt2/cancel", {});
  add("delete", "frontdesk", "DELETE", "/api/v1/appointments/$appt1", undefined, idem(5));
  add("delete again", "frontdesk", "DELETE", "/api/v1/appointments/$appt1", undefined, idem(6));
  add("delete unknown", "frontdesk", "DELETE", "/api/v1/appointments/11111111-1111-4111-8111-111111111111");
  // memberships, packages, files, invite (test servers can't send email)
  add("sell membership", "admin", "POST", "/api/v1/clients/$client1/membership", { tier_id: ids.tier, billing_cycle: "monthly", payment_method: "card" });
  add("membership after sale", "admin", "GET", "/api/v1/clients/$client1/membership");
  add("renew membership", "admin", "POST", "/api/v1/clients/$client1/membership/renew", { payment_method: "cash" });
  add("cancel membership", "admin", "DELETE", "/api/v1/clients/$client1/membership");
  add("sell membership as frontdesk", "frontdesk", "POST", "/api/v1/clients/$client1/membership", { tier_id: ids.tier, billing_cycle: "monthly" });
  add("sell package", "frontdesk", "POST", "/api/v1/clients/$client1/packages", { package_type_id: ids.packageType, payment_method: "cash" });
  add("packages after sale", "frontdesk", "GET", "/api/v1/clients/$client1/packages");
  add("upload file", "admin", "POST", "/api/v1/clients/$client1/files", { __form: { name: "note.txt", type: "text/plain", text: "compare test" } });
  add("client full with file", "admin", "GET", "/api/v1/clients/$client1/full");
  add("download file", "admin", "GET", "/api/v1/clients/files/$file1");
  add("delete file", "admin", "DELETE", "/api/v1/clients/files/$file1");
  add("invite (no email on file)", "admin", "POST", "/api/v1/clients/$client1/invite", {});
  add("delete client", "admin", "DELETE", "/api/v1/clients/$client1");
  add("no token", null, "GET", "/api/v1/appointments");
  return steps;
};

const normalize = (data, known) => {
  const fresh = new Map();
  const text = JSON.stringify(data ?? null)
    .replace(UUID, (u) => {
      const k = u.toLowerCase();
      if (known.has(k)) return k;
      if (!fresh.has(k)) fresh.set(k, `<new-id-${fresh.size + 1}>`);
      return fresh.get(k);
    })
    // Times made during the run (NOW(), NOW() + a period): milliseconds apart
    // between the two servers. Stored data has whole seconds.
    .replace(ISO_NOW, (t) => (Math.abs(Date.parse(t) - Date.now()) < 800 * 86400e3 && !/\.000Z$|:\d\dZ$/.test(t) ? "<now>" : t));
  // "New client" between two bookings made the same day is decided by their
  // (random) ids — created_at is a date — so it isn't comparable for them.
  return JSON.parse(text, (key, value) =>
    value && typeof value === "object" && String(value.id).startsWith("<new-id") && "is_new_client" in value
      ? { ...value, is_new_client: "<tie>" }
      : value,
  );
};

/** Path and values of the first place two JSON values differ. */
const firstDiff = (a, b, at = "$") => {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (a && b && typeof a === "object" && typeof b === "object") {
    if (Array.isArray(a) && Array.isArray(b) && a.length !== b.length) return `${at} (length ${a.length} vs ${b.length})`;
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const d = firstDiff(a[k], b[k], `${at}.${k}`);
      if (d) return d;
    }
  }
  return `${at}: ${JSON.stringify(a)?.slice(0, 120)} vs ${JSON.stringify(b)?.slice(0, 120)}`;
};

// Two identical databases (one dump, then an exact copy), both servers up
// at once, every request sent to both back to back: time-dependent results
// (debt appearing as appointments pass) are the same for both.
const DBS = { ref: "api_compare_ref", cur: "api_compare_cur" };
const uris = { ref: createTestDb(DBS.ref) };
uris.cur = cloneTestDb(DBS.ref, DBS.cur);
const db = DBS.ref;

const ids = {
  admin: sql(db, `SELECT id FROM users WHERE shop_id='${SHOP}' AND role='admin' ORDER BY id LIMIT 1`),
  frontdesk: sql(db, `SELECT id FROM users WHERE shop_id='${SHOP}' AND role='frontdesk' ORDER BY id LIMIT 1`),
  staffUser: sql(db, `SELECT id || '|' || staff_id FROM users WHERE shop_id='${SHOP}' AND role='staff' AND staff_id IS NOT NULL ORDER BY id LIMIT 1`),
  clientUser: sql(db, `SELECT id || '|' || client_id FROM users WHERE shop_id='${SHOP}' AND role='client' AND client_id IS NOT NULL ORDER BY id LIMIT 1`),
  superAdmin: sql(db, `SELECT id FROM users WHERE shop_id='${SHOP}' AND role='super_admin' ORDER BY id LIMIT 1`),
  client: sql(db, `SELECT client_id FROM appointments WHERE shop_id='${SHOP}' AND client_id IS NOT NULL GROUP BY client_id ORDER BY count(*) DESC, client_id LIMIT 1`),
  walkIn: sql(db, `SELECT walk_in_client_id FROM shops WHERE id='${SHOP}'`),
  staff: sql(db, `SELECT id FROM staff WHERE shop_id='${SHOP}' ORDER BY id LIMIT 1`),
  service: sql(db, `SELECT id FROM services WHERE shop_id='${SHOP}' AND is_active AND price > 0 ORDER BY id LIMIT 1`),
  exercise: sql(db, `SELECT coalesce((SELECT id::text FROM exercises ORDER BY id LIMIT 1), '')`),
  tier: sql(db, `SELECT coalesce((SELECT id::text FROM membership_tiers WHERE shop_id='${SHOP}' ORDER BY id LIMIT 1), '')`),
  packageType: sql(db, `SELECT coalesce((SELECT id::text FROM package_types WHERE shop_id='${SHOP}' AND is_active ORDER BY id LIMIT 1), '')`),
};
ids.clientSearch = sql(db, `SELECT left(last_name, 4) FROM clients WHERE id='${ids.client}'`);
ids.clientUserClient = ids.clientUser.split("|")[1];
// Every id already in the database stays as is when comparing.
const known = new Set(
  sql(db, `SELECT id::text FROM appointments UNION ALL SELECT id::text FROM clients UNION ALL SELECT id::text FROM staff
           UNION ALL SELECT id::text FROM services UNION ALL SELECT id::text FROM users UNION ALL SELECT id::text FROM shops`)
    .split("\n").map((x) => x.toLowerCase()),
);
known.add("11111111-1111-4111-8111-111111111111");

const sign = (userId, role, extra = {}) => jwt.sign({ userId, role, shopId: SHOP, ...extra }, process.env.JWT_SECRET, { expiresIn: "1h" });
const tokens = {
  admin: token(ids.admin, "admin"),
  frontdesk: token(ids.frontdesk, "frontdesk"),
  super_admin: token(ids.superAdmin, "super_admin"),
  staff: sign(ids.staffUser.split("|")[0], "staff", { staffId: ids.staffUser.split("|")[1] }),
  client: sign(ids.clientUser.split("|")[0], "client", { clientId: ids.clientUserClient }),
};

/** A multipart upload (the file routes take form data, not JSON). */
const upload = async (port, tok, url, { name, type, text }) => {
  const form = new FormData();
  form.append("file", new Blob([text], { type }), name);
  const res = await fetch(`http://localhost:${port}${url}`, { method: "POST", headers: { Authorization: `Bearer ${tok}` }, body: form });
  const raw = await res.text();
  let data = raw;
  try {
    data = JSON.parse(raw);
  } catch {}
  return { status: res.status, data };
};

/** Counts and totals per table (generated ids and times left out). */
const fingerprint = (dbName) =>
  Object.fromEntries(
    Object.entries({
      appointments: "SELECT status || '/' || payment_status || ':' || count(*) || ':' || sum(deposit_amount) FROM appointments GROUP BY status, payment_status ORDER BY 1",
      appointment_services: "SELECT count(*) || ':' || coalesce(sum(price_override), 0) || ':' || count(DISTINCT (staff_id, start_time)) FROM appointment_services",
      transactions: "SELECT payment_method || '/' || transaction_type || ':' || count(*) || ':' || sum(amount) FROM transactions GROUP BY payment_method, transaction_type ORDER BY 1",
      clients: "SELECT count(*) || ':' || sum(outstanding_balance) || ':' || count(*) FILTER (WHERE last_name = 'Edited') FROM clients",
      client_debts: "SELECT count(*) || ':' || coalesce(sum(amount), 0) FROM client_debts",
      idempotency_keys: "SELECT response_status || ':' || count(*) FROM idempotency_keys GROUP BY response_status ORDER BY 1",
      price_adjustments: "SELECT count(*) || ':' || coalesce(sum(new_total), 0) FROM price_adjustments",
      stock: "SELECT coalesce(sum(stock_quantity), 0) FROM product_inventory",
    }).map(([table, query]) => [table, sql(dbName, query)]),
  );
const fingerprints = {};
const servers = {};
const results = { ref: [], cur: [] };
try {
  [servers.ref, servers.cur] = await Promise.all([
    startServer(uris.ref, PORTS.ref, path.join(refDir, "server.js")),
    startServer(uris.cur, PORTS.cur, "server/server.js"),
  ]);
  // Startup recalculates every client's balance: wait for both to finish.
  for (const name of ["ref", "cur"]) {
    for (let i = 0; i < 240 && !/Recalculated \d+ client balances/.test(servers[name].log()); i++) {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  const vars = { ref: {}, cur: {} };
  for (const step of scenario(ids)) {
    for (const name of ["ref", "cur"]) {
      const fill = (v) => JSON.parse(JSON.stringify(v ?? null).replace(/\$(client1|appt1|appt2|file1)/g, (m, k) => vars[name][k] ?? m));
      const r = step.body?.__form
        ? await upload(PORTS[name], tokens[step.who], fill(step.url), step.body.__form)
        : await api(PORTS[name], step.who ? tokens[step.who] : "")(
            step.method, fill(step.url), step.body === undefined ? undefined : fill(step.body), step.headers,
          );
      if (step.label === "client full with file") vars[name].file1 = r.data?.files?.at(-1)?.id;
      if (step.label === "create client") vars[name].client1 = r.data?.client?.id;
      if (step.label === "book") vars[name].appt1 = r.data?.id;
      if (step.label === "book second") vars[name].appt2 = r.data?.id;
      results[name].push({ label: step.label, status: r.status, data: normalize(r.data, known) });
    }
  }
  // What each server left in its database: counts and totals per table.
  for (const name of ["ref", "cur"]) fingerprints[name] = fingerprint(DBS[name]);
} finally {
  servers.ref?.stop();
  servers.cur?.stop();
  await new Promise((r) => setTimeout(r, 1000));
  dropTestDb(DBS.ref);
  dropTestDb(DBS.cur);
}

const { ref, cur } = results;
// Appointment lists come in start-time order; appointments starting at the
// same moment had no defined order before (now: by id), so compare those
// lists by start time, then id.
const byStart = (list) =>
  Array.isArray(list) && list.every((x) => x && "start_time" in x && "id" in x)
    ? [...list].sort((x, y) => String(x.start_time).localeCompare(String(y.start_time)) || String(x.id).localeCompare(String(y.id)))
    : list;
for (const side of [ref, cur]) for (const r of side) r.data = byStart(r.data);
let differences = 0;
for (let i = 0; i < ref.length; i++) {
  if (JSON.stringify(ref[i]) !== JSON.stringify(cur[i])) {
    differences++;
    console.log(`✗ ${ref[i].label}: ${ref[i].status} vs ${cur[i].status}`);
    console.log(`  first difference at ${firstDiff(ref[i].data, cur[i].data)}`);
  }
}
for (const table of Object.keys(fingerprints.ref || {})) {
  if (fingerprints.ref[table] !== fingerprints.cur[table]) {
    differences++;
    console.log(`✗ database, ${table}:\n  reference: ${fingerprints.ref[table].replace(/\n/g, " | ")}\n  current:   ${fingerprints.cur[table].replace(/\n/g, " | ")}`);
  }
}
if (process.argv.includes("--list")) ref.forEach((r) => console.log(`${r.status} ${r.label}`));
console.log(`${ref.length} requests and ${Object.keys(fingerprints.ref || {}).length} tables compared, ${differences} different.`);
process.exit(differences ? 1 : 0);
