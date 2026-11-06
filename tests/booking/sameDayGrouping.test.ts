// Which appointment a new same-day booking joins (client/src/utils/sameDayGrouping.ts).
import { describe, expect, test } from "vitest";
import { appendNote, sameDayAppointmentFor } from "../../client/src/utils/sameDayGrouping";

const appt = (id: string, start: string, extra: any = {}) => ({
  id, client_id: "c1", status: "confirmed", is_block: false, services: [{ start_time: start }], ...extra,
});

describe("same-day grouping", () => {
  test("joins the client's earliest active appointment that day", () => {
    const day = [appt("late", "2027-01-01T15:00:00Z"), appt("early", "2027-01-01T09:00:00Z"), appt("other", "2027-01-01T08:00:00Z", { client_id: "c2" })];
    expect(sameDayAppointmentFor(day, "c1")?.id).toBe("early");
  });
  test("skips cancelled, no-show and blocks", () => {
    const day = [
      appt("x", "2027-01-01T08:00:00Z", { status: "cancelled" }),
      appt("y", "2027-01-01T08:30:00Z", { status: "no_show" }),
      appt("z", "2027-01-01T08:45:00Z", { is_block: true }),
      appt("ok", "2027-01-01T11:00:00Z"),
    ];
    expect(sameDayAppointmentFor(day, "c1")?.id).toBe("ok");
  });
  test("nothing to join: undefined (also for a bad answer)", () => {
    expect(sameDayAppointmentFor([], "c1")).toBeUndefined();
    expect(sameDayAppointmentFor({ error: "x" }, "c1")).toBeUndefined();
  });
  test("notes are added once, on a new line", () => {
    expect(appendNote("", "new")).toBe("new");
    expect(appendNote("old", "new")).toBe("old\nnew");
    expect(appendNote("old\nnew", "new")).toBe("old\nnew");
    expect(appendNote("old", "")).toBe("old");
  });
});
