import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fitRowHeight,
  readSavedRowHeight,
  saveRowHeight,
  zoomedIn,
  zoomedOut,
} from "../../client/src/utils/schedulerZoom";

describe("fitRowHeight", () => {
  it("is the tallest whole row that shows every working hour", () => {
    // 09:00-21:00 is 48 rows: 25 px fits in 1247 px, 26 px wouldn't.
    expect(fitRowHeight(1247, "09:00:00", "21:00:00")).toBe(25);
  });
  it("counts a part-filled last row", () => {
    expect(fitRowHeight(500, "09:00:00", "09:40:00")).toBe(81); // capped; 3 rows
    expect(fitRowHeight(90, "09:00:00", "09:40:00")).toBe(30);
  });
  it("stays readable on a long day, and within the zoom range", () => {
    // 09:00-23:00 on a phone would need 10 px rows: it scrolls instead.
    expect(fitRowHeight(607, "09:00:00", "23:00:00")).toBe(20);
    expect(fitRowHeight(5000, "09:00:00", "17:00:00")).toBe(81);
  });
});

describe("zoom steps", () => {
  it("moves one step, also from a fitted height between steps", () => {
    expect(zoomedIn(27)).toBe(40);
    expect(zoomedOut(27)).toBe(20);
    expect(zoomedIn(11)).toBe(13);
    expect(zoomedOut(11)).toBe(9);
  });
  it("stops at the ends", () => {
    expect(zoomedIn(81)).toBe(81);
    expect(zoomedOut(9)).toBe(9);
  });
});

describe("the saved zoom", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    });
  });
  afterEach(() => vi.unstubAllGlobals());
  it("is nothing until the user picks one", () => {
    expect(readSavedRowHeight()).toBe(null);
  });
  it("comes back as saved", () => {
    saveRowHeight(40);
    expect(readSavedRowHeight()).toBe(40);
  });
  it("ignores a value that isn't a zoom step", () => {
    store.set("scheduler.rowHeight", "33");
    expect(readSavedRowHeight()).toBe(null);
    store.set("scheduler.rowHeight", "junk");
    expect(readSavedRowHeight()).toBe(null);
  });
  it("copes with storage being unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    });
    expect(readSavedRowHeight()).toBe(null);
    expect(() => saveRowHeight(40)).not.toThrow();
  });
});
