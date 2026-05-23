import { defineStore } from "pinia";
import { palette } from "@primeuix/themes";

export const useThemeStore = defineStore("theme", {
  state: () => ({
    primaryColor: "#ff93d4", // Default
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

        const response = await fetch("/api/v1/shop", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (data && data.primary_color) {
            this.applyTheme(data.primary_color);
          }
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
        const token = localStorage.getItem("token"); // or access_token
        const response = await fetch("/api/v1/shop/theme", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ primaryColor: newColor }),
        });

        if (!response.ok) {
          throw new Error("Failed to save theme");
        }

        // Success! (No action needed, UI is already updated)
      } catch (error) {
        console.error("Theme save failed:", error);
        this.applyTheme(oldColor);
      }
    },
  },
});
