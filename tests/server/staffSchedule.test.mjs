// Staff schedules as the staff schedule page sets them: a weekly schedule
// applies from its week on, a change to one date applies to that date only,
// a week with no working days is a real week off, and everything that reads a
// schedule (booking checks, the portal's free times, the conflict check)
// follows the same rule. SC1–SC9.
//
// Run: node --test tests/server/staffSchedule.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { ROOT, SHOP, api, createTestDb, dropTestDb, sql, startServer, token } from "../offline/helpers.mjs";

const require = createRequire(import.meta.url);
require("dotenv").config({ path: path.join(ROOT, ".env"), quiet: true });
const jwt = require("jsonwebtoken");

const DB = "staff_schedule_test";
const PORT = 3180;
let server;
const as = {};
const ids = {};
let monday; // next week's Monday
const day = (n) => sql(DB, `SELECT ('${monday}'::date + ${n})::text`);
const at = (date, hhmm) => `${date}T${hhmm}:00${sql(DB, `SELECT to_char('${date}'::date::timestamptz, 'TZH:TZM')`)}`;
const full = [1, 2, 3, 4, 5].map((d) => ({ day_of_week: d, ranges: [{ start_time: "10:00", end_time: "18:00" }] }));

before(async () => {
  const uri = createTestDb(DB);
  const one = (role) => sql(DB, `SELECT id FROM users WHERE shop_id='${SHOP}' AND role='${role}' ORDER BY id LIMIT 1`);
  const su = sql(DB, `SELECT id || '|' || staff_id FROM users WHERE shop_id='${SHOP}' AND role='staff' AND staff_id IS NOT NULL ORDER BY id LIMIT 1`).split("|");
  const cu = sql(DB, `SELECT id || '|' || client_id FROM users WHERE shop_id='${SHOP}' AND role='client' AND client_id IS NOT NULL ORDER BY id LIMIT 1`).split("|");
  ids.staff = sql(DB, `INSERT INTO staff (shop_id, name, sort_order) VALUES ('${SHOP}', 'SCHEDULE TEST', 999) RETURNING id`).split("\n")[0];
  ids.service = sql(DB, `SELECT id FROM services WHERE shop_id='${SHOP}' AND is_active ORDER BY id LIMIT 1`);
  ids.long = sql(DB, `SELECT id || '|' || duration_minutes FROM services WHERE shop_id='${SHOP}' AND duration_minutes >= 90 ORDER BY id LIMIT 1`).split("|");
  ids.client = sql(DB, `SELECT id FROM clients WHERE shop_id='${SHOP}' ORDER BY id LIMIT 1`);
  sql(DB, `UPDATE shops SET self_booking_enabled = true WHERE id='${SHOP}'; UPDATE services SET bookable_online = true WHERE id='${ids.service}'`);
  monday = sql(DB, `SELECT (CURRENT_DATE - ((EXTRACT(DOW FROM CURRENT_DATE)::int + 6) % 7) + 7)::text`);
  server = await startServer(uri, PORT);
  const sign = (userId, role, extra) => jwt.sign({ userId, role, shopId: SHOP, ...extra }, process.env.JWT_SECRET);
  as.admin = api(PORT, token(one("admin"), "admin"));
  as.frontdesk = api(PORT, token(one("frontdesk"), "frontdesk"));
  as.staff = api(PORT, sign(su[0], "staff", { staffId: su[1] }));
  as.client = api(PORT, sign(cu[0], "client", { clientId: cu[1] }));
});
after(() => {
  server?.stop();
  dropTestDb(DB);
});

const setWeek = (from, schedule, extra = {}) =>
  as.admin("POST", `/api/v1/staff/${ids.staff}/working-hours`, { enabled: true, effective_from: from, schedule, ...extra });
const setDay = (date, ranges, extra = {}) => as.admin("PUT", `/api/v1/staff/${ids.staff}/days/${date}`, { ranges, ...extra });
const clearDay = (date) => as.admin("DELETE", `/api/v1/staff/${ids.staff}/days/${date}`);
const book = async (date, hhmm, minutes = 60) => {
  const r = await as.admin("POST", "/api/v1/appointments", {
    client_id: ids.client, status: "confirmed",
    services: [{ service_id: ids.service, staff_id: ids.staff, start_time: at(date, hhmm), duration_override: minutes, price_override: 10 }],
  });
  if (r.data?.id) sql(DB, `DELETE FROM appointments WHERE id='${r.data.id}'`);
  return r.status === 200 ? "booked" : r.data?.error;
};
const portalTimes = async (date) => {
  const r = await as.client("GET", `/api/v1/availability?service_id=${ids.service}&staff_id=${ids.staff}&date=${date}`);
  return (r.data?.slots || []).map((s) => new Date(s).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Athens" }));
};
const listed = async () => (await as.admin("GET", "/api/v1/working-hours")).data.filter((w) => w.staff_id === ids.staff);

test("SC1 a weekly schedule applies from its week on", async () => {
  assert.equal((await setWeek(monday, full)).status, 200);
  assert.equal(await book(day(1), "11:00"), "booked", "its first week");
  assert.equal(await book(day(15), "11:00"), "booked", "two weeks later");
  assert.equal(await book(day(15), "19:00"), "staff_unavailable", "outside it");
  assert.equal(await book(day(5), "11:00"), "staff_unavailable", "Saturday isn't a working day");
});

test("SC2 a change to one date is for that date only", async () => {
  await setWeek(monday, full);
  assert.equal((await setDay(day(1), [])).status, 200, "Tuesday off");
  assert.equal(await book(day(1), "11:00"), "staff_unavailable", "that Tuesday");
  assert.equal(await book(day(8), "11:00"), "booked", "the next Tuesday works as usual");
  assert.deepEqual(await portalTimes(day(1)), [], "the portal has no times that day");
  assert.equal((await clearDay(day(1))).status, 200, "back to the weekly schedule");
  assert.equal(await book(day(1), "11:00"), "booked");
});

test("SC3 one date can have several shifts, and every part of them is bookable", async () => {
  await setWeek(monday, full);
  const split = [{ start_time: "10:00", end_time: "12:00" }, { start_time: "16:00", end_time: "18:00" }];
  assert.equal((await setDay(day(2), split)).status, 200);
  assert.equal(await book(day(2), "10:30"), "booked");
  assert.equal(await book(day(2), "13:00"), "staff_unavailable", "between the shifts");
  assert.equal(await book(day(2), "16:30"), "booked");
  const times = await portalTimes(day(2));
  assert.ok(times.includes("10:00") && times.includes("16:00") && times.includes("17:00"), times.join(" "));
  assert.ok(!times.includes("13:00"));
  await clearDay(day(2));
});

test("SC4 the portal offers every shift of a weekly split day too", async () => {
  await setWeek(monday, [{ day_of_week: 1, ranges: [{ start_time: "10:00", end_time: "12:00" }, { start_time: "16:00", end_time: "18:00" }] }]);
  const times = await portalTimes(monday);
  assert.ok(times.includes("10:00") && times.includes("16:00"), times.join(" "));
  await setWeek(monday, full);
});

test("SC5 a week with no working days is stored, and is days off from then on", async () => {
  await setWeek(monday, full);
  const nextMonday = day(7);
  assert.equal((await setWeek(nextMonday, [])).status, 200);
  assert.ok((await listed()).some((w) => w.kind === "version" && w.effective_from === nextMonday), "listed as a schedule");
  assert.equal(await book(day(8), "11:00"), "staff_unavailable");
  assert.equal(await book(day(1), "11:00"), "booked", "the week before is unchanged");
  assert.equal((await as.admin("DELETE", `/api/v1/staff/${ids.staff}/working-hours/${nextMonday}`)).status, 200, "removed again");
  assert.equal(await book(day(8), "11:00"), "booked");
});

test("SC6 a weekly change keeps the one-date changes inside it", async () => {
  await setWeek(monday, full);
  await setDay(day(9), [{ start_time: "12:00", end_time: "14:00" }]);
  await setWeek(day(7), full.map((d) => ({ ...d, ranges: [{ start_time: "09:00", end_time: "17:00" }] })));
  assert.equal(await book(day(9), "09:00"), "staff_unavailable", "the date keeps its own hours");
  assert.equal(await book(day(9), "12:00"), "booked");
  assert.equal(await book(day(10), "09:00"), "booked", "the other days follow the new schedule");
  await clearDay(day(9));
});

test("SC7 bookings outside a new schedule or date are listed first, by their real length", async () => {
  await setWeek(monday, full);
  const r = await as.admin("POST", "/api/v1/appointments", {
    client_id: ids.client, status: "confirmed",
    services: [{ service_id: ids.long[0], staff_id: ids.staff, start_time: at(day(2), "16:00"), duration_override: Number(ids.long[1]), price_override: 10 }],
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  // Saved without its own length (older bookings): the service's length counts.
  sql(DB, `UPDATE appointment_services SET duration_override = NULL WHERE appointment_id='${r.data.id}'`);
  const ends1715 = full.map((d) => (d.day_of_week === 3 ? { day_of_week: 3, ranges: [{ start_time: "10:00", end_time: "17:15" }] } : d));
  const week = await setWeek(monday, ends1715);
  assert.equal(week.status, 409, "the weekly change");
  assert.equal(week.data.conflicts.length, 1);
  const date = await setDay(day(2), [{ start_time: "10:00", end_time: "17:15" }]);
  assert.equal(date.status, 409, "the one-date change");
  assert.equal((await setDay(day(2), [{ start_time: "10:00", end_time: "17:15" }], { force: true })).status, 200, "unless kept anyway");
  await clearDay(day(2));
  sql(DB, `DELETE FROM appointments WHERE id='${r.data.id}'`);
});

test("SC8 what's refused, and why", async () => {
  assert.equal((await setWeek(day(2), full)).data?.error, "effective_from must be a Monday");
  assert.equal((await setDay(sql(DB, "SELECT (CURRENT_DATE - 1)::text"), [])).data?.error, "date cannot be in the past");
  assert.equal((await setDay(day(1), [{ start_time: "18:00", end_time: "10:00" }])).data?.error, "end_time must be after start_time");
  assert.equal((await setDay(day(1), [{ start_time: "10:00", end_time: "14:00" }, { start_time: "13:00", end_time: "18:00" }])).data?.error, "overlapping_ranges");
});

test("SC9 plain staff can't change schedules; front desk can", async () => {
  const before = sql(DB, `SELECT count(*) FROM staff_working_hours WHERE staff_id='${ids.staff}'`);
  for (const [method, url, body] of [
    ["POST", `/api/v1/staff/${ids.staff}/working-hours`, { enabled: true, effective_from: monday, schedule: full }],
    ["DELETE", `/api/v1/staff/${ids.staff}/working-hours/${monday}`],
    ["PUT", `/api/v1/staff/${ids.staff}/days/${day(1)}`, { ranges: [] }],
    ["DELETE", `/api/v1/staff/${ids.staff}/days/${day(1)}`],
  ]) {
    assert.equal((await as.staff(method, url, body)).status, 403, `${method} ${url}`);
  }
  assert.equal(sql(DB, `SELECT count(*) FROM staff_working_hours WHERE staff_id='${ids.staff}'`), before);
  assert.equal((await as.frontdesk("PUT", `/api/v1/staff/${ids.staff}/days/${day(3)}`, { ranges: [] })).status, 200);
  await clearDay(day(3));
});
