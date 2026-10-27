// Native-IndexedDB wrapper for offline mode. Not using a library: the
// operations needed (put / get / getAll / delete by key) are small enough
// that a raw wrapper is simpler than pulling in a dependency.
//
// Stores:
//   pending_writes  saves made offline, replayed in order once back online
//   id_map          temporary id (made offline) -> real id (after sync)
//   appointments    last known appointments, for the calendar while offline
//   clients         last known client list, for client search while offline
//   kv              other cached data (staff, services, working hours, ...)

export interface QueuedWrite {
  id: string; // also the Idempotency-Key sent to the server
  endpoint: string; // relative, e.g. "/api/v1/appointments"
  method: "POST" | "PUT" | "DELETE";
  body: any;
  kind: "appointment" | "payment" | "client" | "delete";
  label: string; // short human-readable description for the UI
  createdAt: number;
  status: "pending" | "conflict";
  lastError?: string;
  // Why the server refused it (slot_taken, stale_appointment, ...), with its details.
  conflict?: { code: string; details?: any };
  // The shop the write was made for: it is only ever replayed with that
  // shop's session, never with another account's.
  shopId?: string | null;
  // For creates made offline: the temporary id the rest of the queue (and the
  // calendar) uses for the new record until the server assigns the real one,
  // and where that real id is in the response ("id", "client.id").
  tempId?: string;
  resultIdPath?: string;
}

const DB_NAME = "pure-offline-queue";
const DB_VERSION = 2;
export const STORES = {
  writes: "pending_writes",
  idMap: "id_map",
  appointments: "appointments",
  clients: "clients",
  kv: "kv",
} as const;

let dbPromise: Promise<IDBDatabase> | null = null;

const openDb = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // Version 1 only had pending_writes; it is kept as is, so saves queued
      // before an app update survive it.
      if (!db.objectStoreNames.contains(STORES.writes)) db.createObjectStore(STORES.writes, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORES.idMap)) db.createObjectStore(STORES.idMap, { keyPath: "tempId" });
      if (!db.objectStoreNames.contains(STORES.appointments)) {
        const store = db.createObjectStore(STORES.appointments, { keyPath: "id" });
        store.createIndex("start", "start_time");
      }
      if (!db.objectStoreNames.contains(STORES.clients)) db.createObjectStore(STORES.clients, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORES.kv)) db.createObjectStore(STORES.kv, { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
};

/** For tests: forget the open connection (fake-indexeddb is reset between tests). */
export const resetDbConnection = () => {
  dbPromise = null;
};

const run = async <T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T> => {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req ? (req as IDBRequest<T>).result : (undefined as T));
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
};

export const putRow = (store: string, row: any) => run(store, "readwrite", (s) => s.put(row));

/** Empties every store (on logout: nothing about the shop stays on the device). */
export const clearAllStores = async () => {
  const db = await openDb();
  const names = Object.values(STORES);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(names, "readwrite");
    names.forEach((name) => tx.objectStore(name).clear());
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
};
export const getRow = <T = any>(store: string, key: string) => run<T>(store, "readonly", (s) => s.get(key) as IDBRequest<T>);
export const getAllRows = <T = any>(store: string) => run<T[]>(store, "readonly", (s) => s.getAll() as IDBRequest<T[]>);
export const deleteRow = (store: string, key: string) => run(store, "readwrite", (s) => s.delete(key));

/** Replaces many rows in one transaction (all or nothing). */
export const putRows = async (store: string, rows: any[], deleteKeys: string[] = []) => {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const s = tx.objectStore(store);
    for (const key of deleteKeys) s.delete(key);
    for (const row of rows) s.put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
};

// --- Queued writes -----------------------------------------------------------
export const addQueuedWrite = (write: QueuedWrite) => run(STORES.writes, "readwrite", (s) => s.add(write));
export const updateQueuedWrite = (write: QueuedWrite) => putRow(STORES.writes, write);
export const removeQueuedWrite = (id: string) => deleteRow(STORES.writes, id);
export const getAllQueuedWrites = async (): Promise<QueuedWrite[]> => {
  const rows = await getAllRows<QueuedWrite>(STORES.writes);
  return rows.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
};

// --- Temporary id -> real id ------------------------------------------------
export const getIdMap = async (): Promise<Record<string, string>> => {
  const rows = await getAllRows<{ tempId: string; realId: string }>(STORES.idMap);
  return Object.fromEntries(rows.map((r) => [r.tempId, r.realId]));
};
export const saveIdMapping = (tempId: string, realId: string) =>
  putRow(STORES.idMap, { tempId, realId, at: Date.now() });
