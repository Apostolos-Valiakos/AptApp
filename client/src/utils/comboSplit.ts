// What a combination service becomes when booked: one booking line per part,
// each on its own staff member (the sauna on the sauna's, etc.; see
// utils/placeStaff.ts).
//
// - Every part has a price set on the combination: each line gets that price,
//   so the lines add up to the combination's price. A part with no default
//   staff member and no sauna/hammam room stays with the staff member the
//   combination was booked for.
// - Otherwise (combinations set up before part prices existed): each part is
//   carved out at its own price and the combination's line keeps the rest.

import { staffForPart } from "./placeStaff";

export type ComboPart = {
  id: string;
  name: string;
  duration_minutes?: number | null;
  price?: number | string | null;
  /** The part's price inside this combination; null when not set. */
  combo_price?: number | string | null;
  default_staff_id?: string | null;
};

export type ComboService = {
  id: string;
  name: string;
  combo_components?: ComboPart[];
};

/** Whether every part has its own price inside the combination. */
export const hasPartPrices = (parts: ComboPart[] | undefined) =>
  !!parts?.length && parts.every((p) => p.combo_price != null && p.combo_price !== "");

/** The line's name: the part, with the combination it came from. */
export const comboLineLabel = (partName: string, comboName?: string | null) =>
  comboName ? `${partName} (${comboName})` : partName;

/**
 * The lines `row` (booked as `combo`, already holding the combination's own
 * price and duration) turns into; `row` itself is the first of them when the
 * combination keeps a line of its own.
 */
export const splitCombo = (combo: ComboService, row: any, staff: any[] = []): any[] => {
  const parts = combo.combo_components || [];
  if (parts.length === 0) return [row];

  if (hasPartPrices(parts)) {
    return parts.map((part) => ({
      service_id: part.id,
      staff_id: staffForPart(part, staff, row.staff_id || null),
      start_time: row.start_time,
      duration_override: part.duration_minutes || 30,
      price_override: Number(part.combo_price),
      variation_name: null,
      combo_service_id: combo.id,
      _label: comboLineLabel(part.name, combo.name),
      _autoGenFor: combo.id,
    }));
  }

  const carved = parts.map((part) => ({
    service_id: part.id,
    staff_id: staffForPart(part, staff, null),
    start_time: row.start_time,
    duration_override: part.duration_minutes || 30,
    price_override: Number(part.price || 0),
    _autoGenFor: row.service_id,
  }));
  const partsMinutes = parts.reduce((sum, p) => sum + (p.duration_minutes || 0), 0);
  const partsPrice = parts.reduce((sum, p) => sum + Number(p.price || 0), 0);
  const remainingMinutes = row.duration_override - partsMinutes;
  const remainingPrice = row.price_override - partsPrice;
  // The parts already make up the whole combination: no line is left for it.
  if (remainingMinutes <= 0 && remainingPrice <= 0) return carved;
  // A real remainder (e.g. Sport + Sauna with only the sauna listed): the
  // combination's line keeps it.
  row.duration_override = Math.max(5, remainingMinutes);
  row.price_override = Math.max(0, remainingPrice);
  return [row, ...carved];
};
