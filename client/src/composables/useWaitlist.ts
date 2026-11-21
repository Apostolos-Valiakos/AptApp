// The front desk's waitlist (server: routes/waitlist.js), shared by the
// calendar's toolbar button, the waitlist panel and the calendar. One copy
// for the whole app.
import { computed, ref } from "vue";
import { api } from "../api/http";

export type WaitlistEntry = {
  id: string;
  client_id: string;
  client_name: string;
  first_name: string;
  last_name: string;
  client_phone: string | null;
  service_id: string | null;
  service_name: string | null;
  duration_minutes: number | null;
  staff_id: string | null;
  staff_name: string | null;
  date_from: string; // "YYYY-MM-DD"
  date_to: string;
  days: number[]; // 0 = Sunday … 6; none = any
  time_from: string | null; // "HH:MM"
  time_to: string | null;
  note: string | null;
};

/**
 * A time a cancelled or deleted booking freed, still free and suiting the
 * waiting clients in `matches` (server: freedSlots in domain/waitlist.js).
 */
export type FreedSlot = { id: string; staff_id: string; staff_name: string; start: Date; end: Date; matches: WaitlistEntry[] };

const entries = ref<WaitlistEntry[]>([]);
const showingAll = ref(false);
const loading = ref(false);
const panelVisible = ref(false);
// Every freed time that suits someone waiting, and the one the panel is
// showing, if any.
const freed = ref<FreedSlot[]>([]);
const freedSlot = ref<FreedSlot | null>(null);
// The waiting entries that can be booked now (a free time in their dates).
const bookable = ref<string[]>([]);

const load = async () => {
  loading.value = true;
  try {
    entries.value = await api.get(`/api/v1/waitlist${showingAll.value ? "?all=1" : ""}`);
  } finally {
    loading.value = false;
  }
};

const loadFreed = async () => {
  const rows: any[] = await api.get("/api/v1/waitlist/freed");
  freed.value = rows.map((r) => ({ ...r, start: new Date(r.start), end: new Date(r.end) }));
  // The one being shown: its latest matches, or closed once it no longer counts.
  if (freedSlot.value) freedSlot.value = freed.value.find((f) => f.id === freedSlot.value!.id) || null;
};

const loadBookable = async () => {
  bookable.value = await api.get("/api/v1/waitlist/bookable");
};

/** Adds an entry, or changes one (with its id). */
const save = async (entry: Record<string, any>, id?: string) => {
  if (id) await api.put(`/api/v1/waitlist/${id}`, entry);
  else await api.post("/api/v1/waitlist", entry);
  await Promise.all([load(), loadFreed(), loadBookable()]);
};

const remove = async (id: string) => {
  await api.del(`/api/v1/waitlist/${id}`);
  entries.value = entries.value.filter((e) => e.id !== id);
  bookable.value = bookable.value.filter((b) => b !== id);
  await loadFreed();
};

/** A freed time nobody will be booked into: gone for everyone. */
const dismissFreed = async (id: string) => {
  await api.del(`/api/v1/waitlist/freed/${id}`);
  freed.value = freed.value.filter((f) => f.id !== id);
  if (freedSlot.value?.id === id) freedSlot.value = null;
};

/** All of it, quietly (on opening the calendar and on other screens' changes). */
const refresh = () => Promise.all([load(), loadFreed(), loadBookable()]).catch(() => {});

export const useWaitlist = () => ({
  entries,
  // Only what can be acted on: the waiting clients who can be booked now
  // (a cancellation that frees a time for someone makes them one).
  count: computed(() => bookable.value.length),
  bookable,
  showingAll,
  loading,
  panelVisible,
  freed,
  freedSlot,
  load,
  loadFreed,
  loadBookable,
  refresh,
  save,
  remove,
  dismissFreed,
});
