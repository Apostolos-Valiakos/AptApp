// The Android app's portal-only build (docs/redesign/ANDROID_HANDOFF.md step
// 7.2): its router holds login, signup and the portal, nothing of the staff
// app; server requests go to the production address. APP1–APP4.
import { describe, expect, test } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";
import { routes, createPortalRouter, STAFF_SIGNED_OUT } from "../../client/src/portal/router";
import { installApiBase, withApiBase, API_PREFIXES } from "../../client/src/apiBase";
import { useAuthStore } from "../../client/src/stores/auth";
import LoginView from "../../client/src/views/LoginView.vue";
import el from "../../client/src/i18n/locales/el";
import { fakeServer, mountScreen, saveLogin, settle } from "./helpers";

const allPaths = (list: any[], parent = ""): string[] =>
  list.flatMap((r) => {
    const full = r.path.startsWith("/") ? r.path : `${parent}/${r.path}`.replace(/\/+/g, "/");
    return [full, ...allPaths(r.children || [], full)];
  });

// The app's router, guard included, on a memory history.
const landOn = async (path: string) => {
  const router = createPortalRouter(createMemoryHistory());
  await router.push(path).catch(() => {});
  await settle();
  return router.currentRoute.value;
};

describe("APP1 the app's router has the portal, never the staff app", () => {
  test("only /, /login, /signup, /portal/* and the catch-all; no /app route", () => {
    const paths = allPaths(routes);
    expect(paths.filter((p) => p.startsWith("/app"))).toEqual([]);
    expect(paths.every((p) => ["/", "/login", "/signup", "/:rest(.*)*"].includes(p) || p.startsWith("/portal"))).toBe(true);
    expect(paths).toContain("/portal/home");
    expect(paths).toContain("/portal/bookings/:id");
  });

  test("a staff link opens the portal for a client", async () => {
    saveLogin({ id: "c1", role: "client", shop_id: "s1", client_id: "cl1" });
    fakeServer();
    expect((await landOn("/app/scheduler")).path).toBe("/portal/home");
    expect((await landOn("/app/financials")).path).toBe("/portal/home");
  });

  test("signed out, the portal asks to log in", async () => {
    fakeServer();
    expect((await landOn("/portal/bookings")).path).toBe("/login");
  });
});

describe("APP2 a staff account is signed out of the app and pointed to the web", () => {
  test("an admin's saved login is dropped and the login page says why", async () => {
    saveLogin({ id: "u1", role: "admin", shop_id: "s1" });
    fakeServer();
    const route = await landOn("/portal/home");
    expect(route.path).toBe("/login");
    expect(route.query[STAFF_SIGNED_OUT]).toBe("1");
    expect(useAuthStore().isAuthenticated).toBe(false);
    expect(localStorage.getItem("token")).toBeNull();
  });

  test("the login page explains, with a link to the web app", async () => {
    fakeServer();
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/login", component: LoginView }] });
    await router.push(`/login?${STAFF_SIGNED_OUT}=1`);
    mountScreen(LoginView, { router });
    await settle();
    const notice = document.querySelector<HTMLElement>('[data-testid="login-staff-app"]')!;
    expect(notice.textContent).toContain(el.login.staffApp);
    expect(notice.querySelector("a")!.getAttribute("href")).toMatch(/\/login$/);
  });

  test("no notice on a normal visit", async () => {
    fakeServer();
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/login", component: LoginView }] });
    await router.push("/login");
    mountScreen(LoginView, { router });
    await settle();
    expect(document.querySelector('[data-testid="login-staff-app"]')).toBeNull();
  });
});

describe("APP3 the server's paths go to the production address", () => {
  const BASE = "https://purespabooking.gr";

  test("/api, /ai, /socket.io and /health are prefixed", () => {
    expect(API_PREFIXES).toEqual(["/api", "/ai", "/socket.io", "/health"]);
    expect(withApiBase("/api/v1/shop", BASE)).toBe(`${BASE}/api/v1/shop`);
    expect(withApiBase("/ai/chat", BASE)).toBe(`${BASE}/ai/chat`);
    expect(withApiBase("/socket.io/?EIO=4", BASE)).toBe(`${BASE}/socket.io/?EIO=4`);
    expect(withApiBase("/health", BASE)).toBe(`${BASE}/health`);
    expect(withApiBase("/api/v1/shop", `${BASE}/`)).toBe(`${BASE}/api/v1/shop`);
  });

  test("anything else is left alone: the app's files, look-alike paths, other sites", () => {
    for (const path of ["/assets/index.js", "/portal/home", "/apiary", "/aim/x", "/healthy", "https://maps.google.com/?q=x"]) {
      expect(withApiBase(path, BASE)).toBe(path);
    }
  });

  test("no address set (the web build): fetch is left as it is", async () => {
    const calls: any[] = [];
    const target: any = { fetch: (input: any) => (calls.push(input), Promise.resolve(new Response("{}"))) };
    const original = target.fetch;
    installApiBase("", target);
    expect(target.fetch).toBe(original);
    installApiBase(BASE, target);
    await target.fetch("/ai/chat");
    await target.fetch("/assets/x.js");
    expect(calls).toEqual([`${BASE}/ai/chat`, "/assets/x.js"]);
  });
});
