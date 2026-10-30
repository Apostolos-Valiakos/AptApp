import { createApp, watch } from "vue";

// In the Capacitor native build there is no Vite proxy, so relative /api
// URLs would resolve to capacitor://localhost/api and fail. Patch fetch to
// prepend the real server origin when VITE_API_BASE_URL is set at build time.
const _apiBase = (import.meta.env.VITE_API_BASE_URL as string) ?? "";
if (_apiBase) {
  const _orig = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (
      typeof input === "string" &&
      (input.startsWith("/api") ||
        input.startsWith("/socket.io") ||
        input.startsWith("/health"))
    ) {
      return _orig(_apiBase + input, init);
    }
    return _orig(input, init);
  };
}
import { createPinia } from "pinia";
import PrimeVue from "primevue/config";
import App from "./App.vue";
import router from "./router";
import { installSessionRecovery } from "./utils/sessionRecovery";

// === PrimeVue v4 Theming ===
import Aura from "@primevue/themes/aura";
import { definePreset, palette } from "@primeuix/themes";

// Core Styles
import "primeicons/primeicons.css";
import "./assets/tailwind.css";

// Services
import ToastService from "primevue/toastservice";
import ConfirmationService from "primevue/confirmationservice";
import Tooltip from "primevue/tooltip";

// === COMPONENTS ===
// PrimeVue components aren't registered here: the build imports each one in
// the screens that use it (unplugin-vue-components, see vite.config.mjs), so
// the first download only carries what the first screen needs.
import { useThemeStore } from "./stores/themes";
import { i18n } from "./i18n";
import { elDatePickerNames } from "./i18n/datePicker";
import { initOfflineSync } from "./offline/queue";

declare const __APP_SW__: boolean; // set by vite.config.mjs

const MyPreset = definePreset(Aura, {
  semantic: {
    primary: palette("#8B6F4E"),
  },
});

const initApp = async () => {
  const app = createApp(App);
  const pinia = createPinia();

  // 2. Install Pinia FIRST so we can use stores
  app.use(pinia);

  // 3. Use the store to fetch/apply theme before mounting
  // At most 3s: with a hung connection the app must still open (offline mode).
  const themeStore = useThemeStore();
  await Promise.race([themeStore.fetchAndApplyTheme(), new Promise((r) => setTimeout(r, 3000))]);

  app.use(router);
  // Expired session → login page; stale build after a rebuild → reload.
  installSessionRecovery(router);
  app.use(i18n);
  app.use(ToastService);
  app.use(ConfirmationService);

  // Initialize PrimeVue with the dynamic v4 Theme Preset
  app.use(PrimeVue, {
    // Weeks start on Monday in every date picker.
    locale: { firstDayOfWeek: 1 },
    theme: {
      preset: MyPreset,
      options: {
        darkModeSelector: ".my-app-dark",
      },
    },
    ripple: true,
  });

  // Date pickers show months and days in the app's language, and follow it
  // when it changes.
  const primevue = app.config.globalProperties.$primevue;
  const defaultLocale: any = { ...primevue.config.locale };
  watch(
    i18n.global.locale,
    (lang) => {
      primevue.config.locale = lang === "el" ? { ...defaultLocale, ...elDatePickerNames } : defaultLocale;
    },
    { immediate: true },
  );

  // Directives
  app.directive("tooltip", Tooltip);


  // Offline write queue: safe to init even when logged out, it just sits
  // idle with an empty queue until a booking/payment write actually needs it.
  initOfflineSync();
  // Keeps the staff app's files in the browser, so /app/* opens offline
  // (client/sw/app-sw.js; production builds only).
  if (__APP_SW__ && "serviceWorker" in navigator) {
    navigator.serviceWorker.register("/app-sw.js", { scope: "/app/" }).catch((err) => {
      console.warn("App service worker not registered", err);
    });
  }

  // 6. Mount the app (Removes the index.html spinner)
  app.mount("#app");
};

// Execute the async start
initApp();
