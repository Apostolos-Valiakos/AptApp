// A deliberate logout, and whose offline changes are whose: real queue and real
// browser storage. B12, B13 and U5 in test-report.html.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { defineComponent, h } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { useAuthStore } from "../../client/src/stores/auth";
import { useLogout } from "../../client/src/composables/useLogout";
import {
  clearOfflineData,
  fetchOrQueue,
  flushQueue,
  initOfflineSync,
  pendingWrites,
} from "../../client/src/offline/queue";
import { blankRouter, fakeServer, mountScreen, saveLogin, setBrowserOnline, settle } from "./helpers";

const WRITE = "/api/v1/appointments/a1";
const queueChange = () => fetchOrQueue(WRITE, "PUT", { notes: "x" }, { kind: "appointment", label: "x" });

const openWithLogout = async () => {
  let logout!: ReturnType<typeof useLogout>;
  const router = blankRouter();
  await router.push("/app/scheduler");
  mountScreen(
    defineComponent({
      setup() {
        logout = useLogout();
        return () => h("div");
      },
    }),
    { router },
  );
  return { logout, router };
};

beforeEach(async () => {
  fakeServer({ "GET /health": { body: {} } });
  await initOfflineSync();
  window.dispatchEvent(new Event("online"));
  await settle();
  await clearOfflineData();
  saveLogin({ id: "u1", role: "admin", shop_id: "s1" });
  setActivePinia(createPinia());
});

describe("B12 logging out with changes waiting", () => {
  test("nothing waiting: logs out without asking, and goes to the home page", async () => {
    const ask = vi.spyOn(window, "confirm");
    const { logout, router } = await openWithLogout();
    await expect(logout()).resolves.toBe(true);
    await settle();
    expect(ask).not.toHaveBeenCalled();
    expect(useAuthStore().isAuthenticated).toBe(false);
    expect(router.currentRoute.value.path).toBe("/");
  });

  test("changes are sent first when the connection is back, then logs out without asking", async () => {
    const online = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    await queueChange();
    online.mockReturnValue(true);
    const server = fakeServer({ "GET /health": { body: {} }, [`PUT ${WRITE}`]: { body: { id: "a1" } } });
    const ask = vi.spyOn(window, "confirm");

    const { logout } = await openWithLogout();
    await logout();
    expect(server.called("PUT", WRITE)).toHaveLength(1);
    expect(server.called("PUT", WRITE)[0].token).toBe("token-admin");
    expect(ask).not.toHaveBeenCalled();
    expect(useAuthStore().isAuthenticated).toBe(false);
  });

  test("changes that can't be sent: choosing to stay keeps the login and the changes", async () => {
    setBrowserOnline(false);
    await queueChange();
    fakeServer({ "GET /health": "network-down" });
    vi.spyOn(window, "confirm").mockReturnValue(false);

    const { logout, router } = await openWithLogout();
    await expect(logout()).resolves.toBe(false);
    expect(useAuthStore().isAuthenticated).toBe(true);
    expect(pendingWrites.value).toHaveLength(1);
    expect(router.currentRoute.value.path).toBe("/app/scheduler");
  });

  test("changes that can't be sent: choosing to leave deletes them and logs out", async () => {
    setBrowserOnline(false);
    await queueChange();
    fakeServer({ "GET /health": "network-down" });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    const { logout } = await openWithLogout();
    await expect(logout()).resolves.toBe(true);
    expect(useAuthStore().isAuthenticated).toBe(false);
    expect(pendingWrites.value).toEqual([]);
  });
});

describe("B13 logging out with no connection", () => {
  test("goes to the login page, because the home page can't load", async () => {
    setBrowserOnline(false);
    await queueChange();
    fakeServer({ "GET /health": "network-down" });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    const { logout, router } = await openWithLogout();
    await logout();
    await settle();
    expect(router.currentRoute.value.path).toBe("/login");
  });
});

describe("S6 logging out from the menu while viewing a shop", () => {
  test("returns to the owner's session", async () => {
    saveLogin({ id: "o1", role: "owner" }, "owner-token");
    setActivePinia(createPinia());
    useAuthStore().startImpersonation("shop-token", { id: "u1", role: "admin", shop_id: "s1" });
    const { logout } = await openWithLogout();
    await logout();
    const auth = useAuthStore();
    expect(auth.isOwner).toBe(true);
    expect(auth.token).toBe("owner-token");
  });

  test("and lands on the platform shops page, not the home page", async () => {
    saveLogin({ id: "o1", role: "owner" }, "owner-token");
    setActivePinia(createPinia());
    useAuthStore().startImpersonation("shop-token", { id: "u1", role: "admin", shop_id: "s1" });
    const { logout, router } = await openWithLogout();
    await logout();
    await settle();
    expect(router.currentRoute.value.path).toBe("/app/platform/shops");
  });
});

describe("U5 unsynced changes belong to the user who made them", () => {
  const maria = { id: "u-maria", role: "admin", shop_id: "s1" };
  const eleni = { id: "u-eleni", role: "admin", shop_id: "s1" };

  /** Maria makes a change offline, her session expires, and the connection returns. */
  const mariaLeavesAChange = async () => {
    saveLogin(maria, "maria-token");
    setActivePinia(createPinia());
    const online = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    await queueChange();
    useAuthStore().logout(); // as an expired session does: offline data is kept
    online.mockReturnValue(true);
  };
  // A login starts syncing in the background, and flushQueue returns at once
  // while that runs: wait for it, then sync again so nothing is left to chance.
  const syncFinished = async () => {
    await new Promise((r) => setTimeout(r, 150));
    await flushQueue();
    await new Promise((r) => setTimeout(r, 150));
  };
  const serverAccepting = () =>
    fakeServer({
      "GET /health": { body: {} },
      [`PUT ${WRITE}`]: { body: { id: "a1" } },
      "POST /api/v1/login": (_url, init) => {
        const { username } = JSON.parse(String(init.body));
        return { body: { token: `${username}-token`, user: username === "maria" ? maria : eleni } };
      },
    });

  test("another user of the same shop neither sees nor sends them", async () => {
    await mariaLeavesAChange();
    const server = serverAccepting();
    await useAuthStore().login("eleni", "pw");
    await syncFinished();
    expect(pendingWrites.value).toEqual([]);
    expect(server.called("PUT", WRITE)).toEqual([]);
  });

  test("the user who made them can still send them after logging back in", async () => {
    await mariaLeavesAChange();
    const server = serverAccepting();
    await useAuthStore().login("maria", "pw");
    await syncFinished();
    expect(server.called("PUT", WRITE).map((c) => c.token)).toEqual(["maria-token"]);
  });

  test("another user's deliberate logout doesn't delete them", async () => {
    await mariaLeavesAChange();
    const server = serverAccepting();
    const auth = useAuthStore();
    await auth.login("eleni", "pw");
    await syncFinished();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { logout } = await openWithLogout();
    await logout();
    await settle();
    await auth.login("maria", "pw");
    await syncFinished();
    expect(server.called("PUT", WRITE).map((c) => c.token)).toEqual(["maria-token"]);
  });

  test("they survive another user's visit, for the original user to send later", async () => {
    await mariaLeavesAChange();
    const server = serverAccepting();
    const auth = useAuthStore();
    await auth.login("eleni", "pw");
    await syncFinished();
    auth.logout();
    await auth.login("maria", "pw");
    await syncFinished();
    expect(server.called("PUT", WRITE).map((c) => c.token)).toEqual(["maria-token"]);
  });
});
