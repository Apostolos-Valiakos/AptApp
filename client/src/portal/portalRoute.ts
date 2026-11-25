// The client portal's routes (docs/redesign/REDESIGN_SPEC.md §2), shared by
// the web app's router (router/index.ts) and the Android app's (portal/router.ts),
// so both always open the same screens at the same addresses.
import type { RouteRecordRaw } from "vue-router";

const screen = (name: "Home" | "Book" | "Bookings" | "Wallet" | "Pass" | "Profile") => () =>
  import("./routes").then((m) => m[name]);

export const portalRoute: RouteRecordRaw = {
  path: "/portal",
  // Its own frame, theme and screens, loaded only when a client opens it.
  component: () => import("./PortalShell.vue"),
  meta: { requiresAuth: true, role: "client" },
  children: [
    { path: "", redirect: "/portal/home" },
    { path: "home", name: "PortalHome", component: screen("Home") },
    { path: "book", name: "PortalBook", component: screen("Book") },
    { path: "book/reschedule/:id", name: "PortalReschedule", component: screen("Book") },
    { path: "bookings", name: "PortalBookings", component: screen("Bookings") },
    { path: "bookings/:id", name: "PortalBooking", component: screen("Bookings") },
    { path: "wallet", name: "PortalWallet", component: screen("Wallet") },
    { path: "wallet/pass", name: "PortalPass", component: screen("Pass") },
    { path: "profile", name: "PortalProfile", component: screen("Profile") },
    // The portal before the redesign: links in emails and notifications
    // already sent still open the same place.
    { path: "appointments", redirect: (to) => ({ path: to.query.tab === "book" ? "/portal/book" : "/portal/bookings", query: {} }) },
    { path: "more", redirect: "/portal/profile" },
  ],
};
