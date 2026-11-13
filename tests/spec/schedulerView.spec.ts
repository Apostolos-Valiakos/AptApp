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

describe("a past visit in the booking dialog's sidebar", () => {
  const past = { id: "old1", status: "completed", start_time: "2026-10-05T10:00:00", service_names: "Massage", staff_names: "Anna", owed: 20 };
  const oldBooking = { ...appointment(), id: "old1", client_id: "c1" };
  const show = async (routes: Record<string, Handler> = {}) => {
    saveLogin({ id: "u1", role: "admin", shop_id: "s1" });
    fakeServer({
      ...baseRoutes,
      "GET /api/v1/clients/c1/past-appointments": { body: [past] },
      "GET /api/v1/clients/c1": { body: { id: "c1", first_name: "Eleni", last_name: "P" } },
      "GET /api/v1/appointments": { body: [oldBooking] },
      ...routes,
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const opened = vi.fn();
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
          onOpenAppointment: opened,
        });
      },
    });
    const wrapper = mountScreen(Parent);
    const parent = wrapper.findComponent(Parent);
    await settle();
    (parent.vm as any).appt = { ...appointment(), client_id: "c1" };
    (parent.vm as any).visible = true;
    await settle();
    return opened;
  };
  const clickVisit = async () => {
    (document.querySelector('[data-testid="past-appointment"]') as HTMLElement).click();
    await settle();
  };

  test("opens that booking, with everything the calendar has on it", async () => {
    const opened = await show();
    await clickVisit();
    expect(opened).toHaveBeenCalledWith(oldBooking);
  });

  test("its resolve button only resolves", async () => {
    const opened = await show();
    (document.querySelector('[data-testid="past-appointment-resolve"]') as HTMLElement).click();
    await settle();
    expect(opened).not.toHaveBeenCalled();
  });

  test("asks first when there are unsaved changes", async () => {
    const opened = await show();
    const notes = document.querySelector("textarea") as HTMLTextAreaElement;
    notes.value = "changed";
    notes.dispatchEvent(new Event("input"));
    await settle();
    await clickVisit();
    expect(opened).not.toHaveBeenCalled();
    (document.querySelector(".p-confirmdialog-accept-button") as HTMLElement).click();
    await settle();
    expect(opened).toHaveBeenCalledWith(oldBooking);
  });

  test("stays on this booking when the other can't be found", async () => {
    const opened = await show({ "GET /api/v1/appointments": { body: [] } });
    await clickVisit();
    expect(opened).not.toHaveBeenCalled();
  });
});

describe("the booking dialog's payment steps", () => {
  const owing = {
    ...appointment(),
    client_id: "c1",
    status: "new",
    payment_status: "unpaid",
    deposit_amount: 0,
    client_outstanding_balance: 30,
    services: [{ ...appointment().services[0], price: 30 }],
  };
  const paid = { ...owing, status: "completed", payment_status: "paid", deposit_amount: 30, client_outstanding_balance: 0 };
  const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const seen = (id: string) => {
    const el = q(id);
    if (!el) return false;
    for (let e: HTMLElement | null = el; e; e = e.parentElement) if (e.style.display === "none") return false;
    return true;
  };
  const show = async (appt: any, role = "admin") => {
    saveLogin({ id: "u1", role, shop_id: "s1" });
    fakeServer({
      ...baseRoutes,
      "GET /api/v1/clients/c1/balance": { body: { balance: appt.client_outstanding_balance } },
      "GET /api/v1/clients/c1/past-appointments": { body: [] },
      "GET /api/v1/appointments": { body: [appt] },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const Parent = defineComponent({
      data: () => ({ visible: false, appt: null as any }),
      render() {
        return h(BookingDialog, {
          visible: (this as any).visible,
          appointment: (this as any).appt,
          services: [{ id: "svc", name: "Massage", duration_minutes: 60, price: 30 }],
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
    q("booking-payment-tab")!.click();
    await settle();
    return wrapper;
  };
  const next = async () => {
    q("payment-next")!.click();
    await settle();
  };

  test("step 1 is the checkout: the sale buttons, no charge yet", async () => {
    await show(owing);
    expect(seen("payment-steps")).toBe(true);
    expect(seen("payment-add-sale")).toBe(true);
    expect(seen("payment-method-card")).toBe(false);
    expect(seen("payment-submit")).toBe(false);
    q("payment-add-sale")!.click();
    await settle();
    expect(seen("payment-sell-package")).toBe(true);
    expect(seen("payment-sell-gift-card")).toBe(true);
  });

  test("step 2 is the way of paying, step 3 the price change and the charge", async () => {
    await show(owing);
    await next();
    expect(seen("payment-method-cash")).toBe(true);
    expect(seen("payment-method-gift-card")).toBe(true);
    expect(seen("payment-method-membership")).toBe(true);
    expect(seen("payment-submit")).toBe(false);
    expect(seen("payment-step-total")).toBe(false);
    expect(seen("payment-review")).toBe(false);
    await next();
    expect(seen("payment-step-total")).toBe(true);
    expect(seen("payment-review")).toBe(true);
    expect(seen("payment-price-change")).toBe(true);
    expect(seen("payment-submit")).toBe(true);
    expect(seen("payment-method-cash")).toBe(false);
  });

  test("the second way of paying takes what the first leaves, as it is typed", async () => {
    const wrapper = await show(owing);
    await next();
    q("payment-add-split")!.click();
    await settle();
    const first = wrapper
      .findAllComponents({ name: "InputNumber" })
      .find((c: any) => c.vm.$el.classList?.contains("fresha-input-large"))!;
    const second = () => document.querySelector('[data-testid="payment-second-amount"] input') as HTMLInputElement;
    const shows = (euros: string) => expect(second().value.replace(/\s/g, "")).toMatch(new RegExp(`^(€${euros}\\.00|${euros},00€)$`));

    first.vm.$emit("input", { value: 20 });
    await settle();
    shows("10");

    first.vm.$emit("update:modelValue", 5);
    await settle();
    shows("25");
  });

  test("an amount typed in the second way stays: the first gives way when both would be too much", async () => {
    const wrapper = await show(owing);
    await next();
    q("payment-add-split")!.click();
    await settle();
    const inputs = wrapper.findAllComponents({ name: "InputNumber" });
    const first = inputs.find((c: any) => c.vm.$el.classList?.contains("fresha-input-large"))!;
    const second = wrapper.findAllComponents({ name: "InputNumber" }).find((c: any) => c.attributes("data-testid") === "payment-second-amount" || c.vm.$el.matches?.('[data-testid="payment-second-amount"]'))!;
    const euros = (c: any) => Number(c.props("modelValue"));
    expect(euros(first)).toBe(30);

    second.vm.$emit("update:modelValue", 12);
    await settle();
    expect(euros(second)).toBe(12);
    expect(euros(first)).toBe(18);
    expect(second.props("max")).toBe(30);
  });

  test("next and back sit in the footer, beside save", async () => {
    await show(owing);
    const footer = q("booking-save")!.parentElement!;
    expect(footer.contains(q("payment-next"))).toBe(true);
    await next();
    expect(footer.contains(q("payment-back"))).toBe(true);
  });

  test("closing starts the payment again: step, way of paying, split", async () => {
    const wrapper = await show(owing);
    const parent = wrapper.findComponent({ name: "BookingDialog" }).vm.$parent as any;
    await next();
    q("payment-method-cash")!.click();
    await settle();
    q("payment-add-split")!.click();
    await settle();

    parent.visible = false;
    await settle();
    parent.visible = true;
    await settle();
    q("booking-payment-tab")!.click();
    await settle();

    expect(seen("payment-add-sale")).toBe(true);
    await next();
    expect(q("payment-method-card")!.getAttribute("aria-pressed")).toBe("true");
    expect(q("payment-second-amount")).toBe(null);
    expect(seen("payment-add-split")).toBe(true);
  });

  test("frontdesk can change the price and charge", async () => {
    await show(owing, "frontdesk");
    await next();
    await next();
    expect(seen("payment-submit")).toBe(true);
    expect(seen("payment-price-change")).toBe(true);
  });

  test("a paid, completed booking has no steps; it can be refunded, not repriced", async () => {
    await show(paid);
    expect(seen("payment-steps")).toBe(false);
    expect(seen("payment-submit")).toBe(false);
    expect(seen("payment-price-change")).toBe(false);
    expect(seen("payment-refund")).toBe(true);
    expect(seen("payment-add-sale")).toBe(true);
  });

  test("a completed booking's price can't be changed, even with money still owed", async () => {
    await show({ ...owing, status: "completed" });
    await next();
    await next();
    expect(seen("payment-submit")).toBe(true);
    expect(seen("payment-price-change")).toBe(false);
  });

  test("a paid booking not yet completed can still have its price changed", async () => {
    await show({ ...paid, status: "confirmed" });
    expect(seen("payment-price-change")).toBe(true);
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

  test.each(["cancelled", "no-show"])("a %s booking gets the red line instead", async (status) => {
    const event = await serviceEvent(status);
    expect(event.classNames).toContain("fc-did-not-happen");
    expect(event.classNames).not.toContain("fc-completed");
  });

  test("an ordinary booking gets neither line", async () => {
    const { classNames } = await serviceEvent("confirmed");
    expect(classNames).not.toContain("fc-did-not-happen");
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

describe("CP8 a booked combination on the calendar", () => {
  test("each card shows its part and the combination; other cards only their service", async () => {
    const line = (start: string, name: string, combo: string | null) => ({
      service_id: "svc", service_name: name, staff_id: "st1", start_time: `${MONDAY}T${start}:00`, duration_minutes: 60, price: 30,
      combo_service_id: combo ? "offer" : null, combo_name: combo,
    });
    const rows = [
      { ...appointment(), id: "a1", services: [line("10:00", "HOLISTIC", "HOLISTIC + SAUNA OFFER")] },
      { ...appointment(), id: "a2", services: [line("12:00", "MASSAGE", null)] },
    ];
    const { options } = await open("admin", { "GET /api/v1/appointments": { body: rows } });
    await showDay(options, `${MONDAY}T00:00:00`, "2026-11-03T00:00:00");
    await settle();
    const calls = calendarApi.setOption.mock.calls.filter((c: any[]) => c[0] === "events");
    const names = Object.fromEntries(
      calls[calls.length - 1][1]
        .filter((e: any) => e.extendedProps?.appointmentId)
        .map((e: any) => [e.extendedProps.appointmentId, e.extendedProps.service_name]),
    );
    // The part is named as in the service list ("svc" is Massage there).
    expect(names).toEqual({ a1: "Massage (HOLISTIC + SAUNA OFFER)", a2: "Massage" });
  });
});

describe("SA the sauna column: separate cards", () => {
  const sauna = { id: "sauna", name: "ΣΑΟΥΝΑ", sort_order: 2, is_active: true, capacity: 5 };
  const booking = (id: string, surname: string, from: string, to: string, persons = 1, status = "confirmed") => ({
    ...appointment(),
    id,
    status,
    first_name: "Ε",
    last_name: surname,
    services: [{
      service_id: "svc", service_name: "ΣΑΟΥΝΑ", staff_id: "sauna", persons,
      start_time: `${MONDAY}T${from}:00`,
      duration_minutes: (new Date(`${MONDAY}T${to}:00`).getTime() - new Date(`${MONDAY}T${from}:00`).getTime()) / 60000,
      price: 15,
    }],
  });
  const fed = async (rows: any[], { view = "resourceTimeGridDay", staffList = [...staff, sauna] as any[] } = {}) => {
    const { wrapper, options } = await open("admin", {
      "GET /api/v1/staff": { body: staffList },
      "GET /api/v1/appointments": { body: rows },
    });
    await options.datesSet({
      startStr: `${MONDAY}T00:00:00`,
      endStr: "2026-11-03T00:00:00",
      view: { title: "", type: view, calendar: { getDate: () => new Date(MONDAY) } },
    });
    await settle();
    const calls = calendarApi.setOption.mock.calls.filter((c: any[]) => c[0] === "events");
    const css = [...wrapper.element.ownerDocument.querySelectorAll("style")].map((s) => s.textContent).join("\n");
    return { wrapper, options, events: calls[calls.length - 1][1], css };
  };
  const three = () => [booking("m", "ΜΑΡΙΑ", "10:00", "11:00"), booking("e", "ΕΛΕΝΗ", "10:30", "11:30"), booking("n", "ΝΙΚΟΣ", "10:55", "12:00")];

  test("each booking is its own card at its own times; no grouped box, no strip", async () => {
    const { events } = await fed(three());
    const cards = events.filter((e: any) => e.resourceId === "sauna" && e.extendedProps?.appointmentId);
    expect(cards.map((c: any) => [c.extendedProps.appointmentId, new Date(c.start).toTimeString().slice(0, 5), new Date(c.end).toTimeString().slice(0, 5)])).toEqual([
      ["m", "10:00", "11:00"], ["e", "10:30", "11:30"], ["n", "10:55", "12:00"],
    ]);
    expect(cards.every((c: any) => c.classNames.includes("fc-place-card"))).toBe(true);
    expect(events.some((e: any) => e.extendedProps?.isPlaceGroup || e.extendedProps?.isOccupancy)).toBe(false);
  });

  test("every column keeps the same width, and ordinary cards aren't sauna cards", async () => {
    const ordinary = { ...appointment(), id: "o", services: [{ service_id: "svc", staff_id: "st1", start_time: `${MONDAY}T10:00:00`, duration_minutes: 60, price: 30 }] };
    const { events, css } = await fed([ordinary, ...three()]);
    expect(css).not.toContain("data-resource-id");
    expect(events.find((e: any) => e.extendedProps?.appointmentId === "o").classNames).not.toContain("fc-place-card");
  });

  test("a sauna card has the surname ready for when it is narrow", async () => {
    const { options, events } = await fed([booking("m", "ΠΑΠΑΔΟΠΟΥΛΟΥ", "10:00", "11:00")]);
    const card = events.find((e: any) => e.extendedProps?.appointmentId === "m");
    const html = options.eventContent({
      event: { ...card, start: new Date(card.start), end: new Date(card.end), extendedProps: card.extendedProps },
      view: { type: "resourceTimeGridDay" },
      isMirror: false,
    }).html;
    expect(html).toContain('<span class="fc-name-short">ΠΑΠΑΔΟΠΟΥΛΟΥ</span>');
  });
});

describe("OT2 a booking outside working hours on the calendar", () => {
  // Anna (st1) works 09:00–17:00 on Mondays (see baseRoutes).
  const booked = (id: string, from: string, minutes: number, status = "confirmed") => ({
    ...appointment(),
    id,
    status,
    services: [{ service_id: "svc", service_name: "Massage", staff_id: "st1", start_time: `${MONDAY}T${from}:00`, duration_minutes: minutes, price: 30 }],
  });
  const drawn = async (rows: any[]) => {
    const { wrapper, options } = await open("admin", { "GET /api/v1/appointments": { body: rows } });
    await showDay(options, `${MONDAY}T00:00:00`, "2026-11-03T00:00:00");
    await settle();
    const calls = calendarApi.setOption.mock.calls.filter((c: any[]) => c[0] === "events");
    const events = calls[calls.length - 1][1];
    const card = (id: string) => events.find((e: any) => e.extendedProps?.appointmentId === id);
    const html = (id: string) => {
      const e = card(id);
      return options.eventContent({
        event: { ...e, start: new Date(e.start), end: new Date(e.end), extendedProps: e.extendedProps },
        view: { type: "resourceTimeGridDay" },
        isMirror: false,
      }).html as string;
    };
    return { wrapper, options, card, html };
  };

  test("starting half an hour early: the first half is striped, with a line and the time where the schedule starts", async () => {
    const { html } = await drawn([booked("early", "08:30", 60)]);
    expect(html("early")).toContain('<div class="fc-overtime-part" style="top:0.00%;height:50.00%"></div>');
    expect(html("early")).toContain('<div class="fc-hours-line" style="top:50.00%"><span>09:00</span></div>');
  });

  test("running past the end: the last part is striped, with the line where the schedule ends", async () => {
    const { html } = await drawn([booked("late", "16:30", 60)]);
    expect(html("late")).toContain('<div class="fc-overtime-part" style="top:50.00%;height:50.00%"></div>');
    expect(html("late")).toContain('<div class="fc-hours-line" style="top:50.00%"><span>17:00</span></div>');
  });

  test("entirely outside the schedule: all striped, no line (the schedule doesn't cross it)", async () => {
    const { html } = await drawn([booked("night", "19:00", 60)]);
    expect(html("night")).toContain('<div class="fc-overtime-part" style="top:0.00%;height:100.00%"></div>');
    expect(html("night")).not.toContain("fc-hours-line");
  });

  test("a booking inside the schedule has neither", async () => {
    const { html, card } = await drawn([booked("normal", "10:00", 60)]);
    expect(html("normal")).not.toContain("fc-overtime-part");
    expect(html("normal")).not.toContain("fc-hours-line");
    expect(card("normal").extendedProps.overtime).toBeNull();
  });

  test("a cancelled booking isn't marked", async () => {
    const { html } = await drawn([booked("gone", "08:30", 60, "cancelled")]);
    expect(html("gone")).not.toContain("fc-overtime-part");
  });

  test("the hover card is told, so it can say how much is outside", async () => {
    const { wrapper, options, card } = await drawn([booked("early", "08:30", 60)]);
    const e = card("early");
    options.eventMouseEnter({
      el: document.createElement("div"),
      event: { display: "auto", start: new Date(e.start), end: new Date(e.end), extendedProps: e.extendedProps },
    });
    await new Promise((r) => setTimeout(r, 300));
    await settle();
    const overtime = wrapper.findComponent({ name: "AppointmentHoverCard" }).props("appointment").overtime;
    expect(overtime).toMatchObject({ minutes: 30, schedule: "09:00–17:00", dayOff: false });
    expect(overtime.parts[0]).toMatchObject({ kind: "before", at: "09:00" });
  });
});
