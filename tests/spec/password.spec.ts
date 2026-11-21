// One password rule wherever a password is set: at least 8 characters, at
// least one of them a digit. The form says so under the field and won't send
// a password that breaks it (the server refuses it too). PW1–PW3.
import { describe, expect, test } from "vitest";
import SignupView from "../../client/src/views/SignupView.vue";
import StaffView from "../../client/src/views/StaffView.vue";
import { passwordOk } from "../../client/src/utils/password";
import el from "../../client/src/i18n/locales/el";
import { blankRouter, fakeServer, mountScreen, saveLogin, settle } from "./helpers";

const type = async (input: HTMLInputElement, value: string) => {
  input.value = value;
  input.dispatchEvent(new Event("input"));
  await settle();
};

describe("PW1 the rule", () => {
  test("8 characters or more, with a digit", () => {
    expect(passwordOk("abcdefg1")).toBe(true);
    expect(passwordOk("1234567890")).toBe(true);
    expect(passwordOk("abcdef1")).toBe(false); // 7 characters
    expect(passwordOk("abcdefgh")).toBe(false); // no digit
    expect(passwordOk("")).toBe(false);
    expect(passwordOk(null)).toBe(false);
  });
});

describe("PW2 a client signing up from an invitation", () => {
  const open = async () => {
    const router = blankRouter();
    await router.push("/signup?token=invite-token");
    const server = fakeServer({ "POST /api/v1/signup": { body: { success: true } } });
    mountScreen(SignupView, { router });
    await settle();
    return server;
  };
  const fields = () => [...document.querySelectorAll<HTMLInputElement>("form input")];
  const submit = () => document.querySelector<HTMLButtonElement>("form button[type=submit]")!;

  test("the rule is shown, turns red for a password that breaks it, and the account can't be created", async () => {
    await open();
    const rule = document.querySelector('[data-testid="password-rule"]')!;
    expect(rule.textContent).toContain(el.common.passwordRule);
    expect(rule.className).not.toContain("text-red");
    const [pw, confirm] = fields();
    await type(pw, "abcdefgh");
    await type(confirm, "abcdefgh");
    expect(rule.className).toContain("text-red");
    expect(submit().disabled).toBe(true);
  });

  test("a password that meets it, typed twice, can be sent", async () => {
    await open();
    const [pw, confirm] = fields();
    await type(pw, "abcdefg1");
    await type(confirm, "abcdefg1");
    expect(submit().disabled).toBe(false);
  });
});

describe("PW3 a staff member's login, created by an admin", () => {
  const open = async () => {
    saveLogin({ id: "u1", role: "admin", shop_id: "s1" });
    const server = fakeServer({
      "GET /api/v1/staff": { body: [{ id: "st1", name: "ΑΝΝΑ ΠΑΠΑ", capacity: 1, service_ids: [], visible_in_calendar: true, is_active: true }] },
      "GET /api/v1/services": { body: [] },
      "POST /api/v1/staff/st1/login": { body: { success: true } },
    });
    mountScreen(StaffView);
    await settle();
    (document.querySelector(`[aria-label="${el.staff.tooltips.createLogin}"]`) as HTMLElement).click();
    await settle();
    return server;
  };
  const save = () => document.querySelector<HTMLButtonElement>('[data-testid="new-login-save"]')!;
  const password = () => document.querySelector<HTMLInputElement>('[data-testid="new-login-password"]')!;

  test("a short password, or one without a digit, can't be saved", async () => {
    const server = await open();
    await type(password(), "short1");
    expect(save().disabled).toBe(true);
    await type(password(), "nodigitshere");
    expect(save().disabled).toBe(true);
    save().click();
    await settle();
    expect(server.called("POST", "/api/v1/staff/st1/login")).toHaveLength(0);
  });

  test("one that meets the rule is sent", async () => {
    const server = await open();
    await type(password(), "welcome2026");
    expect(save().disabled).toBe(false);
    save().click();
    await settle();
    expect(server.called("POST", "/api/v1/staff/st1/login")[0]?.body).toMatchObject({ password: "welcome2026" });
  });
});
