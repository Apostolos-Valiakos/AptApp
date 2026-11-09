import { createRouter, createWebHistory } from "vue-router";
import { defineAsyncComponent, defineComponent, h } from "vue";
import { useAuthStore } from "../stores/auth";

// Views — landing/login stay eager (first paint), the rest are lazy-loaded chunks
import Layout from "../components/Layout.vue";
import IndexView from "../views/IndexView.vue";
import SensitiveGate from "../components/SensitiveGate.vue";
import LoginView from "../views/LoginView.vue";
const SchedulerView = () => import("../views/SchedulerView.vue");
const StaffView = () => import("../views/StaffView.vue");
const StaffScheduleView = () => import("../views/StaffScheduleView.vue");
const ClientsView = () => import("../views/ClientsView.vue");
const ServicesView = () => import("../views/ServicesView.vue");
const ProductsView = () => import("../views/ProductsView.vue");
const GiftCardsView = () => import("../views/GiftCardsView.vue");
// Opens only after the password is retyped, every time; the page itself (and
// its requests) doesn't start before that.
const sensitive = (load: () => Promise<any>) => {
  const Page = defineAsyncComponent(load);
  return defineComponent({ render: () => h(SensitiveGate, null, { default: () => h(Page) }) });
};
const FinancialsView = sensitive(() => import("../components/FinancialsView.vue"));
const profileView = () => import("../views/profileView.vue");
const ClientLayout = () => import("../components/ClientLayout.vue");
const ClientHomeView = () => import("../views/portal/ClientHomeView.vue");
const ClientAppointmentsView = () =>
  import("../views/portal/ClientAppointmentsView.vue");
const ClientMoreView = () => import("../views/portal/ClientMoreView.vue");
const SignupView = () => import("../views/SignupView.vue");
const ShopsView = () => import("../views/ShopsView.vue");
const MembershipTiersView = () => import("../views/MembershipTiersView.vue");
const DailyReportView = () => import("../views/DailyReportView.vue");
const PackageTypesView = () => import("../views/PackageTypesView.vue");
const ExpensesView = () => import("../views/ExpensesView.vue");
const MembershipReportView = sensitive(() => import("../views/MembershipReportView.vue"));
const QrScannerView = () => import("../views/QrScannerView.vue");
const DemoRequestsView = () => import("../views/DemoRequestsView.vue");
const ProductUsageView = sensitive(() => import("../views/ProductUsageView.vue"));

const routes = [
  {
    path: "/",
    component: Layout, // Το Layout αγκαλιάζει τα πάντα
    children: [
      {
        path: "", // Αυτό είναι το "/"
        name: "home",
        component: IndexView,
      },
      {
        path: "login", // Αυτό είναι το "/login"
        name: "login",
        component: LoginView,
        meta: { bare: true },
      },
      {
        path: "/signup",
        name: "Signup",
        component: SignupView,
      },
      {
        path: "app", // Εσωτερικές σελίδες
        meta: { requiresAuth: true },
        children: [
          { path: "scheduler", component: SchedulerView },
          { path: "staff", component: StaffView },
          { path: "staff-schedule", component: StaffScheduleView },
          { path: "clients", component: ClientsView },
          { path: "services", component: ServicesView },
          { path: "products", component: ProductsView },
          {
            path: "product-usage",
            component: ProductUsageView,
            meta: { requiresAnalytics: true },
          },
          { path: "gift-cards", component: GiftCardsView },
          {
            path: "financials",
            component: FinancialsView,
            meta: { requiresAnalytics: true },
          },
          {
            path: "membership-tiers",
            component: MembershipTiersView,
            meta: { requiresShopAdmin: true },
          },
          { path: "daily-report", component: DailyReportView },
          {
            path: "expenses",
            component: ExpensesView,
            meta: { requiresShopAdmin: true },
          },
          {
            path: "packages",
            component: PackageTypesView,
            meta: { requiresShopAdmin: true },
          },
          {
            path: "membership-report",
            component: MembershipReportView,
            meta: { requiresAnalytics: true },
          },
          { path: "qr-scanner", component: QrScannerView },
          {
            path: "platform/shops",
            component: ShopsView,
            meta: { requiresOwner: true },
          },
          {
            path: "platform/demo-requests",
            component: DemoRequestsView,
            meta: { requiresOwner: true },
          },
          { path: "profile", component: profileView },
        ],
      },
    ],
  },
  {
    path: "/portal",
    component: ClientLayout,
    meta: { requiresAuth: true, role: "client" },
    children: [
      { path: "", redirect: "/portal/home" },
      { path: "home", name: "ClientHome", component: ClientHomeView },
      {
        path: "appointments",
        name: "ClientAppointments",
        component: ClientAppointmentsView,
      },
      { path: "more", name: "ClientMore", component: ClientMoreView },
    ],
  },
  // Redirects για να μη σπάνε τα παλιά links - ΠΡΟΣΟΧΗ ΣΤΑ "/"
  { path: "/scheduler", redirect: "/app/scheduler" },
  { path: "/staff", redirect: "/app/staff" },
  { path: "/clients", redirect: "/app/clients" },
  { path: "/services", redirect: "/app/services" },
  { path: "/products", redirect: "/app/products" },
  { path: "/financials", redirect: "/app/financials" },
  { path: "/profile", redirect: "/app/profile" },
];

// The only pages of the staff app a plain "staff" login may open.
const STAFF_PAGES = ["/app/scheduler", "/app/profile"];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to, from, next) => {
  const authStore = useAuthStore();

  // The public home page at "/" is a separate static site (landing/, served
  // by the server), so going there from inside the app (logo, logout) is a
  // full page load. Only for in-app navigation: when the server itself hands
  // "/" to the app (landing not built, or the Vite dev server), IndexView
  // shows instead, with no reload loop.
  // In development the page runs on its own server (VITE_LANDING_URL, see
  // client/.env.development), so "/" always goes there.
  const landingUrl = import.meta.env.VITE_LANDING_URL as string | undefined;
  if (to.path === "/" && (landingUrl || from.matched.length > 0)) {
    window.location.assign(landingUrl || "/");
    return next(false);
  }

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return next("/login");
  }

  if (to.path === "/login" && authStore.isAuthenticated) {
    if (authStore.isClient) return next("/portal/home");
    return next(authStore.isOwner ? "/app/platform/shops" : "/app/scheduler");
  }

  if (to.path.startsWith("/app") && authStore.isClient) {
    return next("/portal/home");
  }

  if (authStore.user?.role === "staff" && to.path.startsWith("/app") && !STAFF_PAGES.includes(to.path)) {
    return next("/app/scheduler");
  }

  if (to.meta.requiresAnalytics && !authStore.isAnalyticsAllowed) {
    return next("/app/scheduler");
  }

  if (to.meta.requiresShopAdmin && !authStore.isShopAdmin) {
    return next("/app/scheduler");
  }

  if (to.meta.requiresOwner && !authStore.isOwner) {
    return next("/app/scheduler");
  }

  if (
    to.path.startsWith("/portal") &&
    !authStore.isClient &&
    authStore.isAuthenticated
  ) {
    return next("/app/scheduler");
  }

  next();
});

export default router;
