import { defineConfig } from "vitest/config";

// Unit tests for the offline mode (tests/offline/*.test.ts). Separate from
// vite.config.mjs, whose root is client/ for the app build.
export default defineConfig({
  test: {
    include: ["tests/offline/**/*.test.ts"],
    environment: "node",
    setupFiles: ["tests/offline/setup.ts"],
  },
});
