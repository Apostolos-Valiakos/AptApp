// The portal's own look: its preset in the shop's colour while the portal is
// open, the staff app's preset back once it closes, and the client's light /
// dark choice. PT1–PT3.
import { afterEach, describe, expect, test, vi } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { Theme, palette } from "@primeuix/themes";
import { usePortalTheme, useAppearance, DARK_CLASS } from "../../client/src/portal/composables/usePortalTheme";
import { appPreset } from "../../client/src/theme/appPreset";
import { useThemeStore } from "../../client/src/stores/themes";
import { fakeServer, mountScreen, saveLogin, settle } from "./helpers";

const Host = defineComponent({ setup: () => (usePortalTheme(), () => h("div")) });
const primary500 = () => (Theme.getPreset() as any)?.semantic?.primary?.[500];
const darkMedia = (matches: boolean) => {
  const listeners: (() => void)[] = [];
  const media = { matches, addEventListener: (_: string, f: () => void) => listeners.push(f), removeEventListener: () => {} };
  vi.stubGlobal("matchMedia", () => media);
  return { flip: (to: boolean) => ((media.matches = to), listeners.forEach((f) => f())) };
};
const open = () => {
  saveLogin({ id: "u1", role: "client", shop_id: "s1", client_id: "c1" });
  fakeServer();
  return mountScreen(Host);
};

afterEach(() => {
  useAppearance().setAppearance("system");
  document.documentElement.classList.remove(DARK_CLASS);
});

describe("PT1 white-label", () => {
  test("the portal's primary is the shop's colour, and follows it when it changes", async () => {
    darkMedia(false);
    useThemeStore().primaryColor = "#2E6B5E";
    open();
    await settle();
    expect(primary500()).toBe(palette("#2E6B5E")[500]);
    expect((Theme.getPreset() as any).semantic.colorScheme.light.surface[50]).toBe("#faf7f2");
    useThemeStore().primaryColor = "#7A3B69";
    await nextTick();
    expect(primary500()).toBe(palette("#7A3B69")[500]);
  });

  test("leaving the portal puts the staff app's theme back", async () => {
    darkMedia(false);
    const wrapper = open();
    await settle();
    wrapper.unmount();
    expect(Theme.getPreset()).toEqual(appPreset);
  });
});

describe("PT2 light and dark", () => {
  test("follows the device unless the client chose", async () => {
    const device = darkMedia(true);
    open();
    await settle();
    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(true);
    device.flip(false);
    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(false);
    useAppearance().setAppearance("dark");
    await nextTick();
    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(true);
    device.flip(false);
    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(true);
  });

  test("the choice is remembered on this device; \"follow the device\" forgets it", () => {
    useAppearance().setAppearance("light");
    expect(localStorage.getItem("portal.appearance")).toBe("light");
    useAppearance().setAppearance("system");
    expect(localStorage.getItem("portal.appearance")).toBeNull();
  });
});

describe("PT3 the staff app stays light", () => {
  test("closing the portal removes dark mode", async () => {
    darkMedia(true);
    const wrapper = open();
    await settle();
    wrapper.unmount();
    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(false);
  });
});

describe("PT4 text that reads on the shop's colour", () => {
  test("white on a dark colour, near-black on a light one (WCAG contrast)", async () => {
    const { textOn } = await import("../../client/src/portal/theme/portalPreset");
    expect(textOn("#8B6F4E")).toBe("#ffffff");
    expect(textOn("#2E6B5E")).toBe("#ffffff");
    expect(textOn("#D4A97A")).toBe("#211a14");
    expect(textOn("#F2E8DC")).toBe("#211a14");
    expect(textOn("not a colour")).toBe("#ffffff");
  });
});
