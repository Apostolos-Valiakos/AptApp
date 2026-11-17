// The Bonus report and each staff member's bonus rule: the report lists each
// staff member's bonus for the dates, and opened, each day and the services
// that earned it; admins set the rule in the staff form, from a date on.
// a product's seller earns commission on it. redemptions count as the service they stand for. BN1–BN9.
import { describe, expect, test } from "vitest";
import { defineComponent, h, ref } from "vue";
import BookingProducts from "../../client/src/components/booking/bookingProducts.vue";
import { useCalendarStore } from "../../client/src/stores/calendar";
import BonusReportView from "../../client/src/views/BonusReportView.vue";
import StaffView from "../../client/src/views/StaffView.vue";
import ServicesView from "../../client/src/views/ServicesView.vue";
import el from "../../client/src/i18n/locales/el";
import { answerConfirm, fakeServer, mountScreen, pageText, saveLogin, settle } from "./helpers";

const byTestId = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const report = {
  from: "2026-11-01",
  to: "2026-11-30",
  total: 10,
  staff: [
    {
      staff_id: "anna",
      staff_name: "ΑΝΝΑ",
      days_worked: 2,
      minutes: 690,
      extra_minutes: 90,
      hours_bonus: 7.5,
      products_bonus: 0,
      bonus: 7.5,
      products: [],
      days: [
        {
          date: "2026-11-10",
          kind: "percent",
          amount_per_hour: 0,
          threshold_minutes: 300,
          percent: 10,
          minutes: 330,
          extra_minutes: 30,
          bonus: 1.5,
          services: [{ id: 1, start_time: "2026-11-10T13:00:00+02:00", minutes: 60, extra_minutes: 30, price: 30, bonus: 1.5, service_name: "Μασάζ", client_name: "MARIA PAPA" }],
        },
        { date: "2026-11-11", kind: "per_hour", amount_per_hour: 6, threshold_minutes: 300, percent: 10, minutes: 360, extra_minutes: 60, bonus: 6, services: [] },
      ],
    },
    {
      staff_id: "eleni", staff_name: "ΕΛΕΝΗ", days_worked: 0, minutes: 0, extra_minutes: 0, hours_bonus: 0, products_bonus: 2.5, bonus: 2.5, days: [],
      products: [{ id: "ps1", day: "2026-11-12", quantity: 2, total_price: 25, product_name: "Λάδι μασάζ", client_name: null, percent: 10, bonus: 2.5 }],
    },
  ],
};

describe("BN1 the report lists each staff member's bonus for the dates", () => {
  test("hours, the hours past the threshold and the bonus, with the total; this month by default", async () => {
    saveLogin({ id: "u1", role: "admin", shop_id: "s1" });
    const server = fakeServer({ "GET /api/v1/reports/bonus": { body: report } });
    mountScreen(BonusReportView);
    await settle();
    const url = server.called("GET", "/api/v1/reports/bonus")[0].url;
    const now = new Date();
    const first = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    expect(url).toContain(`from=${first}`);
    const table = byTestId("bonus-table")!.textContent!;
    expect(table).toContain("ΑΝΝΑ");
    expect(table).toContain("11,5"); // 690 minutes
    expect(table).toContain("1,5"); // 90 minutes past
    expect(table).toContain("7,50");
    expect(byTestId("bonus-total")!.textContent).toContain("10,00");
    // ΕΛΕΝΗ earned only from products: still listed.
    expect(table).toContain("ΕΛΕΝΗ");
    expect(table).toContain("2,50");
  });

  test("nothing to show: says so", async () => {
    saveLogin({ id: "u1", role: "admin", shop_id: "s1" });
    fakeServer({ "GET /api/v1/reports/bonus": { body: { ...report, staff: [], total: 0 } } });
    mountScreen(BonusReportView);
    await settle();
    expect(pageText()).toContain(el.bonus.empty);
  });
});

describe("BN2 opening a staff member shows each day and the services that earned the bonus", () => {
  test("the day's hours, its rule, and each service's part past the threshold", async () => {
    saveLogin({ id: "u1", role: "admin", shop_id: "s1" });
    fakeServer({ "GET /api/v1/reports/bonus": { body: report } });
    mountScreen(BonusReportView);
    await settle();
    (document.querySelector('[data-testid="bonus-table"] .p-datatable-row-toggle-button') as HTMLElement).click();
    await settle();
    const days = byTestId("bonus-days-anna")!.textContent!;
    expect(document.querySelectorAll('[data-testid="bonus-day"]')).toHaveLength(2);
    expect(days).toContain("Μασάζ");
    expect(days).toContain("MARIA PAPA");
    expect(days).toContain("30′");
    expect(days).toContain("10%");
    expect(days).toContain("6,00");
    expect(days).toContain("6 €/ώρα"); // the second day's rule pays per hour
  });
});

const staffMember = { id: "st1", name: "ΑΝΝΑ ΠΑΠΑ", capacity: 1, service_ids: [], visible_in_calendar: true, is_active: true };
const openStaffForm = async (role: "admin" | "frontdesk", routes: Record<string, any> = {}) => {
  saveLogin({ id: "u1", role, shop_id: "s1" });
  const server = fakeServer({
    "GET /api/v1/staff": { body: [staffMember] },
    "GET /api/v1/services": { body: [] },
    "GET /api/v1/staff/st1/bonus-rules": { body: { rules: [], current: { enabled: true, kind: "percent", threshold_minutes: 300, percent: 10, amount_per_hour: 0 }, today: "2026-11-17" } },
    "GET /api/v1/staff/st1/product-commission-rules": { body: { rules: [], current: { enabled: false, percent: 0 }, today: "2026-11-17" } },
    "GET /api/v1/staff/st1/target-rules": { body: { rules: [], current: { enabled: false, steps: [] }, today: "2026-11-17" } },
    "GET /api/v1/staff/st1/review-rules": { body: { rules: [], current: { enabled: false, amount_per_review: 0 }, today: "2026-11-17" } },
    ...routes,
  });
  mountScreen(StaffView);
  await settle();
  (document.querySelector(`[aria-label="${el.staff.tooltips.edit}"]`) as HTMLElement).click();
  await settle();
  return server;
};

describe("BN3 who sets the bonus rule", () => {
  test("admins see it in the staff form, with today's rule", async () => {
    await openStaffForm("admin");
    expect(byTestId("staff-bonus")).not.toBeNull();
    expect(byTestId("bonus-current")!.textContent).toContain("5");
    expect(byTestId("bonus-current")!.textContent).toContain("10%");
  });

  test("frontdesk doesn't, and nothing about it is fetched", async () => {
    const server = await openStaffForm("frontdesk");
    expect(byTestId("staff-bonus")).toBeNull();
    expect(server.called("GET", "/api/v1/staff/st1/bonus-rules")).toHaveLength(0);
  });
});

// Rules are added with "+" and saved by the staff form's one Save.
const setNumber = async (id: string, value: string) => {
  const input = byTestId(id)!.querySelector("input") as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event("input"));
  input.dispatchEvent(new Event("blur"));
  await settle();
};
const press = async (id: string) => {
  byTestId(id)!.click();
  await settle();
};
const footerButton = (label: string) =>
  [...document.querySelectorAll<HTMLElement>(".p-dialog-footer button")].find((b) => b.textContent?.includes(label))!;
const saveStaffForm = async () => {
  footerButton(el.common.save).click();
  await settle();
};
const ruleSaves = { "PUT /api/v1/staff/st1": { body: { success: true } }, "POST /api/v1/staff/st1/bonus-rules": { status: 201, body: { rules: [] } } };

describe("BN4 changing the rule from a date", () => {
  test("hours are sent as minutes, with the date it applies from, when the staff form is saved", async () => {
    const server = await openStaffForm("admin", ruleSaves);
    await setNumber("bonus-hours", "4,5");
    await setNumber("bonus-percent", "12");
    await press("bonus-add");
    expect(server.called("POST", "/api/v1/staff/st1/bonus-rules")).toHaveLength(0);
    expect(byTestId("bonus-rule")!.dataset.pending).toBe("true");
    expect(byTestId("bonus-rule-unsaved")).not.toBeNull();
    await saveStaffForm();
    const body = server.called("POST", "/api/v1/staff/st1/bonus-rules")[0]?.body;
    expect(body).toMatchObject({ enabled: true, threshold_minutes: 270, percent: 12 });
    expect(body.effective_from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(document.querySelector(".p-dialog")).toBeNull();
  });

  test("there's one Save: no save button per rule", async () => {
    await openStaffForm("admin");
    const labels = [...document.querySelectorAll<HTMLElement>(".p-dialog button")].map((b) => b.textContent?.trim());
    expect(labels.filter((l) => l === el.common.save)).toHaveLength(1);
    expect(byTestId("bonus-add")).not.toBeNull();
    expect(byTestId("commission-add")).not.toBeNull();
  });

  test("a rule added twice for the same date is sent once, the last one", async () => {
    const server = await openStaffForm("admin", ruleSaves);
    await press("bonus-add");
    await setNumber("bonus-percent", "15");
    await press("bonus-add");
    expect(document.querySelectorAll('[data-testid="bonus-rule"]')).toHaveLength(1);
    await saveStaffForm();
    const posts = server.called("POST", "/api/v1/staff/st1/bonus-rules");
    expect(posts).toHaveLength(1);
    expect(posts[0].body.percent).toBe(15);
  });

  test("Cancel sends nothing", async () => {
    const server = await openStaffForm("admin", ruleSaves);
    await press("bonus-add");
    footerButton(el.common.cancel).click();
    await settle();
    expect(server.called("POST", "/api/v1/staff/st1/bonus-rules")).toHaveLength(0);
  });

  test("an earlier rule taken off the list is deleted when the form is saved", async () => {
    const server = await openStaffForm("admin", {
      "PUT /api/v1/staff/st1": { body: { success: true } },
      "GET /api/v1/staff/st1/bonus-rules": {
        body: { rules: [{ id: "r1", effective_from: "2026-11-01", enabled: false, threshold_minutes: 300, percent: 10 }], current: { enabled: false, threshold_minutes: 300, percent: 10 }, today: "2026-11-17" },
      },
      "DELETE /api/v1/staff/st1/bonus-rules/r1": { body: { rules: [] } },
    });
    expect(byTestId("bonus-rule")!.textContent).toContain(el.bonus.rules.off);
    (byTestId("bonus-rule")!.querySelector("button") as HTMLElement).click();
    await settle();
    expect(byTestId("bonus-rule")).toBeNull();
    expect(server.called("DELETE", "/api/v1/staff/st1/bonus-rules/r1")).toHaveLength(0);
    await saveStaffForm();
    expect(server.called("DELETE", "/api/v1/staff/st1/bonus-rules/r1")).toHaveLength(1);
  });

  test("a rule that fails to save keeps the dialog open, and Save again sends only what's left", async () => {
    let fail = true;
    const server = await openStaffForm("admin", {
      "PUT /api/v1/staff/st1": { body: { success: true } },
      "POST /api/v1/staff/st1/bonus-rules": { status: 201, body: { rules: [] } },
      "POST /api/v1/staff/st1/product-commission-rules": () => (fail ? { status: 500, body: { error: "x" } } : { status: 201, body: { rules: [] } }),
    });
    await press("bonus-add");
    await press("commission-add");
    await saveStaffForm();
    expect(document.querySelector(".p-dialog")).not.toBeNull();
    expect(pageText()).toContain(el.bonus.rules.saveFailed);
    fail = false;
    await saveStaffForm();
    expect(server.called("POST", "/api/v1/staff/st1/bonus-rules")).toHaveLength(1);
    expect(server.called("POST", "/api/v1/staff/st1/product-commission-rules")).toHaveLength(2);
    expect(document.querySelector(".p-dialog")).toBeNull();
  });

  test("a new staff member gets the rules added before their first save", async () => {
    saveLogin({ id: "u1", role: "admin", shop_id: "s1" });
    const server = fakeServer({
      "GET /api/v1/staff": { body: [] },
      "GET /api/v1/services": { body: [] },
      "POST /api/v1/staff": { body: { success: true, id: "new1" } },
      "POST /api/v1/staff/new1/product-commission-rules": { status: 201, body: { rules: [] } },
    });
    mountScreen(StaffView);
    await settle();
    [...document.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent?.includes(el.staff.addNew))!.click();
    await settle();
    expect(server.calls.filter((c) => c.path.includes("rules"))).toHaveLength(0);
    (byTestId("commission-enabled")!.querySelector("input") as HTMLInputElement).click();
    await settle();
    await press("commission-add");
    await saveStaffForm();
    expect(server.called("POST", "/api/v1/staff")).toHaveLength(1);
    expect(server.called("POST", "/api/v1/staff/new1/product-commission-rules")[0]?.body).toMatchObject({ enabled: true, percent: 10 });
    expect(server.called("POST", "/api/v1/staff/new1/bonus-rules")).toHaveLength(0);
  });

  test("a new staff member whose rule fails: Save again updates them (not a second one) and still sends the rule", async () => {
    saveLogin({ id: "u1", role: "admin", shop_id: "s1" });
    let fail = true;
    const server = fakeServer({
      "GET /api/v1/staff": { body: [] },
      "GET /api/v1/services": { body: [] },
      "POST /api/v1/staff": { body: { success: true, id: "new1" } },
      "PUT /api/v1/staff/new1": { body: { success: true } },
      "POST /api/v1/staff/new1/product-commission-rules": () => (fail ? { status: 500, body: { error: "x" } } : { status: 201, body: { rules: [] } }),
    });
    mountScreen(StaffView);
    await settle();
    [...document.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent?.includes(el.staff.addNew))!.click();
    await settle();
    await press("commission-add");
    await saveStaffForm();
    expect(byTestId("commission-rule")!.dataset.pending).toBe("true");
    fail = false;
    await saveStaffForm();
    expect(server.called("POST", "/api/v1/staff")).toHaveLength(1);
    expect(server.called("PUT", "/api/v1/staff/new1")).toHaveLength(1);
    expect(server.called("POST", "/api/v1/staff/new1/product-commission-rules")).toHaveLength(2);
    expect(document.querySelector(".p-dialog")).toBeNull();
  });
});

describe("BN5 a rule can pay an amount per extra hour", () => {
  test("picking € per extra hour asks for the amount and sends it, with the kind", async () => {
    const server = await openStaffForm("admin", ruleSaves);
    [...byTestId("bonus-kind")!.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent?.includes(el.bonus.rules.kinds.per_hour))!.click();
    await settle();
    expect(byTestId("bonus-percent")).toBeNull();
    expect((byTestId("bonus-add") as HTMLButtonElement).disabled).toBe(true);
    await setNumber("bonus-hours", "4");
    await setNumber("bonus-amount", "4");
    await press("bonus-add");
    await saveStaffForm();
    expect(server.called("POST", "/api/v1/staff/st1/bonus-rules")[0]?.body).toMatchObject({ kind: "per_hour", threshold_minutes: 240, amount_per_hour: 4 });
  });

  test("today's per-hour rule is shown as such", async () => {
    await openStaffForm("admin", {
      "GET /api/v1/staff/st1/bonus-rules": { body: { rules: [], current: { enabled: true, kind: "per_hour", threshold_minutes: 240, percent: 10, amount_per_hour: 4 }, today: "2026-11-17" } },
    });
    expect(byTestId("bonus-current")!.textContent).toContain("4 € ανά επιπλέον ώρα");
  });

  test("switching the bonus off from a date still has its +", async () => {
    const server = await openStaffForm("admin", ruleSaves);
    (byTestId("bonus-enabled")!.querySelector("input") as HTMLInputElement).click();
    await settle();
    await press("bonus-add");
    await saveStaffForm();
    expect(server.called("POST", "/api/v1/staff/st1/bonus-rules")[0]?.body).toMatchObject({ enabled: false });
  });
});

describe("BN6 product commission is switched on in the staff form", () => {
  test("off by default; switched on, it's saved with its percentage from a date", async () => {
    const server = await openStaffForm("admin", {
      "PUT /api/v1/staff/st1": { body: { success: true } },
      "GET /api/v1/staff/st1/product-commission-rules": { body: { rules: [], current: { enabled: false, percent: 0 }, today: "2026-11-17" } },
      "POST /api/v1/staff/st1/product-commission-rules": { status: 201, body: { rules: [] } },
    });
    expect(byTestId("commission-current")!.textContent).toContain(el.bonus.commission.off);
    (byTestId("commission-enabled")!.querySelector("input") as HTMLInputElement).click();
    await settle();
    await press("commission-add");
    await saveStaffForm();
    const body = server.called("POST", "/api/v1/staff/st1/product-commission-rules")[0]?.body;
    expect(body).toMatchObject({ enabled: true, percent: 10 });
    expect(body.effective_from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("frontdesk doesn't see it", async () => {
    await openStaffForm("frontdesk");
    expect(byTestId("staff-commission")).toBeNull();
  });
});

describe("BN7 picking who sold a product", () => {
  const mountProducts = async (sellers: any[], defaultSellerId: string | null, rows: any[] = []) => {
    saveLogin({ id: "u1", role: "frontdesk", shop_id: "s1" });
    fakeServer({ "GET /api/v1/product-sellers": { body: sellers } });
    const calendar = useCalendarStore();
    calendar.resources = [{ id: "st9", name: "ΠΑΛΙΑ ΠΩΛΗΤΡΙΑ" }] as any;
    const model = ref<any[]>(rows);
    mountScreen(defineComponent({
      render: () => h(BookingProducts, { modelValue: model.value, "onUpdate:modelValue": (v: any[]) => (model.value = v), allProducts: [], defaultSellerId }),
    }));
    await settle();
    return model;
  };
  const addProduct = async () => {
    [...document.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent?.includes(el.bookingProducts.addProduct))!.click();
    await settle();
  };

  test("a new product's seller is the booking's therapist when they earn commission", async () => {
    const model = await mountProducts([{ id: "st1", name: "ΑΝΝΑ" }], "st1");
    await addProduct();
    expect(model.value[0].staff_id).toBe("st1");
    expect(byTestId("product-seller")!.textContent).toContain("ΑΝΝΑ");
  });

  test("a therapist without commission isn't filled in; nobody is", async () => {
    const model = await mountProducts([{ id: "st1", name: "ΑΝΝΑ" }], "st2");
    await addProduct();
    expect(model.value[0].staff_id).toBeNull();
  });

  test("nobody earns commission: no seller to pick", async () => {
    await mountProducts([], "st1");
    await addProduct();
    expect(byTestId("product-seller")).toBeNull();
  });

  test("a seller picked before stays shown, even if their commission is now off", async () => {
    await mountProducts([{ id: "st1", name: "ΑΝΝΑ" }], null, [{ product_id: null, staff_id: "st9", quantity: 1, price: 5 }]);
    expect(byTestId("product-seller")!.textContent).toContain("ΠΑΛΙΑ ΠΩΛΗΤΡΙΑ");
  });
});

describe("BN8 offline, the seller is left to the server", () => {
  test("the list can't load: no seller is sent, so the booking's therapist is kept as before", async () => {
    saveLogin({ id: "u1", role: "frontdesk", shop_id: "s1" });
    fakeServer({ "GET /api/v1/product-sellers": "network-down" });
    const model = ref<any[]>([]);
    mountScreen(defineComponent({
      render: () => h(BookingProducts, { modelValue: model.value, "onUpdate:modelValue": (v: any[]) => (model.value = v), allProducts: [], defaultSellerId: "st1" }),
    }));
    await settle();
    [...document.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent?.includes(el.bookingProducts.addProduct))!.click();
    await settle();
    expect("staff_id" in model.value[0]).toBe(false);
  });
});

describe("BN9 a redemption counts as the service it stands for", () => {
  test("the report marks it and says what it counted as", async () => {
    saveLogin({ id: "u1", role: "admin", shop_id: "s1" });
    const withRedemption = structuredClone(report);
    withRedemption.staff[0].days[0].services[0] = { ...withRedemption.staff[0].days[0].services[0], service_name: "ΕΞΑΓΥΡΩΣΗ HOLISTIC", is_redemption: true, price: 32, bonus: 1.6 };
    fakeServer({ "GET /api/v1/reports/bonus": { body: withRedemption } });
    mountScreen(BonusReportView);
    await settle();
    (document.querySelector('[data-testid="bonus-table"] .p-datatable-row-toggle-button') as HTMLElement).click();
    await settle();
    expect(byTestId("bonus-redemption")!.textContent).toContain(el.bonus.redemption);
    expect(byTestId("bonus-days-anna")!.textContent).toContain("32,00");
  });

  const openService = async (service: any, routes: Record<string, any> = {}) => {
    saveLogin({ id: "u1", role: "admin", shop_id: "s1" });
    const server = fakeServer({
      "GET /api/v1/services": { body: [service, { id: "reg", name: "HOLISTIC", category: "Hot", price: 32, duration_minutes: 60, is_active: true }, { id: "red2", name: "ΕΞΑΓΥΡΩΣΗ SPORT", category: "Εξαργύρωση", price: 0, duration_minutes: 60, is_active: true }] },
      "GET /api/v1/staff": { body: [] },
      ...routes,
    });
    mountScreen(ServicesView);
    await settle();
    [...document.querySelectorAll<HTMLElement>(`button[title="${el.common.edit}"]`)][0].click();
    await settle();
    return server;
  };

  test("in the service form, a redemption picks the service it counts as; other services don't have the field", async () => {
    const server = await openService(
      { id: "red1", name: "ΕΞΑΓΥΡΩΣΗ HOLISTIC", category: "Εξαργύρωση", price: 0, duration_minutes: 60, is_active: true, bonus_service_id: null },
      { "PUT /api/v1/services/red1": { body: { success: true } } },
    );
    expect(byTestId("service-bonus-link")).not.toBeNull();
    byTestId("service-bonus-service")!.click();
    await settle();
    const options = [...document.querySelectorAll<HTMLElement>(".p-select-option")].map((o) => o.textContent?.trim());
    expect(options.some((o) => o?.startsWith("HOLISTIC"))).toBe(true);
    expect(options.some((o) => o?.includes("ΕΞΑΓΥΡΩΣΗ"))).toBe(false); // never another redemption
    [...document.querySelectorAll<HTMLElement>(".p-select-option")].find((o) => o.textContent?.startsWith("HOLISTIC"))!
      .dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await settle();
    [...document.querySelectorAll<HTMLElement>(".p-dialog-footer button")].find((b) => b.textContent?.includes(el.common.save))!.click();
    await settle();
    expect(server.called("PUT", "/api/v1/services/red1")[0]?.body.bonus_service_id).toBe("reg");
  });

  test("a regular service has no such field", async () => {
    await openService({ id: "s1", name: "AAA MASSAGE", category: "Hot", price: 30, duration_minutes: 60, is_active: true });
    expect(byTestId("service-bonus-link")).toBeNull();
  });
});

describe("BN10 a sales target bonus with steps, set in the staff form", () => {
  test("off by default; switched on, its steps are sent lowest first when the staff form is saved", async () => {
    const server = await openStaffForm("admin", {
      "PUT /api/v1/staff/st1": { body: { success: true } },
      "POST /api/v1/staff/st1/target-rules": { status: 201, body: { rules: [] } },
    });
    expect(byTestId("staff-target")).not.toBeNull();
    expect(byTestId("target-current")?.textContent ?? "").not.toContain("→");
    (byTestId("target-enabled")!.querySelector("input") as HTMLInputElement).click();
    await settle();
    // The first step is filled in as €2.500 → €300; add a higher one.
    await press("target-add-step");
    await setNumber("target-sales-1", "3500");
    await setNumber("target-bonus-1", "500");
    await press("target-add");
    expect(byTestId("target-rule")!.textContent).toContain("→");
    await saveStaffForm();
    const body = server.called("POST", "/api/v1/staff/st1/target-rules")[0]?.body;
    expect(body).toMatchObject({ enabled: true, steps: [{ target: 2500, bonus: 300 }, { target: 3500, bonus: 500 }] });
  });

  test("two steps with the same target can't be added", async () => {
    await openStaffForm("admin");
    (byTestId("target-enabled")!.querySelector("input") as HTMLInputElement).click();
    await settle();
    await press("target-add-step");
    await setNumber("target-sales-1", "2500");
    await setNumber("target-bonus-1", "10");
    expect((byTestId("target-add") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("BN11 a review bonus for front desk, set in the staff form", () => {
  test("switched on at €3 a review by default, sent with the staff form", async () => {
    const server = await openStaffForm("admin", {
      "PUT /api/v1/staff/st1": { body: { success: true } },
      "POST /api/v1/staff/st1/review-rules": { status: 201, body: { rules: [] } },
    });
    (byTestId("reviews-enabled")!.querySelector("input") as HTMLInputElement).click();
    await settle();
    await press("reviews-add");
    await saveStaffForm();
    expect(server.called("POST", "/api/v1/staff/st1/review-rules")[0]?.body).toMatchObject({ enabled: true, amount_per_review: 3 });
  });

  test("frontdesk users don't see either section", async () => {
    await openStaffForm("frontdesk");
    expect(byTestId("staff-target")).toBeNull();
    expect(byTestId("staff-reviews")).toBeNull();
  });
});

describe("BN12 the Bonus page: review counts per month, and the monthly bonuses", () => {
  const monthly = {
    from: "2026-11-01",
    to: "2026-11-30",
    total: 324,
    review_months: [{ month: "2026-11", start_count: 100, end_count: null }],
    staff: [
      {
        staff_id: "anna", staff_name: "ΑΝΝΑ", days_worked: 0, minutes: 0, extra_minutes: 0,
        hours_bonus: 0, products_bonus: 0, target_bonus: 300, reviews_bonus: 0, bonus: 300,
        days: [], products: [], reviews: [],
        targets: [{ month: "2026-11", sales: 2600, steps: [], reached: { target: 2500, bonus: 300 }, next: { target: 3500, bonus: 500 }, bonus: 300 }],
      },
      {
        staff_id: "desk", staff_name: "ΡΕΣΕΨΙΟΝ", days_worked: 0, minutes: 0, extra_minutes: 0,
        hours_bonus: 0, products_bonus: 0, target_bonus: 0, reviews_bonus: 24, bonus: 24,
        days: [], products: [], targets: [],
        reviews: [{ month: "2026-11", start_count: 100, end_count: 108, reviews: 8, amount_per_review: 3, bonus: 24 }],
      },
    ],
  };
  const openPage = async (routes: Record<string, any> = {}) => {
    saveLogin({ id: "u1", role: "admin", shop_id: "s1" });
    const server = fakeServer({ "GET /api/v1/reports/bonus": { body: monthly }, ...routes });
    mountScreen(BonusReportView);
    await settle();
    return server;
  };

  test("the two counts are typed in per month and saved; the new reviews are shown", async () => {
    const server = await openPage({ "PUT /api/v1/reports/bonus/reviews/2026-11": { body: {} } });
    expect((byTestId("bonus-reviews-save") as HTMLButtonElement).disabled).toBe(true);
    expect(byTestId("reviews-gained-2026-11")!.textContent).toContain("—");
    await setNumber("reviews-end-2026-11", "108");
    expect(byTestId("reviews-gained-2026-11")!.textContent).toContain("8");
    await press("bonus-reviews-save");
    expect(server.called("PUT", "/api/v1/reports/bonus/reviews/2026-11")[0]?.body).toEqual({ start_count: 100, end_count: 108 });
    expect(server.called("GET", "/api/v1/reports/bonus").length).toBeGreaterThan(1);
  });

  test("an end count below the start can't be saved", async () => {
    await openPage();
    await setNumber("reviews-end-2026-11", "90");
    expect(byTestId("reviews-gained-2026-11")!.textContent).toContain(el.bonus.reviews.endBelowStart);
    expect((byTestId("bonus-reviews-save") as HTMLButtonElement).disabled).toBe(true);
  });

  test("each staff member's target and review bonus, with the month's details", async () => {
    await openPage();
    const table = byTestId("bonus-table")!.textContent!;
    expect(table).toContain(el.bonus.targetBonus);
    expect(table).toContain(el.bonus.reviewsBonus);
    expect(table).toContain("300,00");
    expect(table).toContain("24,00");
    // Open both rows (the buttons are drawn again after each).
    for (const i of [0, 1]) {
      document.querySelectorAll<HTMLElement>('[data-testid="bonus-table"] .p-datatable-row-toggle-button')[i].click();
      await settle();
    }
    const target = byTestId("bonus-targets-anna")!.textContent!;
    expect(target).toContain("2.600,00");
    expect(target).toContain("3.500,00"); // the next step
    expect(byTestId("bonus-review-months-desk")!.textContent).toContain("100 → 108");
  });
});

describe("BN13 the staff form shows one kind of bonus at a time, picked from a list", () => {
  const visible = (id: string) => (byTestId(id)!.style.display ?? "") !== "none";
  const pickSection = async (value: string) => {
    byTestId("bonus-section")!.click();
    await settle();
    const option = byTestId(`bonus-section-${value}`)!.closest(".p-select-option") as HTMLElement;
    // PrimeVue picks an option on mousedown, not click.
    option.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await settle();
  };

  test("the hours bonus first; picking another kind shows only its fields", async () => {
    await openStaffForm("admin");
    expect(visible("staff-bonus")).toBe(true);
    expect(visible("staff-target")).toBe(false);
    expect(visible("staff-reviews")).toBe(false);
    await pickSection("target");
    expect(visible("staff-target")).toBe(true);
    expect(visible("staff-bonus")).toBe(false);
  });

  test("each kind in the list says what's in force today", async () => {
    await openStaffForm("admin");
    byTestId("bonus-section")!.click();
    await settle();
    expect(byTestId("bonus-section-hours")!.textContent).toContain("10%");
    expect(byTestId("bonus-section-commission")!.textContent).toContain(el.bonus.commission.off);
  });

  test("a rule added under one kind is kept when another is picked, and marked; Save sends both", async () => {
    const server = await openStaffForm("admin", {
      "PUT /api/v1/staff/st1": { body: { success: true } },
      "POST /api/v1/staff/st1/review-rules": { status: 201, body: { rules: [] } },
      "POST /api/v1/staff/st1/product-commission-rules": { status: 201, body: { rules: [] } },
    });
    await pickSection("reviews");
    (byTestId("reviews-enabled")!.querySelector("input") as HTMLInputElement).click();
    await settle();
    await press("reviews-add");
    await pickSection("commission");
    (byTestId("commission-enabled")!.querySelector("input") as HTMLInputElement).click();
    await settle();
    await press("commission-add");
    byTestId("bonus-section")!.click();
    await settle();
    expect(byTestId("bonus-section-reviews")!.textContent).toContain(el.bonus.rules.unsaved);
    expect(byTestId("bonus-section-target")!.textContent).not.toContain(el.bonus.rules.unsaved);
    await saveStaffForm();
    expect(server.called("POST", "/api/v1/staff/st1/review-rules")).toHaveLength(1);
    expect(server.called("POST", "/api/v1/staff/st1/product-commission-rules")).toHaveLength(1);
  });
});
