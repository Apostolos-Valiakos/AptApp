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
      },
    },
    build: {
      outDir: "../dist",
      emptyOutDir: true,
    },
  };
});
