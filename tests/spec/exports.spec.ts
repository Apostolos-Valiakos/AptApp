// Excel exports: the expense list as filtered, the suppliers with their
// payments, and the Bonus page with a sheet for each staff member. The file
// writer is replaced so each test can read the sheets it would have saved.
// EX1–EX3.
import { beforeEach, describe, expect, test, vi } from "vitest";
import ExpensesView from "../../client/src/views/ExpensesView.vue";
import BonusReportView from "../../client/src/views/BonusReportView.vue";
import { reauthToken } from "../../client/src/utils/reauth";
import { useSettingsStore } from "../../client/src/stores/settings";
import el from "../../client/src/i18n/locales/el";
import { fakeServer, mountScreen, saveLogin, settle } from "./helpers";

const saved = vi.hoisted(() => [] as { file: string; sheets: { name: string; rows: Record<string, unknown>[] }[] }[]);
vi.mock("../../client/src/utils/exportXlsx", () => ({
  exportXlsx: async (file: string, sheets: any[]) => {
    saved.push({ file, sheets });
  },
}));

beforeEach(() => {
  saved.length = 0;
  reauthToken.value = null;
});

const byTestId = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const press = async (id: string) => {
  byTestId(id)!.click();
  await settle();
};

const expense = (extra: any = {}) => ({
  id: "e1", amount: 40, expense_date: "2026-11-10", description: "oils", payment_method: "cash", kind: "daily",
  category_id: "c1", category_name: "Αναλώσιμα", supplier_id: "sup1", supplier_name: "Λάδια Α.Ε.", editable: true, ...extra,
});
const openExpenses = async (routes: Record<string, any> = {}) => {
  saveLogin({ id: "u1", role: "admin", shop_id: "s1" });
  const server = fakeServer({
    "GET /api/v1/expenses": { body: [expense(), expense({ id: "e2", amount: 12.5, expense_date: "2026-11-12", payment_method: "card", description: "towels", category_id: null, category_name: null, supplier_id: null, supplier_name: null })] },
    "GET /api/v1/expense-categories": { body: [{ id: "c1", name: "Αναλώσιμα" }] },
    "GET /api/v1/suppliers": { body: [{ id: "sup1", name: "Λάδια Α.Ε." }] },
    ...routes,
  });
  mountScreen(ExpensesView);
  await settle();
  return server;
};

describe("EX1 the expense list", () => {
  test("exports the rows shown, newest first, with every column and the amount as a number", async () => {
    await openExpenses();
    await press("expenses-export");
    const [{ file, sheets }] = saved;
    expect(file).toMatch(/^expenses_daily.*\.xlsx$/);
    expect(sheets).toHaveLength(1);
    expect(sheets[0].name).toBe(el.expenses.sheet);
    expect(sheets[0].rows).toEqual([
      {
        [el.expenses.date]: expect.stringContaining("12"),
        [el.expenses.category]: el.expenses.noCategory,
        [el.expenses.supplier]: "",
        [el.expenses.description]: "towels",
        [el.expenses.method]: el.common.paymentMethod.card,
        [el.expenses.amount]: 12.5,
      },
      expect.objectContaining({ [el.expenses.description]: "oils", [el.expenses.supplier]: "Λάδια Α.Ε.", [el.expenses.amount]: 40 }),
    ]);
  });

  test("what Ctrl+1 hides on screen isn't exported either", async () => {
    await openExpenses();
    useSettingsStore().setHideCashPaid(true);
    await settle();
    await press("expenses-export");
    expect(saved[0].sheets[0].rows.map((r) => r[el.expenses.description])).toEqual(["towels"]);
    useSettingsStore().setHideCashPaid(false);
  });
});

describe("EX2 the suppliers", () => {
  test("a sheet of suppliers with their totals, and one of every payment to them in the dates", async () => {
    reauthToken.value = "proof";
    const server = await openExpenses({
      "GET /api/v1/suppliers/summary": {
        body: [
          { id: "sup1", name: "Λάδια Α.Ε.", phone: "2410123456", vat_number: "123456789", is_active: true, orders: 2, total: 100.5, last_paid: "2026-11-10" },
          { id: "sup2", name: "Πετσέτες ΟΕ", phone: null, vat_number: null, is_active: false, orders: 0, total: 0, last_paid: null },
        ],
      },
      "GET /api/v1/suppliers/sup1/expenses": {
        body: [
          { id: "o1", amount: 40, expense_date: "2026-11-10", description: "oils", payment_method: "cash", kind: "daily", category_name: null },
          { id: "o2", amount: 60.5, expense_date: "2026-08-01", description: "bulk order", payment_method: "card", kind: "monthly", category_name: "Αναλώσιμα" },
        ],
      },
    });
    [...document.querySelectorAll<HTMLElement>('[data-testid="expense-sections"] button')].find((b) => b.textContent?.includes(el.expenses.suppliers.title))!.click();
    await settle();
    await press("suppliers-export");
    const [{ file, sheets }] = saved;
    expect(file).toMatch(/^suppliers_.*\.xlsx$/);
    expect(sheets.map((s) => s.name)).toEqual([el.expenses.suppliers.sheetSuppliers, el.expenses.suppliers.sheetOrders]);
    expect(sheets[0].rows).toEqual([
      expect.objectContaining({ [el.expenses.suppliers.name]: "Λάδια Α.Ε.", [el.expenses.suppliers.vat]: "123456789", [el.expenses.suppliers.ordersHeader]: 2, [el.expenses.suppliers.paid]: 100.5, [el.expenses.suppliers.removed]: "" }),
      expect.objectContaining({ [el.expenses.suppliers.name]: "Πετσέτες ΟΕ", [el.expenses.suppliers.paid]: 0, [el.expenses.suppliers.removed]: "✓" }),
    ]);
    expect(sheets[1].rows).toEqual([
      expect.objectContaining({ [el.expenses.suppliers.name]: "Λάδια Α.Ε.", [el.expenses.description]: "oils", [el.expenses.suppliers.kind]: el.expenses.kinds.daily, [el.expenses.amount]: 40 }),
      expect.objectContaining({ [el.expenses.description]: "bulk order", [el.expenses.suppliers.kind]: el.expenses.kinds.monthly, [el.expenses.category]: "Αναλώσιμα", [el.expenses.amount]: 60.5 }),
    ]);
    // A supplier with no payments in the dates isn't asked for any.
    expect(server.called("GET", "/api/v1/suppliers/sup2/expenses")).toHaveLength(0);
  });
});

describe("EX3 the Bonus page: the totals, then a sheet for each staff member", () => {
  const member = (extra: any) => ({
    days_worked: 0, minutes: 0, extra_minutes: 0, hours_bonus: 0, products_bonus: 0, target_bonus: 0, reviews_bonus: 0,
    days: [], products: [], targets: [], reviews: [], ...extra,
  });
  const report = {
    from: "2026-11-01", to: "2026-11-30", total: 37.5, review_months: [],
    staff: [
      member({
        staff_id: "anna", staff_name: "ΑΝΝΑ", days_worked: 1, minutes: 360, extra_minutes: 60, hours_bonus: 6, products_bonus: 1.5, target_bonus: 20, bonus: 27.5,
        days: [{
          date: "2026-11-10", kind: "percent", threshold_minutes: 300, percent: 10, amount_per_hour: 0, minutes: 360, extra_minutes: 60, bonus: 6,
          services: [{ id: 1, start_time: "2026-11-10T15:00:00+02:00", minutes: 60, extra_minutes: 60, price: 60, bonus: 6, service_name: "Μασάζ", client_name: "MARIA PAPA", is_redemption: false }],
        }],
        products: [{ id: "p1", day: "2026-11-12", quantity: 1, total_price: 30, cost: 15, base: 15, percent: 10, bonus: 1.5, product_name: "Λάδι", client_name: null }],
        targets: [{ month: "2026-11", sales: 2600, steps: [], reached: { target: 2500, bonus: 20 }, next: null, bonus: 20 }],
      }),
      // A name Excel can't use as is (too long, with a slash), and two alike.
      member({ staff_id: "long", staff_name: "ΕΛΕΝΗ/ΚΑΡΑΓΙΑΝΝΟΠΟΥΛΟΥ ΠΑΠΑΔΟΠΟΥΛΟΥ", reviews_bonus: 6, bonus: 6, reviews: [{ month: "2026-11", start_count: 10, end_count: 12, reviews: 2, amount_per_review: 3, bonus: 6 }] }),
      member({ staff_id: "z1", staff_name: "ΖΩΗ", bonus: 2, products_bonus: 2, products: [{ id: "p2", day: "2026-11-13", quantity: 2, total_price: 20, cost: null, base: 20, percent: 10, bonus: 2, product_name: "Κρέμα", client_name: null }] }),
      member({ staff_id: "z2", staff_name: "ΖΩΗ", bonus: 2, products_bonus: 2, products: [{ id: "p3", day: "2026-11-14", quantity: 2, total_price: 20, cost: null, base: 20, percent: 10, bonus: 2, product_name: "Κρέμα", client_name: null }] }),
    ],
  };

  test("each staff member's days, services, products and monthly bonuses, then their total", async () => {
    reauthToken.value = "proof";
    saveLogin({ id: "u1", role: "admin", shop_id: "s1" });
    fakeServer({ "GET /api/v1/reports/bonus": { body: report } });
    mountScreen(BonusReportView);
    await settle();
    await press("bonus-export");
    const [{ file, sheets }] = saved;
    expect(file).toBe("bonus_2026-11-01_2026-11-30.xlsx");
    // The totals first, then one per staff member: names Excel accepts, no two alike.
    expect(sheets.map((s) => s.name)).toEqual([el.bonus.sheetStaff, "ΑΝΝΑ", "ΕΛΕΝΗ ΚΑΡΑΓΙΑΝΝΟΠΟΥΛΟΥ ΠΑΠΑΔΟΠΟ", "ΖΩΗ", "ΖΩΗ 2"]);
    expect(sheets.every((s) => s.name.length <= 31)).toBe(true);
    expect(sheets[0].rows.map((r) => r[el.bonus.bonus])).toEqual([27.5, 6, 2, 2]);

    const k = el.bonus.staffSheet;
    const anna = sheets[1].rows;
    expect(anna.map((r) => r[k.kind])).toEqual([k.day, k.service, k.product, k.target, k.total]);
    expect(anna[1]).toMatchObject({ [k.time]: "15:00", [k.item]: "Μασάζ", [k.client]: "MARIA PAPA", [k.extraMinutes]: 60, [k.value]: 60, [el.bonus.bonus]: 6 });
    expect(anna[2]).toMatchObject({ [el.bonus.date]: "2026-11-12", [k.value]: 30, [el.bonus.bonus]: 1.5 });
    expect(String(anna[2][k.item])).toContain("1 × Λάδι");
    expect(anna[3]).toMatchObject({ [el.bonus.date]: "2026-11", [k.value]: 2600, [el.bonus.bonus]: 20 });
    expect(anna[4][el.bonus.bonus]).toBe(27.5);
    // Every row has every column, so the sheet's columns line up.
    expect(new Set(anna.map((r) => Object.keys(r).join("|"))).size).toBe(1);

    const eleni = sheets[2].rows;
    expect(eleni.map((r) => r[k.kind])).toEqual([k.reviews, k.total]);
    expect(String(eleni[0][k.item])).toContain("10 → 12: 2 ×");
  });
});
