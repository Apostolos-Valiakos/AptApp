// Server side of offline sync: versions and stale edits, slot conflicts for
// bookings made offline, and idempotent replays (incl. simultaneous ones).
//
// Run: node --test tests/offline/server.test.mjs
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createTestDb, dropTestDb, startServer, token, api, sql, SHOP } from "./helpers.mjs";

const DB = "offline_server_test";
const PORT = 3191;
let server;
let call;
let ids;

// A far-future day nobody has booked, so every test controls its own data.
const DAY = "2027-03-10";
const at = (hhmm) => `${DAY}T${hhmm}:00+02:00`;

const booking = (staffId, start, extra = {}) => ({
  client_id: ids.client,
  status: "confirmed",
  save_receipt: true,
  allow_unavailable: true,
  services: [{ service_id: ids.service, staff_id: staffId, start_time: start, duration_override: 60, price_override: 30 }],
  ...extra,
});
const version = (id) => Number(sql(DB, `SELECT version FROM appointments WHERE id = '${id}'`));
const count = (q) => Number(sql(DB, q));

before(async () => {
  const uri = createTestDb(DB);
  ids = {
    admin: sql(DB, `SELECT id FROM users WHERE shop_id = '${SHOP}' AND role = 'admin' LIMIT 1`),
    staffA: sql(DB, `SELECT id FROM staff WHERE shop_id = '${SHOP}' ORDER BY id LIMIT 1`),
    staffB: sql(DB, `SELECT id FROM staff WHERE shop_id = '${SHOP}' ORDER BY id OFFSET 1 LIMIT 1`),
    service: sql(DB, `SELECT id FROM services WHERE shop_id = '${SHOP}' AND is_active AND price > 0 ORDER BY name LIMIT 1`),
    client: sql(DB, `SELECT id FROM clients WHERE shop_id = '${SHOP}' AND phone IS NOT NULL ORDER BY id LIMIT 1`),
  };
  server = await startServer(uri, PORT);
  call = api(PORT, token(ids.admin, "admin"));
});
after(() => {
  server?.stop();
  dropTestDb(DB);
});

describe("appointment versions", () => {
  test("the list and the save responses return the current version", async () => {
    const r = await call("POST", "/api/v1/appointments", booking(ids.staffA, at("09:00")));
    assert.equal(r.status, 200);
    assert.equal(r.data.version, version(r.data.id));
    const list = await call("GET", `/api/v1/appointments?date=${DAY}`);
    const row = list.data.find((a) => a.id === r.data.id);
    assert.equal(Number(row.version), version(r.data.id));
  });

  test("an edit with the current base_version succeeds and returns the new version", async () => {
    const { data } = await call("POST", "/api/v1/appointments", booking(ids.staffA, at("10:00")));
    const before = version(data.id);
    const r = await call("PUT", `/api/v1/appointments/${data.id}`, booking(ids.staffA, at("10:00"), { base_version: before, internal_notes: "edited" }));
    assert.equal(r.status, 200);
    assert.ok(version(data.id) > before);
    assert.equal(r.data.version, version(data.id));
  });

  test("an edit from an older version is refused as stale, with the current version", async () => {
    const { data } = await call("POST", "/api/v1/appointments", booking(ids.staffA, at("11:00")));
    const seenOffline = version(data.id);
    await call("PUT", `/api/v1/appointments/${data.id}`, booking(ids.staffA, at("11:00"), { internal_notes: "online edit" }));
    const now = version(data.id);
    const r = await call("PUT", `/api/v1/appointments/${data.id}`, booking(ids.staffA, at("11:30"), { base_version: seenOffline, internal_notes: "offline edit" }));
    assert.equal(r.status, 409);
    assert.equal(r.data.error, "stale_appointment");
    assert.equal(r.data.current_version, now);
    assert.equal(sql(DB, `SELECT internal_notes FROM appointments WHERE id = '${data.id}'`), "online edit", "the newer online edit is kept");
  });

  test("force: true (\"keep mine\") overwrites a stale edit", async () => {
    const { data } = await call("POST", "/api/v1/appointments", booking(ids.staffA, at("12:00")));
    const seenOffline = version(data.id);
    await call("PUT", `/api/v1/appointments/${data.id}`, booking(ids.staffA, at("12:00"), { internal_notes: "online" }));
    const r = await call("PUT", `/api/v1/appointments/${data.id}`, booking(ids.staffA, at("12:00"), { base_version: seenOffline, force: true, internal_notes: "mine" }));
    assert.equal(r.status, 200);
    assert.equal(sql(DB, `SELECT internal_notes FROM appointments WHERE id = '${data.id}'`), "mine");
  });

  test("a payment raises the version, so an offline edit can't silently undo it", async () => {
    const { data } = await call("POST", "/api/v1/appointments", booking(ids.staffA, at("13:00")));
    const before = version(data.id);
    const pay = await call("POST", "/api/v1/transactions", { appointment_id: data.id, client_id: ids.client, amount: 30, payment_method: "cash" });
    assert.equal(pay.status, 200, JSON.stringify(pay.data));
    assert.ok(version(data.id) > before);
    const r = await call("PUT", `/api/v1/appointments/${data.id}`, booking(ids.staffA, at("13:00"), { base_version: before, payment_status: "unpaid" }));
    assert.equal(r.status, 409);
    assert.equal(r.data.error, "stale_appointment");
  });

  test("background reminder flags don't raise the version", async () => {
    const { data } = await call("POST", "/api/v1/appointments", booking(ids.staffA, at("14:00")));
    const before = version(data.id);
    sql(DB, `UPDATE appointments SET email_reminder_sent = true, push_reminder_sent = true WHERE id = '${data.id}'`);
    assert.equal(version(data.id), before);
  });

  test("an edit without base_version keeps working as before (online, older clients)", async () => {
    const { data } = await call("POST", "/api/v1/appointments", booking(ids.staffA, at("15:00")));
    await call("PUT", `/api/v1/appointments/${data.id}`, booking(ids.staffA, at("15:00"), { internal_notes: "x" }));
    const r = await call("PUT", `/api/v1/appointments/${data.id}`, booking(ids.staffA, at("15:00"), { internal_notes: "y" }));
    assert.equal(r.status, 200);
  });

  test("editing an appointment deleted meanwhile is reported, not an error 500", async () => {
    const { data } = await call("POST", "/api/v1/appointments", booking(ids.staffA, at("16:00")));
    await call("DELETE", `/api/v1/appointments/${data.id}`);
    const r = await call("PUT", `/api/v1/appointments/${data.id}`, booking(ids.staffA, at("16:00"), { base_version: 1 }));
    assert.equal(r.status, 409);
    assert.equal(r.data.error, "appointment_missing");
  });
});

describe("bookings made offline: slot conflicts", () => {
  const STAFF_DAY = "2027-03-11";
  const t = (hhmm) => `${STAFF_DAY}T${hhmm}:00+02:00`;

  test("a free slot is accepted", async () => {
    const r = await call("POST", "/api/v1/appointments", booking(ids.staffB, t("09:00"), { offline_known_overlaps: [] }));
    assert.equal(r.status, 200);
  });

  test("a slot booked online meanwhile is refused as slot_taken, with the clashing booking", async () => {
    const online = await call("POST", "/api/v1/appointments", booking(ids.staffB, t("11:00")));
    const r = await call("POST", "/api/v1/appointments", booking(ids.staffB, t("11:30"), { offline_known_overlaps: [] }));
    assert.equal(r.status, 409);
    assert.equal(r.data.error, "slot_taken");
    assert.ok(r.data.conflicts.some((c) => c.appointment_id === online.data.id));
    assert.equal(count(`SELECT COUNT(*) FROM appointment_services WHERE start_time = '${t("11:30")}'`), 0, "nothing saved");
  });

  test("an overlap that was visible offline (known) is accepted", async () => {
    const existing = await call("POST", "/api/v1/appointments", booking(ids.staffB, t("13:00")));
    const r = await call("POST", "/api/v1/appointments", booking(ids.staffB, t("13:30"), { offline_known_overlaps: [existing.data.id] }));
    assert.equal(r.status, 200);
  });

  test("force: true books it anyway", async () => {
    await call("POST", "/api/v1/appointments", booking(ids.staffB, t("15:00")));
    const r = await call("POST", "/api/v1/appointments", booking(ids.staffB, t("15:15"), { offline_known_overlaps: [], force: true }));
    assert.equal(r.status, 200);
  });

  test("touching (back-to-back) appointments are not a conflict", async () => {
    await call("POST", "/api/v1/appointments", booking(ids.staffB, t("17:00")));
    const r = await call("POST", "/api/v1/appointments", booking(ids.staffB, t("18:00"), { offline_known_overlaps: [] }));
    assert.equal(r.status, 200);
  });

  test("cancelled appointments don't block the slot", async () => {
    const c = await call("POST", "/api/v1/appointments", booking(ids.staffB, t("19:00"), { status: "cancelled" }));
    assert.equal(c.status, 200);
    const r = await call("POST", "/api/v1/appointments", booking(ids.staffB, t("19:00"), { offline_known_overlaps: [] }));
    assert.equal(r.status, 200);
  });

  test("another staff member's appointment at the same time is not a conflict", async () => {
    await call("POST", "/api/v1/appointments", booking(ids.staffA, t("20:00")));
    const r = await call("POST", "/api/v1/appointments", booking(ids.staffB, t("20:00"), { offline_known_overlaps: [] }));
    assert.equal(r.status, 200);
  });

  test("online bookings (no offline_known_overlaps) may still overlap, as before", async () => {
    await call("POST", "/api/v1/appointments", booking(ids.staffB, t("21:00")));
    const r = await call("POST", "/api/v1/appointments", booking(ids.staffB, t("21:00")));
    assert.equal(r.status, 200);
  });

  test("moving an appointment offline onto a slot taken meanwhile is refused; its own old slot isn't a conflict", async () => {
    const mine = await call("POST", "/api/v1/appointments", booking(ids.staffA, t("09:00")));
    const self = await call("PUT", `/api/v1/appointments/${mine.data.id}`, booking(ids.staffA, t("09:30"), { offline_known_overlaps: [] }));
    assert.equal(self.status, 200, "overlapping its own old time is fine");
    await call("POST", "/api/v1/appointments", booking(ids.staffA, t("11:00")));
    const r = await call("PUT", `/api/v1/appointments/${mine.data.id}`, booking(ids.staffA, t("11:15"), { offline_known_overlaps: [] }));
    assert.equal(r.status, 409);
    assert.equal(r.data.error, "slot_taken");
  });
});

describe("idempotent replays", () => {
  test("the same booking sent twice with one key is created once, with the same answer", async () => {
    const key = randomUUID();
    const body = booking(ids.staffA, "2027-03-12T09:00:00+02:00");
    const a = await call("POST", "/api/v1/appointments", body, { "Idempotency-Key": key });
    const b = await call("POST", "/api/v1/appointments", body, { "Idempotency-Key": key });
    assert.equal(a.status, 200);
    assert.deepEqual(b.data, a.data);
    assert.equal(count(`SELECT COUNT(*) FROM appointment_services WHERE start_time = '2027-03-12T09:00:00+02:00'`), 1);
  });

  test("five simultaneous replays of one booking (several tabs) create it once", async () => {
    const key = randomUUID();
    const body = booking(ids.staffA, "2027-03-12T11:00:00+02:00");
    const results = await Promise.all(Array.from({ length: 5 }, () => call("POST", "/api/v1/appointments", body, { "Idempotency-Key": key })));
    assert.ok(results.every((r) => r.status === 200), JSON.stringify(results.map((r) => r.status)));
    assert.equal(new Set(results.map((r) => r.data.id)).size, 1, "every replay gets the same appointment id");
    assert.equal(count(`SELECT COUNT(*) FROM appointment_services WHERE start_time = '2027-03-12T11:00:00+02:00'`), 1);
  });

  test("five simultaneous replays of one payment record it once", async () => {
    const { data } = await call("POST", "/api/v1/appointments", booking(ids.staffA, "2027-03-12T13:00:00+02:00"));
    const key = randomUUID();
    const body = { appointment_id: data.id, client_id: ids.client, amount: 30, payment_method: "cash" };
    const results = await Promise.all(Array.from({ length: 5 }, () => call("POST", "/api/v1/transactions", body, { "Idempotency-Key": key })));
    assert.ok(results.every((r) => r.status === 200), JSON.stringify(results.map((r) => [r.status, r.data])));
    assert.equal(count(`SELECT COUNT(*) FROM transactions WHERE appointment_id = '${data.id}'`), 1);
  });

  test("five simultaneous replays of a new client create one client", async () => {
    const key = randomUUID();
    const body = { first_name: "Offline", last_name: `Test ${key.slice(0, 6)}`, phone: "+30 690 000 0001" };
    const results = await Promise.all(Array.from({ length: 5 }, () => call("POST", "/api/v1/clients", body, { "Idempotency-Key": key })));
    assert.ok(results.every((r) => r.status === 200), JSON.stringify(results.map((r) => r.status)));
    assert.equal(new Set(results.map((r) => r.data.client.id)).size, 1);
    assert.equal(count(`SELECT COUNT(*) FROM clients WHERE last_name = '${body.last_name}'`), 1);
  });

  test("a rejected request doesn't keep its key: the corrected retry goes through", async () => {
    const key = randomUUID();
    const bad = await call("POST", "/api/v1/appointments", { ...booking(ids.staffA, "2027-03-12T15:00:00+02:00"), services: [{ service_id: ids.service, staff_id: null, start_time: "2027-03-12T15:00:00+02:00" }] }, { "Idempotency-Key": key });
    assert.equal(bad.status, 422);
    const good = await call("POST", "/api/v1/appointments", booking(ids.staffA, "2027-03-12T15:00:00+02:00"), { "Idempotency-Key": key });
    assert.equal(good.status, 200);
  });

  test("deleting twice (a replayed offline delete) succeeds both times", async () => {
    const { data } = await call("POST", "/api/v1/appointments", booking(ids.staffA, "2027-03-12T17:00:00+02:00"));
    const a = await call("DELETE", `/api/v1/appointments/${data.id}`, undefined, { "Idempotency-Key": randomUUID() });
    const b = await call("DELETE", `/api/v1/appointments/${data.id}`, undefined, { "Idempotency-Key": randomUUID() });
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal(b.data.already_deleted, true);
  });
});

describe("duplicate bookings", () => {
  test("booking the same client, staff and time again answers with the existing booking's id", async () => {
    const start = "2027-03-13T10:00:00+02:00";
    const first = await call("POST", "/api/v1/appointments", booking(ids.staffA, start));
    // e.g. "keep mine" on a slot another device filled with the same booking
    const again = await call("POST", "/api/v1/appointments", booking(ids.staffA, start, { force: true }));
    assert.equal(again.status, 200);
    assert.equal(again.data.id, first.data.id, "not null: follow-ups (a queued payment) can link to it");
    assert.equal(count(`SELECT COUNT(*) FROM appointment_services WHERE staff_id = '${ids.staffA}' AND start_time = '${start}'`), 1);
  });
});
