// The free start times a client can book (or move a booking to): every 15
// minutes inside the staff member's working shifts on the date, where the
// whole service fits clear of their other bookings, breaks and leave. Shared
// by the portal's /availability (the booking screens) and the reschedule
// route (the screens and the AI assistant), so both offer the same times.
const { workingRangesOn, bookableShifts } = require("./staffSchedule");

const STEP_MINUTES = 15;

/** How long before a booking's start a client may still book, move or cancel it online. */
const noticeMinutes = async (db, shopId) =>
  Number((await db.query("SELECT portal_min_notice_minutes FROM shops WHERE id = $1", [shopId])).rows[0]?.portal_min_notice_minutes) || 0;

/**
 * Where a staff member can be booked on a date, as the calendar column shows
 * it (domain/staffSchedule.js): their own hours if they keep them, else the
 * shop's opening hours. [] when they don't work, or aren't the shop's.
 */
const shiftsOn = async (db, staffId, shopId, date) => {
  const staffRow = await db.query("SELECT working_hours_enabled FROM staff WHERE id = $1 AND shop_id = $2", [staffId, shopId]);
  const staff = staffRow.rows[0];
  if (!staff) return [];
  if (!staff.working_hours_enabled) {
    const shopRow = await db.query("SELECT slot_min_time, slot_max_time FROM shops WHERE id = $1", [shopId]);
    return bookableShifts(staff, shopRow.rows[0], null);
  }
  return bookableShifts(staff, null, await workingRangesOn(db, staffId, date));
};

/**
 * Free start times (ISO strings) for one staff member and service length on
 * a date ("YYYY-MM-DD", shop time). `skipPast` drops times already gone (for
 * clients); `excludeAppointmentId` ignores that booking's own time, so a
 * booking being moved doesn't collide with itself.
 */
const freeStartTimes = async (
  db,
  { shopId, staffId, date, durationMinutes, skipPast = false, excludeAppointmentId = null, now = Date.now() },
) => {
  const shifts = await shiftsOn(db, staffId, shopId, date);
  if (!shifts.length) return [];
  // A client can't book closer to the start than the shop's notice period.
  const earliest = skipPast ? now + (await noticeMinutes(db, shopId)) * 60000 : -Infinity;

  const [busyRes, timeOffRes] = await Promise.all([
    db.query(
      `SELECT aps.start_time,
              (aps.start_time + (COALESCE(NULLIF(aps.duration_override, 0), s.duration_minutes, 60) || ' minutes')::interval) AS end_time
       FROM appointment_services aps
       JOIN appointments a ON a.id = aps.appointment_id
       JOIN services s ON s.id = aps.service_id
       WHERE aps.staff_id = $1 AND a.shop_id = $2 AND a.status != 'cancelled'
         AND aps.start_time::date = $3::date
         AND ($4::uuid IS NULL OR a.id <> $4::uuid)`,
      [staffId, shopId, date, excludeAppointmentId],
    ),
    db.query(
      `SELECT start_date, start_time, end_time, type FROM staff_time_off
       WHERE staff_id = $1 AND shop_id = $2
         AND (
           (type = 'leave' AND $3::date BETWEEN start_date AND end_date)
           OR (type = 'break' AND start_date = $3::date)
         )`,
      [staffId, shopId, date],
    ),
  ]);

  const dayBase = new Date(`${date}T00:00:00`);
  const at = (hhmm) => {
    const [h, m] = String(hhmm).split(":").map(Number);
    const d = new Date(dayBase);
    d.setHours(h, m, 0, 0);
    return d.getTime();
  };
  const busy = busyRes.rows.map((r) => ({ start: new Date(r.start_time).getTime(), end: new Date(r.end_time).getTime() }));
  for (const row of timeOffRes.rows) {
    if (row.type === "leave") busy.push({ start: -Infinity, end: Infinity });
    else busy.push({ start: at(row.start_time), end: at(row.end_time) });
  }

  const slots = [];
  const stepMs = STEP_MINUTES * 60000;
  const durationMs = durationMinutes * 60000;
  for (const shift of shifts) {
    for (let t = at(shift.start_time); t + durationMs <= at(shift.end_time); t += stepMs) {
      if (t < earliest) continue;
      const end = t + durationMs;
      if (!busy.some((b) => t < b.end && end > b.start)) slots.push(new Date(t).toISOString());
    }
  }
  return slots;
};

/**
 * The staff who can be booked online for a service, in the shop's own order:
 * active, shown in the calendar, and either linked to the service or linked
 * to none (staff with no services linked do any). The order decides who
 * "Anyone" gets.
 */
const eligibleStaff = async (db, shopId, serviceId) =>
  (
    await db.query(
      `SELECT s.id, s.name, s.photo_url, s.specialty
       FROM staff s
       WHERE s.shop_id = $1 AND s.is_active = true AND s.visible_in_calendar = true
         AND (
           NOT EXISTS (SELECT 1 FROM staff_services ss WHERE ss.staff_id = s.id)
           OR EXISTS (SELECT 1 FROM staff_services ss WHERE ss.staff_id = s.id AND ss.service_id = $2)
         )
       ORDER BY s.sort_order, s.name`,
      [shopId, serviceId],
    )
  ).rows;

/**
 * Free start times on a date across several staff members, each time once,
 * with the first of them (in the order given) who is free then: what
 * "Anyone" books. [{ start_time, staff_id, staff_name }], earliest first.
 */
const mergedStartTimes = async (db, { shopId, staff, date, durationMinutes, skipPast = true, excludeAppointmentId = null }) => {
  const perStaff = await Promise.all(
    staff.map((m) => freeStartTimes(db, { shopId, staffId: m.id, date, durationMinutes, skipPast, excludeAppointmentId })),
  );
  const byTime = new Map();
  staff.forEach((m, i) => {
    for (const t of perStaff[i]) if (!byTime.has(t)) byTime.set(t, { start_time: t, staff_id: m.id, staff_name: m.name });
  });
  return [...byTime.values()].sort((a, b) => a.start_time.localeCompare(b.start_time));
};

module.exports = { shiftsOn, freeStartTimes, noticeMinutes, eligibleStaff, mergedStartTimes, STEP_MINUTES };
