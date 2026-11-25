// The Daily Report's reconciliation (server/domain/reconciliation.js):
// Sales − Uncollected (at the day's end) = Expected, against the day's
// Payments, every difference explained by a line.
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const { reconcile } = createRequire(import.meta.url)("../../server/domain/reconciliation.js");

const DAY = "2026-11-20";
const booking = (id: string, value: number) => ({ appointment_id: id, value });
const tx = (id: number, appointment_id: string, amount: number, day = DAY, payment_method = "cash") => ({ id, appointment_id, amount, day, payment_method });
const pay = (id: number, amount: number, extra: any = {}) => ({ id, amount, appointment_id: null, transaction_type: "payment", client_debt_id: null, gift_card_id: null, ...extra });
const line = (r: any, key: string) => r.lines.find((l: any) => l.key === key)?.amount ?? 0;

describe("the day's money adds up", () => {
  it("every booking paid that day: Sales = Expected = Payments, Δ 0", () => {
    const r = reconcile({
      day: DAY,
      bookings: [booking("a", 40), booking("b", 30)],
      bookingTransactions: [tx(1, "a", 40), tx(2, "b", 30)],
      payments: [pay(1, 40, { appointment_id: "a" }), pay(2, 30, { appointment_id: "b" })],
    });
    expect(r).toMatchObject({ sales: 70, uncollected: 0, expected: 70, payments: 70, delta: 0, unexplained: 0, lines: [] });
  });

  it("an unpaid booking is uncollected, not a difference", () => {
    const r = reconcile({
      day: DAY,
      bookings: [booking("a", 40), booking("b", 30)],
      bookingTransactions: [tx(1, "a", 40), tx(2, "b", 10)],
      payments: [pay(1, 40, { appointment_id: "a" }), pay(2, 10, { appointment_id: "b" })],
    });
    expect(r).toMatchObject({ sales: 70, uncollected: 20, expected: 50, payments: 50, delta: 0, unexplained: 0 });
  });

  it("money taken for other things adds to Payments, each explained", () => {
    const r = reconcile({
      day: DAY,
      bookings: [booking("a", 40)],
      bookingTransactions: [tx(1, "a", 40)],
      payments: [
        pay(1, 40, { appointment_id: "a" }),
        pay(2, 35, { appointment_id: "yesterday" }), // the evening before's booking, paid today
        pay(3, 50, { transaction_type: "gift_card_sale", gift_card_id: "g" }),
        pay(4, 100, { transaction_type: "package_sale" }),
        pay(5, 60, { transaction_type: "membership_sale" }),
        pay(6, 20, { client_debt_id: "d" }),
        pay(7, 5),
      ],
    });
    expect(r).toMatchObject({ sales: 40, expected: 40, payments: 310, delta: 270, unexplained: 0 });
    expect([line(r, "otherDaysBookings"), line(r, "giftCardSales"), line(r, "packageSales"), line(r, "membershipSales"), line(r, "manualDebts"), line(r, "otherPayments")]).toEqual([35, 50, 100, 60, 20, 5]);
  });

  it("bookings settled without that day's money take away from it: paid earlier, package visits, write-offs", () => {
    const r = reconcile({
      day: DAY,
      bookings: [booking("a", 40), booking("b", 30), booking("c", 25), booking("d", 20)],
      bookingTransactions: [
        tx(1, "a", 40),
        tx(2, "b", 30, "2026-11-18"), // a deposit two days before
        tx(3, "c", 25, DAY, "package"),
        tx(4, "d", 20, DAY, "write-off"),
      ],
      payments: [pay(1, 40, { appointment_id: "a" })],
    });
    expect(r).toMatchObject({ sales: 115, uncollected: 0, expected: 115, payments: 40, delta: -75, unexplained: 0 });
    expect([line(r, "paidEarlier"), line(r, "visits"), line(r, "writeOffs")]).toEqual([-30, -25, -20]);
  });

  it("paid after the day: still uncollected that day (a past day's check doesn't change), shown for information", () => {
    const r = reconcile({
      day: DAY,
      bookings: [booking("a", 40)],
      bookingTransactions: [tx(1, "a", 15), tx(2, "a", 25, "2026-11-22")],
      payments: [pay(1, 15, { appointment_id: "a" })],
    });
    expect(r).toMatchObject({ sales: 40, uncollected: 25, expected: 15, payments: 15, delta: 0, unexplained: 0 });
    expect(r.paid_later.amount).toBe(25);
  });

  it("a refund that day counts against it", () => {
    const r = reconcile({
      day: DAY,
      bookings: [booking("a", 70)],
      bookingTransactions: [tx(1, "a", 70), tx(2, "a", -70), tx(3, "a", 70)],
      payments: [pay(1, 70, { appointment_id: "a" }), pay(2, -70, { appointment_id: "a", transaction_type: "refund" }), pay(3, 70, { appointment_id: "a" })],
    });
    expect(r).toMatchObject({ sales: 70, expected: 70, payments: 70, delta: 0, unexplained: 0 });
  });

  it("a payment for one of the day's bookings that isn't in the day's payments shows as unexplained", () => {
    const r = reconcile({
      day: DAY,
      bookings: [booking("a", 40)],
      bookingTransactions: [tx(1, "a", 40)],
      payments: [],
    });
    expect(r).toMatchObject({ expected: 40, payments: 0, delta: -40, unexplained: -40 });
  });
});
