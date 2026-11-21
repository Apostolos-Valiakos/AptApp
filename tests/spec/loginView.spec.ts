// The login page, used the way a person uses it. C1–C7 in test-report.html.
import { describe, expect, test, vi } from "vitest";
import LoginView from "../../client/src/views/LoginView.vue";
import { i18n } from "../../client/src/i18n";
import el from "../../client/src/i18n/locales/el";
import en from "../../client/src/i18n/locales/en";
import { blankRouter, deferred, fakeServer, mountScreen, pageText, settle } from "./helpers";

const open = async (url = "/login") => {
  const router = blankRouter([{ path: "/login", component: LoginView }]);
  await router.push(url);
  const wrapper = mountScreen(LoginView, { router });
  await settle();
  return { wrapper, router };
};

const signIn = async (wrapper: any, username = "maria", password = "secret") => {
  const [usernameField, passwordField] = wrapper.findAll("form input");
  await usernameField.setValue(username);
  await passwordField.setValue(password);
  await wrapper.find("form").trigger("submit");
  await settle();
};

const loginAnswers = (user: any) => ({ "POST /api/v1/login": { body: { token: "abc", user } } });
const hasGreek = (text: string) => /[Ͱ-Ͽ]/.test(text);
const toastDetail = () => document.querySelector(".p-toast-detail")?.textContent || "";

describe("C1–C3 where a successful login leads", () => {
  test.each([
    ["client", "/portal"],
    ["super_admin", "/app/scheduler"],
    ["admin", "/app/scheduler"],
    ["frontdesk", "/app/scheduler"],
    ["staff", "/app/scheduler"],
    ["owner", "/app/platform/shops"],
  ])("%s goes to %s", async (role, path) => {
    fakeServer(loginAnswers({ id: "1", role }));
    const { wrapper, router } = await open();
    await signIn(wrapper);
    expect(router.currentRoute.value.path).toBe(path);
  });

  test("the typed username and password are the ones sent", async () => {
    const server = fakeServer(loginAnswers({ id: "1", role: "admin" }));
    const { wrapper } = await open();
    await signIn(wrapper, "eleni", "pa55");
    expect(server.called("POST", "/api/v1/login")[0].body).toEqual({ username: "eleni", password: "pa55" });
  });

  test("the shop's colours failing to load doesn't stop the login", async () => {
    fakeServer({ ...loginAnswers({ id: "1", role: "admin" }), "GET /api/v1/shop": { status: 500, body: {} } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { wrapper, router } = await open();
    await signIn(wrapper);
    expect(router.currentRoute.value.path).toBe("/app/scheduler");
  });
});

describe("C4 a refused login explains why, in the app's language", () => {
  const refusals: [string, any, string][] = [
    ["wrong password", { status: 401, body: { error: "Invalid credentials", code: "invalid_credentials" } }, "Invalid credentials"],
    ["suspended shop", { status: 403, body: { error: "This shop is currently suspended. Please contact support.", code: "shop_inactive" } }, "This shop is currently"],
    ["deactivated account", { status: 403, body: { error: "This account has been deactivated.", code: "account_deactivated" } }, "deactivated"],
    ["too many attempts", { status: 429, body: { error: "Too many login attempts, please try again in 15 minutes", code: "too_many_attempts" } }, "Too many login attempts"],
    ["an error the app doesn't know", { status: 500, body: { error: "Internal server error" } }, "Internal server error"],
    ["no network", "network-down", "Network error"],
  ];

  test.each(refusals)("%s: Greek interface, Greek message", async (_name, reply, english) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fakeServer({ "POST /api/v1/login": reply });
    const { wrapper, router } = await open();
    await signIn(wrapper);
    expect(router.currentRoute.value.path).toBe("/login");
    expect(toastDetail()).not.toBe("");
    expect(toastDetail()).not.toContain(english);
    expect(hasGreek(toastDetail())).toBe(true);
  });

  test("wrong password uses the translated wording, in both languages", async () => {
    fakeServer({ "POST /api/v1/login": { status: 401, body: { error: "Invalid credentials", code: "invalid_credentials" } } });
    let { wrapper } = await open();
    await signIn(wrapper);
    expect(toastDetail()).toBe(el.login.invalidCredentials);
    wrapper.unmount();
    document.body.innerHTML = "";

    i18n.global.locale.value = "en";
    ({ wrapper } = await open());
    await signIn(wrapper);
    expect(toastDetail()).toBe(en.login.invalidCredentials);
  });

  test("each reason has its own message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const seen: string[] = [];
    for (const [, reply] of refusals) {
      fakeServer({ "POST /api/v1/login": reply });
      const { wrapper } = await open();
      await signIn(wrapper);
      seen.push(toastDetail());
      wrapper.unmount();
      document.body.innerHTML = "";
    }
    expect(new Set(seen).size).toBe(refusals.length);
  });
});

describe("C5 the button while signing in", () => {
  test("is disabled during the attempt, so it can't be sent twice", async () => {
    const answer = deferred();
    fakeServer({ "POST /api/v1/login": answer.promise });
    const { wrapper } = await open();
    await signIn(wrapper);
    expect(wrapper.find('button[type="submit"]').attributes("disabled")).toBeDefined();
    answer.resolve({ status: 401, body: { error: "Invalid credentials" } });
    await settle();
  });

  test("works again after a failure", async () => {
    fakeServer({ "POST /api/v1/login": { status: 401, body: { error: "Invalid credentials" } } });
    const { wrapper } = await open();
    await signIn(wrapper);
    expect(wrapper.find('button[type="submit"]').attributes("disabled")).toBeUndefined();
  });
});

describe("C6 showing the password", () => {
  test("hidden at first; the eye shows and hides it, without sending the form", async () => {
    const server = fakeServer();
    const { wrapper } = await open();
    const password = () => wrapper.findAll("form input")[1];
    const eye = wrapper.find('button[type="button"]');
    expect(password().attributes("type")).toBe("password");
    await eye.trigger("click");
    expect(password().attributes("type")).toBe("text");
    await eye.trigger("click");
    expect(password().attributes("type")).toBe("password");
    expect(server.called("POST", "/api/v1/login")).toEqual([]);
  });
});

describe("C7 arriving with something in the address", () => {
  test("an expired session gets a warning, and the address is cleaned", async () => {
    fakeServer();
    const { router } = await open("/login?expired=1");
    expect(pageText()).toContain(el.login.sessionExpired);
    expect(router.currentRoute.value.fullPath).toBe("/login");
  });

  test("a normal visit gets no warning", async () => {
    fakeServer();
    await open();
    expect(pageText()).not.toContain(el.login.sessionExpired);
  });

  test("?lang=en from the home page sets and remembers English, and the address is cleaned", async () => {
    fakeServer();
    const { wrapper, router } = await open("/login?lang=en");
    expect(wrapper.text()).toContain(en.login.signIn);
    expect(localStorage.getItem("locale")).toBe("en");
    expect(router.currentRoute.value.fullPath).toBe("/login");
  });

  test("without ?lang=, the language chosen on the home page is used", async () => {
    fakeServer();
    localStorage.setItem("pure-lang", "en");
    const { wrapper } = await open();
    expect(wrapper.text()).toContain(en.login.signIn);
  });

  test("an unknown language is ignored", async () => {
    fakeServer();
    const { wrapper } = await open("/login?lang=fr");
    expect(wrapper.text()).toContain(el.login.signIn);
    expect(localStorage.getItem("locale")).toBeNull();
  });
});
