// What Home's "Up Next" card says and offers (REDESIGN_SPEC.md §5.1), from
// the client's next booking and the time now. Pure, so every state is tested
// on its own.
import type { PortalBooking } from "../stores/bookings";

export type UpNextKind = "later" | "soon" | "go" | "now" | "done";
export type UpNext = { kind: UpNextKind; booking: PortalBooking; minutesLeft: number; daysLeft: number };

const MIN = 60e3;
const DAY = 24 * 60 * MIN;

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/**
 * The booking the card is about, and its state:
 * - later: more than 24 h away; soon: within 24 h; go: within the hour;
 * - now: under way; done: one that ended earlier today, when nothing else is
 *   coming today (time to ask how it was, and to book again).
 */
export const upNext = (bookings: PortalBooking[], now: Date = new Date()): UpNext | null => {
  const t = now.getTime();
  const live = bookings.filter((b) => b.status !== "cancelled" && b.status !== "no-show" && b.status !== "no_show");
  const next = live
    .filter((b) => new Date(b.end_time).getTime() > t)
    .sort((a, b) => a.start_time.localeCompare(b.start_time))[0];
  if (next) {
    const start = new Date(next.start_time).getTime();
    const minutesLeft = Math.max(0, Math.round((start - t) / MIN));
    const daysLeft = Math.round((new Date(new Date(start).toDateString()).getTime() - new Date(now.toDateString()).getTime()) / DAY);
    const kind: UpNextKind = start <= t ? "now" : start - t <= 60 * MIN ? "go" : start - t <= DAY ? "soon" : "later";
    return { kind, booking: next, minutesLeft, daysLeft };
  }
  const endedToday = live
    .filter((b) => new Date(b.end_time).getTime() <= t && sameDay(new Date(b.start_time), now))
    .sort((a, b) => b.start_time.localeCompare(a.start_time))[0];
  return endedToday ? { kind: "done", booking: endedToday, minutesLeft: 0, daysLeft: 0 } : null;
};

/** Book again: the last distinct service + staff pairs from past visits, newest first. */
export const bookAgainPairs = (past: PortalBooking[], limit = 5) => {
  const seen = new Set<string>();
  const pairs: { service_id: string; service_name: string; staff_id: string | null; staff_name: string | null; price: number; duration_minutes: number }[] = [];
  for (const b of past) {
    if (b.status === "cancelled") continue;
    for (const s of b.services) {
      const key = `${s.service_id}|${s.staff_id ?? ""}`;
      if (!s.service_id || seen.has(key)) continue;
      seen.add(key);
      pairs.push({ service_id: s.service_id, service_name: s.service_name, staff_id: s.staff_id, staff_name: s.staff_name, price: s.price, duration_minutes: s.duration_minutes });
      if (pairs.length === limit) return pairs;
    }
  }
  return pairs;
};
