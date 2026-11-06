import { describe, expect, it } from "vitest";
import { occupancyFrom, overlapGroups, peakPersons, personsOf, placesOf } from "../../client/src/utils/capacity";

const at = (hhmm: string) => new Date(`2027-03-10T${hhmm}:00+02:00`).getTime();
const row = (from: string, to: string, persons = 1) => ({ start: at(from), end: at(to), persons });

describe("places and persons", () => {
  it("defaults to one", () => {
    expect(placesOf({})).toBe(1);
    expect(placesOf({ capacity: 5 })).toBe(5);
    expect(personsOf({})).toBe(1);
    expect(personsOf({ persons: 3 })).toBe(3);
    expect(personsOf({ persons: 0 })).toBe(1);
  });
});

describe("peakPersons", () => {
  it("counts the most persons at one moment, not everyone in the span", () => {
    // 10:00-11:00 ×2 and 11:00-12:00 ×3 never meet: at most 3 together.
    expect(peakPersons([row("10:00", "11:00", 2), row("11:00", "12:00", 3)], at("10:00"), at("12:00"))).toBe(3);
    expect(peakPersons([row("10:00", "11:00", 2), row("10:30", "11:30", 3)], at("10:00"), at("12:00"))).toBe(5);
  });
  it("only within the asked window", () => {
    expect(peakPersons([row("10:00", "11:00", 4)], at("11:00"), at("12:00"))).toBe(0);
    expect(peakPersons([row("10:00", "11:00", 4)], at("10:45"), at("12:00"))).toBe(4);
  });
});

describe("overlapGroups", () => {
  it("chains bookings that overlap into one group", () => {
    const groups = overlapGroups([row("10:30", "11:30"), row("10:00", "11:00"), row("11:30", "12:00"), row("14:00", "15:00")]);
    expect(groups.map((g) => g.length)).toEqual([2, 1, 1]);
    expect(groups[0][0].start).toBe(at("10:00"));
  });
});

describe("occupancyFrom", () => {
  const appointments = [
    { id: "a", status: "confirmed", services: [{ staff_id: "sauna", start_time: "2027-03-10T10:00:00+02:00", duration_minutes: 60, persons: 2 }] },
    { id: "b", status: "cancelled", services: [{ staff_id: "sauna", start_time: "2027-03-10T10:00:00+02:00", duration_minutes: 60 }] },
    { id: "c", status: "new", services: [{ staff_id: "massage", start_time: "2027-03-10T10:00:00+02:00", duration_minutes: 60 }] },
  ];
  it("takes active rows of that place, minus the skipped ones", () => {
    expect(occupancyFrom(appointments, "sauna")).toEqual([row("10:00", "11:00", 2)]);
    expect(occupancyFrom(appointments, "sauna", new Set(["a|0"]))).toEqual([]);
  });
});
