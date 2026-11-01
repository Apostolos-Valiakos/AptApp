// The calendar screen. FullCalendar is replaced because dragging needs real
// layout, which this browser-like page doesn't have: tests hand the screen the
// same events FullCalendar would. The large dialogs are replaced too, except in
// the read-only tests, which use the real booking dialog. Toasts, confirmations,
// stores and the offline queue are real. C8–C17 in test-report.html.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { defineComponent, h } from "vue";
import { createPinia, setActivePinia } from "pinia";
import SchedulerView from "../../client/src/views/SchedulerView.vue";
import BookingDialog from "../../client/src/components/BookingDialog.vue";
import { useCalendarStore } from "../../client/src/stores/calendar";
import { clearOfflineData } from "../../client/src/offline/queue";
import el from "../../client/src/i18n/locales/el";
import {
  answerConfirm,
  errorToasts,
  fakeServer,
  mountScreen,
  pageText,
  saveLogin,
  setBrowserOnline,
  settle,
  type Handler,
} from "./helpers";

const calendarApi = new Proxy<Record<string, any>>(
  { el: document.createElement("div"), view: { title: "", type: "resourceTimeGridDay" } },
  { get: (t, k: string) => (k in t ? t[k] : (t[k] = vi.fn())) },
);

vi.mock("@fullcalendar/vue3", () => ({
  default: defineComponent({
    name: "FullCalendar",
    props: ["options"],
    setup(_, { expose }) {
      expose({ getApi: () => calendarApi });
      return () => h("div", { "data-testid": "calendar" });
    },
  }),
}));

const dialogStub = (name: string) =>
  defineComponent({
    name,
    props: ["visible", "appointment", "staffList"],
    emits: ["save", "update:visible"],
    render: () => h("div"),
  });
const stubs = {
  BookingDialog: dialogStub("BookingDialog"),
  StaffReorderDialog: dialogStub("StaffReorderDialog"),
  AppointmentSwapDialog: true,
  ClientSearchDialog: true,
  ClientQuickProfileDialog: true,
  ClientProfileDialog: true,
  PlaceGroupDialog: true,
  AppointmentHoverCard: true,
};

const MONDAY = "2026-11-02";
const staff = [{ id: "st1", name: "Anna", first_name: "Anna", last_name: "K", sort_order: 1, is_active: true, working_hours_enabled: true }];
const baseRoutes: Record<string, Handler> = {
  "GET /api/v1/staff": { body: staff },
  "GET /api/v1/services": { body: [{ id: "svc", name: "Massage", duration_minutes: 60, price: 30 }] },
  "GET /api/v1/working-hours": {
    body: [{ staff_id: "st1", day_of_week: 1, start_time: "09:00", end_time: "17:00", effective_from: "2020-01-01" }],
  },
  "GET /api/v1/time-off": {
    body: [{ staff_id: "st1", type: "break", start_date: MONDAY, start_time: "13:00", end_time: "14:00" }],
  },
};
const appointment = () => ({
  id: "a1",
  version: 2,
  status: "confirmed",
  first_name: "Eleni",
  last_name: "P",
  services: [{ service_id: "svc", staff_id: "st1", start_time: `${MONDAY}T10:00:00`, duration_minutes: 60, price_override: 30 }],
});
const movedTo = (start: string, end: string) => ({
  event: {
    start: new Date(start),
    end: new Date(end),
    extendedProps: { appointmentId: "a1", serviceIndex: 0, fullAppointment: appointment() },
    getResources: () => [{ id: "st1" }],
  },
  oldEvent: { start: new Date(`${MONDAY}T10:00:00`) },
  revert: vi.fn(),
  jsEvent: {},
});
const moveToEleven = () => movedTo(`${MONDAY}T11:00:00`, `${MONDAY}T12:00:00`);

const open = async (role: string, routes: Record<string, Handler> = {}) => {
  saveLogin({ id: "u1", role, shop_id: "s1" });
  setActivePinia(createPinia()); // a fresh page: the store reads the saved login
  const server = fakeServer({ ...baseRoutes, ...routes });
  const wrapper = mountScreen(SchedulerView, { stubs });
  await settle();
  const options = wrapper.findComponent({ name: "FullCalendar" }).props("options") as any;
  return { wrapper, server, options };
};
const bookingDialog = (wrapper: any) => wrapper.findComponent({ name: "BookingDialog" });
const selectSlot = (from: string, to: string) => ({
  start: new Date(`${MONDAY}T${from}:00`),
  end: new Date(`${MONDAY}T${to}:00`),
  resource: { id: "st1", title: "Anna" },
  view: { calendar: { unselect: () => {} } },
});
const showDay = (options: any, startStr: string, endStr: string) =>
  options.datesSet({
    startStr,
    endStr,
    view: { title: "", type: "resourceTimeGridDay", calendar: { getDate: () => new Date(startStr) } },
  });

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(`${MONDAY}T08:00:00`) });
  fakeServer();
  await clearOfflineData();
});

describe("C8 saving the staff order", () => {
  const save = async (routes: Record<string, Handler>) => {
    const { wrapper } = await open("admin", routes);
    wrapper.findComponent({ name: "StaffReorderDialog" }).vm.$emit("save", [...staff]);
    await settle();
  };
  test("saved: says so", async () => {
    await save({ "POST /api/v1/staff/reorder": { body: {} } });
    expect(pageText()).toContain(el.scheduler.toasts.staffOrderUpdated);
    expect(errorToasts()).toBe(0);
  });
  test("failed: an error, and never a success message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await save({ "POST /api/v1/staff/reorder": { status: 500, body: {} } });
    expect(pageText()).not.toContain(el.scheduler.toasts.staffOrderUpdated);
    expect(errorToasts()).toBe(1);
  });
});

describe("C9 staff can look but not change appointments", () => {
  test("the calendar lets a shop admin select and drag, and staff neither", async () => {
    const admin = await open("admin");
    expect([admin.options.editable, admin.options.selectable]).toEqual([true, true]);
    admin.wrapper.unmount();
    const member = await open("staff");
    expect([member.options.editable, member.options.selectable]).toEqual([false, false]);
  });

  test("selecting a free slot never starts a booking for staff", async () => {
    const { wrapper, options } = await open("staff");
    await options.select(selectSlot("10:00", "11:00"));
    await settle();
    expect(bookingDialog(wrapper).props("visible")).toBeFalsy();
  });

  test("a move reaching the screen anyway sends nothing and is undone", async () => {
    const { server, options } = await open("staff");
    const move = moveToEleven();
    void options.eventDrop(move); // not awaited: a confirmation left open would never finish
    await settle();
    expect(document.querySelector(".p-confirmdialog")).toBeNull();
    expect(server.called("PUT", "/api/v1/appointments/a1")).toEqual([]);
    expect(move.revert).toHaveBeenCalled();
  });

  test("clicking an appointment still shows its details", async () => {
    const { wrapper, options } = await open("staff");
    options.eventClick({ event: { extendedProps: { fullAppointment: appointment() } } });
    await settle();
    expect(bookingDialog(wrapper).props("visible")).toBe(true);
    expect(bookingDialog(wrapper).props("appointment").id).toBe("a1");
  });

  test("resizing is undone the same way", async () => {
    const { server, options } = await open("staff");
    const resize = moveToEleven();
    void options.eventResize(resize);
    await settle();
    expect(server.called("PUT", "/api/v1/appointments/a1")).toEqual([]);
    expect(resize.revert).toHaveBeenCalled();
  });

  test("there's no client search or swap for staff; a shop admin has both", async () => {
    const titles = () => [...document.querySelectorAll("button")].map((b) => b.title);
    const admin = await open("admin");
    expect(titles()).toContain(el.scheduler.nav.swap);
    expect(pageText()).toContain(el.clientSearch.button);
    admin.wrapper.unmount();
    await open("staff");
    expect(titles()).not.toContain(el.scheduler.nav.swap);
    expect(titles()).toContain(el.scheduler.nav.reorderStaff);
    expect(pageText()).not.toContain(el.clientSearch.button);
  });

  test("staff can still reorder the columns", async () => {
    const { wrapper, server } = await open("staff", { "POST /api/v1/staff/reorder": { body: {} } });
    wrapper.findComponent({ name: "StaffReorderDialog" }).vm.$emit("save", [...staff]);
    await settle();
    expect(server.called("POST", "/api/v1/staff/reorder")).toHaveLength(1);
  });
});

describe("C9 the booking dialog is read-only for staff", () => {
  const buttons = ["booking-save", "booking-delete", "booking-payment-tab"];
  const shown = () => buttons.filter((id) => document.querySelector(`[data-testid="${id}"]`));
  const show = async (role: string, appt: any) => {
    saveLogin({ id: "u1", role, shop_id: "s1" });
    fakeServer(baseRoutes);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const Parent = defineComponent({
      data: () => ({ visible: false, appt: null as any }),
      render() {
        return h(BookingDialog, {
          visible: (this as any).visible,
          appointment: (this as any).appt,
          services: [],
          staff,
          allProducts: [],
          timeOff: [],
          workingHours: [],
        });
      },
    });
    const wrapper = mountScreen(Parent);
    const parent = wrapper.findComponent(Parent);
    await settle();
    (parent.vm as any).appt = appt;
    (parent.vm as any).visible = true;
    await settle();
    return wrapper;
  };

  test("a shop admin has save, delete and payment on an appointment", async () => {
    await show("admin", appointment());
    expect(shown()).toEqual(buttons);
  });
  test("staff have none of them on an appointment", async () => {
    await show("staff", appointment());
    expect(document.querySelector(".p-dialog")).not.toBeNull();
    expect(shown()).toEqual([]);
  });
  test("staff can't change a time-off entry either", async () => {
    await show("staff", {
      time_off_id: "off1",
      staff_id: "st1",
      start_time: new Date(`${MONDAY}T13:00:00`),
      end_time: new Date(`${MONDAY}T14:00:00`),
    });
    expect(shown()).toEqual([]);
  });
});

describe("C10 how far back the calendar goes", () => {
  test("staff start at today", async () => {
    const { options } = await open("staff");
    expect(options.validRange).toEqual({ start: MONDAY });
  });
  test.each(["admin", "frontdesk"])("%s can go back", async (role) => {
    const { options } = await open(role);
    expect(options.validRange).toBeUndefined();
  });
});

describe("C11 booking outside working hours", () => {
  test.each(["admin", "super_admin", "frontdesk"])("%s may select the slot", async (role) => {
    const { options } = await open(role);
    expect(options.selectAllow(selectSlot("18:00", "19:00"))).toBe(true);
  });
  test("it asks first: accepting opens the booking", async () => {
    const { wrapper, options } = await open("admin");
    const selecting = options.select(selectSlot("18:00", "19:00"));
    await answerConfirm(true);
    await selecting;
    await settle();
    expect(bookingDialog(wrapper).props("visible")).toBe(true);
  });
  test("it asks first: declining opens nothing", async () => {
    const { wrapper, options } = await open("admin");
    const selecting = options.select(selectSlot("18:00", "19:00"));
    await answerConfirm(false);
    await selecting;
    await settle();
    expect(bookingDialog(wrapper).props("visible")).toBeFalsy();
  });
  test("within working hours nothing is asked", async () => {
    const { wrapper, options } = await open("admin");
    await options.select(selectSlot("10:00", "11:00"));
    await settle();
    expect(document.querySelector(".p-confirmdialog")).toBeNull();
    expect(bookingDialog(wrapper).props("visible")).toBe(true);
  });
});

describe("C12 leave and breaks are blocked for everyone", () => {
  test.each(["admin", "super_admin", "frontdesk"])("%s can't select a break, nor drag onto one", async (role) => {
    const { options } = await open(role);
    const slot = selectSlot("13:00", "14:00");
    expect(options.selectAllow(slot)).toBe(false);
    expect(options.eventAllow(slot, { getResources: () => [{ id: "st1" }], extendedProps: {} })).toBe(false);
  });
  test("right next to the break is fine", async () => {
    const { options } = await open("admin");
    expect(options.selectAllow(selectSlot("12:00", "13:00"))).toBe(true);
  });
});

describe("C13–C16 moving an appointment", () => {
  const drop = async (options: any, move: ReturnType<typeof movedTo>, accept = true) => {
    const dropping = options.eventDrop(move);
    await answerConfirm(accept);
    await dropping;
    await settle();
  };

  test("confirmed: the new time is saved, and the card stays", async () => {
    const { server, options } = await open("admin", { "PUT /api/v1/appointments/a1": { body: {} } });
    const move = moveToEleven();
    await drop(options, move);
    const saved = server.called("PUT", "/api/v1/appointments/a1");
    expect(saved).toHaveLength(1);
    expect(new Date(saved[0].body.services[0].start_time).getTime()).toBe(new Date(`${MONDAY}T11:00:00`).getTime());
    expect(saved[0].body.base_version).toBe(2);
    expect(move.revert).not.toHaveBeenCalled();
  });

  test("not confirmed: nothing is sent and the card goes back", async () => {
    const { server, options } = await open("admin");
    const move = moveToEleven();
    await drop(options, move, false);
    expect(server.called("PUT", "/api/v1/appointments/a1")).toEqual([]);
    expect(move.revert).toHaveBeenCalled();
  });

  test("C13 refused by the server: the card goes back and the reason is shown", async () => {
    const { options } = await open("admin", { "PUT /api/v1/appointments/a1": { status: 400, body: { error: "Slot taken" } } });
    const move = moveToEleven();
    await drop(options, move);
    expect(move.revert).toHaveBeenCalled();
    expect(errorToasts()).toBe(1);
    expect(pageText()).toContain("Slot taken");
  });

  test("C14 over capacity, accepted: sent again with the override", async () => {
    const { server, options } = await open("admin", {
      "PUT /api/v1/appointments/a1": (_url, init) =>
        JSON.parse(String(init.body)).allow_over_capacity ? { body: {} } : { status: 409, body: { error: "over_capacity", persons: 6, capacity: 5 } },
    });
    const move = moveToEleven();
    const dropping = options.eventDrop(move);
    await answerConfirm(true); // the move
    await answerConfirm(true); // over capacity
    await dropping;
    const sent = server.called("PUT", "/api/v1/appointments/a1");
    expect(sent.map((c) => !!c.body.allow_over_capacity)).toEqual([false, true]);
    expect(move.revert).not.toHaveBeenCalled();
  });

  test("C14 over capacity, declined: not sent again, the card goes back", async () => {
    const { server, options } = await open("admin", {
      "PUT /api/v1/appointments/a1": { status: 409, body: { error: "over_capacity", persons: 6, capacity: 5 } },
    });
    const move = moveToEleven();
    const dropping = options.eventDrop(move);
    await answerConfirm(true);
    await answerConfirm(false);
    await dropping;
    expect(server.called("PUT", "/api/v1/appointments/a1")).toHaveLength(1);
    expect(move.revert).toHaveBeenCalled();
  });

  test("C15 changed on another device: reloads the calendar and explains", async () => {
    const { server, options } = await open("admin", {
      "PUT /api/v1/appointments/a1": { status: 409, body: { error: "stale_appointment" } },
    });
    await showDay(options, `${MONDAY}T00:00:00`, "2026-11-03T00:00:00");
    const loadsBefore = server.called("GET", "/api/v1/appointments").length;
    const move = moveToEleven();
    await drop(options, move);
    expect(server.called("GET", "/api/v1/appointments").length).toBeGreaterThan(loadsBefore);
    expect(pageText()).toContain(el.offline.conflict.stale_appointment);
    expect(move.revert).toHaveBeenCalled();
  });

  test("C16 offline: kept for later, and the user is told", async () => {
    const { server, options } = await open("admin");
    setBrowserOnline(false);
    const move = moveToEleven();
    await drop(options, move);
    expect(server.called("PUT", "/api/v1/appointments/a1")).toEqual([]);
    expect(pageText()).toContain(el.booking.toast.savedOffline);
    expect(move.revert).not.toHaveBeenCalled();
  });
});

describe("C17 a day that can't be loaded", () => {
  test.each([403, 500])("%s: no appointments from the previous day, and an error", async (status) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { server, options } = await open("admin", {
      "GET /api/v1/appointments": { body: [appointment()] },
    });
    await showDay(options, `${MONDAY}T00:00:00`, "2026-11-03T00:00:00");
    expect(useCalendarStore().events).toHaveLength(1);

    server.routes["GET /api/v1/appointments"] = { status, body: { error: "nope" } };
    await showDay(options, "2026-11-03T00:00:00", "2026-11-04T00:00:00");
    await settle();
    expect(useCalendarStore().events).toEqual([]);
    expect(errorToasts()).toBe(1);
  });
});

describe("the hover card", () => {
  const hoverOn = (options: any) =>
    options.eventMouseEnter({
      el: document.createElement("div"),
      event: {
        display: "auto",
        start: new Date("2026-06-01T10:00:00"),
        end: new Date("2026-06-01T11:00:00"),
        extendedProps: { isServiceEvent: true, fullAppointment: appointment(), client_name: "Client", service_name: "Service" },
      },
    });
  const cardShown = async (wrapper: any) => {
    await new Promise((r) => setTimeout(r, 300));
    await settle();
    return wrapper.findComponent({ name: "AppointmentHoverCard" }).exists();
  };
  const fakeHoverNone = (noHover: boolean) =>
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query: string) => ({ matches: noHover && query === "(hover: none)", media: query, addEventListener() {}, removeEventListener() {} }) as any,
    );
  afterEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("innerWidth", 1024);
  });

  test("shows on a computer", async () => {
    fakeHoverNone(false);
    const { wrapper, options } = await open("admin");
    hoverOn(options);
    expect(await cardShown(wrapper)).toBe(true);
  });

  test("doesn't show on a phone, where a tap would open it with the booking dialog", async () => {
    fakeHoverNone(false);
    vi.stubGlobal("innerWidth", 390);
    const { wrapper, options } = await open("admin");
    hoverOn(options);
    expect(await cardShown(wrapper)).toBe(false);
  });

  test("doesn't show on a wider touch screen, such as a phone on its side", async () => {
    fakeHoverNone(true);
    const { wrapper, options } = await open("admin");
    hoverOn(options);
    expect(await cardShown(wrapper)).toBe(false);
  });
});

describe("the hover card's services of the day", () => {
  const svc = (start: string, staff = "st1") => ({ service_id: "svc", service_name: "Massage", staff_id: staff, start_time: `${MONDAY}T${start}:00`, duration_minutes: 60, price: 30 });
  const booked = (id: string, client: string, start: string, status = "confirmed") => ({ ...appointment(), id, client_id: client, status, services: [svc(start)] });

  const listFor = async (rows: any[], hoveredId: string) => {
    const { wrapper, options } = await open("admin", { "GET /api/v1/appointments": { body: rows } });
    await showDay(options, `${MONDAY}T00:00:00`, "2026-11-03T00:00:00");
    await settle();
    const calls = calendarApi.setOption.mock.calls.filter((c: any[]) => c[0] === "events");
    const events = calls[calls.length - 1][1];
    const hovered = events.find((e: any) => e.extendedProps?.appointmentId === hoveredId);
    options.eventMouseEnter({
      el: document.createElement("div"),
      event: { display: "auto", start: new Date(hovered.start), end: new Date(hovered.end), extendedProps: hovered.extendedProps },
    });
    await new Promise((r) => setTimeout(r, 300));
    await settle();
    return wrapper.findComponent({ name: "AppointmentHoverCard" }).props("appointment").day_services;
  };

  test("lists all the client's services that day, in time order, marking the hovered one", async () => {
    const list = await listFor([booked("late", "c1", "15:00"), booked("early", "c1", "11:00"), booked("other", "c2", "12:00")], "late");
    expect(list.map((s: any) => [s.id, s.current])).toEqual([
      ["early_0", false],
      ["late_0", true],
    ]);
    expect(list[0].staff).toBe("Anna");
  });

  test("leaves out the client's cancelled bookings", async () => {
    const list = await listFor([booked("a", "c1", "11:00"), booked("gone", "c1", "13:00", "cancelled")], "a");
    expect(list.map((s: any) => s.id)).toEqual(["a_0"]);
  });
});

describe("a completed appointment's card", () => {
  const serviceEvent = async (status: string) => {
    const { options } = await open("admin", {
      "GET /api/v1/appointments": {
        body: [{ ...appointment(), status, services: [{ ...appointment().services[0], service_color: "#fde68a" }] }],
      },
    });
    await showDay(options, `${MONDAY}T00:00:00`, "2026-11-03T00:00:00");
    await settle();
    const calls = calendarApi.setOption.mock.calls.filter((c: any[]) => c[0] === "events");
    return calls[calls.length - 1][1].find((e: any) => e.extendedProps?.isServiceEvent);
  };

  test("keeps its colour and gets the line", async () => {
    const event = await serviceEvent("completed");
    expect(event.backgroundColor).toBe("#fde68a");
    expect(event.classNames).toContain("fc-completed");
  });

  test("other statuses get no line", async () => {
    expect((await serviceEvent("confirmed")).classNames).not.toContain("fc-completed");
  });
});

describe("the time on a computer's cards", () => {
  const cardHtml = (options: any, minutes: number) =>
    options.eventContent({
      timeText: "10:00 - 10:15",
      isMirror: false,
      view: { type: "resourceTimeGridDay" },
      event: {
        start: new Date(`${MONDAY}T10:00:00`),
        end: new Date(new Date(`${MONDAY}T10:00:00`).getTime() + minutes * 60000),
        extendedProps: { client_name: "P Eleni", client_surname: "P", service_name: "Massage", fullAppointment: appointment() },
      },
    }).html;

  test.each([15, 60])("is much smaller than the name on a %i-minute card", async (minutes) => {
    const { options } = await open("admin");
    expect(cardHtml(options, minutes)).toMatch(/text-\[8px\] md:text-\[9px\][^>]*>10:00/);
  });

  test.each([15, 20, 25, 30, 60])("shows on a %i-minute card", async (minutes) => {
    const { options } = await open("admin");
    expect(cardHtml(options, minutes)).toContain("10:00");
  });
});

describe("the phone's day view", () => {
  const bella = { ...staff[0], id: "st2", name: "Bella" };
  const onLeave = (id: string) => ({
    "GET /api/v1/staff": { body: [staff[0], bella] },
    "GET /api/v1/time-off": { body: [{ staff_id: id, type: "leave", start_date: MONDAY, end_date: MONDAY }] },
  });
  const shownStaff = () => {
    const calls = calendarApi.setOption.mock.calls.filter((c: any[]) => c[0] === "resources");
    return calls[calls.length - 1][1].map((r: any) => r.id);
  };
  const openDay = async (routes: Record<string, Handler>) => {
    const opened = await open("admin", routes);
    await showDay(opened.options, `${MONDAY}T00:00:00`, "2026-11-03T00:00:00");
    await settle();
    return opened;
  };
  const onPhone = () => vi.stubGlobal("innerWidth", 390);
  afterEach(() => {
    vi.stubGlobal("innerWidth", 1024);
    localStorage.removeItem("scheduler.showAllStaff");
  });

  test("hides staff on leave that day", async () => {
    onPhone();
    await openDay(onLeave("st2"));
    expect(shownStaff()).toEqual(["st1"]);
  });

  test("shows them when the switch is on", async () => {
    onPhone();
    localStorage.setItem("scheduler.showAllStaff", "1");
    await openDay(onLeave("st2"));
    expect(shownStaff()).toEqual(["st1", "st2"]);
  });

  test("keeps someone on leave who has a booking that day", async () => {
    onPhone();
    const booking = { ...appointment(), services: [{ ...appointment().services[0], staff_id: "st2" }] };
    await openDay({ ...onLeave("st2"), "GET /api/v1/appointments": { body: [booking] } });
    expect(shownStaff()).toEqual(["st1", "st2"]);
  });

  test("a computer still shows staff on leave", async () => {
    await openDay(onLeave("st2"));
    expect(shownStaff()).toEqual(["st1", "st2"]);
  });

  test("a card shows the name and service, not the time", async () => {
    onPhone();
    const { options } = await open("admin");
    const { html } = options.eventContent({
      timeText: "10:00 - 11:00",
      isMirror: false,
      view: { type: "resourceTimeGridDay" },
      event: {
        start: new Date(`${MONDAY}T10:00:00`),
        end: new Date(`${MONDAY}T11:00:00`),
        extendedProps: { client_name: "P Eleni", service_name: "Massage", fullAppointment: appointment() },
      },
    });
    expect(html).toContain("P Eleni");
    expect(html).toContain("Massage");
    expect(html).toContain("line-clamp-2");
    expect(html).not.toContain("10:00");
  });
});
