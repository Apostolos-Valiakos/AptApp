// For bookings made offline: the appointments the device's calendar showed
// overlapping each service (same staff member, overlapping time). Sent with
// the queued write as offline_known_overlaps, so the server can tell an
// overlap staff saw and accepted from a slot booked online in the meantime.
import { isTempId } from "./tempIds";

const ACTIVE = (status: string) => !["cancelled", "no-show", "no_show"].includes(status);

export const knownOverlapIds = (appointments: any[], services: any[], ownId?: string | null): string[] => {
  const ids = new Set<string>();
  for (const svc of services || []) {
    if (!svc?.staff_id || !svc?.start_time) continue;
    const start = new Date(svc.start_time).getTime();
    const end = start + (Number(svc.duration_override || svc.duration_minutes) || 60) * 60000;
    for (const appt of appointments || []) {
      if (!appt || String(appt.id) === String(ownId) || !ACTIVE(appt.status) || isTempId(String(appt.id))) continue;
      for (const other of appt.services || []) {
        if (String(other.staff_id) !== String(svc.staff_id) || !other.start_time) continue;
        const oStart = new Date(other.start_time).getTime();
        const oEnd = oStart + (Number(other.duration_minutes) || 60) * 60000;
        if (oStart < end && oEnd > start) ids.add(String(appt.id));
      }
    }
  }
  return [...ids];
};
