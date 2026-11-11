// Which part of a booking falls outside the staff member's working hours
// (overtime), and where the schedule's start or end crosses it. OT1–OT3.
import { describe, expect, test } from "vitest";
import { mount } from "@vue/test-utils";
import { outsideWorkingHours } from "../../client/src/utils/staffAvailability";
import AppointmentHoverCard from "../../client/src/components/AppointmentHoverCard.vue";
import { i18n } from "../../client/src/i18n";

const MONDAY = "2026-11-02";
const TUESDAY = "2026-11-03";
const staff = [{ id: "st1", working_hours_enabled: true }, { id: "free", working_hours_enabled: false }];
const hours = (ranges: [string, string][], day = 1) =>
  ranges.map(([start_time, end_time]) => ({ staff_id: "st1", day_of_week: day, start_time, end_time, effective_from: "2020-01-01" }));
const oneShift = hours([["10:00:00", "18:00:00"]]);
const splitShift = hours([["10:00:00", "14:00:00"], ["16:00:00", "20:00:00"]]);
const at = (time: string, day = MONDAY) => new Date(`${day}T${time}:00`);
const hhmm = (ms: number) => new Date(ms).toTimeString().slice(0, 5);
const check = (wh: any[], from: string, to: string, staffId = "st1", day = MONDAY) => {
  const r = outsideWorkingHours(wh, staff, staffId, at(from, day), at(to, day));
  return r && {
    dayOff: r.dayOff,
    schedule: r.schedule,
    minutes: r.minutes,
    parts: r.parts.map((p) => [p.kind, hhmm(p.from), hhmm(p.to), p.at, p.until ?? null]),
    boundaries: r.boundaries.map(hhmm),
  };
};

describe("OT1 which part of a booking is outside working hours", () => {
  test("inside the schedule: nothing", () => {
    expect(check(oneShift, "10:00", "11:00")).toBeNull();
    expect(check(oneShift, "17:00", "18:00")).toBeNull();
  });

  test("starting half an hour early: 30 minutes before 10:00, the schedule starting inside the booking", () => {
    expect(check(oneShift, "09:30", "10:30")).toEqual({
      dayOff: false,
      schedule: "10:00–18:00",
      minutes: 30,
      parts: [["before", "09:30", "10:00", "10:00", null]],
      boundaries: ["10:00"],
    });
  });

  test("running past the end: 20 minutes after 18:00", () => {
    expect(check(oneShift, "17:30", "18:20")).toMatchObject({ minutes: 20, parts: [["after", "18:00", "18:20", "18:00", null]], boundaries: ["18:00"] });
  });

  test("entirely before the schedule: all of it, and no boundary inside it", () => {
    expect(check(oneShift, "08:00", "09:00")).toMatchObject({ minutes: 60, parts: [["before", "08:00", "09:00", "10:00", null]], boundaries: [] });
    // Ending exactly when the schedule starts is still all outside.
    expect(check(oneShift, "09:00", "10:00")).toMatchObject({ minutes: 60, boundaries: [] });
  });

  test("longer than the whole day: before and after", () => {
    expect(check(oneShift, "09:00", "19:00")).toMatchObject({
      minutes: 120,
      parts: [["before", "09:00", "10:00", "10:00", null], ["after", "18:00", "19:00", "18:00", null]],
      boundaries: ["10:00", "18:00"],
    });
  });

  test("a split shift: the gap between the two parts counts, with both its ends", () => {
    expect(check(splitShift, "13:30", "16:30")).toEqual({
      dayOff: false,
      schedule: "10:00–14:00, 16:00–20:00",
      minutes: 120,
      parts: [["between", "14:00", "16:00", "14:00", "16:00"]],
      boundaries: ["14:00", "16:00"],
    });
  });

  test("a day off: all of it, marked as a day off", () => {
    expect(check(oneShift, "10:00", "11:00", "st1", TUESDAY)).toEqual({
      dayOff: true,
      schedule: "",
      minutes: 60,
      parts: [["dayOff", "10:00", "11:00", "", null]],
      boundaries: [],
    });
  });

  test("a staff member without working hours, or with none set up yet: never overtime", () => {
    expect(check(oneShift, "03:00", "04:00", "free")).toBeNull();
    expect(check([], "03:00", "04:00")).toBeNull();
  });
});

describe("OT3 the hover card says so", () => {
  const card = (overtime: any) => {
    i18n.global.locale.value = "en";
    const wrapper = mount(AppointmentHoverCard, {
      props: {
        appointment: { status: "confirmed", first_name: "Maria", last_name: "P", start: at("09:30"), end: at("10:30"), service_name: "Massage", overtime },
        anchorRect: { top: 10, left: 10, right: 110, bottom: 60, width: 100, height: 50 },
      },
      global: { plugins: [i18n], stubs: { teleport: true } },
    });
    const text = wrapper.find('[data-testid="hover-overtime"]');
    return text.exists() ? text.text().replace(/\s+/g, " ") : null;
  };
  const from = (wh: any[], a: string, b: string, day = MONDAY) => outsideWorkingHours(wh, staff, "st1", at(a, day), at(b, day));

  test("how much is outside, before or after what time, and the schedule", () => {
    expect(card(from(oneShift, "09:30", "10:30"))).toBe("Outside working hours: 30 min before 10:00 · schedule 10:00–18:00");
    expect(card(from(oneShift, "17:30", "18:20"))).toBe("Outside working hours: 20 min after 18:00 · schedule 10:00–18:00");
  });

  test("both ends, and a gap in a split shift", () => {
    expect(card(from(oneShift, "09:00", "19:00"))).toBe("Outside working hours: 1 h before 10:00, 1 h after 18:00 · schedule 10:00–18:00");
    expect(card(from(splitShift, "13:30", "16:30"))).toBe("Outside working hours: 2 h between 14:00 and 16:00 · schedule 10:00–14:00, 16:00–20:00");
  });

  test("a day off", () => {
    expect(card(from(oneShift, "10:00", "11:00", TUESDAY))).toBe("Outside working hours: day off");
  });

  test("a booking inside the schedule has no notice", () => {
    expect(card(null)).toBeNull();
  });
});
