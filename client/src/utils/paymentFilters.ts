// The cash and card filters (Ctrl+1 / Ctrl+8) hide services, or part of one,
// by the way they were paid. The server (appointment_service_payments) sends
// per service `hidden: { cash, card, both }`: how much of its price each
// filter hides. Exact matches hide a whole service; money that matched no
// service comes off the cheapest services first. A cash-bought gift card
// counts as cash; CASH is never hidden.
type Hidden = { cash?: number | string; card?: number | string; both?: number | string } | null | undefined;
type Filters = { hideCashPaid: boolean; hideCardPaid: boolean };

/** How much of a service the filters on now hide, in money. */
export const hiddenAmount = (hidden: Hidden, filters: Filters) => {
  if (!hidden) return 0;
  const key = filters.hideCashPaid && filters.hideCardPaid ? "both" : filters.hideCashPaid ? "cash" : filters.hideCardPaid ? "card" : null;
  return key ? Number(hidden[key] || 0) : 0;
};

/** What a service shows under the filters: its price less the hidden part. */
export const shownPrice = (price: number | string | null | undefined, hidden: Hidden, filters: Filters) =>
  Math.max(0, Number(price || 0) - hiddenAmount(hidden, filters));

/** True when the filters hide all of a service. */
export const fullyHidden = (price: number | string | null | undefined, hidden: Hidden, filters: Filters) => {
  const amount = hiddenAmount(hidden, filters);
  return amount > 0 && amount >= Number(price || 0) - 0.005;
};

export const paidInCash = (paidWith: string | null | undefined) => !!paidWith && paidWith.split(",").includes("cash");

/** An appointment's total and paid amount with what the filters hide taken off both. */
export const shownMoney = (
  total: number | string | null | undefined,
  paid: number | string | null | undefined,
  services: { hidden?: Hidden }[] = [],
  filters: Filters,
) => {
  const hidden = services.reduce((sum, s) => sum + hiddenAmount(s?.hidden, filters), 0);
  return { total: Math.max(0, Number(total || 0) - hidden), paid: Math.max(0, Number(paid || 0) - hidden) };
};
