// A booking as a calendar event (N5): an .ics file for any calendar app and
// a Google Calendar link. Built in the browser; the app build will add the
// event natively instead (REDESIGN_SPEC.md §6.4).
export type CalendarEvent = { uid: string; title: string; start: Date; end: Date; location?: string; description?: string };

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
// Commas, semicolons and backslashes are special in .ics text; new lines are "\n".
const text = (s = "") => s.replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\r?\n/g, "\\n");

export const icsFor = (e: CalendarEvent, now = new Date()) =>
  [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Pure//Client portal//EL",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(e.start)}`,
    `DTEND:${stamp(e.end)}`,
    `SUMMARY:${text(e.title)}`,
    ...(e.location ? [`LOCATION:${text(e.location)}`] : []),
    ...(e.description ? [`DESCRIPTION:${text(e.description)}`] : []),
    "BEGIN:VALARM",
    "TRIGGER:-PT1H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${text(e.title)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

export const googleCalendarLink = (e: CalendarEvent) => {
  const q = new URLSearchParams({ action: "TEMPLATE", text: e.title, dates: `${stamp(e.start)}/${stamp(e.end)}` });
  if (e.location) q.set("location", e.location);
  if (e.description) q.set("details", e.description);
  return `https://calendar.google.com/calendar/render?${q}`;
};
