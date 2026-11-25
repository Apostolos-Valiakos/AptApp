// The service form in tabs: one part at a time, all saved together; the
// required fields' tab is marked when they're missing. SF1.
import { describe, expect, test } from "vitest";
import ServicesView from "../../client/src/views/ServicesView.vue";
import el from "../../client/src/i18n/locales/el";
import { fakeServer, mountScreen, saveLogin, settle } from "./helpers";

const byTestId = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const shown = (id: string) => byTestId(id)!.style.display !== "none";
const service = { id: "s1", name: "PURE MASSAGE", category: "Hot", price: 29, duration_minutes: 60, is_active: true, bonus_fixed: "2.20" };

const open = async () => {
  saveLogin({ id: "u1", role: "admin", shop_id: "s1" });
  const server = fakeServer({
    "GET /api/v1/services": { body: [service] },
    "GET /api/v1/staff": { body: [] },
    "PUT /api/v1/services/s1": { body: { success: true } },
  });
  mountScreen(ServicesView);
  await settle();
  [...document.querySelectorAll<HTMLElement>(`button[title="${el.common.edit}"]`)][0].click();
  await settle();
  return server;
};

describe("SF1 the service form in tabs", () => {
  test("opens on the basics; each tab shows its own part", async () => {
    await open();
    expect(shown("service-tab-panel-basic")).toBe(true);
    expect(shown("service-tab-panel-bonus")).toBe(false);
    byTestId("service-tab-bonus")!.click();
    await settle();
    expect(shown("service-tab-panel-bonus")).toBe(true);
    expect(shown("service-tab-panel-basic")).toBe(false);
    expect(byTestId("service-tab-panel-bonus")!.querySelector('[data-testid="service-bonus-fixed"]')).not.toBeNull();
  });

  test("Save from another tab sends everything, the other tabs' fields too", async () => {
    const server = await open();
    byTestId("service-tab-staff")!.click();
    await settle();
    [...document.querySelectorAll<HTMLElement>(".p-dialog-footer button")].find((b) => b.textContent?.includes(el.common.save))!.click();
    await settle();
    const body = server.called("PUT", "/api/v1/services/s1")[0]?.body;
    expect([body?.name, body?.price, body?.bonus_fixed]).toEqual(["PURE MASSAGE", 29, 2.2]);
  });

  test("a missing name sends you back to the basics, marked", async () => {
    const server = await open();
    const name = byTestId("service-tab-panel-basic")!.querySelector<HTMLInputElement>("input")!;
    name.value = "";
    name.dispatchEvent(new Event("input"));
    byTestId("service-tab-bonus")!.click();
    await settle();
    [...document.querySelectorAll<HTMLElement>(".p-dialog-footer button")].find((b) => b.textContent?.includes(el.common.save))!.click();
    await settle();
    expect(server.called("PUT", "/api/v1/services/s1")).toHaveLength(0);
    expect(shown("service-tab-panel-basic")).toBe(true);
    expect(byTestId("service-tab-basic")!.querySelector(".bg-red-500")).not.toBeNull();
  });
});
