// The front desk's waitlist: entries (client, service, therapist or anyone,
// the dates, weekdays and time of day they can come), the waiting clients a
// freed slot suits, an entry marked booked when booked from, and when an
// entry can be booked, and the times cancellations free. WL1–WL13.
//
// Run: node --test tests/server/waitlist.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { ROOT, SHOP, api, createTestDb, dropTestDb, sql, startServer, token } from "../offline/helpers.mjs";

const require = createRequire(import.meta.url);
require("dotenv").config({ path: path.join(ROOT, ".env"), quiet: true });
const jwt = require("jsonwebtoken");

const DB = "waitlist_test";
const PORT = 3178;
let server;
const as = {};
const ids = {};
let monday; // next week's Monday
const day = (n) => sql(DB, `SELECT ('${monday}'::date + ${n})::text`);
const at = (date, hhmm) => new Date(`${date}T${hhmm}:00${sql(DB, `SELECT to_char('${date}'::date::timestamptz, 'TZH:TZM')`)}`).toISOString();

before(async () => {
  const uri = createTestDb(DB);
  const one = (role) => sql(DB, `SELECT id FROM users WHERE shop_id='${SHOP}' AND role='${role}' ORDER BY id LIMIT 1`);
  const su = sql(DB, `SELECT id || '|' || staff_id FROM users WHERE shop_id='${SHOP}' AND role='staff' AND staff_id IS NOT NULL ORDER BY id LIMIT 1`).split("|");
  [ids.anna, ids.eleni] = sql(DB, `SELECT id FROM staff WHERE shop_id='${SHOP}' AND COALESCE(capacity, 1) = 1 AND is_active AND visible_in_calendar ORDER BY id LIMIT 2`).split("\n");
  ids.service = sql(DB, `SELECT id FROM services WHERE shop_id='${SHOP}' AND is_active AND duration_minutes = 60 ORDER BY id LIMIT 1`);
  [ids.c1, ids.c2] = sql(DB, `SELECT id FROM clients WHERE shop_id='${SHOP}' ORDER BY id LIMIT 2`).split("\n");
  monday = sql(DB, `SELECT (CURRENT_DATE - ((EXTRACT(DOW FROM CURRENT_DATE)::int + 6) % 7) + 7)::text`);
  server = await startServer(uri, PORT);
  as.frontdesk = api(PORT, token(one("frontdesk"), "frontdesk"));
  as.admin = api(PORT, token(one("admin"), "admin"));
  as.staff = api(PORT, jwt.sign({ userId: su[0], role: "staff", shopId: SHOP, staffId: su[1] }, process.env.JWT_SECRET));
});
after(() => {
  server?.stop();
  dropTestDb(DB);
});

const add = (extra = {}) =>
  as.frontdesk("POST", "/api/v1/waitlist", { client_id: ids.c1, service_id: ids.service, date_from: monday, date_to: day(13), ...extra });
const matches = async (staffId, from, to) =>
  (await as.frontdesk("GET", `/api/v1/waitlist/matches?staff_id=${staffId}&start=${encodeURIComponent(from)}&end=${encodeURIComponent(to)}`)).data.map((e) => e.id);
const clear = () => sql(DB, "DELETE FROM waitlist_entries");

test("WL1 an entry is listed with its client, service and wishes, until its last date", async () => {
  clear();
  const r = await add({ staff_id: ids.anna, days: [2, 4], time_from: "17:00", time_to: "21:00", note: "after work" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(
    { days: r.data.days, from: r.data.time_from, to: r.data.time_to, note: r.data.note, staff: r.data.staff_id },
    { days: [2, 4], from: "17:00", to: "21:00", note: "after work", staff: ids.anna },
  );
  assert.ok(r.data.client_name && r.data.service_name);
  sql(DB, `INSERT INTO waitlist_entries (shop_id, client_id, date_from, date_to) VALUES ('${SHOP}', '${ids.c2}', CURRENT_DATE - 10, CURRENT_DATE - 1)`);
  assert.deepEqual((await as.frontdesk("GET", "/api/v1/waitlist")).data.map((e) => e.id), [r.data.id], "past ones aren't listed");
  assert.equal((await as.frontdesk("GET", "/api/v1/waitlist?all=1")).data.length, 2, "unless asked for");
});

test("WL2 a freed slot finds who it suits", async () => {
  clear();
  const tueEvening = (await add({ days: [2], time_from: "17:00", time_to: "21:00" })).data.id;
  const annaOnly = (await add({ client_id: ids.c2, staff_id: ids.anna })).data.id;
  // Tuesday 18:00–19:00 with Eleni: the Tuesday-evening client (any therapist), not Anna's.
  assert.deepEqual(await matches(ids.eleni, at(day(1), "18:00"), at(day(1), "19:00")), [tueEvening]);
  // With Anna: both.
  assert.deepEqual(await matches(ids.anna, at(day(1), "18:00"), at(day(1), "19:00")), [tueEvening, annaOnly]);
  // Wednesday: not one of the first one's days.
  assert.deepEqual(await matches(ids.anna, at(day(2), "18:00"), at(day(2), "19:00")), [annaOnly]);
  // Tuesday morning: outside the first one's hours.
  assert.deepEqual(await matches(ids.anna, at(day(1), "10:00"), at(day(1), "11:00")), [annaOnly]);
  // 30 minutes free: the 60-minute service doesn't fit.
  assert.deepEqual(await matches(ids.anna, at(day(1), "18:00"), at(day(1), "18:30")), []);
  // 20:30–21:30: the service would end after the client's 21:00.
  assert.deepEqual(await matches(ids.anna, at(day(1), "20:30"), at(day(1), "21:30")), [annaOnly]);
  // After their last date: nobody.
  assert.deepEqual(await matches(ids.anna, at(day(15), "18:00"), at(day(15), "19:00")), []);
});

test("WL3 a booking made from an entry marks it booked, and it leaves the list", async () => {
  clear();
  const entry = (await add()).data.id;
  const r = await as.frontdesk("POST", "/api/v1/appointments", {
    client_id: ids.c1, status: "confirmed", allow_overtime: true, allow_unavailable: true, waitlist_entry_id: entry,
    services: [{ service_id: ids.service, staff_id: ids.anna, start_time: at(day(3), "11:00"), duration_override: 60, price_override: 30 }],
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(sql(DB, `SELECT status || '|' || appointment_id FROM waitlist_entries WHERE id='${entry}'`), `booked|${r.data.id}`);
  assert.deepEqual((await as.frontdesk("GET", "/api/v1/waitlist")).data, []);
  assert.deepEqual(await matches(ids.anna, at(day(4), "11:00"), at(day(4), "12:00")), [], "nor is it suggested");
});

test("WL4 editing and removing", async () => {
  clear();
  const entry = (await add()).data.id;
  const edited = await as.admin("PUT", `/api/v1/waitlist/${entry}`, { client_id: ids.c1, date_from: monday, date_to: monday, time_from: "09:00", time_to: "12:00" });
  assert.equal(edited.status, 200, JSON.stringify(edited.data));
  assert.equal(edited.data.service_id, null, "any service");
  assert.equal(edited.data.date_to, monday);
  assert.equal((await as.frontdesk("DELETE", `/api/v1/waitlist/${entry}`)).status, 200);
  assert.equal(sql(DB, `SELECT status FROM waitlist_entries WHERE id='${entry}'`), "removed", "kept, as removed");
  assert.deepEqual((await as.frontdesk("GET", "/api/v1/waitlist")).data, []);
});

// Free times: one staff member's own hours, bookings, breaks, leave and the
// entry's own hours; who does the service; shared places; a long wait looked
// at a week of free days at a time. WL6–WL9.
const freeTimes = async (entryId, after = "") =>
  (await as.frontdesk("GET", `/api/v1/waitlist/${entryId}/free-times${after ? `?after=${after}` : ""}`)).data;
const startsOf = (result, staffId, date) =>
  result.days.find((d) => d.date === date)?.staff.find((s) => s.staff_id === staffId)?.starts || [];
const book = (staffId, date, from, extra = {}, clientId = ids.c2) =>
  as.frontdesk("POST", "/api/v1/appointments", {
    client_id: clientId, status: "confirmed", allow_overtime: true, allow_unavailable: true, allow_over_capacity: true,
    services: [{ service_id: ids.service, staff_id: staffId, start_time: at(date, from), duration_override: 60, price_override: 30, ...extra }],
  });
const ownHours = (staffId, date, ranges) =>
  sql(DB, `UPDATE staff SET working_hours_enabled = true WHERE id = '${staffId}';
    INSERT INTO staff_schedule_days (staff_id, shop_id, date, ranges) VALUES ('${staffId}', '${SHOP}', '${date}', '${JSON.stringify(ranges)}')
    ON CONFLICT (staff_id, date) DO UPDATE SET ranges = EXCLUDED.ranges`);

test("WL6 free times: inside their hours and the client's, clear of bookings, breaks and leave", async () => {
  clear();
  const tue = day(1);
  ownHours(ids.anna, tue, [{ start_time: "10:00", end_time: "14:00" }]);
  assert.equal((await book(ids.anna, tue, "11:00")).status, 200);
  sql(DB, `INSERT INTO staff_time_off (staff_id, shop_id, type, start_date, end_date, start_time, end_time)
    VALUES ('${ids.anna}', '${SHOP}', 'break', '${tue}', '${tue}', '13:00', '13:30'),
           ('${ids.anna}', '${SHOP}', 'leave', '${day(2)}', '${day(2)}', NULL, NULL)`);
  ownHours(ids.anna, day(2), [{ start_time: "10:00", end_time: "14:00" }]);
  const entry = (await add({ staff_id: ids.anna, date_from: tue, date_to: day(2) })).data.id;
  const r = await freeTimes(entry);
  assert.equal(r.duration_minutes, 60);
  // 10:00 ends as the 11:00 booking starts and 12:00 as the 13:00 break
  // starts; after the break, 13:30 would end past closing.
  assert.deepEqual(startsOf(r, ids.anna, tue), ["10:00", "12:00"]);
  assert.deepEqual(r.days.map((d) => d.date), [tue], "the leave day has nothing");

  // The client's own hours: from 11:30 only 12:00 is left.
  const late = (await add({ staff_id: ids.anna, date_from: tue, date_to: tue, time_from: "11:30" })).data.id;
  assert.deepEqual(startsOf(await freeTimes(late), ids.anna, tue), ["12:00"]);
  // Not one of the client's weekdays: nothing.
  const thursdays = (await add({ staff_id: ids.anna, date_from: tue, date_to: tue, days: [4] })).data.id;
  assert.deepEqual((await freeTimes(thursdays)).days, []);
});

test("WL7 anyone: every staff member who does the service; one with services of their own only does those", async () => {
  clear();
  const wed = day(2);
  sql(DB, `DELETE FROM staff_time_off WHERE staff_id IN ('${ids.anna}', '${ids.eleni}')`);
  ownHours(ids.anna, wed, [{ start_time: "10:00", end_time: "11:00" }]);
  // Eleni by her weekly schedule (Wednesdays 10–11).
  sql(DB, `UPDATE staff SET working_hours_enabled = true WHERE id = '${ids.eleni}';
    DELETE FROM staff_schedule_days WHERE staff_id = '${ids.eleni}';
    INSERT INTO staff_schedule_versions (staff_id, shop_id, effective_from) VALUES ('${ids.eleni}', '${SHOP}', '${monday}') ON CONFLICT DO NOTHING;
    DELETE FROM staff_working_hours WHERE staff_id = '${ids.eleni}' AND effective_from = '${monday}';
    INSERT INTO staff_working_hours (staff_id, shop_id, day_of_week, start_time, end_time, effective_from)
    VALUES ('${ids.eleni}', '${SHOP}', 3, '10:00', '11:00', '${monday}')`);
  const entry = (await add({ date_from: wed, date_to: wed })).data.id;
  let r = await freeTimes(entry);
  assert.deepEqual(startsOf(r, ids.anna, wed), ["10:00"]);
  assert.deepEqual(startsOf(r, ids.eleni, wed), ["10:00"], "her weekly schedule counts");

  // Eleni does another service only: she's left out.
  const other = sql(DB, `SELECT id FROM services WHERE shop_id='${SHOP}' AND id <> '${ids.service}' ORDER BY id LIMIT 1`);
  sql(DB, `DELETE FROM staff_services WHERE staff_id = '${ids.eleni}'; INSERT INTO staff_services (staff_id, service_id) VALUES ('${ids.eleni}', '${other}')`);
  r = await freeTimes(entry);
  assert.deepEqual(startsOf(r, ids.eleni, wed), []);
  assert.deepEqual(startsOf(r, ids.anna, wed), ["10:00"]);
  // Nor is a freed time of hers suggested for it.
  assert.deepEqual(await matches(ids.eleni, at(wed, "10:00"), at(wed, "11:00")), []);
  // Once she does it too, she's back.
  sql(DB, `INSERT INTO staff_services (staff_id, service_id) VALUES ('${ids.eleni}', '${ids.service}')`);
  assert.deepEqual(startsOf(await freeTimes(entry), ids.eleni, wed), ["10:00"]);
  sql(DB, `DELETE FROM staff_services WHERE staff_id = '${ids.eleni}'`);
});

test("WL8 a shared place is free while a place is left; a blocked time is full", async () => {
  clear();
  const thu = day(3);
  const sauna = sql(DB, `SELECT id FROM staff WHERE shop_id='${SHOP}' AND trim(name) = 'ΣΑΟΥΝΑ' LIMIT 1`);
  sql(DB, `DELETE FROM staff_services WHERE staff_id = '${sauna}'; DELETE FROM staff_time_off WHERE staff_id = '${sauna}'`);
  ownHours(sauna, thu, [{ start_time: "10:00", end_time: "11:00" }]);
  const entry = (await add({ staff_id: sauna, date_from: thu, date_to: thu })).data.id;
  assert.equal((await book(sauna, thu, "10:00", { persons: 4 })).status, 200);
  assert.deepEqual(startsOf(await freeTimes(entry), sauna, thu), ["10:00"], "4 of 5 places taken");
  // Another client (the same client's second booking that day would join their first).
  assert.equal((await book(sauna, thu, "10:00", {}, ids.c1)).status, 200);
  assert.deepEqual((await freeTimes(entry)).days, [], "all 5 taken");

  const fri = day(4);
  ownHours(sauna, fri, [{ start_time: "10:00", end_time: "11:00" }]);
  const friEntry = (await add({ staff_id: sauna, date_from: fri, date_to: fri })).data.id;
  sql(DB, `WITH a AS (INSERT INTO appointments (shop_id, status, is_block) VALUES ('${SHOP}', 'confirmed', true) RETURNING id)
    INSERT INTO appointment_services (appointment_id, service_id, staff_id, start_time, duration_override, shop_id)
    SELECT a.id, '${ids.service}', '${sauna}', '${at(fri, "10:00")}', 60, '${SHOP}' FROM a`);
  assert.deepEqual((await freeTimes(friEntry)).days, []);
});

test("WL9 a long wait: seven days with free times at a time, and where to go on from", async () => {
  clear();
  sql(DB, `DELETE FROM staff_time_off WHERE staff_id = '${ids.anna}'; DELETE FROM appointment_services WHERE staff_id = '${ids.anna}'`);
  for (let n = 0; n < 10; n++) ownHours(ids.anna, day(n), [{ start_time: "10:00", end_time: "11:00" }]);
  const entry = (await add({ staff_id: ids.anna, date_from: monday, date_to: day(9) })).data.id;
  const first = await freeTimes(entry);
  assert.deepEqual(first.days.map((d) => d.date), [0, 1, 2, 3, 4, 5, 6].map(day));
  assert.equal(first.next, day(7));
  const second = await freeTimes(entry, first.next);
  assert.deepEqual(second.days.map((d) => d.date), [day(7), day(8), day(9)]);
  assert.equal(second.next, null, "their last date reached");
  assert.equal((await as.frontdesk("GET", `/api/v1/waitlist/${entry}/free-times?after=soon`)).status, 400);
});

// Times freed by cancellations: counted while they suit someone waiting and
// nobody took them again; dismissed for everyone. WL10–WL12.
const freed = async () => (await as.frontdesk("GET", "/api/v1/waitlist/freed")).data;
const freshDay = (n, staffId) => {
  sql(DB, `DELETE FROM waitlist_freed_slots; DELETE FROM staff_time_off WHERE staff_id = '${staffId}'`);
  ownHours(staffId, day(n), [{ start_time: "09:00", end_time: "21:00" }]);
  return day(n);
};

test("WL10 a cancelled or deleted booking's time counts while it suits someone waiting", async () => {
  clear();
  const fri = freshDay(4, ids.anna);
  const a = (await book(ids.anna, fri, "11:00")).data.id;
  const b = (await book(ids.anna, fri, "15:00", {}, ids.c1)).data.id;
  assert.deepEqual(await freed(), [], "nothing freed yet");

  // Nobody waiting fits it: recorded, but not counted.
  assert.equal((await as.frontdesk("POST", `/api/v1/appointments/${a}/cancel`)).status, 200);
  assert.equal(sql(DB, "SELECT count(*) FROM waitlist_freed_slots"), "1");
  assert.deepEqual(await freed(), []);

  // Someone waiting for Friday mornings: now it counts, with them.
  const entry = (await add({ date_from: fri, date_to: fri, time_from: "10:00", time_to: "13:00" })).data.id;
  const [slot] = await freed();
  assert.deepEqual({ staff: slot.staff_id, start: slot.start, end: slot.end, who: slot.matches.map((m) => m.id) },
    { staff: ids.anna, start: at(fri, "11:00"), end: at(fri, "12:00"), who: [entry] });

  // A deleted booking frees its time too.
  await add({ client_id: ids.c2, date_from: fri, date_to: fri, time_from: "14:00", time_to: "17:00" });
  assert.equal((await as.frontdesk("DELETE", `/api/v1/appointments/${b}`)).status, 200);
  assert.deepEqual((await freed()).map((f) => f.start), [at(fri, "11:00"), at(fri, "15:00")]);

  // The client no longer waiting: the 11:00 stops counting.
  await as.frontdesk("DELETE", `/api/v1/waitlist/${entry}`);
  assert.deepEqual((await freed()).map((f) => f.start), [at(fri, "15:00")]);
});

test("WL11 it stops counting once taken again, dismissed, or begun", async () => {
  clear();
  const fri = freshDay(4, ids.anna);
  const entry = (await add({ date_from: fri, date_to: fri })).data.id;
  for (const from of ["10:00", "12:00", "14:00"]) {
    const id = (await book(ids.anna, fri, from)).data.id;
    await as.frontdesk("POST", `/api/v1/appointments/${id}/cancel`);
  }
  assert.equal((await freed()).length, 3);

  // Booked again (from the waitlist or not).
  assert.equal((await book(ids.anna, fri, "10:30", {}, ids.c1)).status, 200);
  assert.deepEqual((await freed()).map((f) => f.start), [at(fri, "12:00"), at(fri, "14:00")]);

  // Dismissed: gone for everyone.
  const noon = (await freed())[0].id;
  assert.equal((await as.admin("DELETE", `/api/v1/waitlist/freed/${noon}`)).status, 200);
  assert.deepEqual((await freed()).map((f) => f.start), [at(fri, "14:00")]);
  assert.equal((await as.frontdesk("DELETE", `/api/v1/waitlist/freed/${noon}`)).status, 404, "already dismissed");

  // Begun: a freed time in the past isn't counted.
  sql(DB, "UPDATE waitlist_freed_slots SET start_time = NOW() - interval '1 hour', end_time = NOW()");
  assert.deepEqual(await freed(), []);
  assert.ok(entry);
});

test("WL12 a shared place counts while a place is left; past bookings free nothing; staff can't see it", async () => {
  clear();
  const sauna = sql(DB, `SELECT id FROM staff WHERE shop_id='${SHOP}' AND trim(name) = 'ΣΑΟΥΝΑ' LIMIT 1`);
  sql(DB, `DELETE FROM staff_services WHERE staff_id = '${sauna}'; DELETE FROM appointment_services WHERE staff_id = '${sauna}' AND start_time >= '${day(5)}'`);
  const sat = freshDay(5, sauna);
  await add({ staff_id: sauna, date_from: sat, date_to: sat });
  const four = (await book(sauna, sat, "10:00", { persons: 4 })).data.id;
  const one = (await book(sauna, sat, "10:00", {}, ids.c1)).data.id;
  await as.frontdesk("POST", `/api/v1/appointments/${one}/cancel`);
  assert.equal((await freed()).length, 1, "4 of 5 places taken: one is free");
  assert.equal((await book(sauna, sat, "10:00", {}, ids.c1)).status, 200);
  assert.deepEqual(await freed(), [], "full again");
  assert.ok(four);

  sql(DB, "DELETE FROM waitlist_freed_slots");
  const past = sql(DB, `WITH a AS (INSERT INTO appointments (shop_id, client_id, status) VALUES ('${SHOP}', '${ids.c2}', 'confirmed') RETURNING id)
    INSERT INTO appointment_services (appointment_id, service_id, staff_id, start_time, shop_id)
    SELECT a.id, '${ids.service}', '${ids.anna}', NOW() - interval '2 hours', '${SHOP}' FROM a RETURNING appointment_id`);
  await as.frontdesk("POST", `/api/v1/appointments/${past}/cancel`);
  assert.equal(sql(DB, "SELECT count(*) FROM waitlist_freed_slots"), "0");
  assert.equal((await as.staff("GET", "/api/v1/waitlist/freed")).status, 403);
});

test("WL13 the button's number: waiting clients with a free time anywhere in their dates", async () => {
  clear();
  const fri = freshDay(4, ids.anna);
  sql(DB, `DELETE FROM appointment_services WHERE staff_id = '${ids.anna}' AND start_time >= '${monday}'`);
  ownHours(ids.anna, fri, [{ start_time: "10:00", end_time: "11:00" }]);
  const free = (await add({ staff_id: ids.anna, date_from: fri, date_to: fri })).data.id;
  const full = (await add({ client_id: ids.c2, staff_id: ids.anna, date_from: fri, date_to: fri })).data.id;
  const booking = (await book(ids.anna, fri, "10:00", {}, ids.c1)).data.id;
  assert.deepEqual((await as.frontdesk("GET", "/api/v1/waitlist/bookable")).data, [], "the one hour is taken");
  // Cancelled: both can be booked now.
  await as.frontdesk("POST", `/api/v1/appointments/${booking}/cancel`);
  assert.deepEqual((await as.frontdesk("GET", "/api/v1/waitlist/bookable")).data, [free, full]);
  // A free time weeks ahead, past one look's stretch, counts too.
  sql(DB, "DELETE FROM waitlist_entries");
  ownHours(ids.anna, day(50), [{ start_time: "10:00", end_time: "11:00" }]);
  sql(DB, `UPDATE staff SET working_hours_enabled = true WHERE id = '${ids.anna}';
    DELETE FROM staff_schedule_versions WHERE staff_id = '${ids.anna}'`);
  const later = (await add({ staff_id: ids.anna, date_from: day(5), date_to: day(60) })).data.id;
  assert.deepEqual((await as.frontdesk("GET", "/api/v1/waitlist/bookable")).data, [later]);
  assert.equal((await as.staff("GET", "/api/v1/waitlist/bookable")).status, 403);
});

test("WL5 what's refused, and who may use it", async () => {
  assert.equal((await add({ client_id: null })).data.error, "client_id is required");
  assert.equal((await add({ date_to: sql(DB, `SELECT ('${monday}'::date - 1)::text`) })).data.error, "date_to must not be before date_from");
  assert.equal((await add({ time_from: "18:00", time_to: "17:00" })).data.error, "time_to must be after time_from");
  assert.equal((await add({ days: [7] })).data.error, "days must be 0 to 6");
  for (const [method, url, body] of [["GET", "/api/v1/waitlist"], ["POST", "/api/v1/waitlist", { client_id: ids.c1, date_from: monday, date_to: monday }]]) {
    assert.equal((await as.staff(method, url, body)).status, 403, `staff ${method}`);
  }
});
