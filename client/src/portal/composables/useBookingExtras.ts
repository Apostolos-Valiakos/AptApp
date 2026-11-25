// The things a booking offers besides changing it: add it to a calendar (N5),
// share it (N6), get directions to the shop (N7), call the shop (K12). In the
// Android app each uses the phone's own (portal/native/*); in a browser, the
// web versions. The screens call the same functions either way.
import { useI18n } from "vue-i18n";
import { AppLauncher } from "@capacitor/app-launcher";
import { saveBlob } from "../../api/http";
import { formatDate } from "../../utils/format";
import { usePortalShopStore } from "../stores/shop";
import { serviceNames, staffNames, type PortalBooking } from "../stores/bookings";
import { googleCalendarLink, icsFor, type CalendarEvent } from "../utils/calendarFile";
import { useCalendarSync } from "../native/useCalendarSync";
import { publicUrl, useShare } from "../native/useShare";
import { useMaps } from "../native/useMaps";
import { quietly } from "../native/platform";
import { useFeedback } from "./useFeedback";

export const useBookingExtras = () => {
  const { t, locale } = useI18n();
  const shop = usePortalShopStore();
  const feedback = useFeedback();
  const calendar = useCalendarSync();
  const sharing = useShare();
  const maps = useMaps();

  const eventFor = (b: PortalBooking): CalendarEvent => ({
    uid: `${b.id}@pure-portal`,
    title: `${serviceNames(b)} · ${shop.name}`,
    start: new Date(b.start_time),
    end: new Date(b.end_time),
    location: shop.shop?.address || shop.name,
    description: [staffNames(b), shop.phone].filter(Boolean).join(" · "),
  });

  const when = (b: PortalBooking) => formatDate(b.start_time, locale.value, "weekdayTime");

  return {
    /**
     * In the app, straight into the phone's calendar (Google Calendar's page
     * if access is refused); in a browser, an .ics file every calendar opens.
     */
    addToCalendar: async (b: PortalBooking) => {
      if (calendar.native) {
        if (await calendar.add(eventFor(b))) feedback.success(t("portal.v2.native.calendarAdded"));
        else await quietly(() => AppLauncher.openUrl({ url: googleCalendarLink(eventFor(b)) }));
        return;
      }
      saveBlob(new Blob([icsFor(eventFor(b))], { type: "text/calendar;charset=utf-8" }), `${serviceNames(b) || "booking"}.ics`);
      feedback.success(t("portal.v2.calendar.downloaded"));
    },
    googleCalendarUrl: (b: PortalBooking) => googleCalendarLink(eventFor(b)),

    /** The phone's share sheet where there is one, else the text is copied. */
    share: async (b?: PortalBooking) => {
      const text = b ? t("portal.v2.share.booking", { shop: shop.name, what: serviceNames(b), when: when(b) }) : shop.name;
      const result = await sharing.share({ title: shop.name, text, url: publicUrl("/portal/book") });
      if (result === "copied") feedback.success(t("portal.v2.share.copied"));
    },

    /** Directions to the shop's address (or its name when it has none). */
    directionsUrl: () => maps.url(),
    /** A directions link's click: the Maps app in the Android app, the link as is on the web. */
    openDirections: (event: Event) => maps.onLinkClick(event),
    callUrl: () => (shop.phone ? `tel:${shop.phone.replace(/\s+/g, "")}` : ""),
  };
};
