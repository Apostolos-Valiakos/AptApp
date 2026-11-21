// The shared helpers that replaced the copies listed in code-review.html:
// dates and times, accent folding, rounding, appointment statuses, durations.
import { describe, expect, test } from "vitest";
import { clockTime, dateLocale, formatDate, formatDuration } from "../../client/src/utils/format";
import { foldText } from "../../client/src/utils/text";
import { round2 } from "../../client/src/utils/money";
import { historyBadge, statusBadge, statusDot, statusKey } from "../../client/src/utils/appointmentStatus";
import el from "../../client/src/i18n/locales/el";
import { i18n } from "../../client/src/i18n";

const at = new Date(2026, 9, 21, 9, 5); // 21 October 2026, 09:05 where the device is

describe("dates follow the app's language", () => {
  test.each([
    ["numeric", "el", "21/10/2026"],
    ["numeric", "en", "21/10/2026"],
    ["short", "en", "21 Oct 2026"],
    ["dayMonth", "en", "21 Oct"],
    ["numericTime", "en", "21/10/2026, 09:05"],
  ] as const)("%s in %s", (style, lang, expected) => {
    expect(formatDate(at, lang, style)).toBe(expected);
  });

  test("Greek month names in Greek", () => {
    expect(formatDate(at, "el", "short")).toMatch(/^21 Οκτ/);
  });

  test("English is the British order, not the American one", () => {
    expect(dateLocale("en")).toBe("en-GB");
    expect(formatDate(at, "en", "numeric")).toBe("21/10/2026");
  });

  test("a plain day ('2026-10-21') is that day, never the one before", () => {
    expect(formatDate("2026-10-21", "el")).toBe("21/10/2026");
  });

  test("nothing to show gives the placeholder", () => {
    expect(formatDate(null, "el")).toBe("");
    expect(formatDate("", "el", "numeric", "—")).toBe("—");
  });

  test("clock time is HH:MM", () => {
    expect(clockTime(at)).toBe("09:05");
    expect(clockTime(new Date(2026, 0, 1, 23, 59))).toBe("23:59");
  });
});

describe("durations", () => {
  const t = i18n.global.t as any;
  test("minutes alone and hours with minutes", () => {
    expect(formatDuration(45, t)).toBe(t("services.duration.minutes", { m: 45 }));
    expect(formatDuration(90, t)).toBe(t("services.duration.hoursMinutes", { h: 1, m: 30 }));
  });
});

describe("text compared the way people type it", () => {
  test.each([
    ["Σάουνα", "σαουνα"],
    ["ΠΑΠΑΔΌΠΟΥΛΟΣ", "παπαδοπουλοσ"],
    ["  Μαρία ", "μαρια"],
    [null, ""],
  ])("%s → %s", (input, expected) => {
    expect(foldText(input as any)).toBe(expected);
  });
});

describe("rounding to the cent", () => {
  test("including the floating-point edge (1.005 → 1.01)", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(-2.345)).toBe(-2.34);
  });
});

describe("appointment statuses", () => {
  test("labels exist for every status", () => {
    for (const s of ["new", "confirmed", "arrived", "started", "completed", "cancelled", "no-show", "no-response"]) {
      expect((el.common.status as any)[statusKey(s)], s).toBeTruthy();
    }
  });
  test("badges and dots, with a fallback for an unknown status", () => {
    expect(statusBadge("cancelled")).toBe("bg-red-100 text-red-800");
    expect(statusBadge("weird")).toBe("bg-gray-100");
    expect(statusDot("no-show")).toBe("bg-red-700");
    expect(statusDot(undefined)).toBe("bg-gray-400");
  });
  test("a client's history shows a finished visit in green, the calendar in grey", () => {
    expect(historyBadge("completed")).toBe("bg-green-100 text-green-800");
    expect(statusBadge("completed")).toBe("bg-gray-200 text-gray-800");
    expect(historyBadge("cancelled")).toBe(statusBadge("cancelled"));
  });
});
