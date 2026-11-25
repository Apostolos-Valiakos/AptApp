// The Android app's router (docs/redesign/ANDROID_HANDOFF.md step 7.2): only
// login, signup and the client portal. The staff and admin screens aren't in
// this build at all, so no link can open them: any other address, /app/...
// included, goes to the portal.
import { createRouter, createWebHistory, type RouterHistory } from "vue-router";
import { useAuthStore } from "../stores/auth";
import LoginView from "../views/LoginView.vue";
import { portalRoute } from "./portalRoute";

export const STAFF_SIGNED_OUT = "staffApp"; // query flag the login page explains

export const routes = [
  { path: "/", redirect: "/portal/home" },
  { path: "/login", name: "login", component: LoginView, meta: { bare: true } },
  { path: "/signup", name: "Signup", component: () => import("../views/SignupView.vue") },
  portalRoute,
  { path: "/:rest(.*)*", redirect: "/portal/home" },
];

// `history`: the browser's in the app; tests pass a memory history.
export const createPortalRouter = (history: RouterHistory = createWebHistory()) => {
  const router = createRouter({ history, routes });

  // The client parts of the web router's guard (router/index.ts).
  router.beforeEach((to) => {
    const auth = useAuthStore();
    // Staff, admins and the owner use the web app: signed out here, and the
    // login page says where to go instead.
    if (auth.isAuthenticated && !auth.isClient) {
      auth.logout();
      return { path: "/login", query: { [STAFF_SIGNED_OUT]: "1" } };
    }
    if (to.meta.requiresAuth && !auth.isAuthenticated) return "/login";
    if ((to.path === "/login" || to.path === "/signup") && auth.isAuthenticated) return "/portal/home";
    return true;
  });

  return router;
};
