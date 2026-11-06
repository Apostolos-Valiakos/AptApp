import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import Components from "unplugin-vue-components/vite";
import { PrimeVueResolver } from "@primevue/auto-import-resolver";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

// PrimeVue components are imported by the screens that use them (instead of
// all being registered in main.ts), so each screen's code only carries the
// components it needs and the first download stays small. "Dropdown" and
// "Calendar" are the app's older names for Select and DatePicker.
const primeVueAliases = { Dropdown: "primevue/select", Calendar: "primevue/datepicker" };
const PrimeVueAliasResolver = (name) =>
  primeVueAliases[name] ? { name: "default", from: primeVueAliases[name] } : undefined;

// The staff app's service worker (client/sw/app-sw.js), written into the build
// with this build's file list, so the app opens offline. Build only:
// __APP_SW__ tells main.ts whether to register it.
const appServiceWorker = () => {
  let isBuild = false;
  return {
    name: "app-service-worker",
    config: (_, { command }) => {
      isBuild = command === "build";
      return { define: { __APP_SW__: JSON.stringify(isBuild) } };
    },
    generateBundle(_, bundle) {
      if (!isBuild) return;
      const files = Object.keys(bundle)
        .filter((f) => f.startsWith("assets/") && /\.(js|css|woff2|png|ico)$/.test(f))
        .map((f) => `/${f}`)
        .sort();
      const template = fs.readFileSync(path.resolve("client/sw/app-sw.js"), "utf8");
      const buildId = createHash("sha256").update(files.join("\n")).digest("hex").slice(0, 12);
      const fill = (src, line, value) => {
        if (!src.includes(line)) throw new Error(`app-sw.js: "${line}" not found`);
        return src.replace(line, line.replace(/__\w+__/, value));
      };
      let source = fill(template, "const BUILD_ID = __BUILD_ID__;", JSON.stringify(buildId));
      source = fill(source, "const PRECACHE = __PRECACHE__;", JSON.stringify(files));
      this.emitFile({ type: "asset", fileName: "app-sw.js", source });
    },
  };
};

export default defineConfig(({ mode }) => {
  // Load env file from the root directory
  // process.cwd() tells Vite to look in the project root for the .env file
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      vue(),
      appServiceWorker(),
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
