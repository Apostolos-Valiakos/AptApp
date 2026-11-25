// The check-in pass at full brightness, so the shop's scanner reads it (N4).
// In the app the screen goes to full while the pass is open and back after;
// in a browser the white field around the code is the brightest it can be.
import { ScreenBrightness } from "@capacitor-community/screen-brightness";
import { isNative, quietly } from "./platform";

// What the screen was before the pass opened; -1 is the system's own setting.
let before: number | null = null;

export const useBrightness = () => ({
  boost: async () => {
    if (!isNative()) return;
    const current = await quietly(() => ScreenBrightness.getBrightness());
    if (before === null) before = typeof current?.brightness === "number" ? current.brightness : -1;
    await quietly(() => ScreenBrightness.setBrightness({ brightness: 1 }));
  },
  restore: async () => {
    if (!isNative() || before === null) return;
    const previous = before;
    before = null;
    await quietly(() => ScreenBrightness.setBrightness({ brightness: previous }));
  },
});
