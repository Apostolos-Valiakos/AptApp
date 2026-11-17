// The money rules shared by every screen (and the offline calendar), the
// same as the server's: an appointment costs its services at their charged
// price (price_override, else the catalogue price) plus its products.

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Total of service lines (`price_override` ?? `price`) and product lines (`price` × `quantity`). */
export const appointmentTotal = (services: any[] = [], products: any[] = []) =>
  round2(
    services.reduce((sum, s) => sum + Number(s?.price_override ?? s?.price ?? 0), 0) +
      products.reduce((sum, p) => sum + Number(p?.price ?? 0) * Number(p?.quantity ?? 1), 0),
  );

/** "paid" once the paid amount covers the total (to the cent), "partial" if anything is paid. */
export const paymentStatus = (total: number, paid: number): "paid" | "partial" | "unpaid" =>
  paid <= 0 ? "unpaid" : paid + 0.005 >= total ? "paid" : "partial";

/**
 * How a payment at the till is shared out. Packages and gift cards sold with
 * it (`extras`) are paid first: by the first way of paying, and what it
 * doesn't cover by the second. Only the rest of each goes to what's owed.
 */
export const paymentShares = (amountNow: number, extras: number, secondAmount: number | null) => {
  const extrasOnFirst = Math.min(amountNow, extras);
  const extrasOnSecond = round2(extras - extrasOnFirst);
  return {
    extrasOnSecond,
    owedOnFirst: round2(amountNow - extrasOnFirst),
    owedOnSecond: secondAmount === null ? 0 : round2(Math.max(0, secondAmount - extrasOnSecond)),
  };
};
