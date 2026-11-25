// Links and the back button in the app (N12, REDESIGN_SPEC.md §6.4):
// - a link to purespabooking.gr/portal/... (App Links) opens that screen in the
//   app instead of the browser;
// - Android's back button closes an open sheet or dialog first, then goes back
//   a screen, and at the first screen leaves the app (to the background).
// In a browser none of this is needed: links and the back button already work.
import { App } from "@capacitor/app";
import type { Router } from "vue-router";
import { isNative, quietly } from "./platform";

// The screens a link may open in the app; anything else stays in the browser.
const IN_APP = /^\/(portal|login|signup)(\/|$|\?)/;

/** The app path for an opened link, or null when it isn't one of the app's. */
export const appPathFor = (url: string) => {
  try {
    const u = new URL(url);
    const path = `${u.pathname}${u.search}`;
    return IN_APP.test(path) ? path : null;
  } catch {
    return null;
  }
};

// A sheet, drawer or dialog drawn on top (PrimeVue's, all closed by Escape).
const overlayOpen = () => !!document.querySelector(".p-drawer, .p-dialog");

export const useDeepLinks = () => ({
  install: (router: Router) => {
    if (!isNative()) return;
    void quietly(() =>
      App.addListener("appUrlOpen", ({ url }) => {
        const path = appPathFor(url);
        if (path) router.push(path);
      }),
    );
    void quietly(() =>
      App.addListener("backButton", () => {
        if (overlayOpen()) {
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
          return;
        }
        const atStart = ["/portal/home", "/login"].includes(router.currentRoute.value.path);
        if (atStart || window.history.length <= 1) void quietly(() => App.minimizeApp());
        else router.back();
      }),
    );
  },
});
