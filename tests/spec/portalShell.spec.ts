// The redesigned portal's frame (docs/redesign/REDESIGN_SPEC.md §2), through
// the real route table: five places, Book in the middle; a rail and a side
// panel on a desktop; the assistant one tap away from every screen; links of
// the old portal still working; and the switch that turns it on. PS1–PS5.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { RouterView } from "vue-router";
import router from "../../client/src/router";
import { setPortalV2, portalV2 } from "../../client/src/portal/flag";
import { useAssistantStore } from "../../client/src/portal/stores/assistant";
import el from "../../client/src/i18n/locales/el";
import { fakeServer, mountScreen, saveLogin, settle } from "./helpers";

Element.prototype.scrollTo ||= () => {};

const at = (width: number) => Object.defineProperty(window, "innerWidth", { value: width, configurable: true, writable: true });
const open = async (path: string, { width = 390, ai = true } = {}) => {
  at(width);
  saveLogin({ id: "u1", role: "client", shop_id: "s1", client_id: "c1" });
  fakeServer({
    "GET /api/v1/shop": { body: { id: "s1", name: "Pure Spa", phone: "2410555555", ai_assistant_enabled: ai } },
    "GET /api/v1/portal/notifications": { body: { items: [], unread_count: 2 } },
    "GET /api/v1/clients/c1/full": { body: { client: { first_name: "Μαρία" }, history: [] } },
  });
  await router.push(path);
  mountScreen(RouterView, { router });
  for (let i = 0; i < 4; i++) await settle();
};
const byTestId = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const landsOn = async (path: string) => {
  await router.push(path);
  return router.currentRoute.value.fullPath;
};

beforeEach(() => setPortalV2(true));
afterEach(() => {
  setPortalV2(false);
  at(1024);
});

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

  test("and with the redesign off, its links open the old portal", async () => {
    await open("/portal/home");
    setPortalV2(false);
    expect(await landsOn("/portal/bookings")).toBe("/portal/appointments");
    expect(await landsOn("/portal/bookings/a1")).toBe("/portal/appointments");
    expect(await landsOn("/portal/book")).toBe("/portal/appointments?tab=book");
    expect(await landsOn("/portal/wallet/pass")).toBe("/portal/more");
    expect(await landsOn("/portal/profile")).toBe("/portal/more");
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

describe("PS5 switching the redesign on and off", () => {
  test("?portal=v2 turns it on for this device and the link opens without it; ?portal=v1 off", async () => {
    setPortalV2(false);
    await open("/portal/home");
    expect(await landsOn("/portal/home?portal=v2")).toBe("/portal/home");
    expect(portalV2.value).toBe(true);
    expect(localStorage.getItem("portalV2")).toBe("1");
    expect(await landsOn("/portal/bookings?portal=v1")).toBe("/portal/appointments");
    expect(portalV2.value).toBe(false);
    expect(localStorage.getItem("portalV2")).toBeNull();
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
