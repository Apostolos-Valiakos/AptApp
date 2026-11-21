// A product variation's bulk price: entered before VAT, shown with the fixed
// 24% VAT as the Τιμή Χονδρικής, and saved with the product. The seller's
// commission is on the profit over it (tests/booking/bonus.test.ts). PB1–PB2.
import { describe, expect, test } from "vitest";
import ProductsView from "../../client/src/views/ProductsView.vue";
import el from "../../client/src/i18n/locales/el";
import { fakeServer, mountScreen, saveLogin, settle } from "./helpers";

const product = (bulk_price: number | null) => ({
  id: "p1",
  name: "Λάδι",
  description: "",
  variations: [{ id: "v1", variation_name: "100ml", price: 30, bulk_price, stock_quantity: 4 }],
});
const byTestId = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const dialogButton = (label: string) =>
  [...document.querySelectorAll<HTMLElement>(".p-dialog button")].find((b) => b.textContent?.includes(label))!;
const typeNumber = async (id: string, value: string) => {
  const input = byTestId(id)!.querySelector("input") as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event("input"));
  input.dispatchEvent(new Event("blur"));
  await settle();
};

const open = async (products: any[], routes: Record<string, any> = {}) => {
  saveLogin({ id: "u1", role: "frontdesk", shop_id: "s1" });
  const server = fakeServer({ "GET /api/v1/products": { body: products }, ...routes });
  mountScreen(ProductsView);
  await settle();
  return server;
};

describe("PB1 the bulk price shows its VAT and the price with it", () => {
  test("a new product: empty until typed, then the bulk price plus 24%", async () => {
    await open([]);
    [...document.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent?.includes(el.products.addNew))!.click();
    await settle();
    expect(document.querySelector(".p-dialog")!.textContent).toContain("ΦΠΑ 24%");
    expect(byTestId("variation-bulk-total-0")!.textContent).toContain(el.products.dialog.bulkTotal);
    expect(byTestId("variation-bulk-total-0")!.textContent).toContain("—");
    await typeNumber("variation-bulk-price-0", "15");
    expect(byTestId("variation-bulk-total-0")!.textContent).toMatch(/18[,.]60/);
  });
});

describe("PB2 the bulk price is saved with the product", () => {
  test("frontdesk edits a variation's bulk price", async () => {
    const server = await open([product(10)], { "PUT /api/v1/products/p1": { body: { success: true } } });
    (document.querySelector('[data-pc-name="button"] .pi-pencil')?.closest("button") as HTMLElement).click();
    await settle();
    expect(byTestId("variation-bulk-total-0")!.textContent).toMatch(/12[,.]40/);
    await typeNumber("variation-bulk-price-0", "9,99"); // Greek decimal comma
    dialogButton(el.products.dialog.saveProduct).click();
    await settle();
    expect(server.called("PUT", "/api/v1/products/p1")[0]?.body.variations[0]).toMatchObject({ id: "v1", bulk_price: 9.99 });
  });

  test("a new product without one is sent as none", async () => {
    const server = await open([], { "POST /api/v1/products": { body: { success: true, productId: "p2" } } });
    [...document.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent?.includes(el.products.addNew))!.click();
    await settle();
    const name = document.querySelector<HTMLInputElement>(".p-dialog input")!;
    name.value = "Κερί";
    name.dispatchEvent(new Event("input"));
    await settle();
    dialogButton(el.products.dialog.saveProduct).click();
    await settle();
    expect(server.called("POST", "/api/v1/products")[0]?.body.variations[0].bulk_price).toBeNull();
  });
});
