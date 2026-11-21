// Two controls now built from the app's PrimeVue components like the rest:
// the discount page's list of bookings with a discount, and the calendar's
// "My schedule" view choice for staff. PC1–PC2.
import { describe, expect, test } from "vitest";
import DiscountCodesAdmin from "../../client/src/components/DiscountCodesAdmin.vue";
import ColorModelToggle from "../../client/src/components/ColorModelToggle.vue";
import { useSettingsStore } from "../../client/src/stores/settings";
import el from "../../client/src/i18n/locales/el";
import { fakeServer, mountScreen, pageText, saveLogin, settle } from "./helpers";

describe("PC1 bookings with a discount", () => {
  const open = async (usage: any[]) => {
    saveLogin({ id: "u1", role: "admin", shop_id: "s1" });
    fakeServer({ "GET /api/v1/discount-codes": { body: [] }, "GET /api/v1/discounts/usage": { body: usage } });
    mountScreen(DiscountCodesAdmin);
    await settle();
  };

  test("one row per booking: date, client, the discount and its amount", async () => {
    await open([
      { id: "u1", start_time: "2026-11-10T10:00:00", first_name: "MARIA", last_name: "PAPA", discount_type: "code", discount_code_name: "FRIENDS", discount_value: 10, discount_amount: 4 },
      { id: "u2", start_time: "2026-11-11T12:00:00", first_name: null, last_name: null, discount_type: "fixed", discount_value: 5, discount_amount: 5 },
    ]);
    const table = document.querySelector('[data-testid="discount-usage"]')!;
    const headers = [...table.querySelectorAll("th")].map((th) => th.textContent!.trim());
    expect(headers).toEqual([el.discount.admin.date, el.discount.admin.client, el.discount.admin.type, el.discount.admin.amount]);
    const rows = [...table.querySelectorAll("tbody tr")].map((tr) => [...tr.querySelectorAll("td")].map((td) => td.textContent!.replace(/\s+/g, " ").trim()));
    expect(rows).toHaveLength(2);
    expect(rows[0][1]).toBe("MARIA PAPA");
    expect(rows[0][2]).toBe("FRIENDS (10%)");
    expect(rows[0][3]).toContain("4,00");
    expect(rows[1][1]).toBe("—");
    expect(rows[1][2]).toContain("5,00");
  });

  test("none yet: says so, with no table", async () => {
    await open([]);
    expect(pageText()).toContain(el.discount.admin.usageEmpty);
    expect(document.querySelector('[data-testid="discount-usage"]')).toBeNull();
  });
});

describe("PC2 a staff member's view of the calendar", () => {
  test("labelled in the app's language, showing \"My schedule\"", async () => {
    saveLogin({ id: "u1", role: "staff", shop_id: "s1", staff_id: "st1" });
    fakeServer();
    useSettingsStore().setResourceFilter("me");
    mountScreen(ColorModelToggle);
    await settle();
    expect(pageText()).toContain(`${el.scheduler.view.label}:`);
    expect(document.querySelector('[data-testid="resource-filter"]')!.textContent).toContain(el.scheduler.mySchedule);
  });
});
