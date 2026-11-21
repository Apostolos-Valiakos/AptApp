// How a till payment is shared between what's sold with it (packages, gift
// cards) and what's owed, across one or two ways of paying.
import { describe, expect, it } from "vitest";
import { paymentShares } from "../../client/src/utils/money";

describe("paymentShares", () => {
  it("nothing sold: all of it goes to what's owed", () => {
    expect(paymentShares(40, 0, null)).toEqual({ extrasOnSecond: 0, owedOnFirst: 40, owedOnSecond: 0 });
  });
  it("a package sold: paid first, the rest goes to what's owed", () => {
    expect(paymentShares(100, 60, null)).toEqual({ extrasOnSecond: 0, owedOnFirst: 40, owedOnSecond: 0 });
  });
  it("the first way doesn't cover the sale: the second pays the rest of it first", () => {
    expect(paymentShares(20, 50, 45)).toEqual({ extrasOnSecond: 30, owedOnFirst: 0, owedOnSecond: 15 });
  });
  it("the second way covering only part of the sale owes nothing", () => {
    expect(paymentShares(20, 50, 10)).toEqual({ extrasOnSecond: 30, owedOnFirst: 0, owedOnSecond: 0 });
  });
  it("to the cent", () => {
    expect(paymentShares(10.1, 0.2, 0.3)).toEqual({ extrasOnSecond: 0, owedOnFirst: 9.9, owedOnSecond: 0.3 });
  });
});
