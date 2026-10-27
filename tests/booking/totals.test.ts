// The booking dialog's money rules (client/src/composables/useBookingTotals.ts).
import { describe, expect, test } from "vitest";
import { ref } from "vue";
import {
  BALANCE_START,
  countsInStoredBalance,
  previousDebtFrom,
  suggestedPayment,
  useBookingTotals,
} from "../../client/src/composables/useBookingTotals";

const now = new Date("2026-10-27T12:00:00");

describe("which bookings are in the client's stored balance", () => {
  test("one that has happened, from 1 March 2026 on", () => {
    expect(countsInStoredBalance("2026-10-27T09:00:00", now)).toBe(true);
    expect(countsInStoredBalance(BALANCE_START, now)).toBe(true);
  });
  test("not one later today, nor one before 1 March 2026", () => {
    expect(countsInStoredBalance("2026-10-27T18:00:00", now)).toBe(false);
    expect(countsInStoredBalance("2026-02-28T10:00:00", now)).toBe(false);
    expect(countsInStoredBalance(null, now)).toBe(false);
  });
});

describe("earlier debt", () => {
  test("a new booking: the stored balance as is", () => {
    expect(previousDebtFrom({ storedBalance: 50, isEdit: false, currentInBalance: true, currentUnpaid: 30, selectedSiblingsUnpaidInBalance: 0 })).toBe(50);
  });
  test("a booking that has happened: its own unpaid part isn't counted twice", () => {
    expect(previousDebtFrom({ storedBalance: 80, isEdit: true, currentInBalance: true, currentUnpaid: 30, selectedSiblingsUnpaidInBalance: 0 })).toBe(50);
  });
  test("a booking later today: the stored balance doesn't have it yet", () => {
    expect(previousDebtFrom({ storedBalance: 50, isEdit: true, currentInBalance: false, currentUnpaid: 30, selectedSiblingsUnpaidInBalance: 0 })).toBe(50);
  });
  test("selected same-day bookings that have happened are taken out too, never below zero", () => {
    expect(previousDebtFrom({ storedBalance: 100, isEdit: true, currentInBalance: true, currentUnpaid: 30, selectedSiblingsUnpaidInBalance: 20 })).toBe(50);
    expect(previousDebtFrom({ storedBalance: 10, isEdit: true, currentInBalance: true, currentUnpaid: 30, selectedSiblingsUnpaidInBalance: 0 })).toBe(0);
  });
});

describe("suggested payment", () => {
  test("what's unpaid on this booking and the selected same-day ones", () => {
    expect(suggestedPayment(30, 20, 120)).toBe(50);
  });
  test("once those are paid: everything due, old debt included", () => {
    expect(suggestedPayment(0, 0, 70)).toBe(70);
    expect(suggestedPayment(0, 0, -5)).toBe(0);
  });
});

describe("useBookingTotals", () => {
  const setup = (over: Partial<Record<string, any>> = {}) =>
    useBookingTotals({
      services: ref([{ price_override: 40 }, { price_override: 20 }]),
      products: ref([{ price: 5, quantity: 2 }]),
      discount: ref({ type: null, value: 0, scope: "services", codeId: null, codeName: null } as any),
      client: ref({ outstanding_balance: 100 }),
      isEdit: ref(true),
      form: ref({ start_time: "2020-01-01T10:00:00", deposit_amount: 10 }), // before BALANCE_START: not in the balance
      siblings: ref([{ id: "s1", owed: 15, deposit_amount: 5, services: [{ start_time: "2020-01-01T12:00:00" }] }]),
      selectedSiblingIds: ref(["s1"]),
      pendingPackagesTotal: ref(25),
      pendingGiftCardsTotal: ref(0),
      ...over,
    });

  test("totals, earlier debt and what is due now", () => {
    const t = setup();
    expect(t.servicesTotal.value).toBe(60);
    expect(t.productsTotal.value).toBe(10);
    expect(t.currentApptTotal.value).toBe(70);
    expect(t.previousDebt.value).toBe(100);
    expect(t.totalDueNow.value).toBe(100 + 60 + 25); // debt + unpaid (70 − 10) + package
    expect(t.combinedTotalDueNow.value).toBe(185 + 15);
    expect(t.selectedSiblingsDepositTotal.value).toBe(5);
    expect(t.suggestedAmount()).toBe(60 + 15);
  });

  test("no client selected: no earlier debt", () => {
    expect(setup({ client: ref(null) }).previousDebt.value).toBe(0);
  });
});
