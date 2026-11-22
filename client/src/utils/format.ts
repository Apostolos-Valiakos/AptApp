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

const DATE_LOCALES: Record<string, string> = { el: "el-GR", en: "en-GB" };

/** The browser locale for the app's language ("el" → "el-GR", "en" → "en-GB"). */
export const dateLocale = (lang: string) => DATE_LOCALES[lang] || lang;

// 24-hour, as clockTime: Greek's default is 12-hour ("05:00 μ.μ."), which
// sat beside "18:00" on the same line.
const TIME = { hour: "2-digit", minute: "2-digit", hourCycle: "h23" } as const;
const DATE_STYLES = {
  /** 21/10/2026 */
  numeric: { day: "2-digit", month: "2-digit", year: "numeric" },
  /** 21 Οκτ 2026 */
  short: { day: "2-digit", month: "short", year: "numeric" },
  /** 21 Οκτ */
  dayMonth: { day: "numeric", month: "short" },
  /** Τρίτη 21 Οκτ */
  weekdayDayMonth: { weekday: "long", day: "numeric", month: "short" },
  /** Οκτώβριος 2026 */
  monthYear: { month: "long", year: "numeric" },
  /** 21/10/2026, 10:30 */
  numericTime: { day: "2-digit", month: "2-digit", year: "numeric", ...TIME },
  /** 21 Οκτ 2026, 10:30 */
  shortTime: { day: "2-digit", month: "short", year: "numeric", ...TIME },
  /** Τρί 21 Οκτ, 10:30 */
  weekdayTime: { weekday: "short", day: "numeric", month: "short", ...TIME },
} satisfies Record<string, Intl.DateTimeFormatOptions>;
export type DateStyle = keyof typeof DATE_STYLES;

/**
 * A date (and time) for display, in the app's language (`lang`: "el"/"en").
 * A plain "2026-10-21" is that day where the device is; empty values give `empty`.
 */
export const formatDate = (
  value: string | number | Date | null | undefined,
  lang: string,
  style: DateStyle = "numeric",
  empty = "",
) => {
  if (value == null || value === "") return empty;
  const d = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return d.toLocaleString(dateLocale(lang), DATE_STYLES[style]);
};

/** "10:05", in the device's time. */
export const clockTime = (value: string | number | Date) => {
  const d = new Date(value);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** "1 h 30 min" / "45 min", in the app's language (`t` from useI18n). */
export const formatDuration = (minutes: number, t: (key: string, values?: any) => string) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? t("services.duration.hoursMinutes", { h, m }) : t("services.duration.minutes", { m });
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
