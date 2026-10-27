// Browser pieces the offline code uses, for tests run in Node: a fresh
// in-memory IndexedDB per test, localStorage, window events and navigator.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, vi } from "vitest";
import { resetDbConnection } from "../../client/src/offline/db";

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(k: string) {
    return this.data.has(k) ? this.data.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, String(v));
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
  clear() {
    this.data.clear();
  }
}

const target = new EventTarget();
(globalThis as any).window = Object.assign(target, {
  addEventListener: target.addEventListener.bind(target),
  removeEventListener: target.removeEventListener.bind(target),
  dispatchEvent: target.dispatchEvent.bind(target),
});
(globalThis as any).localStorage = new MemoryStorage();
Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, writable: true, configurable: true });

beforeEach(() => {
  (globalThis as any).indexedDB = new IDBFactory();
  resetDbConnection();
  (globalThis as any).localStorage.clear();
  (globalThis as any).navigator.onLine = true;
  vi.useRealTimers();
});
