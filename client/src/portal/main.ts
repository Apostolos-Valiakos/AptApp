// The Android app's entry (client/portal.html, `npm run build:portal`): the
// client portal only, nothing of the staff app (docs/redesign/REDESIGN_SPEC.md
// §6.2). Set up like the web entry (../main.ts), with its own router and the
// portal's look from the first paint.
import { createApp, watch } from "vue";
import { installApiBase } from "../apiBase";

// There is no server behind the app's page: requests go to VITE_API_BASE_URL.
installApiBase();
import { createPinia } from "pinia";
import PrimeVue from "primevue/config";
import ToastService from "primevue/toastservice";
import ConfirmationService from "primevue/confirmationservice";
import Tooltip from "primevue/tooltip";
import "primeicons/primeicons.css";
import "../assets/tailwind.css";
import App from "../App.vue";
import { createPortalRouter } from "./router";
import { installSessionRecovery } from "../utils/sessionRecovery";
import { useThemeStore } from "../stores/themes";
import { i18n, savedLocale, setLocale } from "../i18n";
import { elDatePickerNames } from "../i18n/datePicker";
import { portalPreset } from "./theme/portalPreset";
import { setOutsidePortalPreset } from "./composables/usePortalTheme";
import { useDeepLinks } from "./native/useDeepLinks";
import { useNativeChrome } from "./native/useNativeChrome";

const start = async () => {
  const app = createApp(App);
  app.use(createPinia());

  // The shop's colour when a client is already signed in (at most 3 s: with
  // no connection the app must still open, offline).
  const themeStore = useThemeStore();
  await Promise.race([themeStore.fetchAndApplyTheme(), new Promise((r) => setTimeout(r, 3000))]);
  // The portal's look everywhere, the login page included, in the shop's
  // colour once known.
  const preset = portalPreset(themeStore.primaryColor);
  setOutsidePortalPreset(preset);

  const router = createPortalRouter();
  app.use(router);
  // An expired session goes back to the login page.
  installSessionRecovery(router);
  app.use(i18n);
  app.use(ToastService);
  app.use(ConfirmationService);
  app.use(PrimeVue, {
    locale: { firstDayOfWeek: 1 },
    theme: { preset, options: { darkModeSelector: ".my-app-dark" } },
    ripple: true,
  });

  // Date pickers in the app's language, following it when it changes.
  const primevue = app.config.globalProperties.$primevue;
  const defaultLocale: any = { ...primevue.config.locale };
  watch(
    i18n.global.locale,
    (lang) => {
      primevue.config.locale = lang === "el" ? { ...defaultLocale, ...elDatePickerNames } : defaultLocale;
    },
    { immediate: true },
  );
  app.directive("tooltip", Tooltip);

  await setLocale(savedLocale).catch(() => {});
  // App Links to /portal/* and Android's back button.
  useDeepLinks().install(router);
  app.mount("#app");

  // The status bar in the shop's colour from the start, and the splash
  // screen gone once the first screen is drawn.
  const chrome = useNativeChrome();
  chrome.applyTheme(false, themeStore.primaryColor);
  requestAnimationFrame(() => chrome.hideSplash());
};

start();
