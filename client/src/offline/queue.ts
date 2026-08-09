// Offline write queue: appointment/payment writes that fail due to an
// actual network problem (not a server-rejected request) are persisted to
// IndexedDB and replayed automatically once connectivity returns. Works
// identically in the browser and inside the Capacitor WebView — both are
// just IndexedDB + fetch.
import { computed, ref } from "vue";
import {
  addQueuedWrite,
  getAllQueuedWrites,
  removeQueuedWrite,
  updateQueuedWrite,
  type QueuedWrite,
} from "./db";

const pending = ref<QueuedWrite[]>([]);
let initialized = false;
let syncing = false;
let pingTimer: ReturnType<typeof setInterval> | null = null;

export const pendingWrites = computed(() => pending.value);
export const pendingCount = computed(
  () => pending.value.filter((w) => w.status !== "conflict").length,
);
export const conflictCount = computed(
  () => pending.value.filter((w) => w.status === "conflict").length,
);

const genId = () =>
  crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

const refreshPending = async () => {
  pending.value = await getAllQueuedWrites();
};

// A hung connection (wifi connected, no route to the server) doesn't make
// fetch() reject on its own — abort it after a timeout so it's treated the
// same as an outright connection failure instead of spinning forever.
const fetchWithTimeout = (url: string, init: RequestInit, timeoutMs = 8000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
};

const sendWrite = async (
  write: QueuedWrite,
): Promise<{ ok: true } | { ok: false; conflict: boolean; message: string }> => {
  const token = localStorage.getItem("token");
  try {
    const res = await fetchWithTimeout(write.endpoint, {
      method: write.method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": write.id,
      },
      body: JSON.stringify(write.body),
    });
    if (res.ok) return { ok: true };
    const data = await res.json().catch(() => ({}));
    // A 4xx means the server actively rejected this write once it actually
    // saw it (e.g. a slot taken in the meantime, a stale gift-card/membership
    // balance) — that's a real conflict for staff to resolve, not something
    // to keep silently retrying against.
    return {
      ok: false,
      conflict: res.status >= 400 && res.status < 500,
      message: data.error || `Request failed (${res.status})`,
    };
  } catch (e) {
    return { ok: false, conflict: false, message: (e as Error).message };
  }
};

// Tries the write live first; only falls back to the offline queue when the
// request never got a response at all (offline, DNS failure, timeout).
// Server-rejected requests (validation errors, etc.) resolve normally and
// must be surfaced to the caller immediately, not queued to fail again later.
export const fetchOrQueue = async (
  endpoint: string,
  method: "POST" | "PUT",
  body: any,
  meta: { kind: "appointment" | "payment"; label: string },
): Promise<{ queued: false; response: Response } | { queued: true; id: string }> => {
  const token = localStorage.getItem("token");
  const idempotencyKey = genId();
  try {
    const response = await fetchWithTimeout(endpoint, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(body),
    });
    return { queued: false, response };
  } catch {
    const write: QueuedWrite = {
      id: idempotencyKey,
      endpoint,
      method,
      body,
      kind: meta.kind,
      label: meta.label,
      createdAt: Date.now(),
      status: "pending",
    };
    await addQueuedWrite(write);
    await refreshPending();
    return { queued: true, id: write.id };
  }
};

export const flushQueue = async () => {
  if (syncing) return;
  syncing = true;
  try {
    await refreshPending();
    for (const write of pending.value) {
      if (write.status === "conflict") continue; // needs manual resolution, don't auto-retry
      const result = await sendWrite(write);
      if (result.ok) {
        await removeQueuedWrite(write.id);
      } else if (result.conflict) {
        await updateQueuedWrite({ ...write, status: "conflict", lastError: result.message });
      } else {
        // Still unreachable — stop here, the remaining items would fail the same way.
        break;
      }
    }
  } finally {
    await refreshPending();
    syncing = false;
  }
};

export const retryQueuedWrite = async (id: string) => {
  const write = pending.value.find((w) => w.id === id);
  if (!write) return;
  await updateQueuedWrite({ ...write, status: "pending", lastError: undefined });
  await refreshPending();
  flushQueue();
};

export const discardQueuedWrite = async (id: string) => {
  await removeQueuedWrite(id);
  await refreshPending();
};

export const initOfflineSync = async () => {
  if (initialized) return;
  initialized = true;
  await refreshPending();

  window.addEventListener("online", () => flushQueue());

  // navigator.onLine / the browser's `online` event only reflect the OS
  // network interface, not whether the server is actually reachable, so
  // also poll /health periodically while anything is waiting to sync.
  pingTimer = setInterval(() => {
    if (pending.value.length === 0) return;
    fetch("/health")
      .then((res) => res.ok && flushQueue())
      .catch(() => {});
  }, 20000);

  if (pending.value.length > 0) flushQueue();
};
