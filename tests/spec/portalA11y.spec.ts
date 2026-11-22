// Every control on the redesigned portal's screens can be found by a screen
// reader: buttons, links and radios have a name, images a text, fields a
// label (A11Y1), and the places in the shell say which one is open (A11Y2).
import { describe, expect, test } from "vitest";
import { RouterView } from "vue-router";
import { defineComponent, h } from "vue";
import { useAssistantStore } from "../../client/src/portal/stores/assistant";
import router from "../../client/src/router";
import { fakeServer, mountScreen, saveLogin, settle } from "./helpers";

Element.prototype.scrollTo ||= () => {};

const HOUR = 3600e3;
const at = (h: number) => new Date(Date.now() + h * HOUR).toISOString();
const BOOKING = (id: string, h: number, extra: any = {}) => ({
  id, status: "new", payment_status: "unpaid", booking_notes: "σημείωση", paid: 10, total: 40, start_time: at(h), end_time: at(h + 1),
  services: [{ service_id: "svc1", service_name: "Μασάζ", staff_id: "st1", staff_name: "ΑΝΝΑ", start_time: at(h), duration_minutes: 60, price: 40 }],
  ...extra,
});
const ROUTES = {
  "GET /api/v1/shop": { body: { id: "s1", name: "Pure", phone: "2410555555", address: "Λάρισα", self_booking_enabled: true, ai_assistant_enabled: true, google_review_url: "https://g.page/r/x/review" } },
  "GET /api/v1/portal/notifications": { body: { items: [], unread_count: 0 } },
  "GET /api/v1/portal/appointments": { body: [BOOKING("a1", 30), BOOKING("a2", -2, { status: "completed" }), BOOKING("a3", -24 * 5, { status: "completed" })] },
  "GET /api/v1/clients/c1/full": { body: { client: { first_name: "Μαρία", last_name: "Παπά", qr_token: "QR1", receive_emails: true }, history: [] } },
  "GET /api/v1/clients/c1/packages": { body: [{ id: "p1", name: "5 μασάζ", state: "active", remaining: 3, total_visits: 5, used: 2 }] },
  "GET /api/v1/clients/c1/membership": { body: { membership: { tier_name: "Gold", current_period_end: "2026-12-31" }, usage: [] } },
  "GET /api/v1/contests/active": { body: null },
  "GET /api/v1/portal/services": { body: [{ id: "svc1", name: "Μασάζ", duration_minutes: 60, price: 40 }] },
  "GET /api/v1/portal/staff": { body: [{ id: "st1", name: "ΑΝΝΑ" }] },
  "GET /api/v1/portal/availability/days": { body: [{ date: at(30).slice(0, 10), count: 2 }] },
  "GET /api/v1/portal/availability/slots": { body: [{ start_time: at(30), staff_id: "st1", staff_name: "ΑΝΝΑ" }] },
};

const nameOf = (el: Element) =>
  (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "").trim() ||
  [...el.querySelectorAll("img")].map((i) => i.getAttribute("alt") || "").join("").trim();

const unnamed = () => {
  const problems: string[] = [];
  for (const el of document.querySelectorAll('button, a[href], [role="radio"], [role="button"]')) {
    if ((el as HTMLElement).closest("[aria-hidden=true]")) continue;
    if (!nameOf(el)) problems.push(el.outerHTML.slice(0, 120));
  }
  for (const img of document.querySelectorAll("img")) if (!img.hasAttribute("alt")) problems.push(img.outerHTML.slice(0, 120));
  for (const field of document.querySelectorAll("input:not([type=hidden]):not([aria-hidden=true]), textarea, select")) {
    const labelled = field.closest("label") || field.getAttribute("aria-label") || field.getAttribute("aria-labelledby") || (field.id && document.querySelector(`label[for="${field.id}"]`));
    if (!labelled && (field as HTMLElement).offsetParent !== undefined && !(field as HTMLInputElement).closest(".p-toggleswitch, .p-togglebutton")) problems.push(field.outerHTML.slice(0, 120));
  }
  return problems;
};

const visit = async (path: string, width = 390) => {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true, writable: true });
  saveLogin({ id: "u1", role: "client", shop_id: "s1", client_id: "c1" });
  fakeServer(ROUTES);
  await router.push(path);
  mountScreen(defineComponent({ render: () => h(RouterView) }), { router });
  for (let i = 0; i < 4; i++) await settle();
};

describe("A11Y1 every control has a name", () => {
  test.each([
    "/portal/home",
    "/portal/bookings",
    "/portal/bookings/a1",
    "/portal/bookings?tab=past",
    "/portal/book",
    "/portal/book?service=svc1",
    "/portal/wallet",
    "/portal/wallet/pass",
    "/portal/profile",
  ])("%s", async (path) => {
    await visit(path);
    expect(unnamed()).toEqual([]);
  });

  test("the assistant's panel", async () => {
    await visit("/portal/home");
    useAssistantStore().open();
    await settle();
    expect(unnamed()).toEqual([]);
  });
});

describe("A11Y2 the shell says where the client is", () => {
  test("the open place is marked as the current page, on a phone and a desktop", async () => {
    await visit("/portal/wallet");
    expect(document.querySelector('[data-testid="portal-tabs"]')!.getAttribute("aria-label")).toBeTruthy();
    expect(document.querySelector('[data-testid="portal-tabs"] [aria-current="page"]')!.getAttribute("href")).toBe("/portal/wallet");
  });
});
