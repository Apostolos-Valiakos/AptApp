// The redesigned Bookings (REDESIGN_SPEC.md §5.3): upcoming and past (BH1),
// only what was paid (BH2, K5), the details from their link (BH3), confirming
// and cancelling there (BH4, K3, K4), the calendar file (BH5), sharing
// without a share sheet (BH6), and a change made elsewhere showing at once (BH7).
import { afterEach, describe, expect, test, vi } from "vitest";
import { RouterView, createRouter, createWebHistory } from "vue-router";
import BookingsView from "../../client/src/portal/views/BookingsView.vue";
import { icsFor } from "../../client/src/portal/utils/calendarFile";
import { usePortalBookingsStore, type PortalBooking } from "../../client/src/portal/stores/bookings";
import { useBookingExtras } from "../../client/src/portal/composables/useBookingExtras";
import el from "../../client/src/i18n/locales/el";
import { blankRouter, fakeServer, mountScreen, pageText, saveLogin, settle } from "./helpers";
import { defineComponent, h } from "vue";

const HOUR = 3600e3;
const b = (id: string, hoursFromNow: number, extra: Partial<PortalBooking> = {}): PortalBooking => {
  const start = new Date(Date.now() + hoursFromNow * HOUR);
  return {
    id, status: "confirmed", payment_status: "unpaid", booking_notes: null, paid: 0, total: 40,
    start_time: start.toISOString(), end_time: new Date(start.getTime() + HOUR).toISOString(),
    services: [{ service_id: "svc1", service_name: `Θεραπεία ${id}`, staff_id: "st1", staff_name: "ΑΝΝΑ", start_time: start.toISOString(), duration_minutes: 60, price: 40 }],
    ...extra,
  };
};
const LIST = [
  b("soon", 30, { status: "new" }),
  b("later", 24 * 5),
  b("gone", 50, { status: "cancelled" }),
  b("paid", -24 * 3, { status: "completed", paid: 25, total: 40 }),
  b("unpaid", -24 * 10, { status: "completed", paid: 0, total: 40 }),
];

// `web`: the browser's history (as the app has), which knows the entry behind
// the current one; the memory history of the other tests doesn't.
const open = async (path = "/portal/bookings", routes: Record<string, any> = {}, shop: Record<string, any> = {}, web = false) => {
  saveLogin({ id: "u1", role: "client", shop_id: "s1", client_id: "c1" });
  const server = fakeServer({
    "GET /api/v1/portal/appointments": { body: LIST },
    "GET /api/v1/shop": { body: { id: "s1", name: "Pure", phone: "2410555555", address: "Παπαναστασίου 1", cancellation_note: "Δωρεάν ακύρωση έως 24 ώρες πριν.", ...shop } },
    ...routes,
  });
  const screens = [
    { path: "/portal/bookings", component: BookingsView },
    { path: "/portal/bookings/:id", component: BookingsView },
  ];
  const router = web
    ? createRouter({ history: createWebHistory(), routes: [...screens, { path: "/:rest(.*)*", component: { render: () => h("div") } }] })
    : blankRouter(screens);
  await router.push(path);
  mountScreen(defineComponent({ render: () => h(RouterView) }), { router });
  await settle();
  await settle();
  return { server, router };
};
const one = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const names = (id: string) => [...one(id)!.querySelectorAll("li")].map((li) => li.textContent!.match(/Θεραπεία ([a-zA-Z]+)/)![1]);

afterEach(() => vi.unstubAllGlobals());

describe("BH1 upcoming and past", () => {
  test("upcoming soonest first (a cancelled one crossed out); past newest first", async () => {
    const { router } = await open();
    expect(names("upcoming-list")).toEqual(["soon", "gone", "later"]);
    expect(one("upcoming-list")!.textContent).toContain(el.portal.v2.upNext.needsConfirm);
    await router.push("/portal/bookings?tab=past");
    await settle();
    expect(names("past-list")).toEqual(["paid", "unpaid"]);
  });
});

describe("BH2 only what was paid (K5)", () => {
  test("a paid amount where something was paid, nothing where nothing was", async () => {
    await open("/portal/bookings?tab=past");
    const rows = [...one("past-list")!.querySelectorAll("li")];
    expect(rows[0].textContent).toContain("25,00");
    expect(rows[0].textContent).not.toContain("40,00");
    expect(rows[1].querySelector('[data-testid="paid-amount"]')).toBeNull();
    expect(rows[0].querySelector<HTMLAnchorElement>('[data-testid="past-book-again"]')!.getAttribute("href")).toBe("/portal/book?service=svc1&staff=st1");
  });
});

describe("BH3 a booking's details from its link", () => {
  test("/portal/bookings/:id opens them: when, with whom, where, and what can be done", async () => {
    await open("/portal/bookings/later");
    const detail = one("booking-detail")!;
    expect(detail.textContent).toContain("ΑΝΝΑ");
    expect(detail.textContent).toContain("Παπαναστασίου 1");
    expect(one("detail-reschedule")!.getAttribute("href")).toBe("/portal/book/reschedule/later");
    expect(one("detail-confirm")).toBeNull();
  });
});

describe("BH4 confirming and cancelling in the details (K3, K4)", () => {
  test("confirm attendance", async () => {
    const { server } = await open("/portal/bookings/soon", { "POST /api/v1/portal/appointments/soon/confirm": { body: { success: true } } });
    one("detail-confirm")!.click();
    await settle();
    expect(server.called("POST", "/api/v1/portal/appointments/soon/confirm")).toHaveLength(1);
  });

  test("cancel: asks first, with the shop's cancellation note, then cancels", async () => {
    const { server } = await open("/portal/bookings/later", { "POST /api/v1/portal/appointments/later/cancel": { body: { success: true } } });
    one("detail-cancel")!.click();
    await settle();
    expect(pageText()).toContain("Δωρεάν ακύρωση έως 24 ώρες πριν.");
    expect(server.called("POST", "/api/v1/portal/appointments/later/cancel")).toHaveLength(0);
    document.querySelector<HTMLElement>(".p-confirmdialog-accept-button")!.click();
    await settle();
    expect(server.called("POST", "/api/v1/portal/appointments/later/cancel")).toHaveLength(1);
  });
});

describe("BH5 the calendar file", () => {
  test("the right start, end, title and place, in UTC, with a reminder an hour before", () => {
    const ics = icsFor({ uid: "a1@pure", title: "Μασάζ, 60′; Pure", start: new Date("2026-11-25T08:00:00Z"), end: new Date("2026-11-25T09:00:00Z"), location: "Παπαναστασίου 1, Λάρισα" }, new Date("2026-11-20T10:00:00Z"));
    expect(ics).toContain("DTSTART:20261125T080000Z");
    expect(ics).toContain("DTEND:20261125T090000Z");
    expect(ics).toContain("SUMMARY:Μασάζ\\, 60′\\; Pure");
    expect(ics).toContain("LOCATION:Παπαναστασίου 1\\, Λάρισα");
    expect(ics).toContain("TRIGGER:-PT1H");
    expect(ics.split("\r\n")[0]).toBe("BEGIN:VCALENDAR");
  });
});

describe("BH6 sharing without a share sheet", () => {
  test("the text and the booking link are copied, and the client is told", async () => {
    const copied: string[] = [];
    vi.stubGlobal("navigator", { ...navigator, share: undefined, clipboard: { writeText: async (s: string) => void copied.push(s) } });
    await open();
    let extras!: ReturnType<typeof useBookingExtras>;
    mountScreen(defineComponent({ setup: () => ((extras = useBookingExtras()), () => h("div")) }));
    await extras.share(LIST[1]);
    await settle();
    expect(copied[0]).toContain("Θεραπεία later");
    expect(copied[0]).toContain("/portal/book");
    expect(pageText()).toContain(el.portal.v2.share.copied);
  });
});

describe("BH7 a change made elsewhere shows at once", () => {
  test("a booking the assistant made appears without reloading the page", async () => {
    const { server } = await open();
    server.routes["GET /api/v1/portal/appointments"] = { body: [...LIST, b("fromChat", 72)] };
    window.dispatchEvent(new CustomEvent("appointments-changed"));
    await settle();
    expect(names("upcoming-list")).toContain("fromChat");
    expect(usePortalBookingsStore().byId("fromChat")).toBeTruthy();
  });
});

describe("BH8 inside the shop's notice period", () => {
  test("no Cancel or Reschedule; the client is told to call", async () => {
    await open("/portal/bookings/soon", {}, { portal_min_notice_minutes: 48 * 60 });
    expect(one("detail-cancel")).toBeNull();
    expect(one("detail-reschedule")).toBeNull();
    expect(one("too-late")!.textContent).toContain(el.portal.actions.errors.too_late);
  });
});

describe("BH9 closing the details steps back", () => {
  const closeSheet = async () => {
    document.querySelector<HTMLElement>(".p-drawer-close-button")!.click();
    await settle();
  };
  // Closing must not add a history entry, or the phone's Back reopens the
  // booking instead of leaving Bookings (seen on the phone in step 7.7).
  test("opened from the list: closing goes back to it, and Back then leaves Bookings", async () => {
    window.history.replaceState(null, "", "/");
    const { router } = await open("/portal/home", {}, {}, true);
    await router.push("/portal/bookings");
    await router.push("/portal/bookings/later");
    await settle();
    const before = window.history.length;
    await closeSheet();
    await new Promise((r) => setTimeout(r, 50));
    await settle();
    expect(router.currentRoute.value.path).toBe("/portal/bookings");
    expect(one("booking-detail")).toBeNull();
    expect(window.history.state.forward).toBe("/portal/bookings/later");
    expect(window.history.length).toBe(before);
  });
  test("opened from a link: closing shows the list in its place", async () => {
    window.history.replaceState(null, "", "/");
    const { router } = await open("/portal/bookings/later", {}, {}, true);
    const before = window.history.length;
    await closeSheet();
    expect(router.currentRoute.value.path).toBe("/portal/bookings");
    expect(window.history.length).toBe(before);
  });
});
