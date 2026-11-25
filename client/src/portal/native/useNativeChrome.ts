// The app's frame around the page (REDESIGN_SPEC.md §6.4): the status bar in
// the shop's colour (a dark one in dark mode), with icons that read on it, and
// the splash screen hidden once the first screen is drawn. In a browser, the
// page's theme-color tells the browser's bar the same colour.
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { textOn } from "../theme/portalPreset";
import { isNative, quietly } from "./platform";

// The portal's dark surface, behind the status bar in dark mode.
export const DARK_BAR = "#1c1714";

/** The status bar's colour and icon style for the scheme and the shop's colour. */
export const barFor = (dark: boolean, colour: string) => {
  const background = dark ? DARK_BAR : colour;
  // Style.Dark means light icons, for a dark background.
  const style = dark || textOn(colour) === "#ffffff" ? Style.Dark : Style.Light;
  return { background, style };
};

export const useNativeChrome = () => ({
  /** Follows light / dark and the shop's colour. */
  applyTheme: (dark: boolean, colour: string) => {
    const { background, style } = barFor(dark, colour);
    if (!isNative()) {
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", background);
      return;
    }
    void quietly(() => StatusBar.setStyle({ style }));
    void quietly(() => StatusBar.setBackgroundColor({ color: background }));
  },
  /** Hides the splash screen (kept up by capacitor.config.ts until now). */
  hideSplash: () => {
    if (isNative()) void quietly(() => SplashScreen.hide());
  },
});
