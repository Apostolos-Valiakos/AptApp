// An appointment's status as every screen shows it: its label (under
// common.status in the translations) and its colours.

const LABEL_KEYS: Record<string, string> = { "no-show": "noShow", "no-response": "noResponse" };

/** The translation key under common.status ("no-show" → "noShow"). */
export const statusKey = (status: string) => LABEL_KEYS[status] || status;

/** Badge with text: light background, dark text. */
export const STATUS_BADGE: Record<string, string> = {
  new: "bg-blue-100 text-blue-800",
  confirmed: "bg-purple-100 text-purple-800",
  arrived: "bg-orange-100 text-orange-800",
  started: "bg-green-100 text-green-800",
  completed: "bg-gray-200 text-gray-800",
  cancelled: "bg-red-100 text-red-800",
  "no-show": "bg-red-200 text-red-900",
  "no-response": "bg-amber-100 text-amber-800",
};
export const statusBadge = (status: string) => STATUS_BADGE[status] || "bg-gray-100";

/** A client's history shows a finished visit in green instead of grey. */
export const historyBadge = (status: string) =>
  status === "completed" ? "bg-green-100 text-green-800" : statusBadge(status);

/** A small solid dot or bar. */
export const STATUS_DOT: Record<string, string> = {
  new: "bg-blue-500",
  confirmed: "bg-purple-500",
  arrived: "bg-orange-500",
  started: "bg-green-500",
  completed: "bg-gray-500",
  cancelled: "bg-red-500",
  "no-show": "bg-red-700",
  "no-response": "bg-amber-500",
};
export const statusDot = (status: string | undefined) => STATUS_DOT[status || ""] || "bg-gray-400";
