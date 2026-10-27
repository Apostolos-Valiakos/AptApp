// Shared display formats: money in the Greek style ("1.234,50 €") on every
// screen, and dates that never shift by time zone.

const money = new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" });

const wholeMoney = new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR", minimumFractionDigits: 0 });

/**
 * "12,00 €" — the one money format of the app. `compact` drops zero cents
 * ("12 €", "12,50 €"), for short price labels in pickers.
 */
export const formatMoney = (value: number | string | null | undefined, { compact = false } = {}) => {
  const n = Number(value) || 0;
  return compact && Number.isInteger(Math.round(n * 100) / 100) ? wholeMoney.format(n) : money.format(n);
};

/**
 * A calendar date from the server — "2026-10-21", or a DATE column sent as
 * a timestamp — formatted as that same day, never the day before or after.
 */
export const formatDay = (
  value: string | Date,
  locale: string,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" },
) => {
  const iso = typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
};
