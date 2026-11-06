// The queue as the app uses it (client/src/offline/queue.ts): live saves vs
// queuing, temporary ids, syncing over fetch, sessions, persistence, and the
// upgrade from the first version of the browser database.
import { describe, expect, test, beforeEach, vi } from "vitest";
import { FakeServer } from "./fakeServer";

let server: FakeServer;
let q: typeof import("../../client/src/offline/queue");
let db: typeof import("../../client/src/offline/db");

const login = (shopId = "shop-1") => {
  localStorage.setItem("token", "valid");
  localStorage.setItem("user", JSON.stringify({ shop_id: shopId }));
};
const booking = (start: string, extra: any = {}) => ({
  client_id: "known-client",
  services: [{ service_id: "svc", staff_id: "staff-1", start_time: start, duration_override: 60 }],
  ...extra,
});
const meta = { kind: "appointment" as const, label: "test", createsId: "id" };

beforeEach(async () => {
  vi.resetModules(); // fresh module state (queue refs) for each test
  server = new FakeServer();
  globalThis.fetch = vi.fn(server.fetch) as any;
  db = await import("../../client/src/offline/db");
  q = await import("../../client/src/offline/queue");
  login();
});

describe("saving: live first, queue when the server can't be reached", () => {
  test("online: saved live, with an idempotency key, nothing queued", async () => {
    const r = await q.fetchOrQueue("/api/v1/appointments", "POST", booking("2027-01-01T09:00:00Z"), meta);
    expect(r.queued).toBe(false);
    expect(server.appointments.size).toBe(1);
    expect(server.requests[0].key).toBeTruthy();
    expect(await db.getAllQueuedWrites()).toHaveLength(0);
  });

  test("a server refusal (4xx) is returned to the caller, never queued", async () => {
    const r = await q.fetchOrQueue("/api/v1/appointments", "POST", booking("2027-01-01T09:00:00Z", { client_id: "nobody" }), meta);
    expect(r.queued).toBe(false);
    expect(r.queued === false && r.response.status).toBe(422);
    expect(await db.getAllQueuedWrites()).toHaveLength(0);
  });

  test("network down: queued with a temporary id, and the app is marked offline", async () => {
    server.offline = true;
    const r = await q.fetchOrQueue("/api/v1/appointments", "POST", booking("2027-01-01T09:00:00Z"), {
      ...meta,
      offlineExtras: { offline_known_overlaps: ["x"] },
    });
    expect(r.queued).toBe(true);
    expect(r.queued && r.tempId).toMatch(/^tmp-/);
    const [w] = await db.getAllQueuedWrites();
    expect(w.body.offline_known_overlaps).toEqual(["x"]);
    expect(w.shopId).toBe("shop-1");
    expect(q.isOnline.value).toBe(false);
  });

  test("offline extras are only added when queued, not to live saves", async () => {
    await q.fetchOrQueue("/api/v1/appointments", "POST", booking("2027-01-01T09:00:00Z"), {
      ...meta,
      offlineExtras: { offline_known_overlaps: [] },
    });
    expect(server.requests[0].body.offline_known_overlaps).toBeUndefined();
  });

  test("the browser says offline: queued straight away, no 8-second wait on a dead network", async () => {
    (navigator as any).onLine = false;
    const r = await q.fetchOrQueue("/api/v1/appointments", "POST", booking("2027-01-01T09:00:00Z"), meta);
    expect(r.queued).toBe(true);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test("a write about a record still waiting to sync is queued behind it even when online", async () => {
    server.offline = true;
    const created = await q.fetchOrQueue("/api/v1/appointments", "POST", booking("2027-01-01T09:00:00Z"), meta);
    server.offline = false;
    const tempId = created.queued ? created.tempId! : "";
    const pay = await q.fetchOrQueue("/api/v1/transactions", "POST", { appointment_id: tempId, amount: 30 }, { kind: "payment", label: "pay" });
    expect(pay.queued).toBe(true);
    expect(server.requests.filter((r) => r.endpoint === "/api/v1/transactions")).toHaveLength(0);
  });

  test("once that record synced, the temporary id is swapped for the real one and the write goes live", async () => {
    server.offline = true;
    const created = await q.fetchOrQueue("/api/v1/appointments", "POST", booking("2027-01-01T09:00:00Z"), meta);
    server.offline = false;
    await q.flushQueue();
    const tempId = created.queued ? created.tempId! : "";
    const pay = await q.fetchOrQueue("/api/v1/transactions", "POST", { appointment_id: tempId, amount: 30 }, { kind: "payment", label: "pay" });
    expect(pay.queued).toBe(false);
    expect(server.transactions[0].appointment_id).toBe(q.idMap.value[tempId]);
  });

  test("the same dialog saving twice offline edits the queued booking instead of booking twice", async () => {
    server.offline = true;
    const first = await q.fetchOrQueue("/api/v1/appointments", "POST", booking("2027-01-01T09:00:00Z"), meta);
    const tempId = first.queued ? first.tempId! : "";
    await q.fetchOrQueue(`/api/v1/appointments/${tempId}?scope=single`, "PUT", booking("2027-01-01T09:00:00Z", { internal_notes: "2nd save" }), { kind: "appointment", label: "x" });
    server.offline = false;
    await q.flushQueue();
    expect(server.appointments.size).toBe(1);
    expect([...server.appointments.values()][0].internal_notes).toBe("2nd save");
  });
});

describe("syncing", () => {
  test("syncs everything when the server is back, and tells the calendar to refresh", async () => {
    server.offline = true;
    await q.fetchOrQueue("/api/v1/appointments", "POST", booking("2027-01-01T09:00:00Z"), meta);
    await q.fetchOrQueue("/api/v1/appointments", "POST", booking("2027-01-01T10:00:00Z"), meta);
    server.offline = false;
    const synced = vi.fn();
    window.addEventListener("offline-synced", synced);
    await q.flushQueue();
    expect(server.appointments.size).toBe(2);
    expect(q.pendingCount.value).toBe(0);
    expect(synced).toHaveBeenCalledOnce();
    expect(q.isOnline.value).toBe(true);
  });

  test("two syncs started together send each write once", async () => {
    server.offline = true;
    for (let i = 0; i < 5; i++) await q.fetchOrQueue("/api/v1/appointments", "POST", booking(`2027-01-01T1${i}:00:00Z`), meta);
    server.offline = false;
    await Promise.all([q.flushQueue(), q.flushQueue(), q.flushQueue()]);
    expect(server.appointments.size).toBe(5);
    expect(server.requests.filter((r) => r.method === "POST")).toHaveLength(5);
  });

  test("replays are marked as offline replays (X-Offline-Replay)", async () => {
    server.offline = true;
    await q.fetchOrQueue("/api/v1/appointments", "POST", booking("2027-01-01T09:00:00Z"), meta);
    server.offline = false;
    await q.flushQueue();
    const call = (globalThis.fetch as any).mock.calls.find((c: any[]) => c[0] === "/api/v1/appointments" && c[1].headers["X-Offline-Replay"]);
    expect(call).toBeTruthy();
  });

  test("session expired: everything kept, \"log in to sync\" shown; after logging in it syncs", async () => {
    server.offline = true;
    await q.fetchOrQueue("/api/v1/appointments", "POST", booking("2027-01-01T09:00:00Z"), meta);
    server.offline = false;
    server.sessionExpired = true;
    await q.flushQueue();
    expect(q.syncNeedsLogin.value).toBe(true);
    expect(q.pendingCount.value).toBe(1);
    expect(q.conflictCount.value).toBe(0);
    server.sessionExpired = false;
    q.onLoggedIn();
    await vi.waitFor(() => expect(server.appointments.size).toBe(1));
    expect(q.syncNeedsLogin.value).toBe(false);
  });

  test("logged out: nothing is sent, nothing is lost", async () => {
    server.offline = true;
    await q.fetchOrQueue("/api/v1/appointments", "POST", booking("2027-01-01T09:00:00Z"), meta);
    server.offline = false;
    localStorage.removeItem("token");
    await q.flushQueue();
    expect(server.appointments.size).toBe(0);
    expect(q.pendingCount.value).toBe(1);
  });

  test("conflict → keep mine → synced; conflict → discard → gone", async () => {
    server.bookOnline("staff-1", "2027-01-01T09:00:00Z");
    server.offline = true;
    await q.fetchOrQueue("/api/v1/appointments", "POST", booking("2027-01-01T09:00:00Z"), { ...meta, offlineExtras: { offline_known_overlaps: [] } });
    await q.fetchOrQueue("/api/v1/appointments", "POST", booking("2027-01-01T09:00:00Z", { internal_notes: "second" }), { ...meta, offlineExtras: { offline_known_overlaps: [] } });
    server.offline = false;
    await q.flushQueue();
    expect(q.conflictCount.value).toBe(2);
    const [a, b] = q.pendingWrites.value;
    await q.keepMineQueuedWrite(a.id);
    await vi.waitFor(() => expect(server.appointments.size).toBe(2)); // "keep mine" synced
    await vi.waitFor(() => expect(q.pendingWrites.value).toHaveLength(1));
    expect(q.conflictCount.value).toBe(1);
    await q.discardQueuedWrite(b.id);
    expect(q.pendingWrites.value).toHaveLength(0);
    expect(server.appointments.size).toBe(2); // the online one + "keep mine"
  });
});

describe("persistence", () => {
  test("queued writes survive a page reload", async () => {
    server.offline = true;
    await q.fetchOrQueue("/api/v1/appointments", "POST", booking("2027-01-01T09:00:00Z"), meta);
    // "Reload": new module instances, same browser database.
    vi.resetModules();
    db = await import("../../client/src/offline/db");
    db.resetDbConnection();
    q = await import("../../client/src/offline/queue");
    globalThis.fetch = vi.fn(server.fetch) as any;
    server.offline = false;
    await q.flushQueue();
    expect(server.appointments.size).toBe(1);
  });

  test("upgrading the browser database keeps writes queued by the previous version", async () => {
    // Build a version-1 database the way the old app did.
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("pure-offline-queue", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("pending_writes", { keyPath: "id" });
      req.onsuccess = () => {
        const tx = req.result.transaction("pending_writes", "readwrite");
        tx.objectStore("pending_writes").add({
          id: "old-1",
          endpoint: "/api/v1/appointments",
          method: "POST",
          body: booking("2027-01-01T09:00:00Z"),
          kind: "appointment",
          label: "old",
          createdAt: 1,
          status: "pending",
        });
        tx.oncomplete = () => {
          req.result.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
    db.resetDbConnection();
    const writes = await db.getAllQueuedWrites();
    expect(writes.map((w) => w.id)).toEqual(["old-1"]);
    // ...and an old write (no shopId) still syncs with the current session.
    await q.flushQueue();
    expect(server.appointments.size).toBe(1);
  });
});

describe("data from the app's reactive state", () => {
  test("a booking built from Vue reactive form state can be queued (no DataCloneError)", async () => {
    const { reactive } = await import("vue");
    const form = reactive({
      client_id: "known-client",
      start_time: new Date("2027-01-01T09:00:00Z"),
      services: [{ service_id: "svc", staff_id: "staff-1", start_time: new Date("2027-01-01T09:00:00Z"), duration_override: 60 }],
    });
    server.offline = true;
    const r = await q.fetchOrQueue("/api/v1/appointments", "POST", { ...form, services: form.services }, meta);
    expect(r.queued).toBe(true);
    const [w] = await db.getAllQueuedWrites();
    expect(w.body.services[0].start_time).toBe("2027-01-01T09:00:00.000Z");
  });

  test("keep mine / retry on items read back from the reactive queue state work", async () => {
    server.bookOnline("staff-1", "2027-01-01T09:00:00Z");
    server.offline = true;
    await q.fetchOrQueue("/api/v1/appointments", "POST", booking("2027-01-01T09:00:00Z"), { ...meta, offlineExtras: { offline_known_overlaps: [] } });
    server.offline = false;
    await q.flushQueue();
    await expect(q.retryQueuedWrite(q.pendingWrites.value[0].id)).resolves.toBeUndefined();
    await vi.waitFor(() => expect(q.conflictCount.value).toBe(1));
    await expect(q.keepMineQueuedWrite(q.pendingWrites.value[0].id)).resolves.toBeUndefined();
    await vi.waitFor(() => expect(q.pendingWrites.value).toHaveLength(0));
  });
});

describe("queue order", () => {
  test("writes made in the same millisecond keep their order", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    server.offline = true;
    for (let i = 0; i < 20; i++) await q.fetchOrQueue("/api/v1/appointments", "POST", booking(`2027-01-01T09:${String(i).padStart(2, "0")}:00Z`), meta);
    const writes = await db.getAllQueuedWrites();
    expect(writes.map((w) => w.body.services[0].start_time)).toEqual(
      Array.from({ length: 20 }, (_, i) => `2027-01-01T09:${String(i).padStart(2, "0")}:00Z`),
    );
    vi.restoreAllMocks();
  });
});

describe("logging out", () => {
  test("first sends what's waiting, once the server is back", async () => {
    server.offline = true;
    await q.fetchOrQueue("/api/v1/appointments", "POST", booking("2027-01-01T09:00:00Z"), meta);
    server.offline = false; // back, but the app hasn't noticed yet
    expect(await q.syncBeforeLogout()).toBe(0);
    expect(server.appointments.size).toBe(1);
  });

  test("still offline: reports how many changes would be lost, and keeps them", async () => {
    server.offline = true;
    await q.fetchOrQueue("/api/v1/appointments", "POST", booking("2027-01-01T09:00:00Z"), meta);
    await q.fetchOrQueue("/api/v1/appointments", "POST", booking("2027-01-01T11:00:00Z"), meta);
    expect(await q.syncBeforeLogout()).toBe(2);
    expect(await db.getAllQueuedWrites()).toHaveLength(2);
  });

  test("conflicts count as unsynced", async () => {
    await db.addQueuedWrite({
      id: "w1", endpoint: "/api/v1/appointments/a1", method: "PUT", body: {}, kind: "appointment",
      label: "x", createdAt: 1, status: "conflict", shopId: "shop-1",
    });
    expect(await q.syncBeforeLogout()).toBe(1);
  });

  test("clearing deletes everything kept for offline use", async () => {
    server.offline = true;
    await q.fetchOrQueue("/api/v1/appointments", "POST", booking("2027-01-01T09:00:00Z"), meta);
    await db.putRow(db.STORES.clients, { id: "c1", first_name: "Μαρία" });
    await db.putRow(db.STORES.appointments, { id: "a1", start_time: "2027-01-01T09:00:00Z" });
    await db.putRow(db.STORES.kv, { key: "staff", value: [] });
    await db.saveIdMapping("tmp-11111111-1111", "real-1");
    const cleared = vi.fn();
    window.addEventListener("offline-data-cleared", cleared);

    await q.clearOfflineData();

    for (const store of Object.values(db.STORES)) expect(await db.getAllRows(store)).toEqual([]);
    expect(q.pendingCount.value).toBe(0);
    expect(q.idMap.value).toEqual({});
    expect(cleared).toHaveBeenCalled();
  });
});
