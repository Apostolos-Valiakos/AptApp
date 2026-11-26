// The portal with no connection (N13): the bookings last loaded are kept on
// the device (OF1) and shown, with a warning, when loading fails (OF2);
// logging out forgets them (OF3). The pass's offline copy is WL3.
import { describe, expect, test } from "vitest";
import { RouterView } from "vue-router";
import { defineComponent, h } from "vue";
import BookingsView from "../../client/src/portal/views/BookingsView.vue";
import { forgetPortal } from "../../client/src/portal/logout";
import { usePortalBookingsStore } from "../../client/src/portal/stores/bookings";
import { blankRouter, fakeServer, mountScreen, saveLogin, settle } from "./helpers";

const start = new Date(Date.now() + 48 * 3600e3);
const BOOKING = {
  id: "kept", status: "confirmed", payment_status: "unpaid", booking_notes: null, paid: 0, total: 40,
  start_time: start.toISOString(), end_time: new Date(start.getTime() + 3600e3).toISOString(),
  services: [{ service_id: "svc1", service_name: "Μασάζ φυλαγμένο", staff_id: "st1", staff_name: "ΑΝΝΑ", start_time: start.toISOString(), duration_minutes: 60, price: 40 }],
};
const open = async (bookings: any) => {
  saveLogin({ id: "u1", role: "client", shop_id: "s1", client_id: "c1" });
  fakeServer({ "GET /api/v1/portal/appointments": bookings, "GET /api/v1/shop": { body: { id: "s1", name: "Pure" } } });
  const router = blankRouter([{ path: "/portal/bookings", component: BookingsView }]);
  await router.push("/portal/bookings");
  mountScreen(defineComponent({ render: () => h(RouterView) }), { router });
  await settle();
  await settle();
};

describe("OF1 the bookings are kept on the device", () => {
  test("after a load", async () => {
    await open({ body: [BOOKING] });
    expect(JSON.parse(localStorage.getItem("portal.bookings")!)[0].id).toBe("kept");
    expect(document.querySelector('[data-testid="offline-banner"]')).toBeNull();
  });
});

describe("OF2 with no connection", () => {
  test("the kept bookings are shown, with a warning that they may be old", async () => {
    localStorage.setItem("portal.bookings", JSON.stringify([BOOKING]));
    await open("network-down");
    expect(document.querySelector('[data-testid="upcoming-list"]')!.textContent).toContain("Μασάζ φυλαγμένο");
    expect(document.querySelector('[data-testid="offline-banner"]')).not.toBeNull();
  });
});

describe("OF3 logging out", () => {
  test("forgets them", async () => {
    await open({ body: [BOOKING] });
    // Logout is async now: the app's native clean-up runs first (step 7.5).
    await forgetPortal();
    expect(localStorage.getItem("portal.bookings")).toBeNull();
    expect(usePortalBookingsStore().list).toEqual([]);
  });
});
