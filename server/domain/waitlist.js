// The waitlist: clients who want a service when a place opens. The front
// desk keeps it (routes/waitlist.js); a freed slot is matched against it, and
// a booking made from an entry marks it booked.
const { workingRangesBetween, bookableShifts } = require("./staffSchedule");
const { peakPersons, personsOf, placesOf } = require("./capacity");

const ENTRY_SELECT = `
  SELECT w.id, w.client_id, w.service_id, w.staff_id,
         w.date_from::text AS date_from, w.date_to::text AS date_to, w.days,
         to_char(w.time_from, 'HH24:MI') AS time_from, to_char(w.time_to, 'HH24:MI') AS time_to,
         w.note, w.status, w.appointment_id, w.created_at,
         c.first_name, c.last_name, c.first_name || ' ' || c.last_name AS client_name, c.phone AS client_phone,
         s.name AS service_name, s.duration_minutes, st.name AS staff_name
  FROM waitlist_entries w
  JOIN clients c ON c.id = w.client_id
  LEFT JOIN services s ON s.id = w.service_id
  LEFT JOIN staff st ON st.id = w.staff_id`;

// Who does which service (staff_services): a staff member with services of
// their own does only those; one with none does any (most staff have none).
const DOES_SERVICE = (staff, service) => `(
  ${service} IS NULL
  OR NOT EXISTS (SELECT 1 FROM staff_services ss WHERE ss.staff_id = ${staff})
  OR EXISTS (SELECT 1 FROM staff_services ss WHERE ss.staff_id = ${staff} AND ss.service_id = ${service})
)`;

/**
 * The waiting entries a free slot (one therapist, start to end) suits: the
 * slot's date is in their dates and on one of their weekdays, it starts in
 * their time window and their service (its usual length) fits in it before
 * the window and the slot end, and they want that therapist or anyone.
 */
const matchesForSlot = async (db, shopId, { staffId, start, end }) => {
  const { rows } = await db.query(
    `${ENTRY_SELECT}
     CROSS JOIN LATERAL (
       SELECT ($3::timestamptz)::date AS day, ($3::timestamptz)::time AS from_time,
              ($3::timestamptz + (COALESCE(s.duration_minutes, 0) || ' minutes')::interval) AS service_end
     ) slot
     WHERE w.shop_id = $1 AND w.status = 'waiting'
       AND slot.day BETWEEN w.date_from AND w.date_to
       AND (cardinality(w.days) = 0 OR EXTRACT(DOW FROM slot.day)::smallint = ANY (w.days))
       AND (w.staff_id IS NULL OR w.staff_id = $2)
       AND ${DOES_SERVICE("$2", "w.service_id")}
       AND slot.service_end <= $4::timestamptz
       AND (w.time_from IS NULL OR slot.from_time >= w.time_from)
       AND (w.time_to IS NULL OR slot.service_end::time <= w.time_to)
       AND slot.service_end::date = slot.day
     ORDER BY w.created_at`,
    [shopId, staffId, start, end],
  );
  return rows;
};

/** A booking made from an entry: the entry is booked, with the appointment. */
const markBooked = async (db, shopId, entryId, appointmentId) => {
  await db.query(
    `UPDATE waitlist_entries SET status = 'booked', appointment_id = $3, updated_at = NOW()
     WHERE id = $1 AND shop_id = $2 AND status = 'waiting'`,
    [entryId, shopId, appointmentId],
  );
};

// How far one look goes (from the entry's first date, today, or where the
// last look stopped), and how many days with free times it brings at most:
// with "anyone" a single day can have hundreds of start times.
const SEARCH_DAYS = 31;
const FOUND_DAYS = 7;
const STEP_MINUTES = 15;

const dateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (date, n) => {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + n);
  return dateStr(d);
};
const at = (date, hhmm) => new Date(`${date}T${String(hhmm).slice(0, 5)}:00`).getTime();

const hhmm = (ms) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/**
 * When an entry can be booked: for each of its dates on its weekdays, the
 * start times every STEP_MINUTES where its service fits inside its hours and
 * the staff member's working hours, clear of their leave, breaks and other
 * bookings. A shared place (the sauna) is free while it has a place left; a
 * blocked time is full. The staff are the one the entry asks for, or every
 * active one in the calendar, and only those who do the service (see
 * DOES_SERVICE).
 *
 * One look starts at the entry's first date, today or `after` (whichever is
 * latest) and stops after SEARCH_DAYS dates or FOUND_DAYS days with times;
 * `next` is where the next look starts, or null at the entry's last date.
 *
 * → { duration_minutes, from, to, next, days: [{ date, staff: [{ staff_id, staff_name, starts: ["HH:MM"] }] }] }
 */
const freeTimes = async (db, shopId, entry, { now = new Date(), after = null, foundDays = FOUND_DAYS } = {}) => {
  const today = dateStr(now);
  let from = entry.date_from > today ? entry.date_from : today;
  if (after && after > from) from = after;
  const last = addDays(from, SEARCH_DAYS - 1);
  let to = entry.date_to < last ? entry.date_to : last;
  const duration = Number(entry.duration_minutes) || 60;
  const nextAfter = (date) => (date < entry.date_to ? addDays(date, 1) : null);
  const empty = { duration_minutes: duration, from, to, next: to < from ? null : nextAfter(to), days: [] };
  if (to < from) return empty;

  const { rows: staff } = await db.query(
    `SELECT st.id, st.name, st.capacity, st.working_hours_enabled
     FROM staff st
     WHERE st.shop_id = $1 AND st.is_active = true AND st.visible_in_calendar = true
       AND ($2::uuid IS NULL OR st.id = $2) AND ${DOES_SERVICE("st.id", "$3::uuid")}
     ORDER BY st.sort_order, st.name`,
    [shopId, entry.staff_id || null, entry.service_id || null],
  );
  if (!staff.length) return empty;
  const ids = staff.map((s) => s.id);

  const [shop, ranges, booked, timeOff] = await Promise.all([
    db.query("SELECT slot_min_time, slot_max_time FROM shops WHERE id = $1", [shopId]).then((r) => r.rows[0]),
    workingRangesBetween(db, ids, from, to),
    db.query(
      `SELECT aps.staff_id, aps.start_time, COALESCE(aps.duration_override, s.duration_minutes, 60) AS minutes,
              aps.persons, COALESCE(a.is_block, false) AS is_block
       FROM appointment_services aps
       JOIN appointments a ON a.id = aps.appointment_id
       LEFT JOIN services s ON s.id = aps.service_id
       WHERE a.shop_id = $1 AND aps.staff_id = ANY($2::uuid[]) AND a.status != 'cancelled'
         AND aps.start_time >= $3::date AND aps.start_time < $4::date + 1`,
      [shopId, ids, from, to],
    ).then((r) => r.rows),
    db.query(
      `SELECT staff_id, type, start_date::text AS start_date, COALESCE(end_date, start_date)::text AS end_date,
              start_time, end_time
       FROM staff_time_off
       WHERE shop_id = $1 AND staff_id = ANY($2::uuid[]) AND start_date <= $4::date AND COALESCE(end_date, start_date) >= $3::date`,
      [shopId, ids, from, to],
    ).then((r) => r.rows),
  ]);

  const durationMs = duration * 60000;
  const stepMs = STEP_MINUTES * 60000;
  const days = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const dow = new Date(`${date}T12:00:00`).getDay();
    if (entry.days?.length && !entry.days.includes(dow)) continue;
    const day = { date, staff: [] };
    for (const st of staff) {
      const off = timeOff.filter((t) => String(t.staff_id) === String(st.id));
      if (off.some((t) => t.type === "leave" && t.start_date <= date && date <= t.end_date)) continue;
      const places = placesOf(st);
      const breaks = off
        .filter((t) => t.type === "break" && t.start_date === date && t.start_time && t.end_time)
        .map((t) => ({ start: at(date, t.start_time), end: at(date, t.end_time) }));
      const busy = booked
        .filter((b) => String(b.staff_id) === String(st.id))
        .map((b) => {
          const start = new Date(b.start_time).getTime();
          // A blocked time fills every place.
          return { start, end: start + Number(b.minutes) * 60000, persons: b.is_block ? places : personsOf(b) };
        });
      const starts = [];
      for (const shift of bookableShifts(st, shop, ranges(st.id, date))) {
        let first = at(date, shift.start_time);
        let end = at(date, shift.end_time);
        if (entry.time_from) first = Math.max(first, at(date, entry.time_from));
        if (entry.time_to) end = Math.min(end, at(date, entry.time_to));
        for (let t = first; t + durationMs <= end; t += stepMs) {
          if (t < now.getTime()) continue;
          const tEnd = t + durationMs;
          if (breaks.some((b) => t < b.end && tEnd > b.start)) continue;
          if (peakPersons(busy, t, tEnd) + 1 > places) continue;
          starts.push(hhmm(t));
        }
      }
      if (starts.length) day.staff.push({ staff_id: st.id, staff_name: st.name, starts });
    }
    if (day.staff.length) days.push(day);
    if (days.length >= foundDays) {
      to = date;
      break;
    }
  }
  return { duration_minutes: duration, from, to, next: nextAfter(to), days };
};

/**
 * The freed times (recorded by migration 0016's triggers) the front desk can
 * act on: not yet started, not dismissed, not taken again (a shared place
 * while it has a place left still counts), and suiting someone waiting.
 * The same time freed twice is one.
 *
 * → [{ id, staff_id, staff_name, start, end, matches: [entry] }], by start
 */
const freedSlots = async (db, shopId, now = new Date()) => {
  const { rows } = await db.query(
    `SELECT f.id, f.staff_id, st.name AS staff_name, st.capacity, f.start_time, f.end_time
     FROM waitlist_freed_slots f
     JOIN staff st ON st.id = f.staff_id
     WHERE f.shop_id = $1 AND f.dismissed_at IS NULL AND f.start_time > $2
     ORDER BY f.start_time, f.created_at`,
    [shopId, now],
  );
  const seen = new Set();
  const slots = rows.filter((r) => {
    const key = `${r.staff_id}|${new Date(r.start_time).getTime()}|${new Date(r.end_time).getTime()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!slots.length) return [];

  const staffIds = [...new Set(slots.map((s) => s.staff_id))];
  const { rows: booked } = await db.query(
    `SELECT aps.staff_id, aps.start_time, COALESCE(NULLIF(aps.duration_override, 0), s.duration_minutes, 60) AS minutes,
            aps.persons, COALESCE(a.is_block, false) AS is_block
     FROM appointment_services aps
     JOIN appointments a ON a.id = aps.appointment_id
     LEFT JOIN services s ON s.id = aps.service_id
     WHERE a.shop_id = $1 AND aps.staff_id = ANY($2::uuid[]) AND a.status != 'cancelled'
       AND aps.start_time < $4 AND aps.start_time > $3::timestamptz - interval '1 day'`,
    [shopId, staffIds, slots[0].start_time, slots.reduce((m, s) => (s.end_time > m ? s.end_time : m), slots[0].end_time)],
  );

  const open = [];
  for (const slot of slots) {
    const start = new Date(slot.start_time).getTime();
    const end = new Date(slot.end_time).getTime();
    const places = placesOf(slot);
    const busy = booked
      .filter((b) => String(b.staff_id) === String(slot.staff_id))
      .map((b) => {
        const from = new Date(b.start_time).getTime();
        return { start: from, end: from + Number(b.minutes) * 60000, persons: b.is_block ? places : personsOf(b) };
      });
    // Taken again: no place left in it.
    if (peakPersons(busy, start, end) + 1 > places) continue;
    const matches = await matchesForSlot(db, shopId, { staffId: slot.staff_id, start: new Date(start).toISOString(), end: new Date(end).toISOString() });
    if (!matches.length) continue;
    open.push({
      id: slot.id,
      staff_id: slot.staff_id,
      staff_name: slot.staff_name,
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      matches,
    });
  }
  return open;
};

/** Dismissed by hand: gone for everyone (with the same time freed again, if any). */
const dismissFreed = async (db, shopId, id, userId) => {
  const { rowCount } = await db.query(
    `UPDATE waitlist_freed_slots f SET dismissed_at = NOW(), dismissed_by_user_id = $3
     FROM waitlist_freed_slots one
     WHERE one.id = $1 AND one.shop_id = $2
       AND f.shop_id = one.shop_id AND f.staff_id = one.staff_id AND f.start_time = one.start_time AND f.end_time = one.end_time
       AND f.dismissed_at IS NULL`,
    [id, shopId, userId],
  );
  return rowCount > 0;
};

/** Whether an entry has a free time anywhere in its dates (looking a stretch at a time). */
const hasFreeTime = async (db, shopId, entry, now = new Date()) => {
  let after = null;
  for (;;) {
    const look = await freeTimes(db, shopId, entry, { now, after, foundDays: 1 });
    if (look.days.length) return true;
    if (!look.next) return false;
    after = look.next;
  }
};

/**
 * The waiting entries (dates not passed) that can be booked now: a free time
 * somewhere in their dates, weekdays and hours, as Book shows them. The
 * waitlist button counts them.
 */
const bookableEntryIds = async (db, shopId, now = new Date()) => {
  const { rows } = await db.query(
    `${ENTRY_SELECT} WHERE w.shop_id = $1 AND w.status = 'waiting' AND w.date_to >= $2::date ORDER BY w.created_at`,
    [shopId, dateStr(now)],
  );
  const found = await Promise.all(rows.map((e) => hasFreeTime(db, shopId, e, now)));
  return rows.filter((_, i) => found[i]).map((e) => e.id);
};

module.exports = {
  ENTRY_SELECT,
  matchesForSlot,
  markBooked,
  freeTimes,
  hasFreeTime,
  bookableEntryIds,
  freedSlots,
  dismissFreed,
  SEARCH_DAYS,
  FOUND_DAYS,
};
