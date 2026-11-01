import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import Components from "unplugin-vue-components/vite";
import { PrimeVueResolver } from "@primevue/auto-import-resolver";

// The business-requirement tests (tests/spec/): screens, stores and rules run
// in a browser-like page, with only the network and browser APIs replaced.
// Separate from vitest.config.mjs: some of these fail until the app catches up
// with the requirements, and `npm test` stays as it is until then.
const primeVueAliases = { Dropdown: "primevue/select", Calendar: "primevue/datepicker" };
const PrimeVueAliasResolver = (name) =>
  primeVueAliases[name] ? { name: "default", from: primeVueAliases[name] } : undefined;

export default defineConfig({
  plugins: [
    vue(),
    Components({
      dirs: [],
      dts: false,
      resolvers: [PrimeVueAliasResolver, PrimeVueResolver()],
    }),
  ],
  test: {
    include: ["tests/spec/**/*.spec.ts"],
    environment: "jsdom",
    environmentOptions: { jsdom: { url: "http://localhost/" } },
    setupFiles: ["tests/spec/setup.ts"],
    testTimeout: 30000,
    css: false,
    server: { deps: { inline: ["primevue", /@primevue/, /@primeuix/, /@fullcalendar/] } },
  },
});
