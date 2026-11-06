// Same-day grouping in the booking dialog: a new booking for a client who
// already has an appointment that day joins that appointment. These are the
// rules; the dialog does the loading and merging.

const INACTIVE = ["cancelled", "no-show", "no_show"];

/** When an appointment starts: its first service, else its own start. */
export const firstStartOf = (appt: any) => new Date(appt?.services?.[0]?.start_time || appt?.start_time).getTime();

/** The client's earliest active (not cancelled, not no-show), non-block appointment in `dayAppointments`, if any. */
export const sameDayAppointmentFor = (dayAppointments: any, clientId: string) =>
  (Array.isArray(dayAppointments) ? dayAppointments : [])
    .filter((a: any) => a.client_id === clientId && !a.is_block && !INACTIVE.includes(a.status))
    .sort((a: any, b: any) => firstStartOf(a) - firstStartOf(b))[0];

/** Adds `extra` to a note on a new line, unless it's empty or already there. */
export const appendNote = (current: string, extra: string) =>
  !extra || current.includes(extra) ? current : current ? `${current}\n${extra}` : extra;
