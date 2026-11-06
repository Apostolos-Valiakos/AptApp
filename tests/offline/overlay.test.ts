// What the calendar shows while changes wait to sync (client/src/offline/overlay.ts).
import { describe, expect, test } from "vitest";
import { applyPendingWrites, type OverlayContext } from "../../client/src/offline/overlay";
import type { QueuedWrite } from "../../client/src/offline/db";

const services = [
  { id: "svc-massage", name: "Pure Massage", duration_minutes: 60, price: 29, color_code: "#abcdef", is_active: true },
  { id: "svc-facial", name: "Pure Facial", duration_minutes: 40, price: 30, color_code: null, is_active: true },
];
const clients: Record<string, any> = {
  "client-1": { id: "client-1", first_name: "ΔΕΣΠΟΙΝΑ", last_name: "ΑΒΔΟΥΛΑ", phone: "+30 697 933 9723" },
  "tmp-cccccccc-1": { id: "tmp-cccccccc-1", first_name: "Νέα", last_name: "Πελάτισσα" },
};
const ctx = (idMap: Record<string, string> = {}): OverlayContext => ({
  services,
  clientById: (id) => clients[id],
  idMap,
});
const serverAppt = (id: string, start: string, extra: any = {}) => ({
  id,
  version: 3,
  status: "confirmed",
  client_id: "client-1",
  first_name: "ΔΕΣΠΟΙΝΑ",
  last_name: "ΑΒΔΟΥΛΑ",
  deposit_amount: 0,
  payment_status: "unpaid",
  services: [{ service_id: "svc-massage", service_name: "Pure Massage", staff_id: "staff-1", start_time: start, duration_minutes: 60, price: 29 }],
  products: [],
  start_time: start,
  ...extra,
});
let n = 0;
const w = (x: Partial<QueuedWrite> & Pick<QueuedWrite, "endpoint" | "method">): QueuedWrite => ({
  id: `w-${++n}`,
  body: {},
  kind: "appointment",
  label: "",
  createdAt: n,
  status: "pending",
  ...x,
});

describe("calendar overlay", () => {
  test("no queued writes: the server list unchanged", () => {
    const list = [serverAppt("a1", "2027-01-01T09:00:00.000Z")];
    expect(applyPendingWrites(list, [], ctx())).toEqual(list);
  });

  test("a booking made offline appears, marked pending, with service, staff, client and price", () => {
    const out = applyPendingWrites([], [
      w({
        endpoint: "/api/v1/appointments",
        method: "POST",
        tempId: "tmp-aaaaaaaa-1",
        body: { client_id: "client-1", status: "confirmed", services: [{ service_id: "svc-massage", staff_id: "staff-2", start_time: "2027-01-01T10:00:00Z", duration_override: 90, price_override: 45 }] },
      }),
    ], ctx());
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: "tmp-aaaaaaaa-1",
      _offline: "pending",
      status: "confirmed",
      first_name: "ΔΕΣΠΟΙΝΑ",
      payment_status: "unpaid",
      start_time: "2027-01-01T10:00:00.000Z",
    });
    expect(out[0].services[0]).toMatchObject({ service_name: "Pure Massage", staff_id: "staff-2", duration_minutes: 90, price: 45, service_color: "#abcdef" });
  });

  test("a booking for a client created offline shows that client's name", () => {
    const out = applyPendingWrites([], [
      w({ endpoint: "/api/v1/appointments", method: "POST", tempId: "tmp-aaaaaaaa-1", body: { client_id: "tmp-cccccccc-1", services: [{ service_id: "svc-facial", staff_id: "s", start_time: "2027-01-01T10:00:00Z" }] } }),
    ], ctx());
    expect(out[0]).toMatchObject({ first_name: "Νέα", last_name: "Πελάτισσα" });
    expect(out[0].services[0].duration_minutes).toBe(40); // the service's own duration
  });

  test("a move made offline shows at the new time; the server copy isn't duplicated", () => {
    const out = applyPendingWrites([serverAppt("a1", "2027-01-01T09:00:00.000Z")], [
      w({ endpoint: "/api/v1/appointments/a1?scope=single", method: "PUT", body: { client_id: "client-1", status: "confirmed", services: [{ service_id: "svc-massage", staff_id: "staff-3", start_time: "2027-01-01T14:00:00Z", duration_override: 60 }] } }),
    ], ctx());
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "a1", _offline: "pending", start_time: "2027-01-01T14:00:00.000Z" });
    expect(out[0].services[0].staff_id).toBe("staff-3");
  });

  test("a cancellation made offline shows as cancelled", () => {
    const out = applyPendingWrites([serverAppt("a1", "2027-01-01T09:00:00.000Z")], [
      w({ endpoint: "/api/v1/appointments/a1?scope=single", method: "PUT", body: { status: "cancelled" } }),
    ], ctx());
    expect(out[0].status).toBe("cancelled");
    expect(out[0].services).toHaveLength(1); // services kept when the edit doesn't send them
  });

  test("a deletion made offline hides it; a delete in conflict keeps it, flagged", () => {
    const list = [serverAppt("a1", "2027-01-01T09:00:00.000Z"), serverAppt("a2", "2027-01-01T11:00:00.000Z")];
    const deleted = applyPendingWrites(list, [w({ endpoint: "/api/v1/appointments/a1?scope=single", method: "DELETE", kind: "delete" })], ctx());
    expect(deleted.map((a) => a.id)).toEqual(["a2"]);
    const conflicted = applyPendingWrites(list, [w({ endpoint: "/api/v1/appointments/a1?scope=single", method: "DELETE", kind: "delete", status: "conflict" })], ctx());
    expect(conflicted.find((a) => a.id === "a1")._offline).toBe("conflict");
  });

  test("a full payment made offline shows paid; a part payment shows partial", () => {
    const full = applyPendingWrites([serverAppt("a1", "2027-01-01T09:00:00.000Z")], [
      w({ endpoint: "/api/v1/transactions", method: "POST", kind: "payment", body: { appointment_id: "a1", amount: 29, payment_method: "cash" } }),
    ], ctx());
    expect(full[0]).toMatchObject({ payment_status: "paid", deposit_amount: 29, payment_method: "cash", _offline: "pending" });
    const part = applyPendingWrites([serverAppt("a1", "2027-01-01T09:00:00.000Z")], [
      w({ endpoint: "/api/v1/transactions", method: "POST", kind: "payment", body: { appointment_id: "a1", amount: 10 } }),
    ], ctx());
    expect(part[0].payment_status).toBe("partial");
  });

  test("a split payment counts both legs", () => {
    const out = applyPendingWrites([serverAppt("a1", "2027-01-01T09:00:00.000Z")], [
      w({ endpoint: "/api/v1/transactions", method: "POST", kind: "payment", body: { appointment_id: "a1", amount: 20, amount2: 9 } }),
    ], ctx());
    expect(out[0].payment_status).toBe("paid");
  });

  test("a combined same-day payment is spread over the selected appointments in order", () => {
    const out = applyPendingWrites([serverAppt("a1", "2027-01-01T09:00:00.000Z"), serverAppt("a2", "2027-01-01T11:00:00.000Z")], [
      w({ endpoint: "/api/v1/transactions", method: "POST", kind: "payment", body: { appointment_id: "a1", appointment_ids: ["a1", "a2"], amount: 40 } }),
    ], ctx());
    expect(out.find((a) => a.id === "a1")).toMatchObject({ deposit_amount: 29, payment_status: "paid" });
    expect(out.find((a) => a.id === "a2")).toMatchObject({ deposit_amount: 11, payment_status: "partial" });
  });

  test("a create that already synced isn't shown twice (server copy + queued follow-up merge)", () => {
    const out = applyPendingWrites([serverAppt("real-1", "2027-01-01T09:00:00.000Z")], [
      w({ endpoint: "/api/v1/appointments", method: "POST", tempId: "tmp-aaaaaaaa-1", body: { services: [{ service_id: "svc-massage", staff_id: "s", start_time: "2027-01-01T09:00:00Z" }] } }),
      w({ endpoint: "/api/v1/transactions", method: "POST", kind: "payment", body: { appointment_id: "tmp-aaaaaaaa-1", amount: 29 } }),
    ], ctx({ "tmp-aaaaaaaa-1": "real-1" }));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "real-1", payment_status: "paid" });
  });

  test("edits of a booking made offline apply to it before it syncs", () => {
    const out = applyPendingWrites([], [
      w({ endpoint: "/api/v1/appointments", method: "POST", tempId: "tmp-aaaaaaaa-1", body: { services: [{ service_id: "svc-massage", staff_id: "s", start_time: "2027-01-01T09:00:00Z" }] } }),
      w({ endpoint: "/api/v1/appointments/tmp-aaaaaaaa-1?scope=single", method: "PUT", body: { services: [{ service_id: "svc-facial", staff_id: "s", start_time: "2027-01-01T12:00:00Z" }] } }),
    ], ctx());
    expect(out).toHaveLength(1);
    expect(out[0].services[0]).toMatchObject({ service_name: "Pure Facial", start_time: "2027-01-01T12:00:00.000Z" });
  });

  test("a booking in conflict is flagged as such", () => {
    const out = applyPendingWrites([], [
      w({ endpoint: "/api/v1/appointments", method: "POST", tempId: "tmp-aaaaaaaa-1", status: "conflict", body: { services: [{ service_id: "svc-massage", staff_id: "s", start_time: "2027-01-01T09:00:00Z" }] } }),
    ], ctx());
    expect(out[0]._offline).toBe("conflict");
  });

  test("writes about appointments outside the loaded range are ignored without errors", () => {
    const out = applyPendingWrites([], [
      w({ endpoint: "/api/v1/appointments/not-loaded?scope=single", method: "PUT", body: { status: "cancelled" } }),
      w({ endpoint: "/api/v1/transactions", method: "POST", kind: "payment", body: { appointment_id: "not-loaded", amount: 5 } }),
      w({ endpoint: "/api/v1/appointments/not-loaded", method: "DELETE", kind: "delete" }),
    ], ctx());
    expect(out).toEqual([]);
  });

  test("a booking without any timed service (e.g. a half-filled form) isn't drawn", () => {
    const out = applyPendingWrites([], [
      w({ endpoint: "/api/v1/appointments", method: "POST", tempId: "tmp-aaaaaaaa-1", body: { services: [{ service_id: "svc-massage", staff_id: "s" }] } }),
    ], ctx());
    expect(out).toEqual([]);
  });
});

import { knownOverlapIds } from "../../client/src/offline/overlaps";

describe("overlaps visible offline (offline_known_overlaps)", () => {
  const list = [
    serverAppt("a1", "2027-01-01T09:00:00.000Z"), // staff-1 09:00-10:00
    serverAppt("a2", "2027-01-01T10:00:00.000Z"), // staff-1 10:00-11:00
    serverAppt("a3", "2027-01-01T09:30:00.000Z", { status: "cancelled" }),
    { ...serverAppt("tmp-aaaaaaaa-9", "2027-01-01T09:00:00.000Z") },
  ];
  const svc = (start: string, minutes = 60, staff = "staff-1") => [{ staff_id: staff, start_time: start, duration_override: minutes }];

  test("lists real appointments of the same staff overlapping the time", () => {
    expect(knownOverlapIds(list, svc("2027-01-01T09:30:00Z"))).toEqual(["a1", "a2"]);
  });
  test("back-to-back is not an overlap", () => {
    expect(knownOverlapIds(list, svc("2027-01-01T11:00:00Z"))).toEqual([]);
  });
  test("ignores cancelled ones, offline-made ones, other staff and itself", () => {
    expect(knownOverlapIds(list, svc("2027-01-01T09:00:00Z", 30))).toEqual(["a1"]);
    expect(knownOverlapIds(list, svc("2027-01-01T09:00:00Z", 30, "staff-2"))).toEqual([]);
    expect(knownOverlapIds(list, svc("2027-01-01T09:00:00Z", 30), "a1")).toEqual([]);
  });
});

describe("versions while changes wait to sync", () => {
  test("after a queued edit or payment the version is unknown, so a second offline edit doesn't conflict with the first", () => {
    const edited = applyPendingWrites([serverAppt("a1", "2027-01-01T09:00:00.000Z")], [
      w({ endpoint: "/api/v1/appointments/a1?scope=single", method: "PUT", body: { status: "confirmed" } }),
    ], ctx());
    expect(edited[0].version).toBeNull();
    const paid = applyPendingWrites([serverAppt("a1", "2027-01-01T09:00:00.000Z")], [
      w({ endpoint: "/api/v1/transactions", method: "POST", kind: "payment", body: { appointment_id: "a1", amount: 5 } }),
    ], ctx());
    expect(paid[0].version).toBeNull();
    const untouched = applyPendingWrites([serverAppt("a1", "2027-01-01T09:00:00.000Z")], [], ctx());
    expect(untouched[0].version).toBe(3);
  });
});

describe("totals follow the server's rule (charged price, not list price)", () => {
  // A discounted booking: the service shows its list price (29) but is
  // charged 20; the server's total says so.
  const discounted = () => [serverAppt("d1", "2027-03-01T09:00:00.000Z", { current_appt_total: 20 })];
  const pay = (amount: number) =>
    w({ endpoint: "/api/v1/transactions", method: "POST", kind: "payment", body: { appointment_id: "d1", amount, payment_method: "cash" } });

  test("paying the discounted total offline shows the booking as paid", () => {
    const [a] = applyPendingWrites(discounted(), [pay(20)], ctx());
    expect(a.payment_status).toBe("paid");
  });

  test("an offline edit to the services recomputes the total from the charged prices", () => {
    const edit = w({
      endpoint: "/api/v1/appointments/d1",
      method: "PUT",
      body: { services: [{ service_id: "svc-massage", staff_id: "staff-1", start_time: "2027-03-01T09:00:00.000Z", price_override: 15, duration_override: 60 }] },
    });
    const [a] = applyPendingWrites(discounted(), [edit, pay(15)], ctx());
    expect(a.current_appt_total).toBe(15);
    expect(a.payment_status).toBe("paid");
  });
});

describe("a queued cancellation", () => {
  test("shows the booking as cancelled, pending", () => {
    const [a] = applyPendingWrites([serverAppt("a1", "2027-01-01T09:00:00.000Z")], [
      w({ endpoint: "/api/v1/appointments/a1/cancel", method: "POST", body: {} }),
    ], ctx());
    expect(a).toMatchObject({ id: "a1", status: "cancelled", _offline: "pending" });
  });
});
