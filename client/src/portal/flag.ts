// The redesigned portal is switched on per device while it's being built:
// "?portal=v2" in any portal link turns it on, "?portal=v1" back off
// (docs/redesign/IMPLEMENTATION_PLAN.md, step 1.3). Goes away at the switch-over.
import { ref } from "vue";

const KEY = "portalV2";

const read = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

export const portalV2 = ref(read());

export const setPortalV2 = (on: boolean) => {
  portalV2.value = on;
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {}
};

/** Re-reads the saved choice (a test, or another tab, may have changed it). */
export const refreshPortalV2 = () => (portalV2.value = read());

// Where a link of one portal leads in the other, so links from emails and
// notifications work whichever is on.
const TO_V2: Record<string, string> = { "/portal/appointments": "/portal/bookings", "/portal/more": "/portal/profile" };
const TO_V1: Record<string, string> = {
  "/portal/book": "/portal/appointments",
  "/portal/bookings": "/portal/appointments",
  "/portal/wallet": "/portal/more",
  "/portal/profile": "/portal/more",
};

/** The same place in the portal that's on, or null when `path` is already right. */
export const portalPathFor = (path: string, query: Record<string, unknown>, v2: boolean): { path: string; query?: Record<string, string> } | null => {
  if (v2) {
    if (path === "/portal/appointments" && query.tab === "book") return { path: "/portal/book" };
    return TO_V2[path] ? { path: TO_V2[path] } : null;
  }
  // "/portal/book" and moving a booking, not "/portal/bookings".
  if (path === "/portal/book" || path.startsWith("/portal/book/")) return { path: "/portal/appointments", query: { tab: "book" } };
  const base = Object.keys(TO_V1).find((p) => path === p || path.startsWith(`${p}/`));
  return base ? { path: TO_V1[base] } : null;
};
