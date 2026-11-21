// What the calendar's data does: real store, real offline storage and queue;
// only the server is replaced. S8–S15 in test-report.html.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useCalendarStore } from "../../client/src/stores/calendar";
import { useAuthStore } from "../../client/src/stores/auth";
import { cachedAppointmentsInRange } from "../../client/src/offline/localData";
import { clearOfflineData, fetchOrQueue } from "../../client/src/offline/queue";
import { deferred, fakeServer, saveLogin, setBrowserOnline, settle } from "./helpers";

const START = "2026-11-02T00:00:00.000Z";
const END = "2026-11-03T00:00:00.000Z";
const appt = (id: string, start = "2026-11-02T10:00:00.000Z") => ({
  id,
  version: 1,
  status: "confirmed",
  services: [{ staff_id: "st1", start_time: start }],
});
const ids = (rows: any[]) => rows.map((r) => r.id);

beforeEach(async () => {
  await clearOfflineData();
  saveLogin({ id: "u1", role: "admin", shop_id: "s1" });
});

describe("S8 the calendar's staff columns", () => {
  test("hidden staff are left out, the rest follow their saved order", async () => {
    fakeServer({
      "GET /api/v1/staff": {
        body: [
          { id: "c", sort_order: 3 },
          { id: "hidden", sort_order: 1, visible_in_calendar: false },
          { id: "a", sort_order: 1, visible_in_calendar: true },
          { id: "b", sort_order: 2 },
        ],
      },
    });
    const store = useCalendarStore();
    await store.fetchBaseResources();
    expect(ids(store.resources)).toEqual(["a", "b", "c"]);
  });

  test("nothing is requested without a login", async () => {
    localStorage.clear();
    const server = fakeServer();
    const store = useCalendarStore();
    await store.fetchBaseResources();
    await store.fetchAppointments(START, END);
    expect(server.calls).toEqual([]);
  });

  test("everything the booking screens need is loaded", async () => {
    fakeServer({
      "GET /api/v1/services": { body: [{ id: "svc" }] },
      "GET /api/v1/products": { body: [{ id: "prod" }] },
      "GET /api/v1/time-off": { body: [{ id: "off" }] },
      "GET /api/v1/working-hours": { body: [{ id: "wh" }] },
    });
    const store = useCalendarStore();
    await store.fetchBaseResources();
    expect([ids(store.services), ids(store.products), ids(store.timeOff), ids(store.workingHours)]).toEqual([
      ["svc"], ["prod"], ["off"], ["wh"],
    ]);
  });
});

describe("S9 clicking quickly through days", () => {
  test("a slow answer for an earlier day can't replace the day now open", async () => {
    const mondayAnswer = deferred();
    const tuesdayAnswer = deferred();
    fakeServer({
      "GET /api/v1/appointments": (url) =>
        url.includes("2026-11-02") && url.includes("2026-11-03") && !url.includes("start=2026-11-03")
          ? mondayAnswer.promise
          : url.includes("start=2026-11-03")
            ? tuesdayAnswer.promise
            : { body: [] },
    });
    const store = useCalendarStore();
    const monday = store.fetchAppointments(START, END);
    const tuesday = store.fetchAppointments("2026-11-03T00:00:00.000Z", "2026-11-04T00:00:00.000Z");
    tuesdayAnswer.resolve({ body: [appt("tuesday", "2026-11-03T10:00:00.000Z")] });
    await tuesday;
    mondayAnswer.resolve({ body: [appt("monday")] });
    await monday;
    expect(ids(store.events)).toEqual(["tuesday"]);
  });
});

describe("S10 no connection", () => {
  test("the saved copy of that day is shown, marked as saved; a later success clears the mark", async () => {
    const server = fakeServer({ "GET /api/v1/appointments": { body: [appt("a1")] } });
    const store = useCalendarStore();
    await store.fetchAppointments(START, END);
    expect(store.fromCache).toBe(false);
    await vi.waitFor(async () => expect(ids(await cachedAppointmentsInRange(START, END))).toEqual(["a1"]));

    server.routes["GET /api/v1/appointments"] = "network-down";
    await store.fetchAppointments(START, END);
    expect(ids(store.events)).toEqual(["a1"]);
    expect(store.fromCache).toBe(true);

    server.routes["GET /api/v1/appointments"] = { body: [appt("a2")] };
    await store.fetchAppointments(START, END);
    expect(ids(store.events)).toEqual(["a2"]);
    expect(store.fromCache).toBe(false);
  });

  test("a 503 (server restarting) counts as no connection", async () => {
    const server = fakeServer({ "GET /api/v1/appointments": { body: [appt("a1")] } });
    const store = useCalendarStore();
    await store.fetchAppointments(START, END);
    await vi.waitFor(async () => expect(ids(await cachedAppointmentsInRange(START, END))).toEqual(["a1"]));
    server.routes["GET /api/v1/appointments"] = { status: 503, body: {} };
    await store.fetchAppointments(START, END);
    expect(store.fromCache).toBe(true);
    expect(ids(store.events)).toEqual(["a1"]);
  });

  test("nothing saved for that day: an empty day, marked as saved", async () => {
    fakeServer({ "GET /api/v1/appointments": "network-down" });
    const store = useCalendarStore();
    await store.fetchAppointments(START, END);
    expect(store.events).toEqual([]);
    expect(store.fromCache).toBe(true);
  });

  test("staff and services come from the saved copy too", async () => {
    const server = fakeServer({ "GET /api/v1/services": { body: [{ id: "svc" }] } });
    await useCalendarStore().fetchBaseResources();
    await settle();
    server.routes["GET /api/v1/services"] = "network-down";
    const { createPinia, setActivePinia } = await import("pinia");
    setActivePinia(createPinia());
    const afterReload = useCalendarStore();
    await afterReload.fetchBaseResources();
    expect(ids(afterReload.services)).toEqual(["svc"]);
  });
});

describe("S11 the server refuses or fails", () => {
  test.each([403, 500])("%s: the previous day's appointments don't stay on screen", async (status) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const server = fakeServer({ "GET /api/v1/appointments": { body: [appt("a1")] } });
    const store = useCalendarStore();
    await store.fetchAppointments(START, END);
    server.routes["GET /api/v1/appointments"] = { status, body: { error: "nope" } };
    await store.fetchAppointments("2026-11-03T00:00:00.000Z", "2026-11-04T00:00:00.000Z");
    expect(store.events).toEqual([]);
    expect(store.fromCache).toBe(false);
  });
});

describe("S12 changes waiting to sync", () => {
  test("a booking deleted offline is gone from the calendar straight away", async () => {
    fakeServer({ "GET /api/v1/appointments": { body: [appt("a1"), appt("a2", "2026-11-02T12:00:00.000Z")] } });
    const store = useCalendarStore();
    await store.fetchAppointments(START, END);
    setBrowserOnline(false);
    await fetchOrQueue("/api/v1/appointments/a1", "DELETE", undefined, { kind: "appointment", label: "x" });
    expect(ids(store.events)).toEqual(["a2"]);
  });
});

describe("S13 saving the staff order", () => {
  const before = [{ id: "a" }, { id: "b" }];
  const after = [{ id: "b" }, { id: "a" }];

  test("the new order is what is saved", async () => {
    const server = fakeServer({ "POST /api/v1/staff/reorder": { body: {} } });
    const store = useCalendarStore();
    store.resources = before;
    await store.updateResourceOrder(after);
    expect(ids(store.resources)).toEqual(["b", "a"]);
    expect(server.called("POST", "/api/v1/staff/reorder")[0].body).toEqual({
      orders: [{ id: "b", sort_order: 0 }, { id: "a", sort_order: 1 }],
    });
  });

  test("if saving fails, the columns go back to the previous order", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fakeServer({ "POST /api/v1/staff/reorder": { status: 500, body: {} } });
    const store = useCalendarStore();
    store.resources = before;
    await store.updateResourceOrder(after).catch(() => {});
    expect(ids(store.resources)).toEqual(["a", "b"]);
  });
});

describe("S14 and S15 when the user changes without a deliberate logout", () => {
  test("an expired session forgets what is in memory, and late answers stay out", async () => {
    const answer = deferred();
    fakeServer({ "GET /api/v1/appointments": answer.promise, "GET /api/v1/staff": { body: [{ id: "st1" }] } });
    const store = useCalendarStore();
    await store.fetchBaseResources();
    const loading = store.fetchAppointments(START, END);
    useAuthStore().logout();
    answer.resolve({ body: [appt("private")] });
    await loading;
    expect(store.events).toEqual([]);
    expect(store.resources).toEqual([]);
  });

  test("a re-issued token for the same user keeps the calendar", async () => {
    fakeServer({ "GET /api/v1/appointments": { body: [appt("a1")] } });
    const store = useCalendarStore();
    await store.fetchAppointments(START, END);
    useAuthStore().refreshToken("new-token");
    expect(ids(store.events)).toEqual(["a1"]);
  });
});

describe("S14 and S15 after logging out", () => {
  const logOut = async () => {
    await clearOfflineData();
    useAuthStore().logout();
  };

  test("an answer still on its way can't bring back the previous user's appointments", async () => {
    const answer = deferred();
    fakeServer({ "GET /api/v1/appointments": answer.promise });
    const store = useCalendarStore();
    useAuthStore();
    const loading = store.fetchAppointments(START, END);
    await logOut();
    answer.resolve({ body: [appt("private")] });
    await loading;
    await settle();
    expect(store.events).toEqual([]);
    expect(await cachedAppointmentsInRange(START, END)).toEqual([]);
  });

  test("the previous user's appointments, staff, services and products are gone", async () => {
    fakeServer({
      "GET /api/v1/appointments": { body: [appt("a1")] },
      "GET /api/v1/staff": { body: [{ id: "st1" }] },
      "GET /api/v1/services": { body: [{ id: "svc" }] },
      "GET /api/v1/products": { body: [{ id: "prod" }] },
      "GET /api/v1/time-off": { body: [{ id: "off" }] },
      "GET /api/v1/working-hours": { body: [{ id: "wh" }] },
    });
    const store = useCalendarStore();
    await store.fetchBaseResources();
    await store.fetchAppointments(START, END);
    await logOut();
    expect({
      events: store.events,
      resources: store.resources,
      services: store.services,
      products: store.products,
      timeOff: store.timeOff,
      workingHours: store.workingHours,
    }).toEqual({ events: [], resources: [], services: [], products: [], timeOff: [], workingHours: [] });
  });
});
