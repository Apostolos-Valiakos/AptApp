// The client portal's theme (docs/redesign/REDESIGN_SPEC.md §4): Aura with
// warm surfaces, rounder corners and a visible focus ring. White-label: the
// shop's own colour is the primary; Pure's bronze is only the default.
import Aura from "@primevue/themes/aura";
import { definePreset, palette } from "@primeuix/themes";
import { DEFAULT_PRIMARY } from "../../theme/appPreset";

// Relative luminance (WCAG) of a "#rrggbb" colour.
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** The text colour that reads best on the shop's colour: white, or near-black for a light one. */
export const textOn = (hex: string) => {
  const ok = /^#[0-9a-f]{6}$/i.test(hex) ? hex : DEFAULT_PRIMARY;
  const DARK = "#211a14";
  return contrast(luminance(ok), 1) >= contrast(luminance(ok), luminance(DARK)) ? "#ffffff" : DARK;
};

export const portalPreset = (primaryHex: string = DEFAULT_PRIMARY) =>
  definePreset(Aura, {
    // Outlined and text buttons write in the shop's colour: a darker shade of
    // it (a lighter one in the dark), so a pale colour still reads.
    components: {
      button: {
        colorScheme: {
          light: { outlined: { primary: { color: "{primary.800}", borderColor: "{primary.300}" } }, text: { primary: { color: "{primary.800}" } } },
          dark: { outlined: { primary: { color: "{primary.300}", borderColor: "{primary.600}" } }, text: { primary: { color: "{primary.300}" } } },
        },
      },
    },
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
          // The shop's own colour on buttons, with text that reads on it.
          primary: { color: primaryHex, contrastColor: textOn(primaryHex), hoverColor: "{primary.600}", activeColor: "{primary.700}" },
          text: { color: "{surface.900}", mutedColor: "{surface.600}" },
          content: { background: "{surface.0}", borderColor: "{surface.200}" },
        },
        dark: {
          surface: {
            0: "#ffffff", 50: "#f4eee6", 100: "#e2d8cc", 200: "#c6b8a8", 300: "#a08f7c", 400: "#7a6b5b",
            500: "#5a4e42", 600: "#423930", 700: "#302a23", 800: "#231e19", 900: "#1a1612", 950: "#110e0b",
          },
          primary: { color: primaryHex, contrastColor: textOn(primaryHex), hoverColor: "{primary.400}", activeColor: "{primary.300}" },
          text: { color: "{surface.50}", mutedColor: "{surface.300}" },
          content: { background: "{surface.900}", borderColor: "{surface.700}" },
        },
      },
    },
  });
