import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "../stores/auth";

// Views
import Layout from "../components/Layout.vue";
import IndexView from "../views/IndexView.vue";
import LoginView from "../views/LoginView.vue";
import SchedulerView from "../views/SchedulerView.vue";
import StaffView from "../views/StaffView.vue";
import ClientsView from "../views/ClientsView.vue";
import ServicesView from "../views/ServicesView.vue";
import ProductsView from "../views/ProductsView.vue";
import FinancialsView from "../components/FinancialsView.vue";
import profileView from "../views/profileView.vue";
import ClientPortalView from "../views/ClientPortalView.vue";
import SignupView from "../views/SignupView.vue";

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
      },
      {
        path: "/signup",
        name: "Signup",
        component: SignupView,
      },
      {
        path: "/portal",
        name: "ClientPortal",
        component: ClientPortalView,
        meta: { requiresAuth: true, role: "client" },
      },
      {
        path: "app", // Εσωτερικές σελίδες
        meta: { requiresAuth: true },
        children: [
          { path: "scheduler", component: SchedulerView },
          { path: "staff", component: StaffView },
          { path: "clients", component: ClientsView },
          { path: "services", component: ServicesView },
          { path: "products", component: ProductsView },
          { path: "financials", component: FinancialsView },
          { path: "profile", component: profileView },
        ],
      },
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

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to, from, next) => {
  const authStore = useAuthStore();

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return next("/login");
  }

  if (to.path === "/login" && authStore.isAuthenticated) {
    return authStore.isClient ? next("/portal") : next("/app/scheduler");
  }

  if (to.path.startsWith("/app") && authStore.isClient) {
    return next("/portal");
  }

  if (
    to.path === "/portal" &&
    !authStore.isClient &&
    authStore.isAuthenticated
  ) {
    return next("/app/scheduler");
  }

  next();
});

export default router;
