// The front desk's waitlist on the calendar: who's waiting and for what,
// adding and changing entries, booking one (the booking dialog opens filled
// in, and the entry is sent along so it's marked booked), and the waiting
// clients a cancelled booking's time suits. WS1–WS5 (WS6, on the calendar
// itself, is in schedulerView.spec.ts).
import { beforeEach, describe, expect, test, vi } from "vitest";
import { defineComponent, h } from "vue";
import WaitlistPanel from "../../client/src/components/waitlist/WaitlistPanel.vue";
import ClientSelector from "../../client/src/components/ClientSelector.vue";
import BookingDialog from "../../client/src/components/BookingDialog.vue";
import { useWaitlist } from "../../client/src/composables/useWaitlist";
import { useCalendarStore } from "../../client/src/stores/calendar";
import { clearOfflineData } from "../../client/src/offline/queue";
import el from "../../client/src/i18n/locales/el";
import { answerConfirm, fakeServer, mountScreen, pageText, saveLogin, settle } from "./helpers";

const TODAY = "2026-11-16"; // a Monday
const entry = (extra: any = {}) => ({
  id: "w1",
  client_id: "c1",
  client_name: "MARIA PAPA",
  first_name: "MARIA",
  last_name: "PAPA",
  client_phone: "6900001234",
  service_id: "svc",
  service_name: "Massage",
  duration_minutes: 60,
  staff_id: null,
  staff_name: null,
  date_from: "2026-11-18",
  date_to: "2026-11-30",
  days: [2, 4],
  time_from: "17:00",
  time_to: "21:00",
  note: "after work",
  ...extra,
});
const staff = [{ id: "st1", name: "Anna", sort_order: 1, is_active: true }];
const services = [{ id: "svc", name: "Massage", duration_minutes: 60, price: 30, is_active: true }];

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(`${TODAY}T09:00:00`) });
  await clearOfflineData();
  const w = useWaitlist();
  w.entries.value = [];
  w.freed.value = [];
  w.bookable.value = [];
  w.freedSlot.value = null;
  w.panelVisible.value = false;
  w.showingAll.value = false;
});

const press = async (sel: string, i = 0) => {
  (document.querySelectorAll<HTMLElement>(`[data-testid="${sel}"]`)[i] as HTMLElement).click();
  await settle();
};
const openPanel = async (entries: any[], routes: Record<string, any> = {}) => {
  saveLogin({ id: "u1", role: "frontdesk", shop_id: "s1" });
  const server = fakeServer({ "GET /api/v1/waitlist": { body: entries }, "GET /api/v1/waitlist/freed": { body: [] }, "GET /api/v1/waitlist/bookable": { body: [] }, ...routes });
  const store = useCalendarStore();
  store.resources = staff as any;
  store.services = services as any;
  const booked = vi.fn();
  const wrapper = mountScreen(defineComponent({ render: () => h(WaitlistPanel, { onBook: booked }) }));
  const w = useWaitlist();
  await w.refresh();
  w.panelVisible.value = true;
  await settle();
  return { server, booked, wrapper };
};

describe("WS1 who's waiting", () => {
  test("client, phone, service and therapist, and when they can come", async () => {
    await openPanel([entry()]);
    const card = document.querySelector('[data-testid="waitlist-entry"]')!;
    expect(card.textContent).toContain("MARIA PAPA");
    expect(card.textContent).toContain("6900001234");
    expect(card.textContent).toContain(`Massage · ${el.waitlist.anyone}`);
    const when = card.querySelector('[data-testid="waitlist-when"]')!.textContent!;
    expect(when).toContain("Τρί, Πέμ");
    expect(when).toContain("17:00–21:00");
    expect(card.textContent).toContain("after work");
  });

  test("counted only when they can be booked now; those are marked and come first", async () => {
    await openPanel([entry(), entry({ id: "w2", client_name: "ELENI K" }), entry({ id: "w3", client_name: "NIKI S" })], {
      "GET /api/v1/waitlist/bookable": { body: ["w3", "w2"] },
    });
    expect(useWaitlist().count.value).toBe(2);
    const cards = [...document.querySelectorAll('[data-testid="waitlist-entry"]')];
    expect(cards.map((c) => c.textContent!.match(/MARIA PAPA|ELENI K|NIKI S/)![0])).toEqual(["ELENI K", "NIKI S", "MARIA PAPA"]);
    expect(cards.map((c) => !!c.querySelector('[data-testid="waitlist-bookable"]'))).toEqual([true, true, false]);
  });

  test("nobody can be booked now: no number", async () => {
    await openPanel([entry(), entry({ id: "w2" })]);
    expect(useWaitlist().count.value).toBe(0);
    expect(document.querySelector('[data-testid="waitlist-bookable"]')).toBeNull();
  });
});

describe("WS2 adding and changing", () => {
  test("a new entry: the client, service, therapist, dates, days, hours and note are sent", async () => {
    const { server, wrapper } = await openPanel([], { "POST /api/v1/waitlist": { body: entry() } });
    await press("waitlist-add");
    expect(pageText()).toContain(el.waitlist.addTitle);
    // Saving waits for a client.
    expect(document.querySelector<HTMLButtonElement>('[data-testid="waitlist-save"]')!.disabled).toBe(true);
    // The client is picked with the usual client picker.
    wrapper.findComponent(ClientSelector).vm.$emit("select", { id: "c1", first_name: "MARIA", last_name: "PAPA", full_name: "MARIA PAPA", phone: "6900001234" });
    await settle();
    expect(document.querySelector('[data-testid="waitlist-client"]')?.textContent).toContain("MARIA PAPA");
    await press("waitlist-day-2");
    await press("waitlist-day-4");
    const note = document.querySelector<HTMLTextAreaElement>('[data-testid="waitlist-note"]')!;
    note.value = "after work";
    note.dispatchEvent(new Event("input"));
    await press("waitlist-save");
    // From today, for two weeks, by default.
    expect(server.called("POST", "/api/v1/waitlist")[0].body).toEqual({
      client_id: "c1", service_id: null, staff_id: null, date_from: "2026-11-16", date_to: "2026-11-30",
      days: [2, 4], time_from: null, time_to: null, note: "after work",
    });
    expect(server.called("GET", "/api/v1/waitlist").length).toBeGreaterThan(1);
  });

  test("changing one sends it back with its changes", async () => {
    const { server } = await openPanel([entry()], { "PUT /api/v1/waitlist/w1": { body: entry({ note: "evenings only" }) } });
    await press("waitlist-edit");
    const note = document.querySelector<HTMLTextAreaElement>('[data-testid="waitlist-note"]')!;
    note.value = "evenings only";
    note.dispatchEvent(new Event("input"));
    await press("waitlist-day-4");
    await press("waitlist-save");
    expect(server.called("PUT", "/api/v1/waitlist/w1")[0].body).toEqual({
      client_id: "c1", service_id: "svc", staff_id: null, date_from: "2026-11-18", date_to: "2026-11-30",
      days: [2], time_from: "17:00", time_to: "21:00", note: "evenings only",
    });
  });

  test("removing asks first", async () => {
    const { server } = await openPanel([entry()], { "DELETE /api/v1/waitlist/w1": { body: { success: true } } });
    await press("waitlist-remove");
    expect(server.called("DELETE", "/api/v1/waitlist/w1")).toHaveLength(0);
    await answerConfirm(true);
    expect(server.called("DELETE", "/api/v1/waitlist/w1")).toHaveLength(1);
    expect(document.querySelector('[data-testid="waitlist-entry"]')).toBeNull();
  });
});

describe("WS3 booking from the list: at one of their free times", () => {
  const free = {
    duration_minutes: 60, from: "2026-11-18", to: "2026-11-30", next: null,
    days: [
      {
        date: "2026-11-19",
        staff: [
          { staff_id: "st1", staff_name: "Anna", starts: ["17:00", "17:15", "17:30", "17:45", "18:00", "18:15", "18:30", "18:45", "19:00", "19:15"] },
          { staff_id: "st2", staff_name: "Eleni", starts: ["20:00"] },
        ],
      },
    ],
  };

  test("their free times are shown by day and therapist; picking one opens the booking at it", async () => {
    const { booked, server } = await openPanel([entry()], { "GET /api/v1/waitlist/w1/free-times": { body: free } });
    await press("waitlist-book");
    expect(server.called("GET", "/api/v1/waitlist/w1/free-times")).toHaveLength(1);
    expect(booked).not.toHaveBeenCalled();
    const [anna, eleni] = document.querySelectorAll('[data-testid="free-times-staff"]');
    expect(anna.textContent).toContain("Anna");
    // The first eight, then the rest on request.
    expect(anna.querySelectorAll('[data-testid="free-time"]')).toHaveLength(8);
    (anna.querySelector('[data-testid="free-times-more"]') as HTMLElement).click();
    await settle();
    expect(anna.querySelectorAll('[data-testid="free-time"]')).toHaveLength(10);
    (eleni.querySelector('[data-testid="free-time"]') as HTMLElement).click();
    await settle();
    expect(booked.mock.calls[0][0]).toMatchObject({
      client_id: "c1", service_id: "svc", staff_id: "st2", waitlist_entry_id: "w1", start_time: new Date("2026-11-19T20:00:00"),
    });
    expect(useWaitlist().panelVisible.value).toBe(false);
  });

  test("none suits: says so, and the booking can still be opened, from their first day and hour", async () => {
    const { booked } = await openPanel([entry({ staff_id: "st1" })], {
      "GET /api/v1/waitlist/w1/free-times": { body: { ...free, days: [] } },
    });
    await press("waitlist-book");
    expect(document.querySelector('[data-testid="free-times-none"]')).not.toBeNull();
    await press("free-times-anyway");
    const seed = booked.mock.calls[0][0];
    expect(seed).toMatchObject({ client_id: "c1", service_id: "svc", staff_id: "st1", waitlist_entry_id: "w1" });
    expect(seed.start_time).toEqual(new Date("2026-11-18T17:00:00"));
  });

  test("a long wait: later days are added on request, from where the last ones stopped", async () => {
    const later = { ...free, from: "2026-11-26", to: "2026-11-30", next: null, days: [{ date: "2026-11-27", staff: [free.days[0].staff[1]] }] };
    const { server } = await openPanel([entry()], {
      "GET /api/v1/waitlist/w1/free-times": (url: string) => ({ body: url.includes("after=") ? later : { ...free, to: "2026-11-25", next: "2026-11-26" } }),
    });
    await press("waitlist-book");
    expect(document.querySelectorAll('[data-testid="free-times-day"]')).toHaveLength(1);
    await press("free-times-later");
    expect(server.called("GET", "/api/v1/waitlist/w1/free-times")[1].url).toContain("after=2026-11-26");
    expect(document.querySelectorAll('[data-testid="free-times-day"]')).toHaveLength(2);
    expect(document.querySelector('[data-testid="free-times-later"]')).toBeNull();
  });
});

describe("WS4 times cancellations freed", () => {
  const slot = (extra: any = {}) => ({
    id: "f1", staff_id: "st1", staff_name: "Anna", start: new Date("2026-11-19T18:00:00").toISOString(), end: new Date("2026-11-19T19:00:00").toISOString(),
    matches: [entry(), entry({ id: "w2", client_name: "ELENI K" })], ...extra,
  });

  test("listed with how many they suit, and each opens on who it suits; booking takes its time and therapist", async () => {
    const { booked } = await openPanel([entry()], { "GET /api/v1/waitlist/freed": { body: [slot(), slot({ id: "f2", matches: [entry()] })] } });
    const items = document.querySelectorAll('[data-testid="waitlist-freed-item"]');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain("18:00–19:00 · Anna");
    expect(items[0].textContent).toContain("ταιριάζει σε 2 πελάτες σε αναμονή");
    expect(items[1].textContent).toContain("ταιριάζει σε 1 πελάτη σε αναμονή");
    await press("waitlist-freed-open");
    expect(document.querySelector('[data-testid="waitlist-freed"]')?.textContent).toContain("18:00–19:00");
    expect([...document.querySelectorAll('[data-testid="waitlist-entry"]')].map((e) => e.textContent)).toEqual([
      expect.stringContaining("MARIA PAPA"), expect.stringContaining("ELENI K"),
    ]);
    // Straight to the booking: the time was matched to them already.
    await press("waitlist-book");
    expect(booked.mock.calls[0][0]).toMatchObject({ staff_id: "st1", start_time: new Date("2026-11-19T18:00:00"), waitlist_entry_id: "w1" });
  });

  test("dismissed: gone for everyone (the server is told)", async () => {
    const { server } = await openPanel([], {
      "GET /api/v1/waitlist/freed": { body: [slot()] },
      "DELETE /api/v1/waitlist/freed/f1": { body: { success: true } },
    });
    await press("waitlist-freed-dismiss");
    expect(server.called("DELETE", "/api/v1/waitlist/freed/f1")).toHaveLength(1);
    expect(useWaitlist().freed.value).toEqual([]);
    expect(document.querySelector('[data-testid="waitlist-freed-list"]')).toBeNull();
  });

  test("the one shown closes once it no longer counts (taken on another screen)", async () => {
    let freed = [slot()];
    await openPanel([], { "GET /api/v1/waitlist/freed": () => ({ body: freed }) });
    await press("waitlist-freed-open");
    freed = [];
    await useWaitlist().loadFreed();
    await settle();
    expect(document.querySelector('[data-testid="waitlist-freed"]')).toBeNull();
    expect(useWaitlist().freed.value).toEqual([]);
  });
});

describe("WS5 the booking dialog", () => {
  const openBooking = async (appointment: any, routes: Record<string, any> = {}) => {
    saveLogin({ id: "u1", role: "frontdesk", shop_id: "s1" });
    const server = fakeServer({
      "GET /api/v1/clients": { body: [{ id: "c1", first_name: "MARIA", last_name: "PAPA", full_name: "MARIA PAPA" }] },
      "POST /api/v1/appointments": { body: { id: "a9", version: 1 } },
      ...routes,
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const freed = vi.fn();
    const Parent = defineComponent({
      data: () => ({ visible: false, appt: null as any }),
      render() {
        return h(BookingDialog, {
          visible: (this as any).visible,
          "onUpdate:visible": (v: boolean) => ((this as any).visible = v),
          appointment: (this as any).appt,
          services, staff, allProducts: [], timeOff: [], workingHours: [],
          onFreed: freed,
        });
      },
    });
    const parent = mountScreen(Parent).findComponent(Parent);
    await settle();
    (parent.vm as any).appt = appointment;
    (parent.vm as any).visible = true;
    await settle();
    return { server, freed };
  };

  test("a booking from an entry starts with its service, and sends the entry along", async () => {
    const { server } = await openBooking({
      client_id: "c1", first_name: "MARIA", last_name: "PAPA", start_time: new Date("2026-11-18T17:00:00"),
      staff_id: "st1", service_id: "svc", waitlist_entry_id: "w1",
    });
    document.querySelector<HTMLElement>('[data-testid="booking-save"]')!.click();
    await settle();
    const body = server.called("POST", "/api/v1/appointments")[0].body;
    expect(body.waitlist_entry_id).toBe("w1");
    expect(body.services).toEqual([expect.objectContaining({ service_id: "svc", staff_id: "st1", duration_override: 60, price_override: 30 })]);
  });

  test("deleting a booking reports the time it frees", async () => {
    const { freed } = await openBooking(
      {
        id: "a1", version: 2, status: "confirmed", client_id: "c1", first_name: "MARIA", last_name: "PAPA",
        services: [{ service_id: "svc", staff_id: "st1", start_time: "2026-11-19T18:00:00", duration_minutes: 60, price: 30 }],
      },
      { "DELETE /api/v1/appointments/a1": { body: { success: true } } },
    );
    document.querySelector<HTMLElement>('[data-testid="booking-delete"]')!.click();
    await settle();
    await answerConfirm(true);
    expect(freed).toHaveBeenCalledWith([{ staff_id: "st1", start: new Date("2026-11-19T18:00:00"), end: new Date("2026-11-19T19:00:00") }]);
  });
});
