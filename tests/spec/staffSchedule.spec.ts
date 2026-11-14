// The staff schedule page shows each staff member's leave (time off of type
// "leave" from the staff page) on the days it covers, start and end included,
// instead of their hours. Breaks aren't leave. SS1–SS2. A change to one
// date is for that date only; the weekly schedule applies from its Monday on.
// SS3–SS7.
import { describe, expect, test, vi } from "vitest";
import StaffScheduleView from "../../client/src/views/StaffScheduleView.vue";
import el from "../../client/src/i18n/locales/el";
import { answerConfirm, fakeServer, mountScreen, pageText, saveLogin, settle } from "./helpers";

const MONDAY = "2026-11-16";
const staff = [
  { id: "st1", name: "Anna", sort_order: 1, is_active: true, working_hours_enabled: true },
  { id: "st2", name: "Eleni", sort_order: 2, is_active: true, working_hours_enabled: true },
];
const workingHours = [1, 2, 3, 4, 5].flatMap((day) =>
  staff.map((s) => ({ staff_id: s.id, day_of_week: day, start_time: "10:00:00", end_time: "18:00:00", effective_from: "2020-01-01" })),
);
// As the server sends DATE columns: local midnight, written in UTC.
const date = (d: string) => new Date(`${d}T00:00:00`).toISOString();

const open = async (timeOff: any[], width = 1280) => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(`${MONDAY}T09:00:00`) });
  vi.stubGlobal("innerWidth", width);
  saveLogin({ id: "u1", role: "admin", shop_id: "s1" });
  fakeServer({
    "GET /api/v1/staff": { body: staff },
    "GET /api/v1/working-hours": { body: workingHours },
    "GET /api/v1/time-off": { body: timeOff },
    "GET /api/v1/shop-hours": { body: [] },
  });
  mountScreen(StaffScheduleView);
  await settle();
};
/** Each staff row's cells, Monday to Sunday. */
const rows = () =>
  [...document.querySelectorAll("tbody tr")].slice(1).map((tr) => [...tr.querySelectorAll("td")].slice(1).map((td) => td.textContent?.trim()));

describe("SS1 leave on the week's grid", () => {
  test("from its first day to its last, instead of the hours; others keep theirs", async () => {
    await open([{ id: "l1", staff_id: "st1", type: "leave", start_date: date("2026-11-17"), end_date: date("2026-11-19"), reason: "Holidays" }]);
    const [anna, eleni] = rows();
    expect(anna.slice(0, 5)).toEqual(["10:00 - 18:00", el.staffSchedule.onLeave, el.staffSchedule.onLeave, el.staffSchedule.onLeave, "10:00 - 18:00"]);
    expect(eleni.slice(0, 5).every((c) => c === "10:00 - 18:00")).toBe(true);
  });

  test("leave that began before the week and ends after it covers every day", async () => {
    await open([{ id: "l1", staff_id: "st2", type: "leave", start_date: date("2026-11-01"), end_date: date("2026-12-01") }]);
    expect(rows()[1].every((c) => c === el.staffSchedule.onLeave)).toBe(true);
  });

  test("a break isn't leave", async () => {
    await open([{ id: "b1", staff_id: "st1", type: "break", start_date: date("2026-11-17"), end_date: date("2026-11-17"), start_time: "13:00", end_time: "14:00" }]);
    expect(rows()[0][1]).toBe("10:00 - 18:00");
  });
});

describe("SS2 leave on a phone (one day at a time)", () => {
  test("the day's list says who is on leave", async () => {
    await open([{ id: "l1", staff_id: "st1", type: "leave", start_date: date("2026-11-16"), end_date: date("2026-11-16") }], 390);
    const leave = [...document.querySelectorAll('[data-testid="schedule-leave"]')];
    expect(leave).toHaveLength(1);
    expect(leave[0].closest("button")?.textContent).toContain("Anna");
  });
});

// --- Changing a schedule (SS3–SS7) ---

const weekly = (staffId: string, from: string, days: [number, string, string][]) => [
  { staff_id: staffId, kind: "version", effective_from: from },
  ...days.map(([day_of_week, start, end]) => ({ staff_id: staffId, day_of_week, start_time: `${start}:00`, end_time: `${end}:00`, effective_from: from })),
];
const openWith = async (hours: any[], routes: Record<string, any> = {}) => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(`${MONDAY}T09:00:00`) });
  vi.stubGlobal("innerWidth", 1280);
  saveLogin({ id: "u1", role: "admin", shop_id: "s1" });
  const server = fakeServer({
    "GET /api/v1/staff": { body: staff },
    "GET /api/v1/working-hours": { body: hours },
    "GET /api/v1/time-off": { body: [] },
    "GET /api/v1/shop-hours": { body: [] },
    ...routes,
  });
  mountScreen(StaffScheduleView);
  await settle();
  return server;
};
const cell = (row: number, col: number) => document.querySelectorAll("tbody tr")[row + 1].querySelectorAll("td")[col + 1] as HTMLElement;
const press = async (el: Element | null | undefined) => {
  (el as HTMLElement).click();
  await settle();
};
const buttonText = (text: string) => [...document.querySelectorAll(".p-dialog button")].find((b) => b.textContent?.trim() === text);
const timesShown = () => [...document.querySelectorAll(".p-dialog button")].map((b) => b.textContent?.trim()).filter((x) => /^\d\d:\d\d$/.test(x || ""));
const openDay = async (row: number, col: number) => {
  await press(cell(row, col));
  await press([...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === el.staffSchedule.editDay));
};

describe("SS3 a date with its own hours", () => {
  test("is shown with them and marked; its week's other days and later weeks follow the weekly schedule", async () => {
    await openWith([
      ...weekly("st1", "2026-01-05", [[1, "10:00", "18:00"], [2, "10:00", "18:00"]]),
      { staff_id: "st1", kind: "day", date: "2026-11-17", ranges: [] },
    ]);
    expect(cell(0, 0).textContent).toContain("10:00 - 18:00");
    expect(cell(0, 1).textContent).toContain(el.staff.workingHours.dayOff);
    expect(cell(0, 1).querySelector('[data-testid="schedule-own-day"]')).not.toBeNull();
    expect(cell(0, 0).querySelector('[data-testid="schedule-own-day"]')).toBeNull();
  });
});

describe("SS4 changing one date", () => {
  test("saves that date only, with every shift it has", async () => {
    const server = await openWith(weekly("st1", "2026-01-05", [[1, "10:00", "13:00"], [1, "16:00", "20:00"]]), {
      "PUT /api/v1/staff/st1/days/2026-11-16": { body: { success: true } },
    });
    await openDay(0, 0);
    expect(pageText()).toContain(el.staffSchedule.onlyThisDate);
    await press(document.querySelector('[data-testid="day-mode-custom"]'));
    expect(timesShown()).toEqual(["10:00", "13:00", "16:00", "20:00"]);
    await press(buttonText(el.common.save));
    expect(server.called("PUT", "/api/v1/staff/st1/days/2026-11-16")[0].body).toEqual({
      ranges: [{ start_time: "10:00", end_time: "13:00" }, { start_time: "16:00", end_time: "20:00" }],
      force: false,
    });
    expect(server.called("POST", "/api/v1/staff/st1/working-hours")).toHaveLength(0);
  });

  test("starts from that person's own hours, whoever was opened before", async () => {
    await openWith([...weekly("st1", "2026-01-05", [[1, "10:00", "13:00"]]), ...weekly("st2", "2026-01-05", [[1, "11:00", "19:00"]])]);
    await openDay(0, 0);
    await press(buttonText(el.common.cancel));
    await openDay(1, 0);
    await press(document.querySelector('[data-testid="day-mode-custom"]'));
    expect(timesShown()).toEqual(["11:00", "19:00"]);
  });

  test("a day off, and back to the weekly schedule", async () => {
    const server = await openWith(
      [...weekly("st1", "2026-01-05", [[2, "10:00", "18:00"]]), { staff_id: "st1", kind: "day", date: "2026-11-18", ranges: [] }],
      { "PUT /api/v1/staff/st1/days/2026-11-17": { body: {} }, "DELETE /api/v1/staff/st1/days/2026-11-18": { body: {} } },
    );
    await openDay(0, 1);
    await press(document.querySelector('[data-testid="day-mode-off"]'));
    await press(buttonText(el.common.save));
    expect(server.called("PUT", "/api/v1/staff/st1/days/2026-11-17")[0].body).toEqual({ ranges: [], force: false });
    await openDay(0, 2);
    expect(document.querySelector('[data-testid="day-mode-off"]')?.className).not.toContain("outlined");
    await press(document.querySelector('[data-testid="day-mode-default"]'));
    await press(buttonText(el.common.save));
    expect(server.called("DELETE", "/api/v1/staff/st1/days/2026-11-18")).toHaveLength(1);
  });

  test("bookings it would leave outside are listed first", async () => {
    let calls = 0;
    const server = await openWith(weekly("st1", "2026-01-05", [[1, "10:00", "18:00"]]), {
      "PUT /api/v1/staff/st1/days/2026-11-16": () =>
        ++calls === 1
          ? { status: 409, body: { error: "conflicts_found", conflicts: [{ client_name: "Maria", service_name: "Massage", start_time: "2026-11-16T15:00:00" }] } }
          : { body: {} },
    });
    await openDay(0, 0);
    await press(document.querySelector('[data-testid="day-mode-off"]'));
    await press(buttonText(el.common.save));
    expect(pageText()).toContain("Maria");
    await answerConfirm(true);
    expect(server.called("PUT", "/api/v1/staff/st1/days/2026-11-16").map((c: any) => c.body.force)).toEqual([false, true]);
  });

  test("a refusal says why", async () => {
    await openWith(weekly("st1", "2026-01-05", [[1, "10:00", "18:00"]]), {
      "PUT /api/v1/staff/st1/days/2026-11-16": { status: 400, body: { error: "end_time must be after start_time" } },
    });
    await openDay(0, 0);
    await press(document.querySelector('[data-testid="day-mode-custom"]'));
    await press(buttonText(el.common.save));
    expect(pageText()).toContain(el.staffSchedule.errors.endBeforeStart);
  });
});

describe("SS5 a past day", () => {
  test("can't be changed", async () => {
    await openWith(weekly("st1", "2026-01-05", [[1, "10:00", "18:00"]]));
    vi.setSystemTime(new Date("2026-11-18T09:00:00"));
    await press(cell(0, 0));
    const editDay = [...document.querySelectorAll(".p-dialog button")].find((b) => b.textContent?.trim() === el.staffSchedule.editDay) as HTMLButtonElement;
    expect(editDay.disabled).toBe(true);
    expect(pageText()).toContain(el.staffSchedule.pastDayReadOnly);
  });
});

describe("SS6 changing the weekly schedule", () => {
  const openWeek = async () => {
    await press(cell(0, 0));
    await press([...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === el.staffSchedule.changeSchedule));
  };

  test("says it applies from that Monday on, and saves it from then", async () => {
    const server = await openWith(weekly("st1", "2026-01-05", [[1, "10:00", "18:00"]]), {
      "POST /api/v1/staff/st1/working-hours": { body: {} },
    });
    await openWeek();
    expect(document.querySelector('[data-testid="week-from-onwards"]')?.textContent).toContain("2026");
    await press(buttonText(el.common.save));
    expect(server.called("POST", "/api/v1/staff/st1/working-hours")[0].body).toEqual(
      expect.objectContaining({ effective_from: MONDAY, schedule: [{ day_of_week: 1, ranges: [{ start_time: "10:00", end_time: "18:00" }] }] }),
    );
  });

  test("shows the weekly schedule, not a date's own hours", async () => {
    await openWith([...weekly("st1", "2026-01-05", [[1, "10:00", "18:00"]]), { staff_id: "st1", kind: "day", date: "2026-11-16", ranges: [] }]);
    await openWeek();
    expect(timesShown()).toEqual(["10:00", "18:00"]);
  });

  test("a change starting this week can be undone; nothing to undo otherwise", async () => {
    const server = await openWith([...weekly("st1", "2026-01-05", [[1, "10:00", "18:00"]]), ...weekly("st1", MONDAY, [[1, "12:00", "14:00"]])], {
      "DELETE /api/v1/staff/st1/working-hours/2026-11-16": { body: {} },
    });
    await openWeek();
    await press(document.querySelector('[data-testid="week-undo"]'));
    expect(server.called("DELETE", "/api/v1/staff/st1/working-hours/2026-11-16")).toHaveLength(1);
  });

  test("no undo when the schedule started earlier", async () => {
    await openWith(weekly("st1", "2026-01-05", [[1, "10:00", "18:00"]]));
    await openWeek();
    expect(document.querySelector('[data-testid="week-undo"]')).toBeNull();
  });
});

describe("SS7 a week with no working days", () => {
  test("shows as days off (not as the schedule before it)", async () => {
    await openWith([...weekly("st1", "2026-01-05", [[1, "10:00", "18:00"]]), ...weekly("st1", MONDAY, [])]);
    expect(cell(0, 0).textContent).toContain(el.staff.workingHours.dayOff);
  });
});
