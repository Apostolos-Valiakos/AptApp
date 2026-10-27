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

// Offline mode: everything loaded here is also kept in the browser (see
// offline/localData.ts), so the calendar opens and works without a
// connection; changes waiting to sync are drawn on top (offline/overlay.ts).

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("token")}`,
  "Content-Type": "application/json",
});

/** GET that throws on network failure and on an error status. */
const getJson = async (url: string) => {
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  return res.json();
};

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
  const clientsById = ref<Record<string, any>>({});
  let lastRange: { start: string; end: string } | null = null;
  let lastPrefetch = 0;

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
    await Promise.all(
      sources.map(async ([url, key, apply]) => {
        try {
          const data = await getJson(url);
          apply(data);
          cacheValue(key, data).catch(() => {});
        } catch (err: any) {
          if (err?.status && err.status !== 503) return; // a real refusal: don't mask it with old data
          const cached = await cachedValue(key).catch(() => undefined);
          if (cached) apply(cached);
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
      cacheAppointmentsRange(start, end, rows).catch(() => {});
      prefetchAround();
    } catch (err: any) {
      if (err?.status && err.status !== 503) {
        console.error("fetchAppointments failed", err);
        return;
      }
      // Offline: the browser's copy of this range.
      const cached = await cachedAppointmentsInRange(start, end).catch(() => []);
      if (seq !== fetchSeq) return;
      serverEvents.value = cached;
      fromCache.value = true;
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
    const from = new Date(Date.now() - PREFETCH_DAYS_BACK * 86400000);
    from.setHours(0, 0, 0, 0);
    const to = new Date(Date.now() + PREFETCH_DAYS_AHEAD * 86400000);
    to.setHours(0, 0, 0, 0);
    try {
      const params = new URLSearchParams({ start: from.toISOString(), end: to.toISOString() });
      const rows = await getJson(`/api/v1/appointments?${params.toString()}`);
      await cacheAppointmentsRange(from.toISOString(), to.toISOString(), rows);
      await pruneCachedAppointments(60);
    } catch {
      lastPrefetch = 0; // try again next time
    }
    try {
      const clients = await getJson("/api/v1/clients?slim=true");
      if (Array.isArray(clients)) {
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

  const updateResourceOrder = async (reorderedStaff: any[]) => {
    resources.value = reorderedStaff;

    const token = localStorage.getItem("token");
    try {
      await fetch("/api/v1/staff/reorder", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orders: reorderedStaff.map((s, index) => ({
            id: s.id,
            sort_order: index,
          })),
        }),
      });
    } catch (err) {
      console.error("Failed to save staff order", err);
    }
  };

  // Synced changes now have real ids and server data: reload what's visible.
  if (typeof window !== "undefined") {
    window.addEventListener("offline-synced", () => {
      refreshVisibleRange();
      loadCachedClients();
    });
    window.addEventListener("offline-queue-changed", () => loadCachedClients());
    // Logged out: forget what's in memory too, and download afresh next login.
    window.addEventListener("offline-data-cleared", () => {
      serverEvents.value = [];
      clientsById.value = {};
      lastPrefetch = 0;
    });
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
    fetchBaseResources,
    fetchAppointments,
    refreshVisibleRange,
    prefetchAround,
    updateResourceOrder,
    refreshTimeOff,
    refreshWorkingHours,
  };
});
