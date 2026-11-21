// The redesigned Profile (REDESIGN_SPEC.md §5.5): the account saved (PF1,
// K8), the password rule (PF2, K8), email reminders (K9), the language (PF3,
// K11), the appearance (PF4, N11), and logging out clearing what the portal
// kept on the device (PF5).
import { describe, expect, test } from "vitest";
import ProfileView from "../../client/src/portal/views/ProfileView.vue";
import { useAppearance } from "../../client/src/portal/composables/usePortalTheme";
import { useAssistantStore } from "../../client/src/portal/stores/assistant";
import { usePortalWalletStore } from "../../client/src/portal/stores/wallet";
import { setLocale } from "../../client/src/i18n";
import el from "../../client/src/i18n/locales/el";
import { fakeServer, mountScreen, pageText, saveLogin, settle } from "./helpers";

const open = async (routes: Record<string, any> = {}) => {
  saveLogin({ id: "u1", role: "client", shop_id: "s1", client_id: "c1" });
  const server = fakeServer({
    "GET /api/v1/clients/c1/full": { body: { client: { first_name: "Μαρία", last_name: "Παπά", email: "m@example.com", phone: "6900000000", receive_emails: true, qr_token: "QR1" }, history: [] } },
    "GET /api/v1/clients/c1/packages": { body: [] },
    "GET /api/v1/clients/c1/membership": { body: { membership: null, usage: [] } },
    "PUT /api/v1/portal/profile": { body: { success: true } },
    "PUT /api/v1/portal/password": { body: { success: true } },
    "PUT /api/v1/portal/notifications": { body: { success: true } },
    ...routes,
  });
  mountScreen(ProfileView);
  await settle();
  await settle();
  return server;
};
const one = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const type = async (input: HTMLInputElement, value: string) => {
  input.value = value;
  input.dispatchEvent(new Event("input"));
  await settle();
};
const option = (group: string, label: string) => [...one(group)!.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent!.trim() === label)!;

describe("PF1 the account (K8)", () => {
  test("filled in from the client's card and saved", async () => {
    const server = await open();
    expect(one("account")!.textContent).toContain("Μαρία Παπά");
    one("edit-account")!.click();
    await settle();
    await type(document.querySelector<HTMLInputElement>('[data-testid="account-form"] input[name="phone"]')!, "6911111111");
    document.querySelector<HTMLFormElement>('[data-testid="account-form"]')!.dispatchEvent(new Event("submit"));
    await settle();
    expect(server.called("PUT", "/api/v1/portal/profile")[0].body).toEqual({ first_name: "Μαρία", last_name: "Παπά", email: "m@example.com", phone: "6911111111" });
  });
});

describe("PF2 the password rule (K8)", () => {
  test("a password breaking the rule can't be sent; one meeting it is", async () => {
    const server = await open();
    one("edit-password")!.click();
    await settle();
    const [current, next, again] = [...document.querySelectorAll<HTMLInputElement>('[data-testid="password-form"] input')];
    await type(current, "old-pass1");
    await type(next, "short");
    await type(again, "short");
    expect((one("password-save") as HTMLButtonElement).disabled).toBe(true);
    expect(one("password-rule")!.className).toContain("text-red");
    await type(next, "welcome2026");
    await type(again, "welcome2026");
    one("password-save")!.click();
    await settle();
    expect(server.called("PUT", "/api/v1/portal/password")[0].body).toEqual({ currentPassword: "old-pass1", newPassword: "welcome2026" });
  });
});

describe("K9 email reminders (on the new Profile)", () => {
  test("can be turned off", async () => {
    const server = await open();
    const toggle = one("email-reminders")!.querySelector<HTMLInputElement>("input")!;
    expect(toggle.checked).toBe(true);
    toggle.click();
    await settle();
    expect(server.called("PUT", "/api/v1/portal/notifications")[0].body).toEqual({ receive_emails: false });
  });
});

describe("PF3 the language (K11)", () => {
  test("switches the portal and is remembered", async () => {
    await open();
    option("language", "English").click();
    await settle();
    expect(localStorage.getItem("locale")).toBe("en");
    expect(pageText()).toContain("Appearance");
    await setLocale("el");
  });
});

describe("PF4 the appearance (N11)", () => {
  test("light, dark or like the device", async () => {
    await open();
    option("appearance", el.portal.v2.profile.dark).click();
    await settle();
    expect(useAppearance().appearance.value).toBe("dark");
    option("appearance", el.portal.v2.profile.system).click();
    await settle();
    expect(useAppearance().appearance.value).toBe("system");
  });
});

describe("PF5 logging out", () => {
  test("clears the login, the kept pass and the assistant's conversation", async () => {
    await open();
    expect(localStorage.getItem("portal.passToken")).toBe("QR1");
    useAssistantStore().messages.push({ role: "user", content: "γεια" });
    one("logout")!.click();
    await settle();
    expect(localStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("portal.passToken")).toBeNull();
    expect(usePortalWalletStore().passToken).toBeNull();
    expect(useAssistantStore().messages).toHaveLength(0);
  });
});

describe("PF6 when to be reminded (K9)", () => {
  test("the shop's time shows as chosen until the client picks; at least one stays on", async () => {
    const server = await open({ "GET /api/v1/shop": { body: { id: "s1", name: "Pure", reminder_hours_before: 24 } } });
    const button = (m: number) => document.querySelector<HTMLElement>(`[data-testid="reminder-timing"] [data-offset="${m}"]`)!;
    const pressed = () => [1440, 120, 60].filter((m) => button(m).getAttribute("aria-pressed") === "true");
    expect(pressed()).toEqual([1440]);
    button(60).click();
    await settle();
    expect(server.called("PUT", "/api/v1/portal/notifications").at(-1)!.body).toEqual({ reminder_offsets_minutes: [1440, 60] });
    button(1440).click();
    await settle();
    button(60).click();
    await settle();
    expect(pressed()).toEqual([60]);
    expect(server.called("PUT", "/api/v1/portal/notifications").at(-1)!.body).toEqual({ reminder_offsets_minutes: [60] });
  });
});
