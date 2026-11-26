// "Add to calendar" (N5). In the app, the booking goes straight into the
// phone's calendar (calendar access asked the first time); in a browser the
// portal keeps downloading an .ics file (useBookingExtras).
import { CapacitorCalendar } from "@ebarooni/capacitor-calendar";
import type { CalendarEvent } from "../utils/calendarFile";
import { isNative, quietly } from "./platform";

export const useCalendarSync = () => {
  const native = isNative();
  return {
    native,
    /**
     * Adds `event` to the phone's calendar. False when there's no native
     * calendar or the client refused access, so the caller offers another way.
     */
    add: async (event: CalendarEvent): Promise<boolean> => {
      if (!native) return false;
      // Read and write, not write-only: on Android createEvent reads the
      // calendars to find the default one, and fails without read access.
      const access = await quietly(() => CapacitorCalendar.requestFullCalendarAccess());
      if (access?.result !== "granted") return false;
      const created = await quietly(() =>
        CapacitorCalendar.createEvent({
          title: event.title,
          startDate: event.start.getTime(),
          endDate: event.end.getTime(),
          location: event.location,
          description: event.description,
        }),
      );
      return !!created;
    },
  };
};
