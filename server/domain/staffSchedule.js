// A staff member's working hours on a date, the one rule every reader uses:
// that date's own hours if it has them (staff_schedule_days, set for that
// date only), otherwise the weekly schedule in force then (the latest
// staff_schedule_versions entry on or before it, with its rows in
// staff_working_hours; no row for that weekday is a day off). No schedule at
// all yet: null, and the caller decides (bookings aren't restricted).
// The screens follow the same rule (client/src/utils/staffAvailability.ts).

const TIME_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_YYYYMMDD = /^\d{4}-\d{2}-\d{2}$/;

/** The shifts on a date ("YYYY-MM-DD"), as [{ start_time, end_time }] "HH:MM", sorted; or null. */
const workingRangesOn = async (db, staffId, date) => {
  const own = await db.query("SELECT ranges FROM staff_schedule_days WHERE staff_id = $1 AND date = $2::date", [staffId, date]);
  if (own.rows[0]) return [...own.rows[0].ranges].sort((a, b) => (a.start_time > b.start_time ? 1 : -1));
  const version = await db.query(
    "SELECT MAX(effective_from)::text AS latest FROM staff_schedule_versions WHERE staff_id = $1 AND effective_from <= $2::date",
    [staffId, date],
  );
  const latest = version.rows[0]?.latest;
  if (!latest) return null;
  const { rows } = await db.query(
    `SELECT to_char(start_time, 'HH24:MI') AS start_time, to_char(end_time, 'HH24:MI') AS end_time
     FROM staff_working_hours
     WHERE staff_id = $1 AND effective_from = $2::date AND day_of_week = EXTRACT(DOW FROM $3::date)
     ORDER BY start_time`,
    [staffId, latest, date],
  );
  return rows;
};

/** Shifts as sent by the screens: an error message, or null when they're fine. */
const rangesProblem = (ranges) => {
  if (!Array.isArray(ranges)) return "ranges must be an array";
  const sorted = [...ranges].sort((a, b) => (a?.start_time > b?.start_time ? 1 : -1));
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    if (!TIME_HHMM.test(r?.start_time) || !TIME_HHMM.test(r?.end_time)) return "start_time/end_time must be HH:MM";
    if (r.end_time <= r.start_time) return "end_time must be after start_time";
    if (i > 0 && r.start_time < sorted[i - 1].end_time) return "overlapping_ranges";
  }
  return null;
};

// A booking line fits a list of shifts when it starts and ends inside one of
// them, the same day. Its length: its own, else its service's, else an hour.
const LINE_END = "(aps.start_time + (COALESCE(aps.duration_override, s.duration_minutes, 60) || ' minutes')::interval)";
const FITS = (shifts, also = "TRUE") => `EXISTS (
  SELECT 1 FROM ${shifts}
  WHERE ${also} AND aps.start_time::time >= p.start_time AND ${LINE_END}::time <= p.end_time
    AND ${LINE_END}::date = aps.start_time::date
)`;
const OUTSIDE_SQL = (where, fits) => `
  SELECT a.id, aps.start_time, s.name AS service_name, c.first_name || ' ' || c.last_name AS client_name
  FROM appointment_services aps
  JOIN appointments a ON a.id = aps.appointment_id
  LEFT JOIN services s ON s.id = aps.service_id
  LEFT JOIN clients c ON c.id = a.client_id
  WHERE aps.staff_id = $1 AND a.shop_id = $2
    AND a.status NOT IN ('cancelled', 'no-show', 'no_show') AND COALESCE(a.is_block, false) = false
    AND aps.start_time >= CURRENT_DATE
    AND ${where} AND NOT ${fits}
  ORDER BY aps.start_time`;

/**
 * Bookings a weekly schedule from `from` (rows of { day_of_week, start_time,
 * end_time }) would leave outside: up to the next weekly schedule, skipping
 * dates with their own hours (they keep them).
 */
const bookingsOutsideWeek = async (db, staffId, shopId, from, rows) => {
  const next = await db.query(
    "SELECT MIN(effective_from)::text AS ef FROM staff_schedule_versions WHERE staff_id = $1 AND effective_from > $2::date",
    [staffId, from],
  );
  const { rows: found } = await db.query(
    OUTSIDE_SQL(
      `aps.start_time >= $3::date AND ($4::date IS NULL OR aps.start_time < $4::date)
       AND NOT EXISTS (SELECT 1 FROM staff_schedule_days d WHERE d.staff_id = $1 AND d.date = aps.start_time::date)`,
      FITS("json_to_recordset($5::json) AS p(day_of_week int, start_time time, end_time time)", "p.day_of_week = EXTRACT(DOW FROM aps.start_time)"),
    ),
    [staffId, shopId, from, next.rows[0]?.ef || null, JSON.stringify(rows)],
  );
  return found;
};

/** Bookings on one date that a list of shifts would leave outside. */
const bookingsOutsideDate = async (db, staffId, shopId, date, ranges) => {
  const { rows } = await db.query(
    OUTSIDE_SQL(
      "aps.start_time::date = $3::date",
      FITS("json_to_recordset($4::json) AS p(start_time time, end_time time)"),
    ),
    [staffId, shopId, date, JSON.stringify(ranges)],
  );
  return rows;
};

module.exports = { TIME_HHMM, DATE_YYYYMMDD, workingRangesOn, rangesProblem, bookingsOutsideWeek, bookingsOutsideDate };
