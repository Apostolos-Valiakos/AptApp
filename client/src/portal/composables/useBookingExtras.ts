// The things a booking offers besides changing it: add it to a calendar (N5),
// share it (N6), get directions to the shop (N7), call the shop (K12). Web
// versions here; the app build swaps in native ones (REDESIGN_SPEC.md §6.4)
// without the screens changing.
import { useI18n } from "vue-i18n";
import { saveBlob } from "../../api/http";
import { formatDate } from "../../utils/format";
import { usePortalShopStore } from "../stores/shop";
import { serviceNames, staffNames, type PortalBooking } from "../stores/bookings";
import { googleCalendarLink, icsFor, type CalendarEvent } from "../utils/calendarFile";
import { useFeedback } from "./useFeedback";

export const useBookingExtras = () => {
  const { t, locale } = useI18n();
  const shop = usePortalShopStore();
  const feedback = useFeedback();

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
    /** Downloads the booking as an .ics file, which every calendar app opens. */
    addToCalendar: (b: PortalBooking) => {
      saveBlob(new Blob([icsFor(eventFor(b))], { type: "text/calendar;charset=utf-8" }), `${serviceNames(b) || "booking"}.ics`);
      feedback.success(t("portal.v2.calendar.downloaded"));
    },
    googleCalendarUrl: (b: PortalBooking) => googleCalendarLink(eventFor(b)),

    /** The phone's share sheet where there is one, else the text is copied. */
    share: async (b?: PortalBooking) => {
      const url = `${window.location.origin}/portal/book`;
      const text = b ? t("portal.v2.share.booking", { shop: shop.name, what: serviceNames(b), when: when(b) }) : shop.name;
      if (typeof navigator.share === "function") {
        try {
          await navigator.share({ title: shop.name, text, url });
          return;
        } catch (err: any) {
          if (err?.name === "AbortError") return; // closed by the client
        }
      }
      try {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        feedback.success(t("portal.v2.share.copied"));
      } catch {}
    },

    /** Maps at the shop's address (or its name when it has none). */
    directionsUrl: () => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shop.shop?.address || shop.name)}`,
    callUrl: () => (shop.phone ? `tel:${shop.phone.replace(/\s+/g, "")}` : ""),
  };
};
