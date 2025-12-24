import { createApp } from "vue";
import { createPinia } from "pinia";
import PrimeVue from "primevue/config";
import App from "./App.vue";
import router from "./router";

// === PrimeVue v4 Theming ===
// The old "resources/themes/..." imports are removed in v4.
// You must import a preset from @primevue/themes instead.
import Aura from "@primevue/themes/aura"; // Ensure you ran: npm install @primevue/themes

// Core Styles
import "primeicons/primeicons.css";
import "./assets/tailwind.css";

// Services
import ToastService from "primevue/toastservice";
import ConfirmationService from "primevue/confirmationservice";
import Tooltip from "primevue/tooltip";

// === COMPONENTS ===
// Note: In PrimeVue v4, some components were renamed.
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Select from "primevue/select";
import InputText from "primevue/inputtext";
import InputNumber from "primevue/inputnumber";
import DatePicker from "primevue/datepicker";
import Textarea from "primevue/textarea";
import Checkbox from "primevue/checkbox";
import { MultiSelect } from "primevue";

import Chip from "primevue/chip";
import Card from "primevue/card";
import Avatar from "primevue/avatar";
import ScrollPanel from "primevue/scrollpanel";
import Divider from "primevue/divider";
import FloatLabel from "primevue/floatlabel";

import Toast from "primevue/toast";
import ConfirmDialog from "primevue/confirmdialog";
import DataTable from "primevue/datatable";
import Column from "primevue/column";
import Chart from "primevue/chart";

const app = createApp(App);

app.use(createPinia());
app.use(router);
app.use(ToastService);
app.use(ConfirmationService);

// Initialize PrimeVue with the v4 Theme Preset
app.use(PrimeVue, {
  theme: {
    preset: Aura,
    options: {
      // Toggle dark mode based on a class, or use 'system'
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

app.component("DatePicker", DatePicker);
app.component("Calendar", DatePicker);

app.component("Textarea", Textarea);
app.component("Checkbox", Checkbox);
app.component("MultiSelect", MultiSelect);

app.component("Chip", Chip);
app.component("Card", Card);
app.component("Avatar", Avatar);
app.component("ScrollPanel", ScrollPanel);
app.component("Divider", Divider);
app.component("FloatLabel", FloatLabel);

app.component("Toast", Toast);
app.component("ConfirmDialog", ConfirmDialog);
app.component("DataTable", DataTable);
app.component("Column", Column);

app.mount("#app");
