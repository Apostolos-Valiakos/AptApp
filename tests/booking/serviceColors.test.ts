import { describe, expect, it } from "vitest";
import { DEFAULT_CATEGORY_COLOR, resolveServiceColor } from "../../client/src/utils/serviceColors";

describe("resolveServiceColor", () => {
  it("uses a colour the shop chose for the service, then for its category", () => {
    expect(resolveServiceColor("#e600ff", "#ff0000")).toBe("#e600ff");
    expect(resolveServiceColor(null, "#ff0000")).toBe("#ff0000");
  });
  it("treats the database's unchosen blue as unset, in any case", () => {
    expect(resolveServiceColor("#3788d8", null)).toBe(DEFAULT_CATEGORY_COLOR);
    expect(resolveServiceColor("#3788D8", null)).toBe(DEFAULT_CATEGORY_COLOR);
    expect(resolveServiceColor("#3788d8", "#ff0000")).toBe("#ff0000");
  });
  it("still ignores values that aren't colours", () => {
    expect(resolveServiceColor("#var(--p-primary-100)", null)).toBe(DEFAULT_CATEGORY_COLOR);
  });
});
