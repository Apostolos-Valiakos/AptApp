// Every test starts with an empty browser: no saved login, no offline data, a
// fresh Pinia, the Greek interface and the network up.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { enableAutoUnmount } from "@vue/test-utils";
import { resetDbConnection } from "../../client/src/offline/db";
import { i18n } from "../../client/src/i18n";

// Layout features the browser-like page doesn't have; PrimeVue asks for them.
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
  onchange: null,
})) as typeof window.matchMedia;
window.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

beforeEach(() => {
  (globalThis as any).indexedDB = new IDBFactory();
  resetDbConnection();
  localStorage.clear();
  i18n.global.locale.value = "el";
  setActivePinia(createPinia());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

// Registered last so it runs first: screens are unmounted before the page is emptied.
enableAutoUnmount(afterEach);
