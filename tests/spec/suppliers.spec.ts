// Suppliers on the Expenses screen: the list admins keep (behind the retyped
// password, like Monthly and Reports), what was paid to each and in which
// orders, and the optional supplier on every daily or monthly expense.
// SU1–SU5.
import { beforeEach, describe, expect, test } from "vitest";
import ExpensesView from "../../client/src/views/ExpensesView.vue";
import { reauthToken } from "../../client/src/utils/reauth";
import el from "../../client/src/i18n/locales/el";
import { answerConfirm, fakeServer, mountScreen, pageText, saveLogin, settle } from "./helpers";

const supplier = (extra: any = {}) => ({
  id: "sup1",
  name: "Λάδια Α.Ε.",
  phone: "2410123456",
  vat_number: "123456789",
  notes: null,
  is_active: true,
  orders: 2,
  total: 100.5,
  last_paid: "2026-11-10",
  ...extra,
});
const picker = [{ id: "sup1", name: "Λάδια Α.Ε." }, { id: "sup2", name: "Πετσέτες ΟΕ" }];
const expense = (extra: any = {}) => ({
  id: "e1",
  amount: 40,
  expense_date: "2026-11-10",
  description: "oils",
  payment_method: "cash",
  kind: "daily",
  category_id: null,
  category_name: null,
  supplier_id: null,
  supplier_name: null,
  editable: true,
  ...extra,
});

beforeEach(() => {
  reauthToken.value = null;
});

const byTestId = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const press = async (id: string) => {
  byTestId(id)!.click();
  await settle();
};
const sections = () => [...document.querySelectorAll('[data-testid="expense-sections"] button')] as HTMLElement[];
const openSection = async (label: string) => {
  sections().find((b) => b.textContent?.includes(label))!.click();
  await settle();
};
// Opens a PrimeVue dropdown and picks the option with this text.
const pick = async (id: string, text: string) => {
  byTestId(id)!.click();
  await settle();
  const option = [...document.querySelectorAll<HTMLElement>(".p-select-option")].find((o) => o.textContent?.trim() === text);
  if (!option) throw new Error(`no option "${text}" in ${id}`);
  // PrimeVue picks an option on mousedown, not click.
  option.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  await settle();
};
const type = async (id: string, value: string) => {
  const input = (byTestId(id)!.matches("input, textarea") ? byTestId(id) : byTestId(id)!.querySelector("input")) as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event("input"));
  await settle();
};

const open = async (role: "admin" | "frontdesk", routes: Record<string, any> = {}) => {
  saveLogin({ id: "u1", role, shop_id: "s1" });
  const server = fakeServer({
    "GET /api/v1/expenses": { body: [] },
    "GET /api/v1/expense-categories": { body: [] },
    "GET /api/v1/suppliers": { body: picker },
    "GET /api/v1/suppliers/summary": { body: [supplier()] },
    ...routes,
  });
  mountScreen(ExpensesView);
  await settle();
  return server;
};

describe("SU1 an expense can name a supplier", () => {
  test("frontdesk picks one from the saved list when adding a daily expense", async () => {
    const server = await open("frontdesk", { "POST /api/v1/expenses": { status: 201, body: { id: "new" } } });
    await press("expense-add");
    await type("expense-description", "massage oils");
    const amount = document.querySelector<HTMLInputElement>(".p-dialog .p-inputnumber input")!;
    amount.value = "25";
    amount.dispatchEvent(new Event("input"));
    amount.dispatchEvent(new Event("blur"));
    await settle();
    await pick("expense-supplier", "Πετσέτες ΟΕ");
    [...document.querySelectorAll<HTMLElement>(".p-dialog-footer button")].find((b) => b.textContent?.includes(el.common.save))!.click();
    await settle();
    expect(server.called("POST", "/api/v1/expenses")[0]?.body).toMatchObject({ supplier_id: "sup2", kind: "daily" });
  });

  test("it's optional: saved without one, the expense has no supplier", async () => {
    const server = await open("admin", { "PUT /api/v1/expenses/e1": { body: { success: true } }, "GET /api/v1/expenses": { body: [expense()] } });
    (document.querySelector('[aria-label="' + el.expenses.edit + '"]') as HTMLElement).click();
    await settle();
    [...document.querySelectorAll<HTMLElement>(".p-dialog-footer button")].find((b) => b.textContent?.includes(el.common.save))!.click();
    await settle();
    expect(server.called("PUT", "/api/v1/expenses/e1")[0]?.body.supplier_id).toBeNull();
  });

  test("an expense keeps showing a supplier that has since been removed", async () => {
    await open("admin", { "GET /api/v1/expenses": { body: [expense({ supplier_id: "gone", supplier_name: "Παλιός" })] } });
    expect(pageText()).toContain("Παλιός");
    (document.querySelector('[aria-label="' + el.expenses.edit + '"]') as HTMLElement).click();
    await settle();
    expect(byTestId("expense-supplier")!.textContent).toContain("Παλιός");
  });
});

describe("SU2 who sees the suppliers", () => {
  test("frontdesk has no Suppliers tab", async () => {
    await open("frontdesk");
    expect(byTestId("expense-sections")).toBeNull();
    expect(pageText()).not.toContain(el.expenses.suppliers.title);
  });

  test("admins open it only after retyping the password", async () => {
    const server = await open("admin");
    await openSection(el.expenses.suppliers.title);
    expect(byTestId("sensitive-gate")).not.toBeNull();
    expect(server.called("GET", "/api/v1/suppliers/summary")).toHaveLength(0);
  });
});

describe("SU3 the list shows what was paid to each supplier", () => {
  test("name, phone, VAT, number of orders and the amount paid, with the total", async () => {
    reauthToken.value = "proof";
    await open("admin", {
      "GET /api/v1/suppliers/summary": { body: [supplier(), supplier({ id: "sup2", name: "Πετσέτες ΟΕ", phone: null, vat_number: null, total: 15, orders: 1 })] },
    });
    await openSection(el.expenses.suppliers.title);
    const table = byTestId("suppliers-table")!.textContent!;
    expect(table).toContain("Λάδια Α.Ε.");
    expect(table).toContain("2410123456");
    expect(table).toContain("123456789");
    expect(table).toContain("100,50");
    expect(byTestId("suppliers-total")!.textContent).toContain("115,50");
  });

  test("opening a supplier lists its orders and the amount of each", async () => {
    reauthToken.value = "proof";
    const server = await open("admin", {
      "GET /api/v1/suppliers/sup1/expenses": {
        body: [
          { id: "o1", amount: 40, expense_date: "2026-11-10", description: "oils", payment_method: "cash", kind: "daily", category_name: null },
          { id: "o2", amount: 60.5, expense_date: "2026-08-01", description: "bulk order", payment_method: "card", kind: "monthly", category_name: "Αναλώσιμα" },
        ],
      },
    });
    await openSection(el.expenses.suppliers.title);
    (document.querySelector('[data-testid="suppliers-table"] .p-datatable-row-toggle-button') as HTMLElement).click();
    await settle();
    const orders = byTestId("supplier-orders-sup1")!.textContent!;
    expect(orders).toContain("oils");
    expect(orders).toContain("bulk order");
    expect(orders).toContain("60,50");
    expect(server.called("GET", "/api/v1/suppliers/sup1/expenses")).toHaveLength(1);
  });

  test("a removed supplier still paid in the dates is marked removed and can't be changed", async () => {
    reauthToken.value = "proof";
    await open("admin", { "GET /api/v1/suppliers/summary": { body: [supplier({ is_active: false })] } });
    await openSection(el.expenses.suppliers.title);
    const table = byTestId("suppliers-table")!;
    expect(table.textContent).toContain(el.expenses.suppliers.removed);
    expect(table.querySelector(`[aria-label="${el.expenses.suppliers.edit}"]`)).toBeNull();
  });
});

describe("SU4 adding and changing a supplier", () => {
  test("a new supplier is saved with its details and stays for later expenses", async () => {
    reauthToken.value = "proof";
    const server = await open("admin", { "POST /api/v1/suppliers": { status: 201, body: { id: "sup3" } } });
    await openSection(el.expenses.suppliers.title);
    await press("supplier-add");
    await type("supplier-name", "Κεριά ΙΚΕ");
    await type("supplier-phone", "6900000000");
    await type("supplier-vat", "999888777");
    await press("supplier-save");
    expect(server.called("POST", "/api/v1/suppliers")[0]?.body).toMatchObject({ name: "Κεριά ΙΚΕ", phone: "6900000000", vat_number: "999888777" });
    // The expense dialog's list is fetched again, so the new one can be picked.
    expect(server.called("GET", "/api/v1/suppliers").length).toBeGreaterThanOrEqual(2);
  });

  test("a name already on the list is refused with a message", async () => {
    reauthToken.value = "proof";
    await open("admin", { "POST /api/v1/suppliers": { status: 409, body: { error: "name_taken" } } });
    await openSection(el.expenses.suppliers.title);
    await press("supplier-add");
    await type("supplier-name", "λάδια α.ε.");
    await press("supplier-save");
    expect(pageText()).toContain(el.expenses.suppliers.taken);
  });

  test("removing asks first, then takes it off the list", async () => {
    reauthToken.value = "proof";
    const server = await open("admin", { "DELETE /api/v1/suppliers/sup1": { body: { success: true } } });
    await openSection(el.expenses.suppliers.title);
    (byTestId("suppliers-table")!.querySelector(`[aria-label="${el.expenses.suppliers.remove}"]`) as HTMLElement).click();
    await settle();
    await answerConfirm(true);
    expect(server.called("DELETE", "/api/v1/suppliers/sup1")).toHaveLength(1);
  });
});

describe("SU6 adding an expense from a supplier's row", () => {
  const fillAndSave = async (description: string, amount: string) => {
    await type("expense-description", description);
    const input = document.querySelector<HTMLInputElement>(".p-dialog .p-inputnumber input")!;
    input.value = amount;
    input.dispatchEvent(new Event("input"));
    input.dispatchEvent(new Event("blur"));
    await settle();
    [...document.querySelectorAll<HTMLElement>(".p-dialog-footer button")].find((b) => b.textContent?.includes(el.common.save))!.click();
    await settle();
  };

  test("the dialog opens with that supplier picked; saved as daily by default, and the list refreshes", async () => {
    reauthToken.value = "proof";
    const server = await open("admin", { "POST /api/v1/expenses": { status: 201, body: { id: "new" } } });
    await openSection(el.expenses.suppliers.title);
    await press("supplier-add-expense-sup1");
    expect(byTestId("expense-supplier")!.textContent).toContain("Λάδια Α.Ε.");
    expect(byTestId("expense-kind")).not.toBeNull();
    const before = server.called("GET", "/api/v1/suppliers/summary").length;
    await fillAndSave("oils", "30");
    expect(server.called("POST", "/api/v1/expenses")[0]?.body).toMatchObject({ supplier_id: "sup1", kind: "daily" });
    expect(server.called("GET", "/api/v1/suppliers/summary").length).toBe(before + 1);
  });

  test("it can be saved as a monthly expense instead", async () => {
    reauthToken.value = "proof";
    const server = await open("admin", { "POST /api/v1/expenses": { status: 201, body: { id: "new" } } });
    await openSection(el.expenses.suppliers.title);
    await press("supplier-add-expense-sup1");
    [...byTestId("expense-kind")!.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent?.includes(el.expenses.kinds.monthly))!.click();
    await settle();
    expect(byTestId("expense-month")).not.toBeNull();
    await fillAndSave("bulk order", "120");
    expect(server.called("POST", "/api/v1/expenses")[0]?.body).toMatchObject({ supplier_id: "sup1", kind: "monthly" });
  });

  test("the Daily / Monthly choice isn't offered on the daily and monthly tabs", async () => {
    await open("admin");
    await press("expense-add");
    expect(byTestId("expense-kind")).toBeNull();
  });
});

describe("SU5 filtering expenses by supplier", () => {
  test("only the expenses of the picked supplier are listed and totalled", async () => {
    await open("frontdesk", {
      "GET /api/v1/expenses": {
        body: [
          expense({ id: "a", amount: 40, description: "oils", supplier_id: "sup1", supplier_name: "Λάδια Α.Ε." }),
          expense({ id: "b", amount: 15, description: "towels", supplier_id: "sup2", supplier_name: "Πετσέτες ΟΕ" }),
          expense({ id: "c", amount: 5, description: "coffee" }),
        ],
      },
    });
    await pick("expense-supplier-filter", "Λάδια Α.Ε.");
    expect(pageText()).toContain("oils");
    expect(pageText()).not.toContain("towels");
    expect(pageText()).not.toContain("coffee");
    await pick("expense-supplier-filter", el.expenses.noSupplier);
    expect(pageText()).toContain("coffee");
    expect(pageText()).not.toContain("oils");
  });
});
