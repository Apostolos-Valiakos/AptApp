// Optional parts of the app the owner switches off per shop in the platform
// console (shops.disabled_modules). Everything is on unless listed there.
// Keep in step with server/modules.js.
export const MODULES = [
  "gift_cards",
  "packages",
  "products",
  "memberships",
  "cash_filter", // Ctrl+1 / Ctrl+8, CASH, per-service hiding
  "client_portal", // client logins, self-booking, push
  "discounts", // discounts at checkout and discount codes
  "shared_places", // staff with several places (sauna, hammam)
  "contests",
] as const;

export type ModuleKey = (typeof MODULES)[number];
