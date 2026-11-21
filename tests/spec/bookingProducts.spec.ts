// The products on a booking: picking one fills in its price, and every change
// (product, quantity, price, seller) is handed back as a new list with a new
// row, so the dialog's rows are never changed behind its back. BP1–BP2.
import { describe, expect, test } from "vitest";
import { defineComponent, h, ref, toRaw } from "vue";
import BookingProducts from "../../client/src/components/booking/bookingProducts.vue";
import { fakeServer, mountScreen, saveLogin, settle } from "./helpers";

const catalogue = [
  { id: "p1", name: "Oil", variations: [{ id: "v1", variation_name: "100ml", price: "12.50", stock_quantity: 9 }] },
  { id: "p2", name: "Cream", variations: [{ id: "v2", variation_name: "50ml", price: "20", stock_quantity: 3 }] },
];
const mount = async (rows: any[]) => {
  saveLogin({ id: "u1", role: "frontdesk", shop_id: "s1" });
  fakeServer({ "GET /api/v1/product-sellers": { body: [{ id: "st1", name: "ΑΝΝΑ" }, { id: "st2", name: "ΕΛΕΝΗ" }] } });
  const model = ref<any[]>(rows);
  const wrapper = mountScreen(
    defineComponent({
      render: () => h(BookingProducts, { modelValue: model.value, "onUpdate:modelValue": (v: any[]) => (model.value = v), allProducts: catalogue }),
    }),
  );
  await settle();
  return { model, wrapper };
};
const control = (wrapper: any, name: string, index: number) => wrapper.findAllComponents({ name })[index];

describe("BP1 every change is a new list", () => {
  test("quantity, price and seller: the new list has the change, the row the dialog gave is untouched", async () => {
    const original = { product_id: "v1", quantity: 1, price: 12.5, staff_id: "st1" };
    const { model, wrapper } = await mount([original]);
    control(wrapper, "InputNumber", 0).vm.$emit("update:modelValue", 3);
    await settle();
    control(wrapper, "InputNumber", 1).vm.$emit("update:modelValue", 10);
    await settle();
    control(wrapper, "Select", 1).vm.$emit("update:modelValue", "st2");
    await settle();
    expect(model.value).toEqual([{ product_id: "v1", quantity: 3, price: 10, staff_id: "st2" }]);
    expect(original).toEqual({ product_id: "v1", quantity: 1, price: 12.5, staff_id: "st1" });
    expect(toRaw(model.value[0])).not.toBe(original);
  });

  test("other rows are handed back as they were", async () => {
    const first = { product_id: "v1", quantity: 1, price: 12.5 };
    const second = { product_id: "v2", quantity: 2, price: 20 };
    const { model, wrapper } = await mount([first, second]);
    control(wrapper, "InputNumber", 0).vm.$emit("update:modelValue", 4);
    await settle();
    expect(toRaw(model.value[1])).toBe(second);
    expect(model.value[0].quantity).toBe(4);
  });
});

describe("BP2 picking a product", () => {
  test("takes its price, without touching the row the dialog gave", async () => {
    const original = { product_id: null, quantity: 1, price: 0 };
    const { model, wrapper } = await mount([original]);
    control(wrapper, "Select", 0).vm.$emit("update:modelValue", "v2");
    await settle();
    expect(model.value[0]).toMatchObject({ product_id: "v2", price: 20, quantity: 1 });
    expect(original.product_id).toBeNull();
    expect(original.price).toBe(0);
  });

  test("an unknown product keeps the price typed in", async () => {
    const { model, wrapper } = await mount([{ product_id: "v1", quantity: 1, price: 7 }]);
    control(wrapper, "Select", 0).vm.$emit("update:modelValue", "gone");
    await settle();
    expect(model.value[0]).toMatchObject({ product_id: "gone", price: 7 });
  });
});
