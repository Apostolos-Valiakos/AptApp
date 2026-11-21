// Puts the portal's look on while the portal shell is open and takes it off
// when it closes: the portal preset in the shop's colour, and the client's
// light / dark choice (N11). The staff app never runs this, so its own theme
// and its always-light screens are untouched.
import { onMounted, onUnmounted, ref, watch } from "vue";
import { usePreset } from "@primeuix/themes";
import { useThemeStore } from "../../stores/themes";
import { appPreset } from "../../theme/appPreset";
import { portalPreset } from "../theme/portalPreset";

export type Appearance = "system" | "light" | "dark";

const STORAGE_KEY = "portal.appearance";
export const DARK_CLASS = "my-app-dark"; // PrimeVue's darkModeSelector (main.ts)

// A per-device preference: a private window or blocked storage just means
// "follow the device".
const readAppearance = (): Appearance => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
};
const saveAppearance = (value: Appearance) => {
  try {
    if (value === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, value);
  } catch {}
};

// Shared by every component that shows or changes it (shell, Profile).
const appearance = ref<Appearance>(readAppearance());

export const useAppearance = () => ({
  appearance,
  setAppearance: (value: Appearance) => {
    appearance.value = value;
    saveAppearance(value);
  },
});

export const usePortalTheme = () => {
  const themeStore = useThemeStore();
  const media = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  const isDark = () => appearance.value === "dark" || (appearance.value === "system" && !!media?.matches);
  const applyScheme = () => document.documentElement.classList.toggle(DARK_CLASS, isDark());
  const applyPreset = () => usePreset(portalPreset(themeStore.primaryColor));

  const stopColour = watch(() => themeStore.primaryColor, applyPreset);
  const stopScheme = watch(appearance, applyScheme);

  onMounted(() => {
    applyPreset();
    applyScheme();
    media?.addEventListener?.("change", applyScheme);
  });
  onUnmounted(() => {
    stopColour();
    stopScheme();
    media?.removeEventListener?.("change", applyScheme);
    document.documentElement.classList.remove(DARK_CLASS);
    usePreset(appPreset);
  });

  return { isDark };
};
