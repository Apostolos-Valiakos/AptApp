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
