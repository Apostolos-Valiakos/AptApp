import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import Components from "unplugin-vue-components/vite";
import { PrimeVueResolver } from "@primevue/auto-import-resolver";

// PrimeVue components are imported by the screens that use them (instead of
// all being registered in main.ts), so each screen's code only carries the
// components it needs and the first download stays small. "Dropdown" and
// "Calendar" are the app's older names for Select and DatePicker.
const primeVueAliases = { Dropdown: "primevue/select", Calendar: "primevue/datepicker" };
const PrimeVueAliasResolver = (name) =>
  primeVueAliases[name] ? { name: "default", from: primeVueAliases[name] } : undefined;

export default defineConfig(({ mode }) => {
  // Load env file from the root directory
  // process.cwd() tells Vite to look in the project root for the .env file
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      vue(),
      Components({
        dirs: [], // the app's own components stay explicitly imported
        dts: false,
        resolvers: [PrimeVueAliasResolver, PrimeVueResolver()],
      }),
    ],
    root: "client",
    server: {
      port: 5173,
      // Vite rejects requests whose Host header it doesn't recognize (a DNS
      // rebinding protection) — an ngrok tunnel's random *.ngrok-free.app
      // domain would otherwise get "Blocked request. This host is not
      // allowed." Wide open here since this is dev-only; never applies to
      // the production build (that's served by server.js, not Vite).
      allowedHosts: true,
      proxy: {
        "/api": {
          // Access variables from your .env file
          target: `${env.API_URL}:${env.PORT}`,
          changeOrigin: true,
          secure: false,
        },
        "/socket.io": {
          target: `${env.API_URL}:${env.PORT}`,
          ws: true,
        },
        "/health": {
          target: `${env.API_URL}:${env.PORT}`,
          changeOrigin: true,
          secure: false,
        },
        "/manifest.webmanifest": {
          target: `${env.API_URL}:${env.PORT}`,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
  };
});
