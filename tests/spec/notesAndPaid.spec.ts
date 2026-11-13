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

const openBooking = async (role: string) => {
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
  (parent.vm as any).appt = appointment();
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
  test("show what was paid of the total, and both notes behind an info icon", async () => {
    await openBooking("admin");
    const row = document.querySelector('[data-testid="past-appointment"]')!;
    expect(row.querySelector('[data-testid="paid-amount"]')?.textContent?.replace(/\s+/g, " ").trim()).toBe("20,00 € από 40,00 €");
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
    };
  };

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
