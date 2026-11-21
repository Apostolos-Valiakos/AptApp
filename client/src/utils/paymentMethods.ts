// "CASH" is cash in another currency: reports count it with cash and show it
// as cash, but the cash filter (Ctrl+1), which matches "cash" exactly, never
// hides it. Only where a person chooses the way of paying is it called CASH, to
// tell it from normal cash.
export const MONEY_METHODS = ["cash", "CASH", "card", "bank-transfer"];

export const methodChoiceLabel = (t: (key: string) => string, method: string) =>
  method === "CASH" ? "CASH" : t(`common.paymentMethod.${method}`);
