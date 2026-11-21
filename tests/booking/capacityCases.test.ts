// The shared places rules on the screens, against the table the server's
// copy is tested with too (tests/shared/capacityCases.json).
import { describe, expect, it } from "vitest";
import cases from "../shared/capacityCases.json";
import { personsOf, placesOf } from "../../client/src/utils/capacity";

describe("shared places rules (screens)", () => {
  it.each(cases.persons.map((c) => [JSON.stringify(c.row), c]))("persons of %s", (_, c: any) => {
    expect(personsOf(c.row)).toBe(c.expected);
  });
  it.each(cases.places.map((c) => [JSON.stringify(c.staff), c]))("places of %s", (_, c: any) => {
    expect(placesOf(c.staff)).toBe(c.expected);
  });
});
