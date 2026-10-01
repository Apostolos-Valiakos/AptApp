// Single source of truth for "is this staff member bookable at this
// time?", covering both staff_time_off (leave/break) and the optional
// recurring staff_working_hours pattern. Used identically by FullCalendar's
// selectAllow/eventAllow (SchedulerView.vue), the staff dropdown filter
// (bookingServices.vue), and the hard pre-save check (BookingDialog.vue) —
// keeping the logic in one place so the three enforcement points can't drift.

export interface WorkingHourRange {
  staff_id: string | number;
  day_of_week: number; // 0=Sunday..6=Saturday, matches JS Date#getDay()
  start_time: string; // "HH:MM" or "HH:MM:SS"
  end_time: string;
  effective_from: string; // "YYYY-MM-DD" — rows sharing (staff_id, effective_from) form one version
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
export const getWorkingRangesForDate = (
  workingHours: WorkingHourRange[],
  staffId: any,
  date: Date | string,
): { start: string; end: string }[] | null => {
  const dateStr = typeof date === "string" ? date.slice(0, 10) : toLocalDateStr(date);
  const dow = new Date(`${dateStr}T00:00:00`).getDay();
  const staffRows = (workingHours || []).filter(
    (w) => String(w.staff_id) === String(staffId) && w.effective_from <= dateStr,
  );
  if (staffRows.length === 0) return null;
  const latest = staffRows.reduce(
    (m, w) => (w.effective_from > m ? w.effective_from : m),
    staffRows[0].effective_from,
  );
  return staffRows
    .filter((w) => w.effective_from === latest && w.day_of_week === dow)
    .map((w) => ({ start: w.start_time, end: w.end_time }))
    .sort((a, b) => a.start.localeCompare(b.start));
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

// --- Per-week schedule editing (StaffScheduleView.vue) ---
// Each week can be its own independently-saved version (effective_from =
// that week's Monday). Building the editable 7-day set for a given week is
// the entire "copy-on-write" mechanism: if the week already has its own
// version, edit it directly; otherwise clone whatever version currently
// governs each of its 7 days — so saving the result (even with only one day
// changed) correctly carries forward the rest of the inherited pattern
// instead of silently reverting it.

export interface WeekDaySchedule {
  day_of_week: number; // 0=Sunday..6=Saturday
  ranges: { start_time: string; end_time: string }[]; // [] = day off
}

// Server TIME columns round-trip as "HH:MM:SS"; the working-hours save
// endpoint's TIME_HHMM validation requires exactly "HH:MM" — trim before any
// existing row's start_time/end_time is resubmitted in a save payload.
const toHHMM = (s: string): string => (s || "").slice(0, 5);

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

export const buildWeekSchedule = (
  workingHours: WorkingHourRange[],
  staffId: any,
  weekMonday: Date,
): WeekDaySchedule[] => {
  const mondayStr = toLocalDateStr(weekMonday);
  const all = workingHours || [];
  const ownRows = all.filter(
    (w) => String(w.staff_id) === String(staffId) && w.effective_from === mondayStr,
  );

  if (ownRows.length > 0) {
    return Array.from({ length: 7 }, (_, dow) => ({
      day_of_week: dow,
      ranges: ownRows
        .filter((w) => w.day_of_week === dow)
        .map((w) => ({ start_time: toHHMM(w.start_time), end_time: toHHMM(w.end_time) }))
        .sort((a, b) => (a.start_time > b.start_time ? 1 : -1)),
    }));
  }

  return Array.from({ length: 7 }, (_, dow) => {
    const ranges = getWorkingRangesForDate(all, staffId, dateForDowInWeek(weekMonday, dow));
    return {
      day_of_week: dow,
      ranges: (ranges || []).map((r) => ({ start_time: toHHMM(r.start), end_time: toHHMM(r.end) })),
    };
  });
};

// Used by the single-day "use default schedule" action: what this one day
// would resolve to if this week never had its own version at all — i.e. the
// next-older version's pattern, not a bare delete (which would instead
// resolve to "day off" once this week already has its own version, per the
// resolution rule above).
export const dayScheduleExcludingWeek = (
  workingHours: WorkingHourRange[],
  staffId: any,
  weekMonday: Date,
  dayOfWeek: number,
): { start_time: string; end_time: string }[] => {
  const mondayStr = toLocalDateStr(weekMonday);
  const filtered = (workingHours || []).filter((w) => w.effective_from !== mondayStr);
  const ranges = getWorkingRangesForDate(filtered, staffId, dateForDowInWeek(weekMonday, dayOfWeek));
  return (ranges || []).map((r) => ({ start_time: toHHMM(r.start), end_time: toHHMM(r.end) }));
};
