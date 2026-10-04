// Picking a variation (ServicePickerDialog.vue) never changes service_id —
// every variation of a service shares the same id, only price/duration
// differ (see service_variations table, GET /api/v1/services' `variations`
// field). Nothing in appointment_services records which variation was
// picked, so once an appointment is saved and reopened, the only way to
// know which variation it was is to match its saved price/duration back
// against the service's own variation list. Shared by bookingServices.vue
// (the booking dialog's service row) and SchedulerView.vue (the calendar
// appointment block), so the two can never drift on what counts as a match.

export interface ServiceVariation {
  name: string;
  duration_minutes: number;
  price: number;
}

export interface ServiceWithVariations {
  name: string;
  variations?: ServiceVariation[];
}

// Exact-ish match on both price and duration — a plain price/duration
// override (not from picking a variation) is extremely unlikely to
// coincidentally land on exactly one variation's own price+duration pair,
// so no match is the much safer default than a fuzzy/partial one.
export const matchVariationName = (
  service: ServiceWithVariations | undefined,
  priceOverride: number | null | undefined,
  durationOverride: number | null | undefined,
): string | null => {
  if (!service?.variations?.length) return null;
  if (priceOverride == null || durationOverride == null) return null;
  const match = service.variations.find(
    (v) =>
      Math.abs(Number(v.price) - Number(priceOverride)) < 0.01 &&
      Number(v.duration_minutes) === Number(durationOverride),
  );
  return match ? match.name : null;
};

// "ServiceName — VariationName" when a variation matches, otherwise just
// the plain service name — the exact format ServicePickerDialog.vue already
// uses when a variation is freshly picked, kept consistent here so reopening
// a saved appointment shows the same thing as picking it just did.
export const displayServiceName = (
  service: ServiceWithVariations | undefined,
  priceOverride?: number | null,
  durationOverride?: number | null,
): string => {
  if (!service) return "";
  const variationName = matchVariationName(service, priceOverride, durationOverride);
  return variationName ? `${service.name} — ${variationName}` : service.name;
};
