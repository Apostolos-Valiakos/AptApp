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
  /** When "How was it?" was asked for this visit (never again after). */
  review_prompted_at?: string | null;
  paid: number;
  total: number;
  start_time: string;
  end_time: string;
  services: PortalService[];
};

// The last list loaded is kept on the device, so Home and Bookings show it
// with no connection (N13). Only the client's own bookings; logging out
// clears it (portal/logout.ts).
const CACHE_KEY = "portal.bookings";
const readCache = (): PortalBooking[] => {
  try {
    const saved = JSON.parse(localStorage.getItem(CACHE_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
};
const writeCache = (list: PortalBooking[]) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(list));
  } catch {}
};
export const clearBookingsCache = () => {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {}
};

const GONE = ["cancelled"];
export const isActive = (b: PortalBooking) => !GONE.includes(b.status);
export const serviceNames = (b: PortalBooking) => b.services.map((s) => s.service_name).filter(Boolean).join(", ");
export const staffNames = (b: PortalBooking) => [...new Set(b.services.map((s) => s.staff_name).filter(Boolean))].join(", ");

export const usePortalBookingsStore = defineStore("portalBookings", {
  state: () => ({
    list: readCache(),
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
        writeCache(this.list);
      } catch {
        // Keeps what's shown (the kept copy at first), marked as possibly old.
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
