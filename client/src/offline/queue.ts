// Offline write queue: bookings, edits, cancellations, deletions, payments
// and new clients made while the server can't be reached are kept in
// IndexedDB and replayed in order once it can (see sync.ts). Works the same
// in the browser and inside the Capacitor WebView — both are IndexedDB + fetch.
import { computed, ref } from "vue";
import {
  addQueuedWrite,
  clearAllStores,
  getAllQueuedWrites,
  getIdMap,
  removeQueuedWrite,
  saveIdMapping,
  updateQueuedWrite,
  type QueuedWrite,
} from "./db";
import { cancelInstead, flush, keepMine, type SendResult } from "./sync";
import { findTempIds, newTempId, substituteIds } from "./tempIds";

const pending = ref<QueuedWrite[]>([]);
const idMapRef = ref<Record<string, string>>({});
const online = ref(typeof navigator === "undefined" ? true : navigator.onLine !== false);
const authBlocked = ref(false);
let initialized = false;
let syncingHere = false;
let pingTimer: ReturnType<typeof setInterval> | null = null;

export const pendingWrites = computed(() => pending.value);
export const pendingCount = computed(() => pending.value.filter((w) => w.status !== "conflict").length);
export const conflictCount = computed(() => pending.value.filter((w) => w.status === "conflict").length);
export const idMap = computed(() => idMapRef.value);
/** Whether the server is reachable (not just whether there is a network). */
export const isOnline = computed(() => online.value);
/** Writes are waiting for the next login (the session expired while offline). */
export const syncNeedsLogin = computed(() => authBlocked.value && pendingCount.value > 0);

// IndexedDB can only store plain data: Vue's reactive objects (form state,
// items read back from `pending`) throw DataCloneError. Every write is turned
// into plain JSON first — exactly what would be sent to the server anyway
// (dates become ISO strings, undefined fields are dropped).
const plain = <T>(value: T): T => (value === undefined ? value : JSON.parse(JSON.stringify(value)));

// Strictly increasing, so writes made in the same millisecond (a booking and
// its follow-up edit) keep their order in the queue.
let lastCreatedAt = 0;
const nextCreatedAt = () => (lastCreatedAt = Math.max(Date.now(), lastCreatedAt + 1));

const genId = () =>
  typeof globalThis.crypto?.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const currentShopId = (): string | null => {
  try {
    if (!localStorage.getItem("token")) return null;
    const user = JSON.parse(localStorage.getItem("user") || "null");
    return user?.shop_id || user?.shopId || null;
  } catch {
    return null;
  }
};

const refreshPending = async () => {
  pending.value = await getAllQueuedWrites();
  idMapRef.value = await getIdMap();
};

// Other open tabs share the same IndexedDB: tell them when the queue changes.
const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("pure-offline-queue") : null;
const queueChanged = () => {
  window.dispatchEvent(new CustomEvent("offline-queue-changed"));
  channel?.postMessage("changed");
};

// A hung connection (wifi up, no route to the server) doesn't make fetch()
// reject on its own: abort after a timeout so it counts as unreachable.
const fetchWithTimeout = (url: string, init: RequestInit, timeoutMs = 8000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
};

const headersFor = (idempotencyKey: string, replay: boolean): Record<string, string> => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
  "Idempotency-Key": idempotencyKey,
  ...(replay ? { "X-Offline-Replay": "1" } : {}),
});

const send = async (write: QueuedWrite): Promise<SendResult> => {
  try {
    const res = await fetchWithTimeout(write.endpoint, {
      method: write.method,
      headers: headersFor(write.id, true),
      body: write.method === "DELETE" || write.body === undefined ? undefined : JSON.stringify(write.body),
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  } catch {
    return { networkError: true };
  }
};

export interface QueueMeta {
  kind: QueuedWrite["kind"];
  label: string;
  /** For creates: where the new record's id is in the response ("id", "client.id"). */
  createsId?: string;
  /**
   * Fields added to the body only if the write ends up queued — e.g.
   * offline_known_overlaps, which lets the server tell a slot booked online
   * in the meantime from an overlap staff already saw and accepted.
   */
  offlineExtras?: Record<string, any>;
}

export type QueueOutcome =
  | { queued: false; response: Response }
  | { queued: true; id: string; tempId?: string };

const enqueue = async (
  endpoint: string,
  method: QueuedWrite["method"],
  body: any,
  meta: QueueMeta,
  idempotencyKey: string,
): Promise<QueueOutcome> => {
  const tempId = meta.createsId ? newTempId() : undefined;
  const write: QueuedWrite = {
    id: idempotencyKey,
    endpoint,
    method,
    body: plain(body && typeof body === "object" && !Array.isArray(body) ? { ...body, ...(meta.offlineExtras || {}) } : body),
    kind: meta.kind,
    label: meta.label,
    createdAt: nextCreatedAt(),
    status: "pending",
    shopId: currentShopId(),
    tempId,
    resultIdPath: meta.createsId,
  };
  await addQueuedWrite(write);
  await refreshPending();
  queueChanged();
  return { queued: true, id: write.id, tempId };
};

/**
 * Saves live when the server is reachable; otherwise (no network, DNS
 * failure, timeout) queues the write and returns { queued: true }. A
 * response from the server — success or a refusal like a validation error —
 * is returned as is, never queued, so it can be shown right away.
 *
 * Writes that refer to a record created offline and not yet synced (a
 * temporary id) are always queued, behind that record's create.
 */
export const fetchOrQueue = async (
  endpoint: string,
  method: QueuedWrite["method"],
  body: any,
  meta: QueueMeta,
): Promise<QueueOutcome> => {
  const idempotencyKey = genId();
  // Ids from creates that synced since the caller got them.
  const swapped = substituteIds(endpoint, body, idMapRef.value);
  endpoint = swapped.endpoint;
  body = swapped.body;

  if (findTempIds(endpoint, body).length > 0 || !online.value || navigator.onLine === false) {
    return enqueue(endpoint, method, body, meta, idempotencyKey);
  }
  try {
    const response = await fetchWithTimeout(endpoint, {
      method,
      headers: headersFor(idempotencyKey, false),
      body: method === "DELETE" || body === undefined ? undefined : JSON.stringify(body),
    });
    return { queued: false, response };
  } catch {
    online.value = false;
    startPinging();
    return enqueue(endpoint, method, body, meta, idempotencyKey);
  }
};

/** Runs one sync (in one tab at a time, when the browser supports locks). */
export const flushQueue = async () => {
  if (syncingHere) return;
  syncingHere = true;
  const run = async () => {
    const result = await flush({
      getWrites: getAllQueuedWrites,
      updateWrite: updateQueuedWrite,
      removeWrite: removeQueuedWrite,
      getIdMap,
      saveIdMapping,
      send,
      currentShopId,
    });
    authBlocked.value = result.stoppedBy === "auth";
    if (result.stoppedBy === "network") online.value = false;
    else if (result.stoppedBy !== "auth") online.value = true;
    if (result.synced > 0) window.dispatchEvent(new CustomEvent("offline-synced", { detail: result }));
    return result;
  };
  try {
    const locks = (navigator as any).locks;
    if (locks?.request) {
      // ifAvailable: if another tab is syncing right now, skip this run.
      await locks.request("pure-offline-sync", { ifAvailable: true }, async (lock: unknown) => {
        if (lock) await run();
      });
    } else {
      await run();
    }
  } finally {
    await refreshPending();
    queueChanged();
    syncingHere = false;
  }
};

/** "Keep mine": send the conflicting write again, overwriting / booking anyway. */
export const keepMineQueuedWrite = async (id: string) => {
  const write = pending.value.find((w) => w.id === id);
  if (!write) return;
  await updateQueuedWrite(plain(keepMine(write)));
  await refreshPending();
  flushQueue();
};

/** "Cancel instead": a refused delete (the booking has payments) becomes a cancellation. */
export const cancelInsteadQueuedWrite = async (id: string) => {
  const write = pending.value.find((w) => w.id === id);
  if (!write) return;
  await updateQueuedWrite(plain(cancelInstead(write)));
  await refreshPending();
  flushQueue();
};

/** Try again unchanged (e.g. after fixing something on the server side). */
export const retryQueuedWrite = async (id: string) => {
  const write = pending.value.find((w) => w.id === id);
  if (!write) return;
  await updateQueuedWrite(plain({ ...write, status: "pending", conflict: undefined, lastError: undefined }));
  await refreshPending();
  flushQueue();
};

/** "Keep theirs" / discard: drop the queued write. */
export const discardQueuedWrite = async (id: string) => {
  await removeQueuedWrite(id);
  await refreshPending();
  queueChanged();
};

const checkServer = async () => {
  try {
    const res = await fetchWithTimeout("/health", { method: "GET", cache: "no-store" }, 5000);
    online.value = res.ok;
  } catch {
    online.value = false;
  }
  if (online.value) {
    stopPinging();
    if (pending.value.some((w) => w.status === "pending")) flushQueue();
  }
};

function startPinging() {
  if (pingTimer) return;
  pingTimer = setInterval(checkServer, 10000);
}
function stopPinging() {
  if (pingTimer && !pending.value.some((w) => w.status === "pending")) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
}

/**
 * Before a deliberate logout: tries to send what's waiting, and returns how
 * many changes still couldn't be (offline, or conflicts) — they'd be lost.
 */
export const syncBeforeLogout = async (): Promise<number> => {
  await refreshPending();
  if (!pending.value.some((w) => w.status === "pending") || authBlocked.value) return pending.value.length;
  // The connection may be back without the app having noticed yet.
  try {
    online.value = (await fetchWithTimeout("/health", { method: "GET", cache: "no-store" }, 4000)).ok;
  } catch {
    online.value = false;
  }
  if (online.value) await flushQueue();
  return pending.value.length;
};

/**
 * Deletes everything kept for offline use (appointments, clients, settings,
 * queued changes). Only for a deliberate logout — an expired session keeps it
 * all, so the changes can still sync after the next login.
 */
export const clearOfflineData = async () => {
  await clearAllStores();
  authBlocked.value = false;
  await refreshPending();
  window.dispatchEvent(new CustomEvent("offline-data-cleared"));
  queueChanged();
};

/** Call after logging in: writes held for an expired session can go now. */
export const onLoggedIn = () => {
  authBlocked.value = false;
  if (pending.value.some((w) => w.status === "pending")) flushQueue();
};

export const initOfflineSync = async () => {
  if (initialized) return;
  initialized = true;
  await refreshPending();

  window.addEventListener("online", () => {
    online.value = true;
    checkServer();
  });
  window.addEventListener("offline", () => {
    online.value = false;
    startPinging();
  });
  // Logged in again in another tab: writes held for the expired session can go.
  window.addEventListener("storage", (e) => {
    if (e.key === "token" && e.newValue) onLoggedIn();
  });
  // Another tab changed the queue (or synced): pick it up.
  if (channel) {
    channel.onmessage = async () => {
      await refreshPending();
      window.dispatchEvent(new CustomEvent("offline-queue-changed"));
      if (pending.value.length === 0) window.dispatchEvent(new CustomEvent("offline-synced"));
    };
  }
  // Server reachability can't be told from the network interface alone, so
  // keep checking while anything is waiting (and every minute regardless).
  setInterval(() => {
    if (pending.value.length > 0 || !online.value) checkServer();
    else refreshPending();
  }, 60000);
  if (pending.value.some((w) => w.status === "pending")) startPinging();
  await checkServer();
};
