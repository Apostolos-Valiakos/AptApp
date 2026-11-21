// The portal's booking actions, shared by its screens and the AI assistant's
// cards: the same requests, the same texts when the server refuses, a toast
// (unless the caller shows the outcome itself) and every screen told to
// reload. PA1–PA4.
import { afterEach, describe, expect, test, vi } from "vitest";
import { defineComponent, h } from "vue";
import { usePortalBookingActions, PortalActionError } from "../../client/src/portal/composables/usePortalBookingActions";
import el from "../../client/src/i18n/locales/el";
import { fakeServer, mountScreen, pageText, saveLogin, settle } from "./helpers";

let actions!: ReturnType<typeof usePortalBookingActions>;
const open = (routes: Record<string, any>) => {
  saveLogin({ id: "u1", role: "client", shop_id: "s1", client_id: "c1" });
  const server = fakeServer(routes);
  mountScreen(defineComponent({ setup: () => ((actions = usePortalBookingActions()), () => h("div")) }));
  return server;
};
const changed = vi.fn();
window.addEventListener("appointments-changed", changed);
afterEach(() => changed.mockClear());

const BOOKING = { service_id: "svc1", staff_id: "st1", start_time: "2026-11-25T08:00:00.000Z" };

describe("PA1 booking", () => {
  test("the screen's request, with a key that makes a retry harmless; the screens reload", async () => {
    const server = open({ "POST /api/v1/appointments": { body: { id: "a1" } } });
    await actions.book({ ...BOOKING, booking_notes: "Ήσυχο δωμάτιο" }, { key: "k-1" });
    await settle();
    const [call] = server.called("POST", "/api/v1/appointments");
    expect(call.body).toEqual({ booking_notes: "Ήσυχο δωμάτιο", services: [BOOKING] });
    expect(pageText()).toContain(el.portal.actions.booked);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  test("each booking gets its own key unless one is given", async () => {
    const keys: string[] = [];
    open({ "POST /api/v1/appointments": (_url: string, init: RequestInit) => (keys.push(new Headers(init.headers).get("Idempotency-Key")!), { body: { id: "a1" } }) });
    await actions.book(BOOKING);
    await actions.book(BOOKING);
    await actions.book(BOOKING, { key: "same" });
    await actions.book(BOOKING, { key: "same" });
    expect(keys[0]).not.toBe(keys[1]);
    expect(keys.slice(2)).toEqual(["same", "same"]);
  });
});

describe("PA2 a refusal", () => {
  test("the server's reason becomes the client's text; nothing reloads", async () => {
    open({ "POST /api/v1/appointments": { status: 422, body: { error: "self_booking_not_allowed", reason: "slot_unavailable" } } });
    const err = await actions.book(BOOKING).catch((e) => e);
    await settle();
    expect(err).toBeInstanceOf(PortalActionError);
    expect(err.reason).toBe("slot_unavailable");
    expect(pageText()).toContain(el.portal.actions.errors.slot_unavailable);
    expect(changed).not.toHaveBeenCalled();
  });

  test("a booking gone (404) and a lost connection have their own texts", async () => {
    open({ "POST /api/v1/portal/appointments/a1/cancel": { status: 404, body: { error: "Appointment not found or cannot be cancelled" } }, "POST /api/v1/portal/appointments/a2/cancel": "network-down" });
    expect((await actions.cancel("a1").catch((e) => e)).message).toBe(el.portal.actions.errors.not_found);
    expect((await actions.cancel("a2").catch((e) => e)).message).toBe(el.portal.actions.errors.offline);
  });
});

describe("PA3 moving, cancelling, confirming", () => {
  test("each to its portal route", async () => {
    const server = open({});
    await actions.reschedule("a1", { start_time: BOOKING.start_time, staff_id: "st2" });
    await actions.reschedule("a2", { start_time: BOOKING.start_time });
    await actions.cancel("a3");
    await actions.confirmAttendance("a4");
    expect(server.called("POST", "/api/v1/portal/appointments/a1/reschedule")[0].body).toEqual({ start_time: BOOKING.start_time, staff_id: "st2" });
    expect(server.called("POST", "/api/v1/portal/appointments/a2/reschedule")[0].body).toEqual({ start_time: BOOKING.start_time });
    expect(server.called("POST", "/api/v1/portal/appointments/a3/cancel")).toHaveLength(1);
    expect(server.called("POST", "/api/v1/portal/appointments/a4/confirm")).toHaveLength(1);
    expect(changed).toHaveBeenCalledTimes(4);
  });
});

describe("PA4 quiet: the caller shows the outcome", () => {
  test("no toast either way, but the screens still reload", async () => {
    open({ "POST /api/v1/portal/appointments/a1/cancel": { body: { success: true } }, "POST /api/v1/portal/appointments/a2/cancel": { status: 404, body: {} } });
    await actions.cancel("a1", { quiet: true });
    await actions.cancel("a2", { quiet: true }).catch(() => {});
    await settle();
    expect(document.querySelectorAll(".p-toast-message")).toHaveLength(0);
    expect(changed).toHaveBeenCalledTimes(1);
  });
});
