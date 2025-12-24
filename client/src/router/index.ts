import { createRouter, createWebHistory } from "vue-router";
import SchedulerView from "../views/SchedulerView.vue";
import StaffView from "../views/StaffView.vue";
import ClientsView from "../views/ClientsView.vue";
import ServicesView from "../views/ServicesView.vue";
import FinancialsView from "../components/FinancialsView.vue";
import LoginView from "../views/LoginView.vue";
import profileView from "../views/profileView.vue";
import ProductsView from "../views/ProductsView.vue";
import { useAuthStore } from "../stores/auth";

const routes = [
  { path: "/", redirect: "/scheduler" },
  { path: "/login", component: LoginView },
  {
    path: "/scheduler",
    component: SchedulerView,
    meta: { requiresAuth: true },
  },
  { path: "/staff", component: StaffView, meta: { requiresAuth: true } },
  { path: "/clients", component: ClientsView, meta: { requiresAuth: true } },
  { path: "/services", component: ServicesView, meta: { requiresAuth: true } },
  { path: "/products", component: ProductsView, meta: { requiresAuth: true } },

  {
    path: "/financials",
    component: FinancialsView,
    meta: { requiresAuth: true },
  },
  { path: "/profile", component: profileView, meta: { requiresAuth: true } },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to, from, next) => {
  const auth = useAuthStore();
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    next("/login");
  } else {
    next();
  }
});

export default router;
