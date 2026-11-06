// The money in the booking dialog. Every expected amount is worked out by hand
// from the requirement, in euros. B1–B11 in test-report.html.
import { createRequire } from "node:module";
import { describe, expect, test } from "vitest";
import { ref } from "vue";
import {
  countsInStoredBalance,
  useBookingTotals,
} from "../../client/src/composables/useBookingTotals";
import { computeDiscountAmount } from "../../client/src/utils/discount";
import BookingProducts from "../../client/src/components/booking/bookingProducts.vue";
import { mountScreen, settle } from "./helpers";

const { discountTotal } = createRequire(import.meta.url)("../../server/discounts.js");

const noDiscount = { type: null, value: 0, scope: "services", code_id: null, code_name: null };
const FUTURE = "2099-01-01T10:00:00"; // not yet in the client's stored balance
const HAPPENED = "2026-03-02T10:00:00"; // already in it

const totals = (over: Partial<Record<string, any>> = {}) =>
  useBookingTotals({
    services: ref(over.services ?? [{ price_override: 30 }]),
    products: ref(over.products ?? []),
    discount: ref(over.discount ?? noDiscount),
    client: ref(over.client === undefined ? { outstanding_balance: 0 } : over.client),
    isEdit: ref(over.isEdit ?? false),
    form: ref({ start_time: over.start ?? FUTURE, deposit_amount: over.paid ?? 0 }),
    siblings: ref(over.siblings ?? []),
    selectedSiblingIds: ref(over.selected ?? []),
    pendingPackagesTotal: ref(over.packages ?? 0),
    pendingGiftCardsTotal: ref(over.giftCards ?? 0),
    ...(over.savedUnpaid === undefined ? {} : { savedUnpaid: ref(over.savedUnpaid) }),
  } as any);

describe("B1 adding up the booking", () => {
  test("services plus products times their quantities", () => {
    const t = totals({
      services: [{ price_override: 40 }, { price_override: 20 }],
      products: [{ price: 5, quantity: 3 }, { price: 2.5, quantity: 2 }],
    });
    expect(t.servicesTotal.value).toBe(60);
    expect(t.productsTotal.value).toBe(20);
    expect(t.currentApptTotal.value).toBe(80);
  });

  test("a line with no price counts as 0, prices sent as text still add up", () => {
    const t = totals({
      services: [{ price_override: null }, { price_override: "12.50" }],
      products: [{ price: undefined, quantity: 4 }, { price: "3" }],
    });
    expect(t.servicesTotal.value).toBe(12.5);
    expect(t.productsTotal.value).toBe(3); // no quantity given: one item
  });

  test("an empty booking owes nothing", () => {
    const t = totals({ services: [] });
    expect(t.currentApptTotal.value).toBe(0);
    expect(t.totalDueNow.value).toBe(0);
  });
});

describe("B2 discounts", () => {
  const base = { services: [{ price_override: 60 }], products: [{ price: 40, quantity: 1 }] };
  test.each([
    ["10% on services only", { type: "percent", value: 10, scope: "services" }, 6, 94],
    ["10% on products only", { type: "percent", value: 10, scope: "products" }, 4, 96],
    ["10% on everything", { type: "percent", value: 10, scope: "total" }, 10, 90],
    ["a code is a percentage too", { type: "code", value: 25, scope: "services" }, 15, 85],
    ["15€ off services", { type: "fixed", value: 15, scope: "services" }, 15, 85],
    ["a fixed discount larger than its part stops at that part", { type: "fixed", value: 500, scope: "products" }, 40, 60],
    ["more than 100% stops at the full amount", { type: "percent", value: 150, scope: "total" }, 100, 0],
    ["a zero discount does nothing", { type: "percent", value: 0, scope: "total" }, 0, 100],
    ["a negative discount does nothing", { type: "fixed", value: -5, scope: "total" }, 0, 100],
    ["no type does nothing", { type: null, value: 10, scope: "total" }, 0, 100],
  ])("%s", (_name, discount, off, total) => {
    const t = totals({ ...base, discount });
    expect(t.discountAmount.value).toBe(off);
    expect(t.currentApptTotal.value).toBe(total);
  });

  test("rounded to the cent", () => {
    const t = totals({ services: [{ price_override: 10 }], discount: { type: "percent", value: 33.33, scope: "services" } });
    expect(t.discountAmount.value).toBe(3.33);
  });

  test("a discount on an empty part gives nothing", () => {
    expect(totals({ products: [], discount: { type: "fixed", value: 5, scope: "products" } }).discountAmount.value).toBe(0);
  });

  test.each([
    ["fixed", 15, 60],
    ["fixed", 500, 60],
    ["percent", 33.33, 10],
    ["code", 25, 60],
    ["percent", 0, 60],
    ["fixed", 5, 0],
  ])("the screen and the server agree: %s %s on %s€", (type, value, amount) => {
    const screen = computeDiscountAmount({ type, value, scope: "services", code_id: null, code_name: null } as any, amount as number, 0);
    expect(screen).toBe(discountTotal(type, value, amount));
  });
});

describe("B3 what has been paid", () => {
  test("a part payment lowers what is due", () => {
    expect(totals({ services: [{ price_override: 70 }], paid: 20 }).totalDueNow.value).toBe(50);
  });
  test("paying exactly the bill leaves nothing due", () => {
    expect(totals({ services: [{ price_override: 70 }], paid: 70 }).totalDueNow.value).toBe(0);
  });
  test("paying more than this booking leaves it at 0, it doesn't eat into earlier debt", () => {
    const t = totals({ services: [{ price_override: 70 }], paid: 100, client: { outstanding_balance: 40 } });
    expect(t.totalDueNow.value).toBe(40);
  });
  test("the discount comes off before the payment", () => {
    const t = totals({ services: [{ price_override: 100 }], paid: 30, discount: { type: "percent", value: 10, scope: "services" } });
    expect(t.totalDueNow.value).toBe(60);
  });
});

describe("B4 earlier debt isn't counted twice", () => {
  test("a booking that has happened is already in the stored balance", () => {
    const t = totals({ isEdit: true, start: HAPPENED, client: { outstanding_balance: 80 } });
    expect(t.previousDebt.value).toBe(50);
    expect(t.totalDueNow.value).toBe(80);
  });
  test("a booking still to come isn't", () => {
    const t = totals({ isEdit: true, start: FUTURE, client: { outstanding_balance: 80 } });
    expect(t.previousDebt.value).toBe(80);
    expect(t.totalDueNow.value).toBe(110);
  });
  test("a new booking is never in it, whatever its date", () => {
    const t = totals({ isEdit: false, start: HAPPENED, client: { outstanding_balance: 80 } });
    expect(t.previousDebt.value).toBe(80);
    expect(t.totalDueNow.value).toBe(110);
  });
  test("no client chosen: no earlier debt", () => {
    expect(totals({ client: null }).previousDebt.value).toBe(0);
  });
  test("a client with no stored balance has no earlier debt", () => {
    expect(totals({ client: {} }).previousDebt.value).toBe(0);
  });
});

describe("B5 and B10 a client's credit is subtracted, and a larger credit shows as negative", () => {
  test("new booking: 20€ credit on a 30€ bill leaves 10€", () => {
    expect(totals({ client: { outstanding_balance: -20 } }).totalDueNow.value).toBe(10);
  });
  test("new booking: 50€ credit on a 30€ bill shows -20€", () => {
    expect(totals({ client: { outstanding_balance: -50 } }).totalDueNow.value).toBe(-20);
  });
  test("editing a booking still to come: same as a new one", () => {
    const t = totals({ isEdit: true, start: FUTURE, client: { outstanding_balance: -20 } });
    expect(t.previousDebt.value).toBe(-20);
    expect(t.totalDueNow.value).toBe(10);
  });
  test("editing one that has happened: its 30€ is already in the -20€, so the client still has 20€ credit", () => {
    // Stored -20 = credit of 50 + this booking's unpaid 30.
    const t = totals({ isEdit: true, start: HAPPENED, client: { outstanding_balance: -20 } });
    expect(t.previousDebt.value).toBe(-50);
    expect(t.totalDueNow.value).toBe(-20);
  });
  test("a stored 10€ that includes this booking's unpaid 30€ means 20€ of credit", () => {
    const t = totals({ isEdit: true, start: HAPPENED, client: { outstanding_balance: 10 } });
    expect(t.previousDebt.value).toBe(-20);
    expect(t.totalDueNow.value).toBe(10);
  });
  test("an unsaved extra on a past booking doesn't pass for credit: the stored balance only knows the saved 30€", () => {
    const t = totals({
      isEdit: true,
      start: HAPPENED,
      services: [{ price_override: 30 }],
      products: [{ price: 10, quantity: 1 }],
      savedUnpaid: 30,
      client: { outstanding_balance: 30 },
    });
    expect(t.previousDebt.value).toBe(0);
    expect(t.totalDueNow.value).toBe(40);
  });
  test("a service removed but not yet saved isn't owed twice", () => {
    const t = totals({ isEdit: true, start: HAPPENED, services: [], savedUnpaid: 30, client: { outstanding_balance: 80 } });
    expect(t.previousDebt.value).toBe(50);
    expect(t.totalDueNow.value).toBe(50);
  });
  test("the amount offered for payment is never negative", () => {
    const t = totals({ services: [], client: { outstanding_balance: -20 } });
    expect(t.suggestedAmount()).toBe(0);
  });
});

describe("B6 which bookings are in the stored balance", () => {
  const now = new Date("2026-10-27T12:00:00");
  test.each([
    ["exactly when counting started", "2026-03-01T00:00:00", true],
    ["a minute before counting started", "2026-02-28T23:59:00", false],
    ["earlier today", "2026-10-27T09:00:00", true],
    ["this very moment", "2026-10-27T12:00:00", true],
    ["later today", "2026-10-27T18:00:00", false],
    ["no date", null, false],
  ])("%s", (_name, start, expected) => {
    expect(countsInStoredBalance(start, now)).toBe(expected);
  });
});

describe("B7 same-day bookings paid together", () => {
  const siblings = [
    { id: "a", owed: 15, deposit_amount: 5, services: [{ start_time: FUTURE }] },
    { id: "b", owed: 25, deposit_amount: 10, services: [{ start_time: FUTURE }] },
  ];
  test("only the selected ones count", () => {
    const t = totals({ isEdit: true, siblings, selected: ["b"] });
    expect(t.selectedSiblingsOwedTotal.value).toBe(25);
    expect(t.selectedSiblingsDepositTotal.value).toBe(10);
    expect(t.combinedTotalDueNow.value).toBe(55);
    expect(t.totalDueNow.value).toBe(30);
  });
  test("none selected: nothing added", () => {
    expect(totals({ isEdit: true, siblings }).combinedTotalDueNow.value).toBe(30);
  });
  test("one that has happened is in the stored balance too: counted once", () => {
    const happened = { id: "h", owed: 20, deposit_amount: 0, services: [{ start_time: HAPPENED }] };
    const t = totals({ isEdit: true, siblings: [happened], selected: ["h"], client: { outstanding_balance: 100 } });
    expect(t.previousDebt.value).toBe(80);
    expect(t.combinedTotalDueNow.value).toBe(130); // 80 earlier + 30 this booking + 20 selected
  });
  test("one still to come isn't in the stored balance: nothing taken off", () => {
    const t = totals({ isEdit: true, siblings, selected: ["a"], client: { outstanding_balance: 100 } });
    expect(t.previousDebt.value).toBe(100);
    expect(t.combinedTotalDueNow.value).toBe(145);
  });
});

describe("B8 packages and gift cards sold with this payment", () => {
  test("both add to what is due now, not to the booking's own total", () => {
    const t = totals({ packages: 25, giftCards: 50 });
    expect(t.currentApptTotal.value).toBe(30);
    expect(t.totalDueNow.value).toBe(105);
    expect(t.combinedTotalDueNow.value).toBe(105);
  });
});

describe("B9 the amount offered when the payment tab opens", () => {
  const sibling = { id: "a", owed: 20, deposit_amount: 0, services: [{ start_time: FUTURE }] };
  test("what is unpaid on this booking and the selected ones, without old debt", () => {
    const t = totals({ paid: 10, siblings: [sibling], selected: ["a"], client: { outstanding_balance: 100 } });
    expect(t.suggestedAmount()).toBe(40);
  });
  test("once those are paid: everything due, old debt included", () => {
    const t = totals({ paid: 30, packages: 5, client: { outstanding_balance: 70 } });
    expect(t.suggestedAmount()).toBe(75);
  });
});

describe("B11 a product quantity of 0 can't be entered", () => {
  test("typing 0 ends up as 1 in the booking", async () => {
    const line = { product_id: null, quantity: 3, price: 5 };
    const wrapper = mountScreen(BookingProducts, { props: { modelValue: [line], allProducts: [] } });
    const quantity = wrapper.find<HTMLInputElement>(".p-inputnumber-input");
    quantity.element.value = "0";
    await quantity.trigger("input");
    await quantity.trigger("blur");
    await settle();
    expect(line.quantity).toBe(1);
  });
});
