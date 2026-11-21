// The staff app's theme: Aura with Pure's bronze as primary (each shop's own
// colour is applied over it at runtime, stores/themes.ts). The client portal
// swaps in its own preset while it's open (portal/theme/portalPreset.ts) and
// puts this one back when it closes.
import Aura from "@primevue/themes/aura";
import { definePreset, palette } from "@primeuix/themes";

export const DEFAULT_PRIMARY = "#8B6F4E";

export const appPreset = definePreset(Aura, {
  semantic: {
    primary: palette(DEFAULT_PRIMARY),
  },
});
