// The portal's frame (docs/redesign/REDESIGN_SPEC.md §2), through the real
// route table: five places, Book in the middle; a rail and a side panel on a
// desktop; the assistant one tap away from every screen; links of the old
// portal still working; notifications from the bell. PS1–PS5.
// (PS5 was the switch between the old and new portal, gone with the old one.)
import { afterEach, describe, expect, test } from "vitest";
import { RouterView } from "vue-router";
import router from "../../client/src/router";
import { useAssistantStore } from "../../client/src/portal/stores/assistant";
import el from "../../client/src/i18n/locales/el";
import { fakeServer, mountScreen, saveLogin, settle } from "./helpers";

Element.prototype.scrollTo ||= () => {};

const at = (width: number) => Object.defineProperty(window, "innerWidth", { value: width, configurable: true, writable: true });
const open = async (path: string, { width = 390, ai = true } = {}) => {
  at(width);
  saveLogin({ id: "u1", role: "client", shop_id: "s1", client_id: "c1" });
  const server = fakeServer({
    "GET /api/v1/shop": { body: { id: "s1", name: "Pure Spa", phone: "2410555555", ai_assistant_enabled: ai } },
    "GET /api/v1/portal/notifications": { body: { items: [], unread_count: 2 } },
    "GET /api/v1/clients/c1/full": { body: { client: { first_name: "Μαρία" }, history: [] } },
  });
  await router.push(path);
  mountScreen(RouterView, { router });
  for (let i = 0; i < 4; i++) await settle();
  return server;
};
const byTestId = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const landsOn = async (path: string) => {
  await router.push(path);
  return router.currentRoute.value.fullPath;
};

afterEach(() => at(1024));

describe("PS1 five places on a phone", () => {
  test("Home, Bookings, Book (raised, in the middle), Wallet, Profile", async () => {
    await open("/portal/home");
    const tabs = [...byTestId("portal-tabs")!.querySelectorAll("a")];
    expect(tabs.map((a) => a.textContent!.trim())).toEqual([
      el.portal.nav.home, el.portal.nav.bookings, el.portal.nav.book, el.portal.nav.wallet, el.portal.nav.profile,
    ]);
    expect(tabs.map((a) => a.getAttribute("href"))).toEqual(["/portal/home", "/portal/bookings", "/portal/book", "/portal/wallet", "/portal/profile"]);
    expect(tabs[2].querySelector(".rounded-full")).not.toBeNull();
    expect(tabs[0].getAttribute("aria-current")).toBe("page");
    expect(byTestId("portal-rail")).toBeNull();
  });

  test("the bell shows the unread count", async () => {
    await open("/portal/home");
    expect(byTestId("activity-button")!.textContent).toContain("2");
  });
});

describe("PS2 old links still work", () => {
  test("the old portal's places open the same place in the new one", async () => {
    await open("/portal/home");
    expect(await landsOn("/portal/appointments")).toBe("/portal/bookings");
    expect(await landsOn("/portal/appointments?tab=book")).toBe("/portal/book");
    expect(await landsOn("/portal/more")).toBe("/portal/profile");
  });
});

describe("PS3 the assistant from every screen", () => {
  test("a button in the top bar opens it in a sheet on a phone", async () => {
    await open("/portal/bookings");
    byTestId("assistant-button")!.click();
    await settle();
    expect(useAssistantStore().visible).toBe(true);
    expect(document.querySelector('.p-drawer [data-testid="assistant-chat"]')).not.toBeNull();
  });

  test("beside the page on a desktop", async () => {
    await open("/portal/home", { width: 1280 });
    byTestId("assistant-button")!.click();
    await settle();
    expect(byTestId("portal-side-panel")!.querySelector('[data-testid="assistant-chat"]')).not.toBeNull();
    expect(document.querySelector(".p-drawer")).toBeNull();
  });

  test("no button when the shop has it off", async () => {
    await open("/portal/home", { ai: false });
    expect(byTestId("assistant-button")).toBeNull();
  });
});

describe("PS4 a desktop", () => {
  test("a rail with the same five places instead of tabs, and a language switch", async () => {
    await open("/portal/wallet", { width: 1280 });
    const rail = byTestId("portal-rail")!;
    expect([...rail.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(["/portal/home", "/portal/bookings", "/portal/book", "/portal/wallet", "/portal/profile"]);
    expect(rail.querySelector('a[aria-current="page"]')!.getAttribute("href")).toBe("/portal/wallet");
    expect(rail.textContent).toContain("EN");
    expect(byTestId("portal-tabs")).toBeNull();
  });
});

describe("PS5 notifications from the bell (K10)", () => {
  test("the list opens, and can all be marked read", async () => {
    const server = await open("/portal/home");
    server.routes["GET /api/v1/portal/notifications"] = {
      body: { items: [{ id: "n1", title: "Υπενθύμιση", body: "Αύριο 10:00", type: "reminder", read_at: null, created_at: "2026-11-20T10:00:00Z", url: null }], unread_count: 1 },
    };
    server.routes["PUT /api/v1/portal/notifications/read-all"] = { body: { success: true } };
    byTestId("activity-button")!.click();
    await settle();
    expect(document.body.textContent).toContain("Υπενθύμιση");
    [...document.querySelectorAll<HTMLElement>(".p-dialog button")].find((b) => b.textContent!.trim() === el.portal.notificationHistory.markAllRead)!.click();
    await settle();
    expect(server.called("PUT", "/api/v1/portal/notifications/read-all")).toHaveLength(1);
  });
});

describe("AIC5 the conversation stays while the client moves around", () => {
  test("closing the assistant and changing tab keep it", async () => {
    await open("/portal/home");
    const assistant = useAssistantStore();
    assistant.open();
    assistant.messages.push({ role: "user", content: "Θέλω μασάζ αύριο" });
    await settle();
    assistant.close();
    await router.push("/portal/bookings");
    await settle();
    byTestId("assistant-button")!.click();
    await settle();
    expect(document.querySelector('[data-testid="assistant-chat"]')!.textContent).toContain("Θέλω μασάζ αύριο");
  });
});
