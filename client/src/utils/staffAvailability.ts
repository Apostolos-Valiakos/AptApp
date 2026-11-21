import { askConfirm, type Confirm } from "./confirm";
// Single source of truth for "is this staff member bookable at this
// time?", covering both staff_time_off (leave/break) and the optional
// recurring staff_working_hours pattern. Used identically by FullCalendar's
// selectAllow/eventAllow (SchedulerView.vue), the staff dropdown filter
// (bookingServices.vue), and the hard pre-save check (BookingDialog.vue) —
// keeping the logic in one place so the three enforcement points can't drift.

/**
 * One entry of GET /api/v1/working-hours. Three kinds:
 * - a weekly schedule's shift: day_of_week, start_time, end_time and
 *   effective_from (the Monday it applies from, until the next schedule);
 * - kind "version": a weekly schedule exists from effective_from (so one with
 *   no working days still counts);
 * - kind "day": a date with its own hours (ranges; none = a day off), for that
 *   date only, instead of the weekly schedule's.
 */
export interface WorkingHourRange {
  staff_id: string | number;
  kind?: "version" | "day";
  day_of_week?: number; // 0=Sunday..6=Saturday, matches JS Date#getDay()
  start_time?: string; // "HH:MM" or "HH:MM:SS"
  end_time?: string;
  effective_from?: string; // "YYYY-MM-DD"
  date?: string; // kind "day"
  ranges?: { start_time: string; end_time: string }[]; // kind "day"
}

export interface TimeOffEntry {
  staff_id: string | number;
  type: "leave" | "break";
  start_date: string;
  end_date: string;
  start_time?: string;
  end_time?: string;
}

export interface StaffLike {
  id: string | number;
  working_hours_enabled?: boolean;
}

// staff_time_off DATE columns come back as full ISO timestamps (pg parses
// DATE into a local-midnight Date, then JSON serialization renders it in
// UTC), so always round-trip through local date parts rather than slicing
// the string.
export const toLocalDateStr = (v: any): string => {
  const d = v instanceof Date ? v : new Date(v);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

/**
 * The staff member's leave (a whole-day time off) covering this day, if any:
 * from its start date through its end date, both included.
 */
export const leaveOnDay = (timeOff: any[] | null | undefined, staffId: any, day: Date | string): any | null => {
  const date = toLocalDateStr(day);
  return (
    (timeOff || []).find(
      (entry: any) =>
        entry.type === "leave" &&
        String(entry.staff_id) === String(staffId) &&
        toLocalDateStr(entry.start_date) <= date &&
        date <= toLocalDateStr(entry.end_date),
    ) || null
  );
};

export const isDuringTimeOff = (
  timeOff: TimeOffEntry[],
  staffId: any,
  start: Date,
  end: Date,
): boolean => {
  const dateStr = toLocalDateStr(start);
  return (timeOff || []).some((entry) => {
    if (String(entry.staff_id) !== String(staffId)) return false;
    if (entry.type === "leave") {
      return (
        dateStr >= toLocalDateStr(entry.start_date) &&
        dateStr <= toLocalDateStr(entry.end_date)
      );
    }
    const entryDate = toLocalDateStr(entry.start_date);
    if (entryDate !== dateStr) return false;
    const breakStart = new Date(`${entryDate}T${entry.start_time}`);
    const breakEnd = new Date(`${entryDate}T${entry.end_time}`);
    return start < breakEnd && end > breakStart;
  });
};

// Resolves whichever schedule VERSION was/is active for a staff member as of
// a given date — not just "their pattern," since it can change over time.
// Returns null when no version exists as of that date at all (distinct from
// a version existing with zero ranges for that weekday, i.e. a real day off —
// both used to collapse into the same [] under the old single-pattern model,
// which is exactly the ambiguity this needs to resolve): null means
// "unrestricted" everywhere it's consumed, [] means "blocked, day off."
/** A date's own hours (kind "day"), if it has them; [] is a day off that date. */
export const ownHoursOn = (workingHours: WorkingHourRange[], staffId: any, date: Date | string) => {
  const dateStr = typeof date === "string" ? date.slice(0, 10) : toLocalDateStr(date);
  const own = (workingHours || []).find((w) => w.kind === "day" && String(w.staff_id) === String(staffId) && w.date === dateStr);
  return own ? [...(own.ranges || [])].sort((a, b) => a.start_time.localeCompare(b.start_time)) : null;
};

/** The weekly schedule in force on a date: its first Monday, or null if there's none yet. */
export const weeklyScheduleStart = (workingHours: WorkingHourRange[], staffId: any, date: Date | string): string | null => {
  const dateStr = typeof date === "string" ? date.slice(0, 10) : toLocalDateStr(date);
  let latest: string | null = null;
  for (const w of workingHours || []) {
    if (w.kind === "day" || !w.effective_from || String(w.staff_id) !== String(staffId)) continue;
    if (w.effective_from <= dateStr && (!latest || w.effective_from > latest)) latest = w.effective_from;
  }
  return latest;
};

/** What the weekly schedule says for a date (ignoring the date's own hours); null if there's none. */
export const weeklyRangesForDate = (
  workingHours: WorkingHourRange[],
  staffId: any,
  date: Date | string,
): { start: string; end: string }[] | null => {
  const dateStr = typeof date === "string" ? date.slice(0, 10) : toLocalDateStr(date);
  const latest = weeklyScheduleStart(workingHours, staffId, dateStr);
  if (!latest) return null;
  const dow = new Date(`${dateStr}T00:00:00`).getDay();
  return (workingHours || [])
    .filter((w) => !w.kind && String(w.staff_id) === String(staffId) && w.effective_from === latest && w.day_of_week === dow)
    .map((w) => ({ start: w.start_time!, end: w.end_time! }))
    .sort((a, b) => a.start.localeCompare(b.start));
};

/**
 * A staff member's shifts on a date: the date's own hours if it has them,
 * otherwise the weekly schedule in force then ([] = a day off). null when
 * there's no schedule at all yet. The server reads them the same way
 * (server/domain/staffSchedule.js).
 */
export const getWorkingRangesForDate = (
  workingHours: WorkingHourRange[],
  staffId: any,
  date: Date | string,
): { start: string; end: string }[] | null => {
  const own = ownHoursOn(workingHours, staffId, date);
  if (own) return own.map((r) => ({ start: r.start_time, end: r.end_time }));
  return weeklyRangesForDate(workingHours, staffId, date);
};

export const isWithinWorkingHours = (
  workingHours: WorkingHourRange[],
  staffList: StaffLike[],
  staffId: any,
  start: Date,
  end: Date,
): boolean => {
  const staffMember = (staffList || []).find((s) => String(s.id) === String(staffId));
  if (!staffMember?.working_hours_enabled) return true; // unconfigured — unrestricted

  const ranges = getWorkingRangesForDate(workingHours, staffId, start);
  if (ranges === null) return true; // no version resolvable for this date — fail open
  if (ranges.length === 0) return false; // a version exists, this weekday is a real day off

  const dateStr = toLocalDateStr(start);
  return ranges.some((r) => {
    const rangeStart = new Date(`${dateStr}T${r.start}`);
    const rangeEnd = new Date(`${dateStr}T${r.end}`);
    return start >= rangeStart && end <= rangeEnd;
  });
};

/** A stretch of a booking outside working hours. Times are ms; `at`/`until` are "HH:MM". */
export type OutsidePart = {
  from: number;
  to: number;
  /** Before the day's first start (`at`), after its last end (`at`), in the gap of a split shift (`at`–`until`), or on a day off. */
  kind: "before" | "after" | "between" | "dayOff";
  at: string;
  until?: string;
};
export type OutsideHours = {
  dayOff: boolean;
  /** The day's schedule, "10:00–14:00, 16:00–20:00"; "" on a day off. */
  schedule: string;
  minutes: number;
  parts: OutsidePart[];
  /** The schedule's starts and ends that fall inside the booking (ms): where it crosses into or out of working hours. */
  boundaries: number[];
};

/**
 * What of a booking [start, end) lies outside the staff member's working
 * hours that day (overtime), or null when all of it is inside, or they have
 * no working hours set. Unlike isStaffAvailable this also answers for the
 * past: it describes a booking that exists, it doesn't decide if one may be made.
 */
export const outsideWorkingHours = (
  workingHours: WorkingHourRange[],
  staffList: StaffLike[],
  staffId: any,
  start: Date,
  end: Date,
): OutsideHours | null => {
  const staffMember = (staffList || []).find((s) => String(s.id) === String(staffId));
  if (!staffMember?.working_hours_enabled) return null;
  const ranges = getWorkingRangesForDate(workingHours, staffId, start);
  if (ranges === null) return null;

  const from = start.getTime();
  const to = end.getTime();
  const minutesOf = (parts: OutsidePart[]) => Math.round(parts.reduce((sum, p) => sum + (p.to - p.from), 0) / 60000);
  if (ranges.length === 0) {
    const parts: OutsidePart[] = [{ from, to, kind: "dayOff", at: "" }];
    return { dayOff: true, schedule: "", minutes: minutesOf(parts), parts, boundaries: [] };
  }

  const dateStr = toLocalDateStr(start);
  const shifts = ranges.map((r) => ({
    start: new Date(`${dateStr}T${r.start}`).getTime(),
    end: new Date(`${dateStr}T${r.end}`).getTime(),
    startText: toHHMM(r.start),
    endText: toHHMM(r.end),
  }));
  const parts: OutsidePart[] = [];
  let cursor = from;
  shifts.forEach((shift, i) => {
    const gapEnd = Math.min(to, shift.start);
    if (gapEnd > cursor) {
      parts.push(
        i === 0
          ? { from: cursor, to: gapEnd, kind: "before", at: shift.startText }
          : { from: cursor, to: gapEnd, kind: "between", at: shifts[i - 1].endText, until: shift.startText },
      );
    }
    cursor = Math.max(cursor, shift.end);
  });
  if (to > cursor) parts.push({ from: cursor, to, kind: "after", at: shifts[shifts.length - 1].endText });
  if (parts.length === 0) return null;

  return {
    dayOff: false,
    schedule: shifts.map((s) => `${s.startText}–${s.endText}`).join(", "),
    minutes: minutesOf(parts),
    parts,
    boundaries: shifts.flatMap((s) => [s.start, s.end]).filter((t) => t > from && t < to),
  };
};

export const isStaffAvailable = (params: {
  staffList: StaffLike[];
  workingHours: WorkingHourRange[];
  timeOff: TimeOffEntry[];
  staffId: any;
  start: Date;
  end: Date;
}): { available: boolean; reason?: "time_off" | "outside_hours" } => {
  if (!params.staffId) return { available: true };
  // Mirrors the server-side exemption in assertStaffAvailable — deliberately
  // unconditional even though working-hours now has effective-dated versions:
  // re-validating a past appointment on every save would block unrelated
  // edits (payments, notes) the moment a staff member's schedule changes.
  if (params.start.getTime() < Date.now()) return { available: true };
  if (isDuringTimeOff(params.timeOff, params.staffId, params.start, params.end)) {
    return { available: false, reason: "time_off" };
  }
  if (
    !isWithinWorkingHours(
      params.workingHours,
      params.staffList,
      params.staffId,
      params.start,
      params.end,
    )
  ) {
    return { available: false, reason: "outside_hours" };
  }
  return { available: true };
};

// For overtime warnings: the staff member's working ranges that day as
// "10:00–14:00, 16:00–20:20", "" for a scheduled day off, or null when they
// have no schedule (unrestricted).
export const describeWorkingDay = (
  workingHours: WorkingHourRange[],
  staffList: StaffLike[],
  staffId: any,
  date: Date,
): string | null => {
  const staffMember = (staffList || []).find((s) => String(s.id) === String(staffId));
  if (!staffMember?.working_hours_enabled) return null;
  const ranges = getWorkingRangesForDate(workingHours, staffId, date);
  if (ranges === null) return null;
  return ranges.map((r) => `${r.start.slice(0, 5)}–${r.end.slice(0, 5)}`).join(", ");
};

/** Asks before booking outside working hours; true = book it as overtime. */
export const askOvertime = (
  confirm: Confirm,
  t: (key: string, values?: Record<string, unknown>) => string,
  entries: { name: string; hours: string | null }[],
): Promise<boolean> =>
  askConfirm(confirm, {
    header: t("booking.overtime.header"),
    message: overtimeConfirmMessage(entries, t),
    icon: "pi pi-clock",
    acceptLabel: t("booking.overtime.accept"),
    rejectLabel: t("common.cancel"),
  });

// Shared overtime confirmation text (booking dialog, calendar click and
// drag): one line per staff member, e.g. "Ιωάννα: ωράριο 10:00–20:20".
export const overtimeConfirmMessage = (
  entries: { name: string; hours: string | null }[],
  t: (key: string, values?: Record<string, unknown>) => string,
): string => {
  const seen = new Set<string>();
  const lines = entries
    .filter((e) => !seen.has(e.name) && seen.add(e.name))
    .map((e) =>
      e.hours
        ? `• ${t("booking.overtime.line", { name: e.name, hours: e.hours })}`
        : `• ${t("booking.overtime.lineDayOff", { name: e.name })}`,
    );
  return `${t("booking.overtime.intro")}\n\n${lines.join("\n")}\n\n${t("booking.overtime.question")}`;
};

// --- Weekly schedules (StaffScheduleView.vue) ---
// A weekly schedule applies from its Monday until the next one. The week
// dialog shows the one in force that week (the dates' own hours aside) and
// saves the result as a schedule from that Monday on.

export interface WeekDaySchedule {
  day_of_week: number; // 0=Sunday..6=Saturday
  ranges: { start_time: string; end_time: string }[]; // [] = day off
}

// Server TIME columns round-trip as "HH:MM:SS"; the working-hours save
// endpoint's TIME_HHMM validation requires exactly "HH:MM" — trim before any
// existing row's start_time/end_time is resubmitted in a save payload.
const toHHMM = (s: string): string => (s || "").slice(0, 5);

// Working ranges as the schedule forms show them ("09:00"–"17:00").
const asTimeRanges = (ranges: { start: string; end: string }[] | null) =>
  (ranges || []).map((r) => ({ start_time: toHHMM(r.start), end_time: toHHMM(r.end) }));

export const mondayOf = (date: Date | string): Date => {
  const d = date instanceof Date ? new Date(date) : new Date(`${date}T00:00:00`);
  d.setHours(0, 0, 0, 0);
  const diff = (d.getDay() + 6) % 7; // JS getDay(): 0=Sun..6=Sat -> 0=Mon..6=Sun
  d.setDate(d.getDate() - diff);
  return d;
};

// The actual calendar date for a given day_of_week within the week starting
// at weekMonday — day_of_week 0 (Sunday) is the last day of that week, not
// the first.
export const dateForDowInWeek = (weekMonday: Date, dayOfWeek: number): Date => {
  const offset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const d = new Date(weekMonday);
  d.setDate(d.getDate() + offset);
  return d;
};

/** The weekly schedule in force for the week starting weekMonday, day by day (dates' own hours aside). */
export const buildWeekSchedule = (
  workingHours: WorkingHourRange[],
  staffId: any,
  weekMonday: Date,
): WeekDaySchedule[] =>
  Array.from({ length: 7 }, (_, dow) => ({
    day_of_week: dow,
    ranges: asTimeRanges(weeklyRangesForDate(workingHours, staffId, dateForDowInWeek(weekMonday, dow))),
  }));
