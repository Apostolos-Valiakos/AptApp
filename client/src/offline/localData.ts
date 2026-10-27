// Last known server data, kept in the browser so frontdesk can open the
// calendar, look up services and search clients while offline.
import { STORES, deleteRow, getAllRows, getRow, putRow, putRows } from "./db";

// --- Appointments ------------------------------------------------------------

const startOf = (a: any) => a.services?.[0]?.start_time || a.start_time;

/**
 * Stores a fetched range. Appointments that were in this range before but
 * aren't any more (deleted or moved online) are removed, so the offline
 * calendar never shows ghosts.
 */
export const cacheAppointmentsRange = async (start: string, end: string, rows: any[]) => {
  const from = new Date(start).getTime();
  const to = new Date(end).getTime();
  const existing = await getAllRows<any>(STORES.appointments);
  const fresh = new Set(rows.map((r) => String(r.id)));
  const stale = existing
    .filter((a) => {
      const t = new Date(startOf(a)).getTime();
      return t >= from && t < to && !fresh.has(String(a.id));
    })
    .map((a) => String(a.id));
  await putRows(
    STORES.appointments,
    rows.map((r) => ({ ...r, id: String(r.id), start_time: startOf(r), _cachedAt: Date.now() })),
    stale,
  );
};

/** The cached appointments that start in [start, end). */
export const cachedAppointmentsInRange = async (start: string, end: string) => {
  const from = new Date(start).getTime();
  const to = new Date(end).getTime();
  const rows = await getAllRows<any>(STORES.appointments);
  return rows
    .filter((a) => {
      const t = new Date(startOf(a)).getTime();
      return t >= from && t < to;
    })
    .map(({ _cachedAt, ...a }) => a)
    .sort((a, b) => String(startOf(a)).localeCompare(String(startOf(b))));
};

/** Drops cached appointments older than `days` (keeps the store small). */
export const pruneCachedAppointments = async (days = 60) => {
  const limit = Date.now() - days * 86400000;
  const rows = await getAllRows<any>(STORES.appointments);
  const old = rows.filter((a) => new Date(startOf(a)).getTime() < limit).map((a) => String(a.id));
  if (old.length) await putRows(STORES.appointments, [], old);
};

// --- Other data (staff, services, working hours, ...) ------------------------

export const cacheValue = (key: string, value: any) => putRow(STORES.kv, { key, value, at: Date.now() });
export const cachedValue = async <T = any>(key: string): Promise<T | undefined> =>
  (await getRow<{ value: T }>(STORES.kv, key))?.value;

// --- Clients -----------------------------------------------------------------

/** Lower-case, accents and final sigma folded: "Δέσποινα" matches "δεσποινα". */
export const foldText = (s: string) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ς/g, "σ")
    .trim();
const digitsOf = (s: string) => String(s || "").replace(/\D/g, "");

export const cacheClients = async (clients: any[], replaceAll = true) => {
  const rows = clients.map((c) => ({ ...c, id: String(c.id) }));
  if (!replaceAll) return putRows(STORES.clients, rows);
  // Keep clients made offline (temporary ids) until they sync.
  const existing = await getAllRows<any>(STORES.clients);
  const fresh = new Set(rows.map((r) => r.id));
  const gone = existing.filter((c) => !fresh.has(c.id) && !String(c.id).startsWith("tmp-")).map((c) => c.id);
  return putRows(STORES.clients, rows, gone);
};
export const addCachedClient = (client: any) => putRow(STORES.clients, { ...client, id: String(client.id) });
export const removeCachedClient = (id: string) => deleteRow(STORES.clients, id);
export const getCachedClient = (id: string) => getRow<any>(STORES.clients, id);
export const getCachedClients = () => getAllRows<any>(STORES.clients);

/**
 * Client search over the cached list: every word must match the name (in
 * any order, accents ignored) or the query's digits must appear in the phone
 * (spaces and +30 ignored). Same result shape as GET /api/v1/clients?slim.
 */
export const searchCachedClients = async (query: string, limit = 10) => {
  const words = foldText(query).split(/\s+/).filter(Boolean);
  const digits = digitsOf(query);
  if (!words.length && !digits) return [];
  const all = await getAllRows<any>(STORES.clients);
  const matches = all.filter((c) => {
    const name = foldText(`${c.first_name || ""} ${c.last_name || ""}`);
    if (words.length && words.every((w) => name.includes(w))) return true;
    if (digits.length >= 3 && digitsOf(c.phone).includes(digits)) return true;
    return !!c.email && foldText(c.email).includes(foldText(query));
  });
  return matches
    .sort((a, b) => String(a.last_name || "").localeCompare(String(b.last_name || ""), "el"))
    .slice(0, limit)
    .map((c) => ({ ...c, full_name: c.full_name || `${c.first_name || ""} ${c.last_name || ""}`.trim() }));
};
