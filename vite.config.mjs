// vite.config.js (root of project)
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  root: "client",
  server: {
    port: 5173,
    proxy: {
      // This forwards any request starting with /api to your backend
      "/api": {
        target: "http://192.168.68.58:3000",
        changeOrigin: true,
        secure: false,
      },
      "/socket.io": {
        target: "http://192.168.68.58:3000",
        ws: true,
      },
    },
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
});
