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

export const getWorkingRangesForDay = (
  workingHours: WorkingHourRange[],
  staffId: any,
  dayOfWeek: number,
): { start: string; end: string }[] =>
  (workingHours || [])
    .filter(
      (w) => String(w.staff_id) === String(staffId) && w.day_of_week === dayOfWeek,
    )
    .map((w) => ({ start: w.start_time, end: w.end_time }))
    .sort((a, b) => a.start.localeCompare(b.start));

export const isWithinWorkingHours = (
  workingHours: WorkingHourRange[],
  staffList: StaffLike[],
  staffId: any,
  start: Date,
  end: Date,
): boolean => {
  const staffMember = (staffList || []).find((s) => String(s.id) === String(staffId));
  if (!staffMember?.working_hours_enabled) return true; // unconfigured — unrestricted

  const ranges = getWorkingRangesForDay(workingHours, staffId, start.getDay());
  if (ranges.length === 0) return false; // opted in, day off

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
  // Mirrors the server-side exemption in assertStaffAvailable — neither
  // time-off nor working-hours are historically versioned, so re-validating
  // a past appointment against the CURRENT schedule would block unrelated
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
