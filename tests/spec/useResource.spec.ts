// The admin pages' shared loading and saving (code review proposal 2): a
// list kept as it was when the server refuses, a change followed by a
// reload, and a failure shown with the page's own message. AR1–AR3.
import { describe, expect, test } from "vitest";
import { defineComponent, h } from "vue";
import { useAdminActions, useResource } from "../../client/src/composables/useResource";
import { errorToasts, fakeServer, mountScreen, pageText, saveLogin, settle } from "./helpers";

const mountWith = <T,>(setup: () => T) => {
  let exposed!: T;
  mountScreen(defineComponent({ setup: () => ((exposed = setup()), () => h("div")) }));
  return () => exposed;
};

describe("AR1 a list from one address", () => {
  test("loads it, and says when it is loading", async () => {
    saveLogin({ id: "u1", role: "admin", shop_id: "s1" });
    fakeServer({ "GET /api/v1/gift-cards": { body: [{ id: 1 }] } });
    const get = mountWith(() => useResource<any[]>("/api/v1/gift-cards"));
    expect(get().loading.value).toBe(true);
    await get().reload();
    expect(get().items.value).toEqual([{ id: 1 }]);
    expect(get().loading.value).toBe(false);
  });

  test("keeps what it had when the server refuses", async () => {
    saveLogin({ id: "u1", role: "admin", shop_id: "s1" });
    const server = fakeServer({ "GET /api/v1/contests": { body: [{ id: 1 }] } });
    const get = mountWith(() => useResource<any[]>("/api/v1/contests", [], { loadsLater: true }));
    expect(get().loading.value).toBe(false);
    await get().reload();
    server.routes["GET /api/v1/contests"] = { status: 403, body: { error: "Forbidden" } };
    await get().reload();
    expect(get().items.value).toEqual([{ id: 1 }]);
  });
});

describe("AR2 a change on an admin page", () => {
  test("is followed by a reload of the page", async () => {
    saveLogin({ id: "u1", role: "admin", shop_id: "s1" });
    const server = fakeServer({ "POST /api/v1/package-types": { body: { id: 7 } } });
    let reloads = 0;
    const get = mountWith(() => useAdminActions(() => "Could not save", () => reloads++));
    const ok = await get().run(() => get().call("/api/v1/package-types", "POST", { name: "Five" }));
    expect(ok).toBe(true);
    expect(server.called("POST", "/api/v1/package-types")[0].body).toEqual({ name: "Five" });
    expect(reloads).toBe(1);
  });
});

describe("AR3 a refused change", () => {
  test("shows the server's reason, else the page's message, and doesn't reload", async () => {
    saveLogin({ id: "u1", role: "admin", shop_id: "s1" });
    fakeServer({
      "DELETE /api/v1/discount-codes/1": { status: 409, body: { error: "In use" } },
      "DELETE /api/v1/discount-codes/2": { status: 500, body: {} },
    });
    let reloads = 0;
    const get = mountWith(() => useAdminActions(() => "Could not save", () => reloads++));
    expect(await get().run(() => get().call("/api/v1/discount-codes/1", "DELETE"))).toBe(false);
    expect(await get().run(() => get().call("/api/v1/discount-codes/2", "DELETE"))).toBe(false);
    await settle();
    expect(errorToasts()).toBe(2);
    expect(pageText()).toContain("In use");
    expect(pageText()).toContain("Could not save");
    expect(reloads).toBe(0);
  });

  test("an empty answer counts as done", async () => {
    saveLogin({ id: "u1", role: "admin", shop_id: "s1" });
    fakeServer({ "PUT /api/v1/expenses/1": { body: null } });
    const get = mountWith(() => useAdminActions(() => "x", () => {}));
    await expect(get().call("/api/v1/expenses/1", "PUT", { amount: 1 })).resolves.toEqual({});
  });
});
