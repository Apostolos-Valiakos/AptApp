import { defineStore } from "pinia";
import { api } from "../api/http";
import { palette } from "@primeuix/themes";

export const useThemeStore = defineStore("theme", {
  state: () => ({
    primaryColor: "#8B6F4E", // Default — Pure Massage & Spa warm brown
  }),
  actions: {
    // 1. This updates the DOM immediately
    applyTheme(colorHex: string) {
      this.primaryColor = colorHex;

      // Generate the shades using PrimeVue's palette helper
      const shades = palette(colorHex);

      // Apply them to the HTML root
      const root = document.documentElement;

      // Set the main variable
      root.style.setProperty("--p-primary-color", colorHex);

      if (shades && typeof shades === "object") {
        Object.entries(shades).forEach(([key, value]) => {
          root.style.setProperty(`--p-primary-${key}`, value as string);
        });
      }
    },

    // 2. Fetch from DB
    async fetchAndApplyTheme() {
      try {
        const token = localStorage.getItem("token");
        if (!token) return; // If no token, keep default

        const data = await api.get("/api/v1/shop");
        if (data && data.primary_color) {
          this.applyTheme(data.primary_color);
        }
      } catch (error) {
        console.error("Failed to fetch theme:", error);
      }
    },
    async updateTheme(newColor: string) {
      // 1. Optimistic Update: Change the UI immediately so it feels fast
      const oldColor = this.primaryColor;
      this.applyTheme(newColor);

      try {
        await api.put("/api/v1/shop/theme", { primaryColor: newColor });

        // Success! (No action needed, UI is already updated)
      } catch (error) {
        console.error("Theme save failed:", error);
        this.applyTheme(oldColor);
      }
    },
  },
});
