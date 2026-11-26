// The app's frame around the page (REDESIGN_SPEC.md §6.4): the status bar
// with icons that read on the page behind it, and the splash screen hidden
// once the first screen is drawn. In a browser, the page's theme-color gives
// the browser's bar the shop's colour (a dark one in dark mode).
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { textOn } from "../theme/portalPreset";
import { isNative, quietly } from "./platform";

// The portal's page background (surface 50 / 950 in theme/portalPreset.ts).
export const LIGHT_BAR = "#faf7f2";
export const DARK_BAR = "#110e0b";

/**
 * The status bar's colour and icon style. Android 15 and later draw the app
 * under the status bar and ignore its colour, so the page itself is what the
 * icons sit on: they follow the scheme, not the shop's colour. Older Android
 * gets the page's colour as the bar's, so every phone looks the same.
 */
export const barFor = (dark: boolean) =>
  // Style.Dark means light icons, for a dark background.
  dark ? { background: DARK_BAR, style: Style.Dark } : { background: LIGHT_BAR, style: Style.Light };

export const useNativeChrome = () => ({
  /** Follows light / dark and, in a browser, the shop's colour. */
  applyTheme: (dark: boolean, colour: string) => {
    if (!isNative()) {
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? DARK_BAR : colour);
      return;
    }
    const { background, style } = barFor(dark);
    void quietly(() => StatusBar.setStyle({ style }));
    void quietly(() => StatusBar.setBackgroundColor({ color: background }));
  },
  /**
   * Status-bar icons that read on a full-screen colour drawn under the bar
   * (the pass is the shop's colour edge to edge). `applyTheme` puts the
   * page's own icons back.
   */
  iconsOver: (colour: string) => {
    if (!isNative()) return;
    void quietly(() => StatusBar.setStyle({ style: textOn(colour) === "#ffffff" ? Style.Dark : Style.Light }));
  },
  /** Hides the splash screen (kept up by capacitor.config.ts until now). */
  hideSplash: () => {
    if (isNative()) void quietly(() => SplashScreen.hide());
  },
});
