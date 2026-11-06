// Shared places: a staff member that is really a room (ΣΑΟΥΝΑ, ΧΑΜΜΑΜ) takes
// several persons at once (staff.capacity). The server refuses a booking
// over that as over_capacity unless it's sent with allow_over_capacity; these
// are the same rules for the screens.

const INACTIVE = ["cancelled", "no-show", "no_show"];

/** "10:05", in the device's time. */
export const hhmm = (value: string | number | Date) => {
  const d = new Date(value);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** Places at the same time; 1 for an ordinary staff member. */
export const placesOf = (staff: any) => Math.max(1, Number(staff?.capacity) || 1);

/** How many persons a service row is for. */
export const personsOf = (svc: any) => Math.max(1, Math.floor(Number(svc?.persons)) || 1);

export type Occupancy = { start: number; end: number; persons: number };

/** The most persons present at one moment within [start, end). */
export const peakPersons = (rows: Occupancy[], start: number, end: number) => {
  const points: [number, number][] = [];
  for (const r of rows) {
    const from = Math.max(r.start, start);
    const to = Math.min(r.end, end);
    if (from < to) points.push([from, r.persons], [to, -r.persons]);
  }
  // At the same moment, someone leaving frees the place before the next one comes.
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let now = 0;
  let peak = 0;
  for (const [, change] of points) {
    now += change;
    peak = Math.max(peak, now);
  }
  return peak;
};

/**
 * Bookings in one column that overlap, chained (10:00–11:00 and 10:30–11:30
 * are one group, 10:00–11:30), in start order. Each item needs start/end (ms).
 */
export const overlapGroups = <T extends { start: number; end: number }>(items: T[]): T[][] => {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end);
  const groups: T[][] = [];
  let groupEnd = -Infinity;
  for (const item of sorted) {
    if (groups.length > 0 && item.start < groupEnd) {
      groups[groups.length - 1].push(item);
      groupEnd = Math.max(groupEnd, item.end);
    } else {
      groups.push([item]);
      groupEnd = item.end;
    }
  }
  return groups;
};

const minutesOf = (svc: any) => Number(svc?.duration_override || svc?.duration_minutes) || 60;

/**
 * The persons in `staffId`'s place during [start, end) from the loaded
 * appointments, leaving out the rows in `skip` ("appointmentId|serviceIndex").
 */
export const occupancyFrom = (appointments: any[], staffId: any, skip: Set<string> = new Set()): Occupancy[] => {
  const rows: Occupancy[] = [];
  for (const appt of appointments || []) {
    if (!appt || INACTIVE.includes(appt.status)) continue;
    (appt.services || []).forEach((svc: any, index: number) => {
      if (String(svc.staff_id) !== String(staffId) || !svc.start_time) return;
      if (skip.has(`${appt.id}|${index}`)) return;
      const start = new Date(svc.start_time).getTime();
      rows.push({ start, end: start + minutesOf(svc) * 60000, persons: personsOf(svc) });
    });
  }
  return rows;
};

/** The question asked before booking over the places (from an over_capacity answer). */
export const overCapacityMessage = (details: any, t: (key: string, params?: any) => string) => {
  const from = details?.start_time ? hhmm(details.start_time) : "";
  const to = details?.end_time ? hhmm(details.end_time) : "";
  return t("capacity.overMessage", {
    name: details?.staff_name || "",
    persons: details?.persons ?? "",
    capacity: details?.capacity ?? "",
    time: from && to ? `${from}–${to}` : from,
  });
};

/** Asks before booking over the places; true = book anyway. `confirm` is PrimeVue's useConfirm(). */
export const askOverCapacity = (
  confirm: { require: (options: any) => void },
  t: (key: string, params?: any) => string,
  details: any,
): Promise<boolean> =>
  new Promise((resolve) => {
    confirm.require({
      header: t("capacity.header"),
      message: overCapacityMessage(details, t),
      icon: "pi pi-users",
      acceptLabel: t("capacity.accept"),
      rejectLabel: t("common.cancel"),
      accept: () => resolve(true),
      reject: () => resolve(false),
      onHide: () => resolve(false),
    });
  });
