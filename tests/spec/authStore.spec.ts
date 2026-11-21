// Who is logged in, what their role allows, and the owner's "view as" a shop.
// S1–S7 in test-report.html.
import { describe, expect, test, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useAuthStore } from "../../client/src/stores/auth";
import { fakeServer, saveLogin } from "./helpers";

const reloadPage = () => {
  setActivePinia(createPinia());
  return useAuthStore();
};
const admin = { id: "u1", role: "admin", shop_id: "s1" };
const owner = { id: "o1", role: "owner" };

describe("S1 logging in", () => {
  test("a correct login opens the session, and a page reload keeps it", async () => {
    fakeServer({ "POST /api/v1/login": { body: { token: "abc", user: admin } } });
    const result = await useAuthStore().login("maria", "secret");
    expect(result.success).toBe(true);

    const afterReload = reloadPage();
    expect(afterReload.isAuthenticated).toBe(true);
    expect(afterReload.token).toBe("abc");
    expect(afterReload.user.role).toBe("admin");
  });

  test("the username and password are what is sent to the server", async () => {
    const server = fakeServer({ "POST /api/v1/login": { body: { token: "abc", user: admin } } });
    await useAuthStore().login("maria", "secret");
    expect(server.called("POST", "/api/v1/login")[0].body).toEqual({ username: "maria", password: "secret" });
  });

  test("a re-issued token keeps the same user logged in, also after a reload", () => {
    saveLogin(admin, "old");
    reloadPage().refreshToken("new");
    const afterReload = reloadPage();
    expect(afterReload.token).toBe("new");
    expect(afterReload.user.id).toBe("u1");
  });
});

describe("S2 a refused login", () => {
  test.each([
    ["wrong password", { status: 401, body: { error: "Invalid credentials" } }],
    ["deactivated account", { status: 403, body: { error: "This account has been deactivated." } }],
    ["an answer without a token", { status: 200, body: {} }],
  ])("%s: stays logged out, nothing saved", async (_name, reply) => {
    fakeServer({ "POST /api/v1/login": reply });
    const auth = useAuthStore();
    const result = await auth.login("maria", "wrong");
    expect(result.success).toBe(false);
    expect(auth.isAuthenticated).toBe(false);
    expect(localStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("user")).toBeNull();
  });

  test("no network: fails without throwing, stays logged out", async () => {
    fakeServer({ "POST /api/v1/login": "network-down" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const auth = useAuthStore();
    expect((await auth.login("maria", "secret")).success).toBe(false);
    expect(auth.isAuthenticated).toBe(false);
  });
});

describe("S3 what each role may do", () => {
  test.each([
    // role,          shop admin, analytics, owner, client
    ["super_admin", true, true, false, false],
    ["admin", true, true, false, false],
    ["frontdesk", true, false, false, false],
    ["staff", false, false, false, false],
    ["owner", false, false, true, false],
    ["client", false, false, false, true],
  ])("%s", (role, shopAdmin, analytics, isOwner, isClient) => {
    saveLogin({ role });
    const auth = reloadPage();
    expect(auth.isShopAdmin).toBe(shopAdmin);
    expect(auth.isAnalyticsAllowed).toBe(analytics);
    expect(auth.isOwner).toBe(isOwner);
    expect(auth.isClient).toBe(isClient);
  });

  test("nobody logged in: no permissions at all", () => {
    const auth = reloadPage();
    expect([auth.isAuthenticated, auth.isShopAdmin, auth.isAnalyticsAllowed, auth.isOwner, auth.isClient]).toEqual([
      false, false, false, false, false,
    ]);
  });

  test("a client login knows which client it is, whichever way the server names it", () => {
    saveLogin({ role: "client", clientId: "c1" });
    expect(reloadPage().clientId).toBe("c1");
    saveLogin({ role: "client", client_id: "c2" });
    expect(reloadPage().clientId).toBe("c2");
  });
});

describe("S4 damaged saved data", () => {
  test.each(["user", "originalUser"])("an unreadable saved %s means logged out, not a crash", (key) => {
    localStorage.setItem("token", "abc");
    localStorage.setItem("originalToken", "owner-token");
    localStorage.setItem(key, "{not json");
    expect(() => reloadPage()).not.toThrow();
    expect(reloadPage().isAuthenticated).toBe(false);
  });
});

describe("S5 the owner viewing a shop", () => {
  test("viewing a shop acts as that shop's user", () => {
    saveLogin(owner, "owner-token");
    const auth = reloadPage();
    auth.startImpersonation("shop-token", admin);
    expect(auth.isImpersonating).toBe(true);
    expect(auth.token).toBe("shop-token");
    expect(auth.isOwner).toBe(false);
    expect(auth.isShopAdmin).toBe(true);
  });

  test("leaving restores the owner exactly, also after a reload in between", () => {
    saveLogin(owner, "owner-token");
    reloadPage().startImpersonation("shop-token", admin);
    const auth = reloadPage();
    expect(auth.isImpersonating).toBe(true);
    auth.exitImpersonation();

    const afterExit = reloadPage();
    expect(afterExit.isImpersonating).toBe(false);
    expect(afterExit.token).toBe("owner-token");
    expect(afterExit.user).toEqual(owner);
    expect(localStorage.getItem("originalToken")).toBeNull();
  });

  test("switching to a second shop still returns to the owner, not the first shop", () => {
    saveLogin(owner, "owner-token");
    const auth = reloadPage();
    auth.startImpersonation("shop-1", admin);
    auth.startImpersonation("shop-2", { ...admin, shop_id: "s2" });
    auth.exitImpersonation();
    expect(auth.token).toBe("owner-token");
    expect(auth.isOwner).toBe(true);
  });

  test("leaving when not viewing a shop changes nothing", () => {
    saveLogin(admin, "abc");
    const auth = reloadPage();
    auth.exitImpersonation();
    expect(auth.token).toBe("abc");
    expect(auth.user).toEqual(admin);
  });
});

describe("S6 logging out while viewing a shop", () => {
  test("only leaves the shop: the owner stays logged in, also after a reload", () => {
    saveLogin(owner, "owner-token");
    const auth = reloadPage();
    auth.startImpersonation("shop-token", admin);
    auth.logout();

    expect(auth.isAuthenticated).toBe(true);
    expect(auth.isOwner).toBe(true);
    expect(auth.isImpersonating).toBe(false);
    const afterReload = reloadPage();
    expect(afterReload.token).toBe("owner-token");
    expect(afterReload.user).toEqual(owner);
  });
});

describe("S7 a normal logout", () => {
  test("removes everything saved, and a reload stays logged out", () => {
    saveLogin(admin, "abc");
    const auth = reloadPage();
    auth.logout();
    expect(auth.isAuthenticated).toBe(false);
    expect(auth.user).toBeNull();
    expect(["token", "user", "originalToken", "originalUser"].map((k) => localStorage.getItem(k))).toEqual([
      null, null, null, null,
    ]);
    expect(reloadPage().isAuthenticated).toBe(false);
  });
});
