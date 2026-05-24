import { createApp } from "vue";

// In the Capacitor native build there is no Vite proxy, so relative /api
// URLs would resolve to capacitor://localhost/api and fail. Patch fetch to
// prepend the real server origin when VITE_API_BASE_URL is set at build time.
const _apiBase = (import.meta.env.VITE_API_BASE_URL as string) ?? "";
if (_apiBase) {
  const _orig = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (
      typeof input === "string" &&
      (input.startsWith("/api") || input.startsWith("/socket.io"))
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
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Select from "primevue/select";
import InputText from "primevue/inputtext";
import InputNumber from "primevue/inputnumber";
import DatePicker from "primevue/datepicker";
import Textarea from "primevue/textarea";
import Checkbox from "primevue/checkbox";
import ProgressBar from "primevue/progressbar";
import { MultiSelect } from "primevue";

import Chip from "primevue/chip";
import Card from "primevue/card";
import Avatar from "primevue/avatar";
import ScrollPanel from "primevue/scrollpanel";
import Divider from "primevue/divider";
import FloatLabel from "primevue/floatlabel";
import ColorPicker from "primevue/colorpicker";
import ToggleSwitch from "primevue/toggleswitch";
import Tag from "primevue/tag";
import Toast from "primevue/toast";
import ConfirmDialog from "primevue/confirmdialog";
import DataTable from "primevue/datatable";
import Column from "primevue/column";
import Chart from "primevue/chart";
import { useThemeStore } from "./stores/themes";
import { i18n } from "./i18n";

const MyPreset = definePreset(Aura, {
  semantic: {
    primary: palette("#ff93d4"),
  },
});

const initApp = async () => {
  const app = createApp(App);
  const pinia = createPinia();

  // 2. Install Pinia FIRST so we can use stores
  app.use(pinia);

  // 3. Use the store to fetch/apply theme before mounting
  const themeStore = useThemeStore();
  await themeStore.fetchAndApplyTheme();

  app.use(router);
  app.use(i18n);
  app.use(ToastService);
  app.use(ConfirmationService);

  // Initialize PrimeVue with the dynamic v4 Theme Preset
  app.use(PrimeVue, {
    theme: {
      preset: MyPreset,
      options: {
        darkModeSelector: ".my-app-dark",
      },
    },
    ripple: true,
  });

  // Directives
  app.directive("tooltip", Tooltip);

  // === REGISTER COMPONENTS ===
  app.component("Button", Button);
  app.component("Dialog", Dialog);
  app.component("Dropdown", Select);
  app.component("InputText", InputText);
  app.component("InputNumber", InputNumber);
  app.component("Chart", Chart);
  app.component("ColorPicker", ColorPicker);
  app.component("ProgressBar", ProgressBar);

  app.component("DatePicker", DatePicker);
  app.component("Calendar", DatePicker);

  app.component("Textarea", Textarea);
  app.component("Tag", Tag);
  app.component("Checkbox", Checkbox);
  app.component("MultiSelect", MultiSelect);

  app.component("Chip", Chip);
  app.component("Card", Card);
  app.component("Avatar", Avatar);
  app.component("ScrollPanel", ScrollPanel);
  app.component("Divider", Divider);
  app.component("FloatLabel", FloatLabel);
  app.component("ToggleSwitch", ToggleSwitch);
  app.component("Toast", Toast);
  app.component("ConfirmDialog", ConfirmDialog);
  app.component("DataTable", DataTable);
  app.component("Column", Column);

  // 6. Mount the app (Removes the index.html spinner)
  app.mount("#app");
};

// Execute the async start
initApp();
