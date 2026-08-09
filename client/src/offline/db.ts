// Minimal native-IndexedDB wrapper for the offline write queue. Not using a
// library here — the operations needed (add / getAll / delete-by-key,
// ordered by insertion) are small enough that a raw wrapper is simpler than
// pulling in a dependency.

export interface QueuedWrite {
  id: string; // also the Idempotency-Key sent to the server
  endpoint: string; // relative, e.g. "/api/v1/appointments"
  method: "POST" | "PUT";
  body: any;
  kind: "appointment" | "payment";
  label: string; // short human-readable description for the UI
  createdAt: number;
  status: "pending" | "syncing" | "conflict";
  lastError?: string;
}

const DB_NAME = "pure-offline-queue";
const STORE_NAME = "pending_writes";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

const openDb = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
};

export const addQueuedWrite = async (write: QueuedWrite): Promise<void> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).add(write);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

export const getAllQueuedWrites = async (): Promise<QueuedWrite[]> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => {
      const rows = (req.result || []) as QueuedWrite[];
      rows.sort((a, b) => a.createdAt - b.createdAt);
      resolve(rows);
    };
    req.onerror = () => reject(req.error);
  });
};

export const updateQueuedWrite = async (write: QueuedWrite): Promise<void> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(write);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

export const removeQueuedWrite = async (id: string): Promise<void> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};
