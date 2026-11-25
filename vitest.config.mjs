import { defineConfig } from "vitest/config";

// Unit tests: the offline mode, bookings and the bonus, and the Android app (tests/offline, tests/booking, tests/app). Separate from
// vite.config.mjs, whose root is client/ for the app build.
export default defineConfig({
  test: {
    include: ["tests/offline/**/*.test.ts", "tests/booking/**/*.test.ts", "tests/app/**/*.test.ts"],
    environment: "node",
    setupFiles: ["tests/offline/setup.ts"],
  },
});
