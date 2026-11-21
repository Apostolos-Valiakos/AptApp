import { describe, expect, it } from "vitest";
import { personsOf, placesOf } from "../../client/src/utils/capacity";

describe("places and persons", () => {
  it("defaults to one", () => {
    expect(placesOf({})).toBe(1);
    expect(placesOf({ capacity: 5 })).toBe(5);
    expect(personsOf({})).toBe(1);
    expect(personsOf({ persons: 3 })).toBe(3);
    expect(personsOf({ persons: 0 })).toBe(1);
  });
});
