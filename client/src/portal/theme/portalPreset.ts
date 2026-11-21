// The client portal's theme (docs/redesign/REDESIGN_SPEC.md §4): Aura with
// warm surfaces, rounder corners and a visible focus ring. White-label: the
// shop's own colour is the primary; Pure's bronze is only the default.
import Aura from "@primevue/themes/aura";
import { definePreset, palette } from "@primeuix/themes";
import { DEFAULT_PRIMARY } from "../../theme/appPreset";

export const portalPreset = (primaryHex: string = DEFAULT_PRIMARY) =>
  definePreset(Aura, {
    primitive: { borderRadius: { none: "0", xs: "6px", sm: "10px", md: "14px", lg: "20px", xl: "28px" } },
    semantic: {
      primary: palette(primaryHex),
      focusRing: { width: "2px", style: "solid", color: "{primary.400}", offset: "2px" },
      colorScheme: {
        light: {
          surface: {
            0: "#ffffff", 50: "#faf7f2", 100: "#f4eee6", 200: "#e9e0d4", 300: "#d6c8b6", 400: "#b8a690",
            500: "#94826d", 600: "#6f604f", 700: "#4f4337", 800: "#352c24", 900: "#211a14", 950: "#140f0b",
          },
          text: { color: "{surface.900}", mutedColor: "{surface.600}" },
          content: { background: "{surface.0}", borderColor: "{surface.200}" },
        },
        dark: {
          surface: {
            0: "#ffffff", 50: "#f4eee6", 100: "#e2d8cc", 200: "#c6b8a8", 300: "#a08f7c", 400: "#7a6b5b",
            500: "#5a4e42", 600: "#423930", 700: "#302a23", 800: "#231e19", 900: "#1a1612", 950: "#110e0b",
          },
          text: { color: "{surface.50}", mutedColor: "{surface.300}" },
          content: { background: "{surface.900}", borderColor: "{surface.700}" },
        },
      },
    },
  });
