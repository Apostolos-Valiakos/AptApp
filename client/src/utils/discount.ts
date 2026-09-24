export type DiscountType = "fixed" | "percent" | "code" | null;
export type DiscountScope = "services" | "total";

export interface DiscountState {
  type: DiscountType;
  value: number;
  scope: DiscountScope;
  code_id: string | null;
  code_name: string | null;
}

export const emptyDiscount = (): DiscountState => ({
  type: null,
  value: 0,
  scope: "services",
  code_id: null,
  code_name: null,
});

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// Mirrors server/discounts.js discountTotal — the server is the authority.
export const computeDiscountAmount = (
  d: DiscountState,
  servicesTotal: number,
  productsTotal: number,
): number => {
  if (!d.type || !(d.value > 0)) return 0;
  const base = servicesTotal + (d.scope === "total" ? productsTotal : 0);
  if (base <= 0) return 0;
  const raw = d.type === "fixed" ? d.value : (base * d.value) / 100;
  return round2(Math.min(raw, base));
};

export const discountFromAppointment = (val: any): DiscountState =>
  val?.discount_type
    ? {
        type: val.discount_type,
        value: Number(val.discount_value) || 0,
        scope: val.discount_scope === "total" ? "total" : "services",
        code_id: val.discount_code_id || null,
        code_name: val.discount_code_name || null,
      }
    : emptyDiscount();

export const discountPayload = (d: DiscountState) =>
  d.type && d.value > 0
    ? {
        discount_type: d.type,
        discount_value: d.value,
        discount_scope: d.scope,
        discount_code_id: d.type === "code" ? d.code_id : null,
      }
    : { discount_type: null };
