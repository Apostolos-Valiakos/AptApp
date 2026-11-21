// The client's bookings (last 12 months and to come, GET /portal/appointments),
// shared by Home and Bookings and reloaded whenever any screen or the
// assistant changes one ("appointments-changed").
import { defineStore } from "pinia";
import { api } from "../../api/http";

export type PortalService = {
  service_id: string;
  service_name: string;
  staff_id: string | null;
  staff_name: string | null;
  start_time: string;
  duration_minutes: number;
  price: number;
};
export type PortalBooking = {
  id: string;
  status: string;
  payment_status: string;
  booking_notes: string | null;
  paid: number;
  total: number;
  start_time: string;
  end_time: string;
  services: PortalService[];
};

const GONE = ["cancelled"];
export const isActive = (b: PortalBooking) => !GONE.includes(b.status);
export const serviceNames = (b: PortalBooking) => b.services.map((s) => s.service_name).filter(Boolean).join(", ");
export const staffNames = (b: PortalBooking) => [...new Set(b.services.map((s) => s.staff_name).filter(Boolean))].join(", ");

export const usePortalBookingsStore = defineStore("portalBookings", {
  state: () => ({
    list: [] as PortalBooking[],
    loaded: false,
    failed: false,
    listening: false,
  }),
  getters: {
    /** Still to come (or under way), soonest first, cancelled ones left out. */
    upcoming(state): PortalBooking[] {
      const now = Date.now();
      return state.list
        .filter((b) => isActive(b) && new Date(b.end_time).getTime() > now)
        .sort((a, b) => a.start_time.localeCompare(b.start_time));
    },
    /** Over (or cancelled), newest first. */
    past(state): PortalBooking[] {
      const now = Date.now();
      return state.list
        .filter((b) => new Date(b.end_time).getTime() <= now || (!isActive(b) && new Date(b.start_time).getTime() <= now))
        .sort((a, b) => b.start_time.localeCompare(a.start_time));
    },
    /** A cancelled booking whose time hasn't come: shown with the upcoming ones, crossed out. */
    cancelledUpcoming(state): PortalBooking[] {
      const now = Date.now();
      return state.list.filter((b) => !isActive(b) && new Date(b.start_time).getTime() > now);
    },
    byId: (state) => (id: string) => state.list.find((b) => b.id === id),
  },
  actions: {
    async load() {
      try {
        this.list = await api.get<PortalBooking[]>("/api/v1/portal/appointments");
        this.failed = false;
      } catch {
        this.failed = true;
      } finally {
        this.loaded = true;
      }
      if (!this.listening) {
        this.listening = true;
        window.addEventListener("appointments-changed", () => this.load());
      }
    },
  },
});
