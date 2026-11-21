// The "done" sheet after a booking is made or moved, from the Book screen or
// from the assistant's card alike: the same check, Add to calendar, Share.
import { defineStore } from "pinia";

export const useBookingSuccessStore = defineStore("portalBookingSuccess", {
  state: () => ({ bookingId: null as string | null, kind: "booked" as "booked" | "moved" }),
  actions: {
    show(bookingId: string, kind: "booked" | "moved" = "booked") {
      this.bookingId = bookingId;
      this.kind = kind;
    },
    close() {
      this.bookingId = null;
    },
  },
});
