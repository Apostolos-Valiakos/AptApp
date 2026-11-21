// A new client's phone that another client already has: the new client
// dialogs (the booking's "+" and the clients page) show who has it, with
// "Use this client" first; a new client then takes a deliberate "create
// anyway". Typed or pasted, written any way. CPS1–CPS6.
import { describe, expect, test, vi } from "vitest";
import { defineComponent, h } from "vue";
import ClientSelector from "../../client/src/components/ClientSelector.vue";
import ClientsView from "../../client/src/views/ClientsView.vue";
import { cacheClients } from "../../client/src/offline/localData";
import el from "../../client/src/i18n/locales/el";
import { fakeServer, mountScreen, pageText, saveLogin, settle } from "./helpers";

const maria = { id: "c1", first_name: "MARIA", last_name: "PAPA", full_name: "MARIA PAPA", phone: "+30 690 000 1234" };
const created = { success: true, client: { id: "c9", first_name: "ELENI", last_name: "PAPA", phone: "6900001234" } };

const type = async (testid: string, value: string) => {
  const input = document.querySelector<HTMLInputElement>(`[data-testid="${testid}"]`)!;
  input.value = value;
  input.dispatchEvent(new Event("input"));
  await settle();
};
const typing = async (testid: string, value: string) => {
  // Key by key: looked up once typing stops for a moment.
  for (let i = 1; i <= value.length; i++) await type(testid, value.slice(0, i));
  await new Promise((r) => setTimeout(r, 350));
  await settle();
};
const press = async (testid: string) => {
  document.querySelector<HTMLElement>(`[data-testid="${testid}"]`)!.click();
  await settle();
};

const openPicker = async (routes: Record<string, any> = {}) => {
  saveLogin({ id: "u1", role: "frontdesk", shop_id: "s1" });
  const server = fakeServer({
    "GET /api/v1/clients/by-phone": (url: string) => ({ body: decodeURIComponent(url).replace(/\D/g, "").endsWith("6900001234") ? [maria] : [] }),
    "POST /api/v1/clients": { body: created },
    ...routes,
  });
  const picked = vi.fn();
  mountScreen(defineComponent({ render: () => h(ClientSelector, { onSelect: picked }) }));
  await settle();
  await press("client-new");
  await type("client-new-first", "Eleni");
  await type("client-new-last", "Papa");
  return { server, picked };
};

describe("CPS1 a phone another client has", () => {
  test("pasted: who has it is shown at once", async () => {
    const { server } = await openPicker();
    await type("client-new-phone", "+30 690 000 1234");
    await new Promise((r) => setTimeout(r, 20));
    await settle();
    expect(document.querySelector('[data-testid="phone-matches"]')?.textContent).toContain("MARIA PAPA");
    expect(server.called("GET", "/api/v1/clients/by-phone")).toHaveLength(1);
  });

  test("typed: looked up once it is a whole number, however it's written", async () => {
    const { server } = await openPicker();
    await typing("client-new-phone", "690 000 1234");
    expect(pageText()).toContain(el.clients.phoneMatch.title);
    expect(server.called("GET", "/api/v1/clients/by-phone")).toHaveLength(1);
  });
});

describe("CPS2 choosing", () => {
  test("'Use this client' picks them, and no client is created", async () => {
    const { server, picked } = await openPicker();
    await typing("client-new-phone", "6900001234");
    await press("phone-match-use");
    expect(picked).toHaveBeenCalledWith(expect.objectContaining({ id: "c1", full_name: "MARIA PAPA" }));
    expect(server.called("POST", "/api/v1/clients")).toHaveLength(0);
  });

  test("a new client takes 'create anyway', and says so to the server", async () => {
    const { server, picked } = await openPicker();
    await typing("client-new-phone", "6900001234");
    const save = document.querySelector('[data-testid="client-new-save"]')!;
    expect(save.textContent).toContain(el.clients.phoneMatch.createAnyway);
    await press("client-new-save");
    expect(server.called("POST", "/api/v1/clients")[0].body).toEqual(expect.objectContaining({ phone: "6900001234", allow_same_phone: true }));
    expect(picked).toHaveBeenCalledWith(expect.objectContaining({ id: "c9" }));
  });

  test("a phone nobody has: saved as before", async () => {
    const { server } = await openPicker();
    await typing("client-new-phone", "6900005555");
    expect(document.querySelector('[data-testid="phone-matches"]')).toBeNull();
    expect(document.querySelector('[data-testid="client-new-save"]')!.textContent).toContain(el.booking.quickAdd.saveClient);
    await press("client-new-save");
    expect(server.called("POST", "/api/v1/clients")[0].body.allow_same_phone).toBe(false);
  });
});

describe("CPS3 the server finds the phone as it saves", () => {
  test("who has it is shown, and the dialog stays open", async () => {
    const { picked } = await openPicker({
      "GET /api/v1/clients/by-phone": { body: [] },
      "POST /api/v1/clients": { status: 409, body: { error: "phone_exists", matches: [maria] } },
    });
    await typing("client-new-phone", "6900001234");
    await press("client-new-save");
    expect(document.querySelector('[data-testid="phone-matches"]')?.textContent).toContain("MARIA PAPA");
    expect(picked).not.toHaveBeenCalled();
  });
});

describe("CPS4 offline", () => {
  test("no connection: the clients kept on this device are checked", async () => {
    await cacheClients([maria]);
    await openPicker({ "GET /api/v1/clients/by-phone": "network-down" });
    await typing("client-new-phone", "0030 6900001234");
    expect(document.querySelector('[data-testid="phone-matches"]')?.textContent).toContain("MARIA PAPA");
  });
});

describe("CPS5 the clients page's new client", () => {
  const openPage = async () => {
    saveLogin({ id: "u1", role: "admin", shop_id: "s1" });
    const server = fakeServer({
      "GET /api/v1/clients": { body: { clients: [], total: 0 } },
      "GET /api/v1/clients/by-phone": { body: [maria] },
      "GET /api/v1/clients/c1/full": { body: { client: maria, history: [], files: [] } },
      "POST /api/v1/clients": { body: created },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    mountScreen(ClientsView);
    await settle();
    return server;
  };

  test("'Use this client' opens their card instead of creating one", async () => {
    const server = await openPage();
    await press("clients-new");
    await typing("new-client-phone", "6900001234");
    await press("phone-match-use");
    expect(server.called("GET", "/api/v1/clients/c1/full")).toHaveLength(1);
    expect(server.called("POST", "/api/v1/clients")).toHaveLength(0);
  });
});
