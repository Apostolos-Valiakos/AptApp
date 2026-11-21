// The sync engine (client/src/offline/sync.ts): replay order, temporary ids,
// conflicts, outages mid-sync, expired sessions, other accounts' writes.
import { describe, expect, test, beforeEach } from "vitest";
import { flush, keepMine, canKeepMine, type SyncDeps } from "../../client/src/offline/sync";
import type { QueuedWrite } from "../../client/src/offline/db";
import { FakeServer } from "./fakeServer";

const SHOP = "shop-1";
const STAFF = "staff-1";
let server: FakeServer;
let store: Map<string, QueuedWrite>;
let idMap: Record<string, string>;
let shop: string | null;
let clock = 0;

const deps = (): SyncDeps => ({
  getWrites: async () => [...store.values()].sort((a, b) => a.createdAt - b.createdAt),
  updateWrite: async (w) => void store.set(w.id, structuredClone(w)),
  removeWrite: async (id) => void store.delete(id),
  getIdMap: async () => ({ ...idMap }),
  saveIdMapping: async (t, r) => void (idMap[t] = r),
  send: server.send,
  currentShopId: () => shop,
});

const queue = (w: Partial<QueuedWrite> & Pick<QueuedWrite, "endpoint" | "method">): QueuedWrite => {
  const write: QueuedWrite = {
    id: `key-${++clock}`,
    body: {},
    kind: "appointment",
    label: "test",
    createdAt: clock,
    status: "pending",
    shopId: SHOP,
    ...w,
  };
  store.set(write.id, write);
  return write;
};
const booking = (start: string, extra: any = {}) => ({
  client_id: "known-client",
  services: [{ service_id: "svc", staff_id: STAFF, start_time: start, duration_override: 60 }],
  offline_known_overlaps: [],
  ...extra,
});
const createBooking = (tempId: string, start: string, extra: any = {}) =>
  queue({ endpoint: "/api/v1/appointments", method: "POST", body: booking(start, extra), tempId, resultIdPath: "id" });

beforeEach(() => {
  server = new FakeServer();
  store = new Map();
  idMap = {};
  shop = SHOP;
  clock = 0;
});

describe("order and basics", () => {
  test("an empty queue does nothing", async () => {
    const r = await flush(deps());
    expect(r).toEqual({ synced: 0, conflicts: 0, held: 0, stoppedBy: null });
    expect(server.requests).toHaveLength(0);
  });

  test("writes are sent in the order they were made, each once", async () => {
    for (let i = 0; i < 50; i++) createBooking(`tmp-${String(i).padStart(8, "0")}-0000`, `2027-01-01T${String(8 + (i % 10)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}:00Z`);
    const r = await flush(deps());
    expect(r.synced).toBe(50);
    expect(store.size).toBe(0);
    expect(server.requests.map((q) => q.key)).toEqual(Array.from({ length: 50 }, (_, i) => `key-${i + 1}`));
  });

  test("each write carries its own idempotency key", async () => {
    createBooking("tmp-aaaaaaaa-1", "2027-01-01T09:00:00Z");
    await flush(deps());
    expect(server.requests[0].key).toBe("key-1");
  });

  test("conflicts are not retried automatically", async () => {
    const w = createBooking("tmp-aaaaaaaa-1", "2027-01-01T09:00:00Z");
    store.set(w.id, { ...w, status: "conflict" });
    await flush(deps());
    expect(server.requests).toHaveLength(0);
  });
});

describe("records created offline (temporary ids)", () => {
  test("a payment for a booking made offline goes to the booking's real id", async () => {
    createBooking("tmp-aaaaaaaa-1", "2027-01-01T09:00:00Z");
    queue({ endpoint: "/api/v1/transactions", method: "POST", kind: "payment", body: { appointment_id: "tmp-aaaaaaaa-1", amount: 30 } });
    const r = await flush(deps());
    expect(r.synced).toBe(2);
    const realId = idMap["tmp-aaaaaaaa-1"];
    expect(realId).toBeTruthy();
    expect(server.transactions[0].appointment_id).toBe(realId);
  });

  test("new client + booking for them + payment, all made offline, link up", async () => {
    queue({ endpoint: "/api/v1/clients", method: "POST", kind: "client", body: { first_name: "Νέα", last_name: "Πελάτισσα" }, tempId: "tmp-cccccccc-1", resultIdPath: "client.id" });
    createBooking("tmp-aaaaaaaa-1", "2027-01-01T09:00:00Z", { client_id: "tmp-cccccccc-1" });
    queue({ endpoint: "/api/v1/transactions", method: "POST", kind: "payment", body: { appointment_id: "tmp-aaaaaaaa-1", client_id: "tmp-cccccccc-1", amount: 30 } });
    const r = await flush(deps());
    expect(r).toMatchObject({ synced: 3, conflicts: 0 });
    const clientId = idMap["tmp-cccccccc-1"];
    const apptId = idMap["tmp-aaaaaaaa-1"];
    expect(server.appointments.get(apptId).client_id).toBe(clientId);
    expect(server.transactions[0]).toMatchObject({ appointment_id: apptId, client_id: clientId });
  });

  test("editing and then deleting a booking made offline reach the real booking", async () => {
    createBooking("tmp-aaaaaaaa-1", "2027-01-01T09:00:00Z");
    queue({ endpoint: "/api/v1/appointments/tmp-aaaaaaaa-1?scope=single", method: "PUT", body: booking("2027-01-01T10:00:00Z", { internal_notes: "moved" }) });
    queue({ endpoint: "/api/v1/appointments/tmp-aaaaaaaa-1?scope=single", method: "DELETE", kind: "delete", body: undefined });
    const r = await flush(deps());
    expect(r.synced).toBe(3);
    expect(server.appointments.size).toBe(0);
    const [, put, del] = server.requests;
    expect(put.endpoint).toBe(`/api/v1/appointments/${idMap["tmp-aaaaaaaa-1"]}?scope=single`);
    expect(del.endpoint).toBe(put.endpoint);
  });

  test("ids from an earlier sync run are still applied (mapping persists)", async () => {
    createBooking("tmp-aaaaaaaa-1", "2027-01-01T09:00:00Z");
    await flush(deps());
    queue({ endpoint: "/api/v1/transactions", method: "POST", kind: "payment", body: { appointment_id: "tmp-aaaaaaaa-1", amount: 10 } });
    const r = await flush(deps());
    expect(r.synced).toBe(1);
    expect(server.transactions[0].appointment_id).toBe(idMap["tmp-aaaaaaaa-1"]);
  });

  test("a temporary id never reaches the server", async () => {
    queue({ endpoint: "/api/v1/clients", method: "POST", kind: "client", body: { first_name: "A", last_name: "B" }, tempId: "tmp-cccccccc-1", resultIdPath: "client.id" });
    createBooking("tmp-aaaaaaaa-1", "2027-01-01T09:00:00Z", { client_id: "tmp-cccccccc-1" });
    await flush(deps());
    expect(server.requests.every((q) => !JSON.stringify(q).includes("tmp-"))).toBe(true);
  });

  test("a write whose offline record was discarded becomes a conflict (missing_record), not a broken request", async () => {
    queue({ endpoint: "/api/v1/transactions", method: "POST", kind: "payment", body: { appointment_id: "tmp-aaaaaaaa-gone", amount: 30 } });
    const r = await flush(deps());
    expect(r.conflicts).toBe(1);
    expect([...store.values()][0].conflict?.code).toBe("missing_record");
    expect(server.requests).toHaveLength(0);
  });
});

describe("outages and failures mid-sync", () => {
  test("network drops mid-sync: what was sent is done, the rest waits in order", async () => {
    createBooking("tmp-aaaaaaaa-1", "2027-01-01T09:00:00Z");
    createBooking("tmp-aaaaaaaa-2", "2027-01-01T10:00:00Z");
    createBooking("tmp-aaaaaaaa-3", "2027-01-01T11:00:00Z");
    const origSend = server.send;
    let n = 0;
    const d = deps();
    d.send = async (w) => (++n === 2 ? { networkError: true } : origSend(w));
    const r = await flush(d);
    expect(r).toMatchObject({ synced: 1, stoppedBy: "network" });
    expect([...store.values()].map((w) => w.tempId)).toEqual(["tmp-aaaaaaaa-2", "tmp-aaaaaaaa-3"]);
    const r2 = await flush(deps());
    expect(r2.synced).toBe(2);
    expect(server.appointments.size).toBe(3);
  });

  test("response lost after the server saved it: the retry doesn't create a duplicate", async () => {
    createBooking("tmp-aaaaaaaa-1", "2027-01-01T09:00:00Z");
    server.loseResponses = 1;
    const r = await flush(deps());
    expect(r.stoppedBy).toBe("network");
    expect(server.appointments.size).toBe(1); // saved, but we didn't hear back
    const r2 = await flush(deps());
    expect(r2.synced).toBe(1);
    expect(server.appointments.size).toBe(1); // replay answered from the idempotency record
    expect(idMap["tmp-aaaaaaaa-1"]).toBe([...server.appointments.keys()][0]);
  });

  test("a lost response on a payment doesn't charge twice", async () => {
    createBooking("tmp-aaaaaaaa-1", "2027-01-01T09:00:00Z");
    queue({ endpoint: "/api/v1/transactions", method: "POST", kind: "payment", body: { appointment_id: "tmp-aaaaaaaa-1", amount: 30 } });
    await flush(deps()); // booking synced, payment too
    expect(server.transactions).toHaveLength(1);
    // Same payment replayed with its key (e.g. another tab had it): still one.
    queue({ id: "key-2", endpoint: "/api/v1/transactions", method: "POST", kind: "payment", body: { appointment_id: idMap["tmp-aaaaaaaa-1"], amount: 30 } });
    await flush(deps());
    expect(server.transactions).toHaveLength(1);
  });

  test("a server error (5xx) stops the run without marking a conflict, and the next run continues", async () => {
    createBooking("tmp-aaaaaaaa-1", "2027-01-01T09:00:00Z");
    createBooking("tmp-aaaaaaaa-2", "2027-01-01T10:00:00Z");
    server.fail5xx = 1;
    const r = await flush(deps());
    expect(r).toMatchObject({ synced: 0, stoppedBy: "server" });
    expect([...store.values()].every((w) => w.status === "pending")).toBe(true);
    expect((await flush(deps())).synced).toBe(2);
  });

  test("still offline: nothing is lost or reordered", async () => {
    createBooking("tmp-aaaaaaaa-1", "2027-01-01T09:00:00Z");
    server.offline = true;
    const r = await flush(deps());
    expect(r.stoppedBy).toBe("network");
    expect(store.size).toBe(1);
    expect([...store.values()][0].status).toBe("pending");
  });
});

describe("sessions and accounts", () => {
  test("session expired while offline: the run stops, nothing becomes a conflict", async () => {
    createBooking("tmp-aaaaaaaa-1", "2027-01-01T09:00:00Z");
    server.sessionExpired = true;
    const r = await flush(deps());
    expect(r.stoppedBy).toBe("auth");
    expect([...store.values()][0].status).toBe("pending");
    server.sessionExpired = false; // logged in again
    expect((await flush(deps())).synced).toBe(1);
  });

  test("logged out: nothing is sent", async () => {
    createBooking("tmp-aaaaaaaa-1", "2027-01-01T09:00:00Z");
    shop = null;
    const r = await flush(deps());
    expect(r.stoppedBy).toBe("auth");
    expect(server.requests).toHaveLength(0);
  });

  test("writes made in another shop's session are held, never sent with this one", async () => {
    queue({ endpoint: "/api/v1/appointments", method: "POST", body: booking("2027-01-01T09:00:00Z"), shopId: "other-shop", tempId: "tmp-aaaaaaaa-9", resultIdPath: "id" });
    createBooking("tmp-aaaaaaaa-1", "2027-01-01T10:00:00Z");
    const r = await flush(deps());
    expect(r).toMatchObject({ synced: 1, held: 1 });
    expect(server.requests).toHaveLength(1);
    expect([...store.values()][0].shopId).toBe("other-shop");
  });
});

describe("conflicts", () => {
  test("a slot booked online meanwhile: conflict with the details, other writes still sync", async () => {
    server.bookOnline(STAFF, "2027-01-01T09:00:00Z");
    createBooking("tmp-aaaaaaaa-1", "2027-01-01T09:00:00Z");
    createBooking("tmp-aaaaaaaa-2", "2027-01-01T12:00:00Z");
    const r = await flush(deps());
    expect(r).toMatchObject({ synced: 1, conflicts: 1 });
    const left = [...store.values()][0];
    expect(left.conflict?.code).toBe("slot_taken");
    expect(left.conflict?.details?.conflicts).toHaveLength(1);
    expect(canKeepMine(left)).toBe(true);
  });

  test("a payment for a booking that conflicted is flagged too (depends_on_conflict), not sent", async () => {
    server.bookOnline(STAFF, "2027-01-01T09:00:00Z");
    createBooking("tmp-aaaaaaaa-1", "2027-01-01T09:00:00Z");
    queue({ endpoint: "/api/v1/transactions", method: "POST", kind: "payment", body: { appointment_id: "tmp-aaaaaaaa-1", amount: 30 } });
    const r = await flush(deps());
    expect(r.conflicts).toBe(2);
    const pay = [...store.values()].find((w) => w.kind === "payment")!;
    expect(pay.conflict?.code).toBe("depends_on_conflict");
    expect(server.transactions).toHaveLength(0);
  });

  test("\"keep mine\" on a taken slot books it anyway, and its payment can then go", async () => {
    server.bookOnline(STAFF, "2027-01-01T09:00:00Z");
    createBooking("tmp-aaaaaaaa-1", "2027-01-01T09:00:00Z");
    queue({ endpoint: "/api/v1/transactions", method: "POST", kind: "payment", body: { appointment_id: "tmp-aaaaaaaa-1", amount: 30 } });
    await flush(deps());
    const booked = [...store.values()].find((w) => w.tempId)!;
    store.set(booked.id, keepMine(booked));
    const pay = [...store.values()].find((w) => w.kind === "payment")!;
    store.set(pay.id, { ...pay, status: "pending", conflict: undefined });
    const r = await flush(deps());
    expect(r.synced).toBe(2);
    expect(server.transactions[0].appointment_id).toBe(idMap["tmp-aaaaaaaa-1"]);
  });

  test("an offline edit of an appointment changed online meanwhile: stale conflict; keep mine overwrites", async () => {
    const id = server.bookOnline(STAFF, "2027-01-02T09:00:00Z");
    queue({ endpoint: `/api/v1/appointments/${id}?scope=single`, method: "PUT", body: { ...booking("2027-01-02T10:00:00Z"), base_version: 1, internal_notes: "offline" } });
    server.editOnline(id, { internal_notes: "online" });
    const r = await flush(deps());
    expect(r.conflicts).toBe(1);
    const w = [...store.values()][0];
    expect(w.conflict?.code).toBe("stale_appointment");
    expect(server.appointments.get(id).internal_notes).toBe("online");
    store.set(w.id, keepMine(w));
    expect((await flush(deps())).synced).toBe(1);
    expect(server.appointments.get(id).internal_notes).toBe("offline");
  });

  test("editing an appointment deleted online meanwhile: conflict that can't be kept (only discarded)", async () => {
    queue({ endpoint: "/api/v1/appointments/bbbbbbbb-gone?scope=single", method: "PUT", body: { ...booking("2027-01-02T10:00:00Z"), base_version: 1 } });
    await flush(deps());
    const w = [...store.values()][0];
    expect(w.conflict?.code).toBe("appointment_missing");
    expect(canKeepMine(w)).toBe(false);
  });

  test("deleting an appointment already deleted online counts as done", async () => {
    const id = server.bookOnline(STAFF, "2027-01-02T09:00:00Z");
    server.appointments.delete(id);
    queue({ endpoint: `/api/v1/appointments/${id}?scope=single`, method: "DELETE", kind: "delete", body: undefined });
    const r = await flush(deps());
    expect(r.synced).toBe(1);
    expect(store.size).toBe(0);
  });

  test("a conflict is saved with real ids, so \"keep mine\" works even if the mapping is lost", async () => {
    queue({ endpoint: "/api/v1/clients", method: "POST", kind: "client", body: { first_name: "A", last_name: "B" }, tempId: "tmp-cccccccc-1", resultIdPath: "client.id" });
    server.bookOnline(STAFF, "2027-01-01T09:00:00Z");
    createBooking("tmp-aaaaaaaa-1", "2027-01-01T09:00:00Z", { client_id: "tmp-cccccccc-1" });
    await flush(deps());
    const w = [...store.values()][0];
    expect(w.body.client_id).toBe(idMap["tmp-cccccccc-1"]);
    idMap = {};
    store.set(w.id, keepMine(w));
    expect((await flush(deps())).synced).toBe(1);
  });
});

describe("order safety", () => {
  test("a follow-up that got ahead of its record's create waits instead of becoming a conflict", async () => {
    // Same timestamp, follow-up first in the list.
    queue({ id: "a-edit", createdAt: 5, endpoint: "/api/v1/appointments/tmp-aaaaaaaa-1?scope=single", method: "PUT", body: booking("2027-01-01T10:00:00Z") });
    queue({ id: "b-create", createdAt: 5, endpoint: "/api/v1/appointments", method: "POST", body: booking("2027-01-01T09:00:00Z"), tempId: "tmp-aaaaaaaa-1", resultIdPath: "id" });
    const r1 = await flush(deps());
    expect(r1.conflicts).toBe(0);
    expect(store.get("a-edit")?.status).toBe("pending");
    const r2 = await flush(deps());
    expect(r2.synced).toBe(1);
    expect(store.size).toBe(0);
  });
});

describe("a delete refused because the booking has payments", () => {
  const refused = {
    id: "w-del",
    endpoint: "/api/v1/appointments/a1?scope=single",
    method: "DELETE" as const,
    body: undefined,
    kind: "delete" as const,
    label: "x",
    createdAt: 1,
    status: "conflict" as const,
    conflict: { code: "has_payments", details: {} },
  };

  test("'cancel instead' turns it into a cancellation of the same booking, same key", async () => {
    const { cancelInstead, canCancelInstead } = await import("../../client/src/offline/sync");
    expect(canCancelInstead(refused)).toBe(true);
    const w = cancelInstead(refused);
    expect(w).toMatchObject({ id: "w-del", method: "POST", endpoint: "/api/v1/appointments/a1/cancel", body: {}, status: "pending" });
    expect(w.conflict).toBeUndefined();
  });

  test("only offered for that refusal", async () => {
    const { canCancelInstead } = await import("../../client/src/offline/sync");
    expect(canCancelInstead({ ...refused, conflict: { code: "appointment_missing", details: {} } })).toBe(false);
    expect(canCancelInstead({ ...refused, method: "PUT" })).toBe(false);
  });
});
