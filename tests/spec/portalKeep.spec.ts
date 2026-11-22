// Every client-portal feature the redesign kept (docs/redesign/REDESIGN_SPEC.md
// §3, K1–K14). First written against the portal before the redesign (commit
// 98a0cc5), now run against the redesigned one through the real route table:
// the same features, reached where they live now.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { RouterView } from "vue-router";
import { defineComponent, h } from "vue";
import router from "../../client/src/router";
import { setLocale } from "../../client/src/i18n";
import el from "../../client/src/i18n/locales/el";
import { fakeServer, mountScreen, pageText, saveLogin, settle } from "./helpers";

const qr = vi.hoisted(() => ({ drawn: [] as string[] }));
vi.mock("qrcode", () => ({
  default: { toCanvas: async (_canvas: unknown, text: string) => void qr.drawn.push(text) },
}));

Element.prototype.scrollTo ||= () => {};

const HOUR = 3600e3;
const at = (h: number) => {
  const d = new Date(Date.now() + h * HOUR);
  d.setMinutes(0, 0, 0);
  return d.toISOString();
};
const visit = (id: string, h: number, extra: any = {}) => ({
  id, status: "confirmed", payment_status: "unpaid", booking_notes: null, paid: 0, total: 40, start_time: at(h), end_time: at(h + 1),
  services: [{ service_id: "svc1", service_name: `Θεραπεία ${id}`, staff_id: "st1", staff_name: "ΑΝΝΑ", start_time: at(h), duration_minutes: 60, price: 40 }],
  ...extra,
});
const CLIENT = { id: "c1", first_name: "Μαρία", last_name: "Παπά", email: "m@example.com", phone: "6900000000", qr_token: "QR-TOKEN-1", receive_emails: true };

const open = async (path: string, routes: Record<string, any> = {}) => {
  Object.defineProperty(window, "innerWidth", { value: 390, configurable: true, writable: true });
  saveLogin({ id: "u1", role: "client", shop_id: "s1", client_id: "c1" });
  const server = fakeServer({
    "GET /api/v1/shop": { body: { id: "s1", name: "Pure", phone: "2410555555", self_booking_enabled: true, ai_assistant_enabled: false } },
    "GET /api/v1/portal/appointments": { body: [] },
    "GET /api/v1/clients/c1/full": { body: { client: CLIENT, history: [] } },
    "GET /api/v1/clients/c1/membership": { body: { membership: null, usage: [] } },
    "GET /api/v1/clients/c1/packages": { body: [] },
    "GET /api/v1/portal/notifications": { body: { items: [], unread_count: 0 } },
    "GET /api/v1/contests/active": { body: null },
    ...routes,
  });
  await router.push(path);
  mountScreen(defineComponent({ render: () => h(RouterView) }), { router });
  for (let i = 0; i < 4; i++) await settle();
  return server;
};
const testId = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const press = async (el: HTMLElement) => {
  el.click();
  await settle();
  await settle();
};
const buttonNamed = (label: string) =>
  [...document.querySelectorAll<HTMLElement>("button, a")].find((b) => b.textContent?.trim() === label)!;
const type = async (input: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  input.value = value;
  input.dispatchEvent(new Event("input"));
  await settle();
};

beforeEach(async () => {
  qr.drawn.length = 0;
  await setLocale("el");
});

describe("K1 the next appointment on Home", () => {
  test("the soonest booking still to come, with what and who; not a past or cancelled one", async () => {
    await open("/portal/home", {
      "GET /api/v1/portal/appointments": {
        body: [visit("past", -48), visit("gone", 5, { status: "cancelled" }), visit("later", 72), visit("next", 26, { services: [{ ...visit("x", 26).services[0], service_name: "Hot stones", staff_name: "ΕΛΕΝΗ" }] })],
      },
    });
    const card = testId("upnext-card")!.textContent!;
    expect(card).toContain("Hot stones");
    expect(card).toContain("ΕΛΕΝΗ");
    for (const other of ["Θεραπεία past", "Θεραπεία gone", "Θεραπεία later"]) expect(card).not.toContain(other);
  });

  test("none to come: an invitation to book", async () => {
    await open("/portal/home");
    expect(testId("home-empty")).not.toBeNull();
  });
});

describe("K2 booking: service, staff member, free time, then Book", () => {
  test("sends the chosen service, staff member and time, with the notes", async () => {
    const server = await open("/portal/book", {
      "GET /api/v1/portal/services": { body: [{ id: "svc1", name: "Μασάζ προσώπου", duration_minutes: 60, price: 45, category: null }] },
      "GET /api/v1/portal/staff": { body: [{ id: "st1", name: "ΑΝΝΑ" }] },
      "GET /api/v1/portal/availability/days": { body: [{ date: at(26).slice(0, 10), count: 1 }] },
      "GET /api/v1/portal/availability/slots": { body: [{ start_time: at(26), staff_id: "st1", staff_name: "ΑΝΝΑ" }] },
      "POST /api/v1/appointments": { body: { id: "a1", success: true } },
    });
    await press(testId("service-option")!);
    await press([...testId("staff-chips")!.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent!.trim() === "ΑΝΝΑ")!);
    expect(server.called("GET", "/api/v1/portal/availability/slots").at(-1)!.url).toContain("staff_id=st1");
    await press(testId("slot")!);
    await press(testId("continue")!);
    await type(document.querySelector("textarea")!, "Αλλεργία στα αμύγδαλα");
    await press(testId("submit")!);
    expect(server.called("POST", "/api/v1/appointments")[0].body).toEqual({
      booking_notes: "Αλλεργία στα αμύγδαλα",
      services: [{ service_id: "svc1", staff_id: "st1", start_time: at(26) }],
    });
  });
});

describe("K3 confirming attendance", () => {
  test("a booking not yet confirmed can be confirmed; a confirmed one isn't offered it", async () => {
    const server = await open("/portal/bookings/a1", {
      "GET /api/v1/portal/appointments": { body: [visit("a1", 30, { status: "new" }), visit("a2", 60)] },
      "POST /api/v1/portal/appointments/a1/confirm": { body: { success: true } },
    });
    await press(testId("detail-confirm")!);
    expect(server.called("POST", "/api/v1/portal/appointments/a1/confirm")).toHaveLength(1);
    await router.push("/portal/bookings/a2");
    await settle();
    expect(testId("detail-confirm")).toBeNull();
  });
});

describe("K4 cancelling", () => {
  test("asks first, then cancels", async () => {
    const server = await open("/portal/bookings/a1", {
      "GET /api/v1/portal/appointments": { body: [visit("a1", 30)] },
      "POST /api/v1/portal/appointments/a1/cancel": { body: { success: true } },
    });
    await press(testId("detail-cancel")!);
    expect(server.called("POST", "/api/v1/portal/appointments/a1/cancel")).toHaveLength(0);
    expect(pageText()).toContain(el.portal.cancelConfirm.message);
    await press(document.querySelector<HTMLElement>(".p-confirmdialog-accept-button")!);
    expect(server.called("POST", "/api/v1/portal/appointments/a1/cancel")).toHaveLength(1);
  });
});

describe("K5 past appointments", () => {
  test("listed newest first with what was paid", async () => {
    await open("/portal/bookings?tab=past", {
      "GET /api/v1/portal/appointments": {
        body: [visit("first", -24 * 30, { status: "completed", paid: 40 }), visit("second", -24 * 2, { status: "completed", paid: 35, total: 35 })],
      },
    });
    const text = testId("past-list")!.textContent!;
    expect(text.indexOf("Θεραπεία second")).toBeLessThan(text.indexOf("Θεραπεία first"));
    expect(text).toContain("35,00");
    expect(text).toContain("40,00");
  });
});

describe("K6 the membership card and its QR", () => {
  test("the QR carries the client's own token; the membership shows its usage", async () => {
    await open("/portal/wallet", {
      "GET /api/v1/clients/c1/membership": {
        body: { membership: { tier_name: "Gold", current_period_end: "2026-12-31" }, usage: [{ service_id: "s1", service_name: "Σάουνα", used_this_month: 2, quota_per_month: 4 }] },
      },
    });
    expect(testId("membership")!.textContent).toContain("Gold");
    expect(testId("membership")!.textContent).toContain("2 / 4");
    await router.push("/portal/wallet/pass");
    for (let i = 0; i < 3; i++) await settle();
    expect(qr.drawn).toContain("QR-TOKEN-1");
  });
});

describe("K7 visit packages", () => {
  test("each package with the visits left", async () => {
    await open("/portal/wallet", {
      "GET /api/v1/clients/c1/packages": { body: [{ id: "p1", name: "5 μασάζ", service_name: "Μασάζ", state: "active", remaining: 3, total_visits: 5, used: 2 }] },
    });
    expect(testId("packages")!.textContent).toContain("5 μασάζ");
    expect(testId("packages")!.textContent).toContain(el.portal.v2.home.visitsLeft.replace("{left}", "3").replace("{total}", "5"));
  });
});

describe("K8 my information and password", () => {
  test("the details are filled in and saved", async () => {
    const server = await open("/portal/profile", { "PUT /api/v1/portal/profile": { body: { success: true } } });
    await press(testId("edit-account")!);
    await type(document.querySelector<HTMLInputElement>('[data-testid="account-form"] input[name="phone"]')!, "6911111111");
    document.querySelector<HTMLFormElement>('[data-testid="account-form"]')!.dispatchEvent(new Event("submit"));
    await settle();
    expect(server.called("PUT", "/api/v1/portal/profile")[0].body).toMatchObject({ first_name: "Μαρία", phone: "6911111111" });
  });

  test("a new password must meet the rule", async () => {
    await open("/portal/profile");
    await press(testId("edit-password")!);
    const [current, next, again] = [...document.querySelectorAll<HTMLInputElement>('[data-testid="password-form"] input')];
    await type(current, "old-pass1");
    await type(next, "short");
    await type(again, "short");
    expect((testId("password-save") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("K9 email reminders", () => {
  test("can be turned off", async () => {
    const server = await open("/portal/profile", { "PUT /api/v1/portal/notifications": { body: { success: true } } });
    const toggle = testId("email-reminders")!.querySelector<HTMLInputElement>("input")!;
    expect(toggle.checked).toBe(true);
    await press(toggle);
    expect(server.called("PUT", "/api/v1/portal/notifications")[0].body).toEqual({ receive_emails: false });
  });
});

describe("K10 notifications", () => {
  test("the bell shows the unread count; the list opens and can be marked read", async () => {
    const server = await open("/portal/home", {
      "GET /api/v1/portal/notifications": {
        body: {
          items: [
            { id: "n1", title: "Υπενθύμιση", body: "Αύριο 10:00", type: "reminder", read_at: null, created_at: "2026-11-20T10:00:00Z", url: null },
            { id: "n2", title: "Προσφορά", body: "-20%", type: "broadcast", read_at: "2026-11-19T10:00:00Z", created_at: "2026-11-19T09:00:00Z", url: null },
          ],
          unread_count: 1,
        },
      },
      "PUT /api/v1/portal/notifications/read-all": { body: { success: true } },
    });
    expect(testId("activity-button")!.textContent).toContain("1");
    await press(testId("activity-button")!);
    expect(pageText()).toContain("Υπενθύμιση");
    expect(pageText()).toContain("Προσφορά");
    await press(buttonNamed(el.portal.notificationHistory.markAllRead));
    expect(server.called("PUT", "/api/v1/portal/notifications/read-all")).toHaveLength(1);
  });
});

describe("K11 language", () => {
  test("the portal switches between Greek and English", async () => {
    await open("/portal/profile");
    await press([...testId("language")!.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent!.trim() === "English")!);
    expect(testId("portal-tabs")!.textContent).toContain("Home");
    await press([...testId("language")!.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent!.trim() === "Ελληνικά")!);
    expect(testId("portal-tabs")!.textContent).toContain(el.portal.nav.home);
  });
});

describe("K12 calling the shop", () => {
  test("a call link with the shop's phone", async () => {
    await open("/portal/home");
    expect(document.querySelector('a[href="tel:2410555555"]')).not.toBeNull();
  });
});

describe("K13 the contest", () => {
  test("shown while one is running", async () => {
    await open("/portal/home", { "GET /api/v1/contests/active": { body: { id: "k1", name: "Κλήρωση Χριστουγέννων", description: "Κερδίστε ένα σπα" } } });
    expect(testId("contest")!.textContent).toContain("Κλήρωση Χριστουγέννων");
  });
});

describe("K14 the shop's self-booking off", () => {
  test("Book says so, with the phone, and offers no services", async () => {
    await open("/portal/book", { "GET /api/v1/portal/services": { status: 404, body: { error: "self_booking_disabled" } } });
    expect(testId("book-disabled")!.textContent).toContain(el.portal.book.disabled);
    expect(testId("book-disabled")!.querySelector('a[href="tel:2410555555"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="service-option"]')).toBeNull();
  });
});
