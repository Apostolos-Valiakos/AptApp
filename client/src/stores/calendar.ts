import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { applyPendingWrites } from "../offline/overlay";
import {
  cacheAppointmentsRange,
  cacheClients,
  cacheValue,
  cachedAppointmentsInRange,
  cachedValue,
  getCachedClients,
  pruneCachedAppointments,
} from "../offline/localData";
import { idMap, pendingWrites } from "../offline/queue";
import { api } from "../api/http";
import { useAuthStore } from "./auth";

// Offline mode: everything loaded here is also kept in the browser (see
// offline/localData.ts), so the calendar opens and works without a
// connection; changes waiting to sync are drawn on top (offline/overlay.ts).

/** GET that throws on network failure, and ApiError (with .status) on a refusal. */
const getJson = (url: string) => api.get(url);

const PREFETCH_DAYS_BACK = 7;
const PREFETCH_DAYS_AHEAD = 30;
const PREFETCH_EVERY_MS = 15 * 60 * 1000;

export const useCalendarStore = defineStore("calendar", () => {
  const resources = ref<any[]>([]);
  const serverEvents = ref<any[]>([]);
  const services = ref<any[]>([]);
  const products = ref<any[]>([]);
  const timeOff = ref<any[]>([]);
  const workingHours = ref<any[]>([]);
  /** Shown from the browser's copy (the server couldn't be reached). */
  const fromCache = ref(false);
  /** The server refused or failed to load the visible range (not a lost connection). */
  const loadFailed = ref(false);
  const clientsById = ref<Record<string, any>>({});
  let lastRange: { start: string; end: string } | null = null;
  let lastPrefetch = 0;
  // Raised when the logged-in user changes: answers to requests made before
  // that belong to the previous user and are dropped.
  let session = 0;

  /** The calendar's appointments: the last known list plus changes waiting to sync. */
  const events = computed(() =>
    applyPendingWrites(serverEvents.value, pendingWrites.value, {
      services: services.value,
      clientById: (id: string) => clientsById.value[id],
      idMap: idMap.value,
    }),
  );

  const loadCachedClients = async () => {
    const rows = await getCachedClients().catch(() => []);
    clientsById.value = Object.fromEntries(rows.map((c: any) => [String(c.id), c]));
  };

  // 1. Static data for dropdowns and the calendar's columns.
  const fetchBaseResources = async () => {
    if (!localStorage.getItem("token")) return;
    const sources: [string, string, (v: any) => void][] = [
      ["/api/v1/staff", "staff", (v) => {
        resources.value = v
          .filter((s: any) => s.visible_in_calendar !== false)
          .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));
      }],
      ["/api/v1/services", "services", (v) => (services.value = v)],
      ["/api/v1/products", "products", (v) => (products.value = v)],
      ["/api/v1/time-off", "timeOff", (v) => (timeOff.value = v)],
      ["/api/v1/working-hours", "workingHours", (v) => (workingHours.value = v)],
    ];
    const startedIn = session;
    await Promise.all(
      sources.map(async ([url, key, apply]) => {
        try {
          const data = await getJson(url);
          if (startedIn !== session) return;
          apply(data);
          cacheValue(key, data).catch(() => {});
        } catch (err: any) {
          if (err?.status && err.status !== 503) return; // a real refusal: don't mask it with old data
          const cached = await cachedValue(key).catch(() => undefined);
          if (cached && startedIn === session) apply(cached);
        }
      }),
    );
    loadCachedClients();
  };

  // 2. Appointments for the visible date range.
  // Clicking quickly through days starts several loads; answers can arrive
  // out of order, and only the latest request's may be shown.
  let fetchSeq = 0;
  const fetchAppointments = async (start: string, end: string) => {
    if (!localStorage.getItem("token")) return;
    lastRange = { start, end };
    const seq = ++fetchSeq;
    const params = new URLSearchParams({ start, end });
    try {
      const rows = await getJson(`/api/v1/appointments?${params.toString()}`);
      if (seq !== fetchSeq) return;
      serverEvents.value = rows;
      fromCache.value = false;
      loadFailed.value = false;
      cacheAppointmentsRange(start, end, rows).catch(() => {});
      prefetchAround();
    } catch (err: any) {
      if (err?.status && err.status !== 503) {
        console.error("fetchAppointments failed", err);
        if (seq !== fetchSeq) return;
        // Old appointments must not pass for this range's.
        serverEvents.value = [];
        fromCache.value = false;
        // An expired session has its own message (utils/sessionRecovery.ts).
        loadFailed.value = err.status !== 401;
        return;
      }
      // Offline: the browser's copy of this range.
      const cached = await cachedAppointmentsInRange(start, end).catch(() => []);
      if (seq !== fetchSeq) return;
      serverEvents.value = cached;
      fromCache.value = true;
      loadFailed.value = false;
    }
  };

  /** Re-reads the visible range (after a sync, or when the queue changed). */
  const refreshVisibleRange = () => (lastRange ? fetchAppointments(lastRange.start, lastRange.end) : undefined);

  /**
   * While online, keeps the coming weeks (and the past week) plus the client
   * list in the browser, so they're there if the connection drops later.
   */
  const prefetchAround = async (force = false) => {
    if (!force && Date.now() - lastPrefetch < PREFETCH_EVERY_MS) return;
    lastPrefetch = Date.now();
    const startedIn = session;
    const from = new Date(Date.now() - PREFETCH_DAYS_BACK * 86400000);
    from.setHours(0, 0, 0, 0);
    const to = new Date(Date.now() + PREFETCH_DAYS_AHEAD * 86400000);
    to.setHours(0, 0, 0, 0);
    try {
      const params = new URLSearchParams({ start: from.toISOString(), end: to.toISOString() });
      const rows = await getJson(`/api/v1/appointments?${params.toString()}`);
      if (startedIn !== session) return;
      await cacheAppointmentsRange(from.toISOString(), to.toISOString(), rows);
      await pruneCachedAppointments(60);
    } catch {
      lastPrefetch = 0; // try again next time
    }
    try {
      const clients = await getJson("/api/v1/clients?slim=true");
      if (Array.isArray(clients) && startedIn === session) {
        await cacheClients(clients);
        await loadCachedClients();
      }
    } catch {}
  };

  const refreshTimeOff = async () => {
    try {
      timeOff.value = await getJson("/api/v1/time-off");
      cacheValue("timeOff", timeOff.value).catch(() => {});
    } catch (err) {
      console.error("refreshTimeOff failed", err);
    }
  };

  const refreshWorkingHours = async () => {
    try {
      workingHours.value = await getJson("/api/v1/working-hours");
      cacheValue("workingHours", workingHours.value).catch(() => {});
    } catch (err) {
      console.error("refreshWorkingHours failed", err);
    }
  };

  /** Shows the new order right away; if it can't be saved, puts the old one back and throws. */
  const updateResourceOrder = async (reorderedStaff: any[]) => {
    const previous = resources.value;
    resources.value = reorderedStaff;

    try {
      await api.post("/api/v1/staff/reorder", {
        orders: reorderedStaff.map((s, index) => ({
          id: s.id,
          sort_order: index,
        })),
      });
    } catch (err) {
      console.error("Failed to save staff order", err);
      resources.value = previous;
      throw err;
    }
  };

  /** Forgets everything in memory, and any answers still on their way. */
  const forgetLoadedData = () => {
    session++;
    fetchSeq++;
    lastRange = null;
    lastPrefetch = 0;
    serverEvents.value = [];
    resources.value = [];
    services.value = [];
    products.value = [];
    timeOff.value = [];
    workingHours.value = [];
    clientsById.value = {};
    fromCache.value = false;
    loadFailed.value = false;
  };

  // Every way a user stops being the current one: logout, an expired or
  // revoked session, entering or leaving a shop's view.
  const authStore = useAuthStore();
  watch(() => authStore.user?.id, forgetLoadedData, { flush: "sync" });

  // Synced changes now have real ids and server data: reload what's visible.
  if (typeof window !== "undefined") {
    window.addEventListener("offline-synced", () => {
      refreshVisibleRange();
      loadCachedClients();
    });
    window.addEventListener("offline-queue-changed", () => loadCachedClients());
    // Logged out: forget what's in memory too, and download afresh next login.
    window.addEventListener("offline-data-cleared", forgetLoadedData);
  }
  // Clients created offline appear in the overlay by name.
  watch(pendingWrites, () => loadCachedClients());

  return {
    resources,
    events,
    serverEvents,
    services,
    products,
    timeOff,
    workingHours,
    fromCache,
    loadFailed,
    fetchBaseResources,
    fetchAppointments,
    refreshVisibleRange,
    prefetchAround,
    updateResourceOrder,
    refreshTimeOff,
    refreshWorkingHours,
  };
});
