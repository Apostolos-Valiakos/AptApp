// Every client-portal feature the redesign keeps (docs/redesign/REDESIGN_SPEC.md
// §3, K1–K14), written against the portal as it is before the redesign. The
// redesigned screens must pass the same tests: only `openPortalScreen` (which
// screen shows what) changes when they replace the old ones.
import { beforeEach, describe, expect, test, vi } from "vitest";
import ClientLayout from "../../client/src/components/ClientLayout.vue";
import ClientHomeView from "../../client/src/views/portal/ClientHomeView.vue";
import ClientAppointmentsView from "../../client/src/views/portal/ClientAppointmentsView.vue";
import ClientMoreView from "../../client/src/views/portal/ClientMoreView.vue";
import { setLocale } from "../../client/src/i18n";
import el from "../../client/src/i18n/locales/el";
import { blankRouter, fakeServer, mountScreen, pageText, saveLogin, settle } from "./helpers";

const qr = vi.hoisted(() => ({ drawn: [] as string[] }));
vi.mock("qrcode", () => ({
  default: { toCanvas: async (_canvas: unknown, text: string) => void qr.drawn.push(text) },
}));

Element.prototype.scrollTo ||= () => {};

const HOUR = 3600e3;
const inHours = (h: number) => new Date(Date.now() + h * HOUR).toISOString();
const visit = (extra: any) => ({
  status: "confirmed", payment_status: "unpaid", paid: 0, total_service_price: 40, total_product_price: 0,
  service_names: "Μασάζ", staff_names: "ΑΝΝΑ", ...extra,
});
const CLIENT = { id: "c1", first_name: "Μαρία", last_name: "Παπά", email: "m@example.com", phone: "6900000000", qr_token: "QR-TOKEN-1", receive_emails: true };

// Where each feature lives. The redesign changes this map, not the tests.
type Place = "shell" | "home" | "bookings" | "book" | "wallet" | "profile";
const SCREENS: Record<Place, { screen: any; path: string }> = {
  shell: { screen: ClientLayout, path: "/portal/home" },
  home: { screen: ClientHomeView, path: "/portal/home" },
  bookings: { screen: ClientAppointmentsView, path: "/portal/appointments" },
  book: { screen: ClientAppointmentsView, path: "/portal/appointments?tab=book" },
  wallet: { screen: ClientMoreView, path: "/portal/more" },
  profile: { screen: ClientMoreView, path: "/portal/more" },
};

const openPortalScreen = async (place: Place, routes: Record<string, any> = {}) => {
  saveLogin({ id: "u1", role: "client", shop_id: "s1", client_id: "c1" });
  const server = fakeServer({
    "GET /api/v1/shop": { body: { id: "s1", name: "Pure", phone: "2410555555", ai_assistant_enabled: false } },
    "GET /api/v1/clients/c1/full": { body: { client: CLIENT, history: [] } },
    "GET /api/v1/clients/c1/membership": { body: { membership: null, usage: [] } },
    "GET /api/v1/clients/c1/packages": { body: [] },
    "GET /api/v1/portal/notifications": { body: { items: [], unread_count: 0 } },
    "GET /api/v1/contests/active": { body: null },
    ...routes,
  });
  const router = blankRouter();
  await router.push(SCREENS[place].path);
  mountScreen(SCREENS[place].screen, { router });
  await settle();
  return { server, router };
};

// A button or link by its text; a card button (a service, a staff member)
// also shows details or an initial, so its text need only hold the label.
const press = async (label: string, root: ParentNode = document) => {
  const all = [...root.querySelectorAll<HTMLElement>("button, a")];
  const target = all.find((b) => b.textContent?.trim() === label) || all.find((b) => b.textContent?.includes(label));
  if (!target) throw new Error(`No button "${label}"`);
  target.click();
  await settle();
};
// A folded section of the profile, opened by its title.
const openSection = async (title: string) => {
  const header = [...document.querySelectorAll("h3")].find((h) => h.textContent?.trim() === title)!;
  (header.closest("div.cursor-pointer") as HTMLElement).click();
  await settle();
};
const acceptConfirmation = async () => {
  document.querySelector<HTMLElement>(".p-confirmdialog-accept-button")!.click();
  await settle();
};

beforeEach(async () => {
  qr.drawn.length = 0;
  await setLocale("el");
});

describe("K1 the next appointment on Home", () => {
  test("the soonest booking still to come, with what and who; not a past or cancelled one", async () => {
    await openPortalScreen("home", {
      "GET /api/v1/clients/c1/full": {
        body: {
          client: CLIENT,
          history: [
            visit({ id: "past", start_time: inHours(-48), service_names: "Παλιό" }),
            visit({ id: "gone", start_time: inHours(5), status: "cancelled", service_names: "Ακυρωμένο" }),
            visit({ id: "later", start_time: inHours(72), service_names: "Αργότερα" }),
            visit({ id: "next", start_time: inHours(26), service_names: "Hot stones", staff_names: "ΕΛΕΝΗ" }),
          ],
        },
      },
    });
    const text = pageText();
    expect(text).toContain("Hot stones");
    expect(text).toContain("ΕΛΕΝΗ");
    for (const other of ["Παλιό", "Ακυρωμένο", "Αργότερα"]) expect(text).not.toContain(other);
  });

  test("none to come: says so", async () => {
    await openPortalScreen("home");
    expect(pageText()).toContain(el.portal.home.noUpcoming);
  });
});

describe("K2 booking: service, staff member, free time, then Book", () => {
  test("sends the chosen service, staff member and time, with the notes", async () => {
    const slot = new Date(Date.now() + 26 * HOUR);
    slot.setMinutes(0, 0, 0);
    const { server } = await openPortalScreen("book", {
      "GET /api/v1/portal/services": { body: [{ id: "svc1", name: "Μασάζ προσώπου", duration_minutes: 60, price: 45, category: null }] },
      "GET /api/v1/portal/staff": { body: [{ id: "st1", name: "ΑΝΝΑ" }] },
      "GET /api/v1/availability": { body: { slots: [slot.toISOString()] } },
      "POST /api/v1/appointments": { body: { id: "a1", success: true } },
    });
    await press("Μασάζ προσώπου");
    await press("ΑΝΝΑ");
    expect(server.called("GET", "/api/v1/availability")[0].url).toContain("staff_id=st1");
    const time = [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => /^\d{1,2}:\d{2}/.test(b.textContent!.trim()))!;
    time.click();
    await settle();
    await press(el.portal.book.stepConfirm);
    const notes = document.querySelector<HTMLTextAreaElement>("textarea")!;
    notes.value = "Αλλεργία στα αμύγδαλα";
    notes.dispatchEvent(new Event("input"));
    await press(el.portal.book.confirmButton);
    const [call] = server.called("POST", "/api/v1/appointments");
    expect(call.body).toEqual({
      booking_notes: "Αλλεργία στα αμύγδαλα",
      services: [{ service_id: "svc1", staff_id: "st1", start_time: slot.toISOString() }],
    });
  });
});

describe("K3 confirming attendance", () => {
  test("a booking not yet confirmed can be confirmed; a confirmed one isn't offered it", async () => {
    const { server } = await openPortalScreen("bookings", {
      "GET /api/v1/clients/c1/full": { body: { client: CLIENT, history: [visit({ id: "a1", start_time: inHours(30), status: "new" })] } },
      "POST /api/v1/portal/appointments/a1/confirm": { body: { success: true } },
    });
    await press(el.portal.upcoming.confirm);
    expect(server.called("POST", "/api/v1/portal/appointments/a1/confirm")).toHaveLength(1);
    expect([...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === el.portal.upcoming.confirm)).toBe(false);
  });
});

describe("K4 cancelling", () => {
  test("asks first, then cancels", async () => {
    const { server } = await openPortalScreen("bookings", {
      "GET /api/v1/clients/c1/full": { body: { client: CLIENT, history: [visit({ id: "a1", start_time: inHours(30) })] } },
      "POST /api/v1/portal/appointments/a1/cancel": { body: { success: true } },
    });
    await press(el.portal.upcoming.cancel);
    expect(server.called("POST", "/api/v1/portal/appointments/a1/cancel")).toHaveLength(0);
    expect(pageText()).toContain(el.portal.cancelConfirm.message);
    await acceptConfirmation();
    expect(server.called("POST", "/api/v1/portal/appointments/a1/cancel")).toHaveLength(1);
  });
});

describe("K5 past appointments", () => {
  test("listed newest first with what was paid", async () => {
    await openPortalScreen("bookings", {
      "GET /api/v1/clients/c1/full": {
        body: {
          client: CLIENT,
          history: [
            visit({ id: "old", start_time: inHours(-24 * 30), service_names: "Πρώτη", status: "completed", paid: 40 }),
            visit({ id: "new", start_time: inHours(-24 * 2), service_names: "Δεύτερη", status: "completed", paid: 35, total_service_price: 35 }),
          ],
        },
      },
    });
    const text = pageText();
    expect(text.indexOf("Δεύτερη")).toBeLessThan(text.indexOf("Πρώτη"));
    expect(text).toContain("35,00");
    expect(text).toContain("40,00");
  });
});

describe("K6 the membership card and its QR", () => {
  test("the QR carries the client's own token; the membership shows its usage", async () => {
    await openPortalScreen("wallet", {
      "GET /api/v1/clients/c1/membership": {
        body: { membership: { tier_name: "Gold", current_period_end: "2026-12-31" }, usage: [{ service_id: "s1", service_name: "Σάουνα", used_this_month: 2, quota_per_month: 4 }] },
      },
    });
    expect(qr.drawn).toContain("QR-TOKEN-1");
    expect(pageText()).toContain("Gold");
    expect(pageText()).toContain("2 / 4");
  });
});

describe("K7 visit packages", () => {
  test("each package with the visits left", async () => {
    await openPortalScreen("wallet", {
      "GET /api/v1/clients/c1/packages": { body: [{ id: "p1", name: "5 μασάζ", service_name: "Μασάζ", state: "active", remaining: 3, total_visits: 5, used: 2, usage: [], purchased_at: "2026-10-01", expires_at: null, price_paid: 150 }] },
    });
    expect(pageText()).toContain("5 μασάζ");
    expect(pageText()).toContain(el.packages.card.left.replace("{n}", "3").replace("{total}", "5"));
  });
});

describe("K8 my information and password", () => {
  test("the details are filled in and saved", async () => {
    const { server } = await openPortalScreen("profile", { "PUT /api/v1/portal/profile": { body: { success: true } } });
    await openSection(el.portal.more.myInformation);
    const phone = [...document.querySelectorAll<HTMLInputElement>("input")].find((i) => i.value === "6900000000")!;
    phone.value = "6911111111";
    phone.dispatchEvent(new Event("input"));
    await settle();
    await press(el.portal.account.saveChanges);
    expect(server.called("PUT", "/api/v1/portal/profile")[0].body).toMatchObject({ first_name: "Μαρία", phone: "6911111111" });
  });

  test("a new password must meet the rule", async () => {
    await openPortalScreen("profile");
    await openSection(el.portal.more.changePassword);
    const [current, next, again] = [...document.querySelectorAll<HTMLInputElement>('input[type="password"]')];
    for (const [input, value] of [[current, "old-pass1"], [next, "short"], [again, "short"]] as const) {
      input.value = value;
      input.dispatchEvent(new Event("input"));
    }
    await settle();
    const save = [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === el.portal.account.updatePassword)!;
    expect(save.disabled).toBe(true);
  });
});

describe("K9 email reminders", () => {
  test("can be turned off", async () => {
    const { server } = await openPortalScreen("profile", { "PUT /api/v1/portal/notifications": { body: { success: true } } });
    const toggle = document.querySelector<HTMLInputElement>(".p-toggleswitch input")!;
    expect(toggle.checked).toBe(true);
    toggle.click();
    await settle();
    expect(server.called("PUT", "/api/v1/portal/notifications")[0].body).toEqual({ receive_emails: false });
  });
});

describe("K10 notifications", () => {
  const items = [
    { id: "n1", title: "Υπενθύμιση", body: "Αύριο 10:00", type: "reminder", read_at: null, created_at: "2026-11-20T10:00:00Z", url: null },
    { id: "n2", title: "Προσφορά", body: "-20%", type: "broadcast", read_at: "2026-11-19T10:00:00Z", created_at: "2026-11-19T09:00:00Z", url: null },
  ];
  test("the bell shows the unread count; the list opens and can be marked read", async () => {
    const { server } = await openPortalScreen("shell", {
      "GET /api/v1/portal/notifications": { body: { items, unread_count: 1 } },
      "PUT /api/v1/portal/notifications/read-all": { body: { success: true } },
    });
    const bell = document.querySelector<HTMLElement>("button .pi-bell")!.closest("button")!;
    expect(bell.textContent).toContain("1");
    bell.click();
    await settle();
    expect(pageText()).toContain("Υπενθύμιση");
    expect(pageText()).toContain("Προσφορά");
    await press(el.portal.notificationHistory.markAllRead);
    expect(server.called("PUT", "/api/v1/portal/notifications/read-all")).toHaveLength(1);
  });
});

describe("K11 language", () => {
  test("the portal switches between Greek and English", async () => {
    await openPortalScreen("shell");
    await press("🇬🇧 EN");
    await settle();
    expect(pageText()).toContain("Home");
    await press("🇬🇷 EL");
    expect(pageText()).toContain(el.portal.nav.home);
  });
});

describe("K12 calling the shop", () => {
  test("a call link with the shop's phone", async () => {
    await openPortalScreen("home");
    expect(document.querySelector('a[href="tel:2410555555"]')).not.toBeNull();
  });
});

describe("K13 the contest", () => {
  test("shown while one is running", async () => {
    await openPortalScreen("home", { "GET /api/v1/contests/active": { body: { id: "k1", name: "Κλήρωση Χριστουγέννων", description: "Κερδίστε ένα σπα" } } });
    expect(pageText()).toContain("Κλήρωση Χριστουγέννων");
  });
});

describe("K14 the shop's self-booking off", () => {
  test("Book says so and offers no services", async () => {
    await openPortalScreen("book", { "GET /api/v1/portal/services": { status: 404, body: { error: "self_booking_disabled" } } });
    expect(pageText()).toContain(el.portal.book.disabled);
    expect(pageText()).not.toContain(el.portal.book.stepService);
  });
});
