// The client's notes and an appointment's internal note and paid amount,
// wherever clients and appointments are shown. NP1–NP5 in test-report.html.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import BookingDialog from "../../client/src/components/BookingDialog.vue";
import AppointmentHoverCard from "../../client/src/components/AppointmentHoverCard.vue";
import PaidAmount from "../../client/src/components/PaidAmount.vue";
import AppointmentNotesTip from "../../client/src/components/AppointmentNotesTip.vue";
import ClientQuickProfileDialog from "../../client/src/components/ClientQuickProfileDialog.vue";
import ClientProfileDialog from "../../client/src/components/ClientProfileDialog.vue";
import Tooltip from "primevue/tooltip";
import { clearOfflineData } from "../../client/src/offline/queue";
import { i18n } from "../../client/src/i18n";
import { fakeServer, mountScreen, saveLogin, settle, type Handler } from "./helpers";

const MONDAY = "2026-11-02";
const staff = [{ id: "st1", name: "Anna", first_name: "Anna", last_name: "K", sort_order: 1, is_active: true, working_hours_enabled: true }];
const appointment = () => ({
  id: "a1",
  version: 2,
  status: "confirmed",
  client_id: "c1",
  first_name: "Eleni",
  last_name: "P",
  client_notes: "Allergic to almond oil",
  services: [{ service_id: "svc", staff_id: "st1", start_time: `${MONDAY}T10:00:00`, duration_minutes: 60, price_override: 30 }],
});
const clientRow = { id: "c1", first_name: "Eleni", last_name: "P", full_name: "Eleni P", phone: "6900000000", notes: "Allergic to almond oil" };
const past = {
  id: "old1",
  status: "completed",
  start_time: "2026-10-05T10:00:00",
  service_names: "Massage",
  staff_names: "Anna",
  internal_notes: "Prefers a firm massage",
  booking_notes: "Σχόλιο Ραντεβού",
  total: 40,
  paid: 20,
  owed: 20,
};
const routes: Record<string, Handler> = {
  "GET /api/v1/clients": { body: [clientRow] },
  "GET /api/v1/clients/c1/past-appointments": { body: [past] },
  "PUT /api/v1/appointments/a1": { body: { id: "a1", version: 3 } },
  "PUT /api/v1/clients/c1/notes": { body: { success: true, notes: "Allergic to almond oil and nuts" } },
};

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(`${MONDAY}T08:00:00`) });
  fakeServer();
  await clearOfflineData();
});

const openBooking = async (role: string, appt: any = appointment()) => {
  saveLogin({ id: "u1", role, shop_id: "s1" });
  const server = fakeServer(routes);
  vi.spyOn(console, "error").mockImplementation(() => {});
  const Parent = defineComponent({
    data: () => ({ visible: false, appt: null as any }),
    render() {
      return h(BookingDialog, {
        visible: (this as any).visible,
        "onUpdate:visible": (v: boolean) => ((this as any).visible = v),
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
  return { server, parent };
};
const notesBox = () => document.querySelector<HTMLTextAreaElement>('[data-testid="client-notes-input"]');
const typeNotes = async (text: string) => {
  const box = notesBox()!;
  box.value = text;
  box.dispatchEvent(new Event("input"));
  await settle();
};
const save = async () => {
  document.querySelector<HTMLElement>('[data-testid="booking-save"]')!.click();
  await settle();
};

describe("NP1 the client's notes in the booking dialog", () => {
  test("are shown under the client's name, ready to edit", async () => {
    await openBooking("admin");
    expect(notesBox()?.value).toBe("Allergic to almond oil");
  });

  test("an edit is saved with the booking's Save", async () => {
    const { server } = await openBooking("admin");
    await typeNotes("Allergic to almond oil and nuts");
    expect(server.called("PUT", "/api/v1/clients/c1/notes")).toHaveLength(0);
    await save();
    expect(server.called("PUT", "/api/v1/appointments/a1")).toHaveLength(1);
    expect(server.called("PUT", "/api/v1/clients/c1/notes").map((c) => c.body)).toEqual([{ notes: "Allergic to almond oil and nuts" }]);
  });

  test("saving without touching them doesn't write them", async () => {
    const { server } = await openBooking("admin");
    await save();
    expect(server.called("PUT", "/api/v1/appointments/a1")).toHaveLength(1);
    expect(server.called("PUT", "/api/v1/clients/c1/notes")).toHaveLength(0);
  });

  test("closing without saving drops the edit", async () => {
    const { server, parent } = await openBooking("admin");
    await typeNotes("Changed");
    (parent.vm as any).visible = false;
    await settle();
    expect(server.called("PUT", "/api/v1/clients/c1/notes")).toHaveLength(0);
  });

  test("staff read them but can't edit them", async () => {
    await openBooking("staff");
    expect(notesBox()).toBeNull();
    expect(document.querySelector('[data-testid="client-notes-text"]')?.textContent).toContain("Allergic to almond oil");
  });
});

describe("NP2 past visits in the booking dialog's sidebar", () => {
  test("show only what was paid, and both notes behind an info icon", async () => {
    await openBooking("admin");
    const row = document.querySelector('[data-testid="past-appointment"]')!;
    expect(row.querySelector('[data-testid="paid-amount"]')?.textContent?.replace(/\s+/g, " ").trim()).toBe("20,00 €");
    expect(row.querySelector('[data-testid="appointment-notes-tip"]')?.getAttribute("aria-label")).toBe(
      "Σημειώσεις ραντεβού: Σχόλιο Ραντεβού\n\nΕσωτερική σημείωση: Prefers a firm massage",
    );
  });

  test("staff see the note but no money", async () => {
    await openBooking("staff");
    const row = document.querySelector('[data-testid="past-appointment"]')!;
    expect(row.querySelector('[data-testid="paid-amount"]')).toBeNull();
    expect(row.querySelector('[data-testid="appointment-notes-tip"]')).not.toBeNull();
  });
});

describe("NP3 the amount paid", () => {
  const text = (paid: number, total: number) => {
    const wrapper = mount(PaidAmount, { props: { paid, total }, global: { plugins: [i18n] } });
    return wrapper.text().replace(/\s+/g, " ");
  };
  test("only the amount when all of it is paid", () => {
    expect(text(40, 40)).toBe("40,00 €");
  });
  test("the total too when it isn't", () => {
    expect(text(20, 40)).toBe("20,00 € από 40,00 €");
    expect(text(0, 40)).toBe("0,00 € από 40,00 €");
  });
  test("nothing to pay reads as paid", () => {
    expect(text(0, 0)).toBe("0,00 €");
  });
  // A client's history shows only what the client paid.
  const onlyPaid = (paid: number, total: number) =>
    mount(PaidAmount, { props: { paid, total, onlyPaid: true }, global: { plugins: [i18n] } }).text().replace(/\s+/g, " ");
  test("in a client's history: what was paid, never the total", () => {
    expect(onlyPaid(40, 40)).toBe("40,00 €");
    expect(onlyPaid(20, 40)).toBe("20,00 €");
  });
  test("in a client's history: nothing paid (or refunded), no amount at all", () => {
    expect(onlyPaid(0, 40)).toBe("");
    expect(onlyPaid(0, 0)).toBe("");
    expect(onlyPaid(-10, 40)).toBe("");
  });
});

describe("NP4 the calendar's hover card", () => {
  const card = (role: string, appointment: any) => {
    saveLogin({ id: "u1", role, shop_id: "s1" });
    const wrapper = mount(AppointmentHoverCard, {
      props: {
        appointment: { status: "confirmed", first_name: "Eleni", last_name: "P", start: new Date(`${MONDAY}T10:00:00`), end: new Date(`${MONDAY}T11:00:00`), service_name: "Massage", ...appointment },
        anchorRect: { top: 10, left: 10, right: 110, bottom: 60, width: 100, height: 50 },
      },
      global: { plugins: [i18n], stubs: { teleport: true } },
    });
    const pick = (id: string) => wrapper.find(`[data-testid="${id}"]`);
    return {
      notes: pick("hover-client-notes").exists() ? pick("hover-client-notes").text() : null,
      payment: pick("hover-payment").text().replace(/\s+/g, " "),
      serviceNotes: wrapper.findAll('[data-testid="hover-service-note"]').map((n) => n.text()),
    };
  };

  test("shows the hovered service's own note, and each one's in the day's list", () => {
    expect(card("admin", { service_notes: "Pressure on the left shoulder" }).serviceNotes[0]).toContain("Pressure on the left shoulder");
    expect(card("admin", { service_notes: "" }).serviceNotes).toEqual([]);
    const day = card("admin", {
      day_services: [
        { id: "a1_0", start: new Date(`${MONDAY}T10:00:00`), service: "Massage", staff: "Anna", notes: "Firm", current: true },
        { id: "a1_1", start: new Date(`${MONDAY}T11:00:00`), service: "Sauna", staff: "", notes: "" },
      ],
    });
    expect(day.serviceNotes).toHaveLength(1);
    expect(day.serviceNotes[0]).toContain("Firm");
  });

  test("shows the client's notes", () => {
    expect(card("admin", { client_notes: "Allergic to almond oil" }).notes).toContain("Allergic to almond oil");
    expect(card("admin", { client_notes: "" }).notes).toBeNull();
  });

  test("a part payment: what was paid of the total", () => {
    expect(card("admin", { current_appt_total: 40, deposit_amount: 20, payment_status: "partial" }).payment).toBe("Πληρωμένο 20,00 € από 40,00 €");
    expect(card("admin", { current_appt_total: 40, deposit_amount: 40, payment_status: "paid" }).payment).toBe("Πληρωμένο 40,00 €");
    expect(card("admin", { current_appt_total: 40, deposit_amount: 0, payment_status: "unpaid" }).payment).toBe("Απλήρωτο 40,00 €");
  });

  test("staff see whether it is paid, without amounts", () => {
    expect(card("staff", { current_appt_total: 40, deposit_amount: 20, payment_status: "partial" }).payment).toBe("Πληρωμένο");
    expect(card("staff", { current_appt_total: 40, deposit_amount: 0, payment_status: "unpaid" }).payment).toBe("Απλήρωτο");
  });
});

describe("NP5 notes behind the info icon", () => {
  const tip = (appointment: any) => {
    const wrapper = mount(AppointmentNotesTip, { props: { appointment }, global: { plugins: [i18n], directives: { tooltip: Tooltip } } });
    const button = wrapper.find('[data-testid="appointment-notes-tip"]');
    return button.exists() ? button.attributes("aria-label") : null;
  };
  test("the appointment notes alone, the internal note alone, or none", () => {
    expect(tip({ booking_notes: "Σχόλιο Ραντεβού" })).toBe("Σημειώσεις ραντεβού: Σχόλιο Ραντεβού");
    expect(tip({ internal_notes: "Firm" })).toBe("Εσωτερική σημείωση: Firm");
    expect(tip({ booking_notes: " ", internal_notes: null })).toBeNull();
  });
});

describe("NP6 a visit in the client's quick profile", () => {
  test("opens in the booking dialog, as the calendar has it", async () => {
    saveLogin({ id: "u1", role: "admin", shop_id: "s1" });
    const visit = { id: "old1", status: "completed", start_time: "2026-10-05T10:00:00", service_names: "Massage", internal_notes: null, booking_notes: "Σχόλιο Ραντεβού", paid: 0, total_service_price: 35, total_product_price: 0, services_paid: [] };
    const dayRow = { ...appointment(), id: "old1" };
    const server = fakeServer({
      "GET /api/v1/clients/c1/full": { body: { client: clientRow, history: [visit] } },
      "GET /api/v1/appointments": { body: [dayRow] },
    });
    const opened = vi.fn();
    const Parent = defineComponent({
      data: () => ({ visible: false }),
      render() {
        return h(ClientQuickProfileDialog, { visible: (this as any).visible, clientId: "c1", onOpenAppointment: opened });
      },
    });
    const wrapper = mountScreen(Parent);
    (wrapper.findComponent(Parent).vm as any).visible = true;
    await settle();
    const row = document.querySelector<HTMLElement>('[data-testid="quick-profile-appointment"]')!;
    expect(row.querySelector('[data-testid="appointment-notes-tip"]')?.getAttribute("aria-label")).toBe("Σημειώσεις ραντεβού: Σχόλιο Ραντεβού");
    row.click();
    await settle();
    expect(server.called("GET", "/api/v1/appointments")[0].url).toContain("date=2026-10-05");
    expect(opened).toHaveBeenCalledWith(dayRow);
  });
});

describe("NP7 a client's history shows only what they paid", () => {
  const visit = (id: string, paid: number, total: number) => ({
    id, status: "completed", start_time: "2026-10-05T10:00:00", service_names: `Massage ${id}`, internal_notes: null, booking_notes: null,
    paid, total_service_price: total, total_product_price: 0, services_paid: [],
  });
  const history = [visit("full", 40, 40), visit("part", 20, 40), visit("none", 0, 35)];
  const amounts = (selector: string) =>
    [...document.querySelectorAll<HTMLElement>(selector)].map((row) => row.querySelector('[data-testid="paid-amount"]')?.textContent?.replace(/\s+/g, " ").trim() ?? null);

  test("the full profile: paid in full or in part, the amount paid; nothing paid, no amount", async () => {
    saveLogin({ id: "u1", role: "admin", shop_id: "s1" });
    fakeServer({ "GET /api/v1/clients/c1/full": { body: { client: clientRow, history, files: [] } } });
    const Parent = defineComponent({
      data: () => ({ visible: false }),
      render() {
        return h(ClientProfileDialog, { visible: (this as any).visible, clientId: "c1", initialTab: "History" });
      },
    });
    const wrapper = mountScreen(Parent);
    (wrapper.findComponent(Parent).vm as any).visible = true;
    await settle();
    const rows = [...document.querySelectorAll<HTMLElement>(".p-dialog .border-gray-100.rounded-lg")].filter((r) => r.textContent?.includes("Massage"));
    expect(rows.map((r) => r.querySelector('[data-testid="paid-amount"]')?.textContent?.replace(/\s+/g, " ").trim() ?? null)).toEqual(["40,00 €", "20,00 €", null]);
    expect(document.querySelector(".p-dialog")!.textContent).not.toContain("από");
  });

  test("the quick profile too", async () => {
    saveLogin({ id: "u1", role: "admin", shop_id: "s1" });
    fakeServer({ "GET /api/v1/clients/c1/full": { body: { client: clientRow, history } } });
    const Parent = defineComponent({
      data: () => ({ visible: false }),
      render() {
        return h(ClientQuickProfileDialog, { visible: (this as any).visible, clientId: "c1" });
      },
    });
    const wrapper = mountScreen(Parent);
    (wrapper.findComponent(Parent).vm as any).visible = true;
    await settle();
    expect(amounts('[data-testid="quick-profile-appointment"]')).toEqual(["40,00 €", "20,00 €", null]);
  });
});

describe("a visit in the client's history opens its booking", () => {
  const openProfile = (props: Record<string, any> = {}) => {
    const Parent = defineComponent({
      data: () => ({ visible: false }),
      render() {
        return h(ClientProfileDialog, { visible: (this as any).visible, clientId: "c1", initialTab: "History", ...props });
      },
    });
    const wrapper = mountScreen(Parent);
    (wrapper.findComponent(Parent).vm as any).visible = true;
    return wrapper;
  };
  const visit = { ...past, id: "a1", start_time: `${MONDAY}T10:00:00`, service_names: "Massage", paid: 0, total_service_price: 30 };

  test("the booking dialog opens on top with that booking, from the day's list; the profile stays behind", async () => {
    saveLogin({ id: "u1", role: "admin", shop_id: "s1" });
    const server = fakeServer({
      "GET /api/v1/clients/c1/full": { body: { client: clientRow, history: [visit] } },
      "GET /api/v1/appointments": { body: [appointment()] },
      "GET /api/v1/staff": { body: staff },
      "GET /api/v1/services": { body: [{ id: "svc", name: "Massage", price: 30, duration_minutes: 60 }] },
      "GET /api/v1/shop": { body: { slot_min_time: "09:00", slot_max_time: "21:00" } },
    });
    openProfile();
    await settle();
    document.querySelector<HTMLElement>('[data-testid="history-booking"]')!.click();
    await vi.waitFor(() => {
      if (!document.querySelector(".fresha-dialog")) throw new Error("no booking dialog yet");
    });
    await settle();
    expect(server.calls.some((c) => c.path === "/api/v1/appointments" && c.url.includes(`date=${MONDAY}`))).toBe(true);
    expect(document.querySelector(".fresha-dialog")!.textContent).toContain("Eleni");
    expect(document.querySelector(".client-profile-dialog")).not.toBeNull();
  });

  test("the booking it was opened from just closes the profile, showing that booking", async () => {
    saveLogin({ id: "u1", role: "admin", shop_id: "s1" });
    const server = fakeServer({ "GET /api/v1/clients/c1/full": { body: { client: clientRow, history: [visit] } } });
    openProfile({ currentAppointmentId: "a1" });
    await settle();
    document.querySelector<HTMLElement>('[data-testid="history-booking"]')!.click();
    await settle();
    expect(server.called("GET", "/api/v1/appointments")).toHaveLength(0);
    expect(document.querySelector(".fresha-dialog")).toBeNull();
  });
});

describe("NP6 each service's own note in the booking dialog", () => {
  const withNote = () => ({
    ...appointment(),
    services: [{ ...appointment().services[0], notes: "Pressure on the left shoulder" }],
  });
  const noteBoxes = () => [...document.querySelectorAll<HTMLTextAreaElement>('[data-testid="service-notes"]')];

  test("every service row has its note box, showing the saved note", async () => {
    await openBooking("admin", withNote());
    expect(noteBoxes().map((b) => b.value)).toEqual(["Pressure on the left shoulder"]);
  });

  test("an edited note is sent with that service when the booking is saved", async () => {
    const { server } = await openBooking("admin", withNote());
    const box = noteBoxes()[0];
    box.value = "Softer on the neck";
    box.dispatchEvent(new Event("input"));
    await settle();
    await save();
    const put = server.called("PUT", "/api/v1/appointments/a1")[0];
    expect(put?.body.services.map((s: any) => s.notes)).toEqual(["Softer on the neck"]);
  });
});
