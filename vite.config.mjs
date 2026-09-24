import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig(({ mode }) => {
  // Load env file from the root directory
  // process.cwd() tells Vite to look in the project root for the .env file
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [vue()],
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
