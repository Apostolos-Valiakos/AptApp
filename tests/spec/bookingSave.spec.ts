// Saving in the booking dialog: what is checked before anything is sent,
// what is sent, and how the server's refusals are handled. Written before
// executeSave and recordPayment were split up (code review proposal 17), so
// the split can't change any of it. BS1–BS6.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { defineComponent, h } from "vue";
import BookingDialog from "../../client/src/components/BookingDialog.vue";
import BookingPayments from "../../client/src/components/booking/bookingPayments.vue";
import { clearOfflineData } from "../../client/src/offline/queue";
import el from "../../client/src/i18n/locales/el";
import { answerConfirm, fakeServer, mountScreen, pageText, saveLogin, settle, type Handler } from "./helpers";

const MONDAY = "2026-11-02";
const staff = [
  { id: "st1", name: "Anna", sort_order: 1, is_active: true, working_hours_enabled: true },
  { id: "sauna", name: "ΣΑΟΥΝΑ", sort_order: 2, is_active: true, capacity: 5 },
];
const workingHours = [{ staff_id: "st1", day_of_week: 1, start_time: "09:00:00", end_time: "17:00:00", effective_from: "2020-01-01" }];
const service = { id: "svc", name: "Massage", duration_minutes: 60, price: 30 };
const appointment = (start = "10:00", extra: any = {}) => ({
  id: "a1",
  version: 2,
  status: "confirmed",
  client_id: "c1",
  first_name: "Eleni",
  last_name: "P",
  services: [{ service_id: "svc", staff_id: "st1", start_time: `${MONDAY}T${start}:00`, duration_minutes: 60, price: 30, charged: 30 }],
  ...extra,
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(`${MONDAY}T08:00:00`) });
  fakeServer();
  await clearOfflineData();
});

const open = async (appt: any, routes: Record<string, Handler> = {}, { role = "admin", timeOff = [] as any[] } = {}) => {
  saveLogin({ id: "u1", role, shop_id: "s1" });
  const server = fakeServer({
    "GET /api/v1/clients": { body: [{ id: "c1", first_name: "Eleni", last_name: "P", full_name: "Eleni P" }] },
    "PUT /api/v1/appointments/a1": { body: { id: "a1", version: 3 } },
    ...routes,
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  const saved = vi.fn();
  const Parent = defineComponent({
    data: () => ({ visible: false, appt: null as any }),
    render() {
      return h(BookingDialog, {
        visible: (this as any).visible,
        "onUpdate:visible": (v: boolean) => ((this as any).visible = v),
        appointment: (this as any).appt,
        services: [service],
        staff,
        allProducts: [],
        timeOff,
        workingHours,
        onSave: saved,
      });
    },
  });
  const wrapper = mountScreen(Parent);
  const parent = wrapper.findComponent(Parent);
  await settle();
  (parent.vm as any).appt = appt;
  (parent.vm as any).visible = true;
  await settle();
  return { server, saved, parent, wrapper };
};
const save = async () => {
  document.querySelector<HTMLElement>('[data-testid="booking-save"]')!.click();
  await settle();
};
const sent = (server: any) => server.called("PUT", "/api/v1/appointments/a1").map((c: any) => c.body);

describe("BS1 checked before anything is sent", () => {
  test("a booking needs a client", async () => {
    const { server } = await open(appointment("10:00", { client_id: null, id: undefined, first_name: null }));
    await save();
    expect(pageText()).toContain(el.booking.validation.selectClient);
    expect(server.calls.filter((c: any) => c.method !== "GET")).toHaveLength(0);
  });

  test("a staff member on leave can't be booked", async () => {
    const { server } = await open(appointment(), {}, {
      timeOff: [{ staff_id: "st1", type: "leave", start_date: MONDAY, end_date: MONDAY }],
    });
    await save();
    expect(pageText()).toContain(el.booking.validation.staffUnavailable);
    expect(sent(server)).toHaveLength(0);
  });
});

describe("BS2 outside working hours", () => {
  test("an admin is asked first, and the booking is sent as overtime", async () => {
    const { server } = await open(appointment("17:30"));
    await save();
    expect(sent(server)).toHaveLength(0);
    await answerConfirm(true);
    expect(sent(server)).toHaveLength(1);
    expect(sent(server)[0].allow_overtime).toBe(true);
  });

  test("saying no sends nothing", async () => {
    const { server } = await open(appointment("17:30"));
    await save();
    await answerConfirm(false);
    expect(sent(server)).toHaveLength(0);
  });
});

describe("BS3 what is sent", () => {
  test("the services with their price, one person outside a shared place, and the version it was loaded at", async () => {
    const { server, saved } = await open(appointment());
    await save();
    const body = sent(server)[0];
    expect(body.allow_overtime).toBe(false);
    expect(body.base_version).toBe(2);
    expect(body.services).toEqual([expect.objectContaining({ service_id: "svc", staff_id: "st1", price_override: 30, persons: 1 })]);
    expect(body.recurrence).toBeNull();
    expect(saved).toHaveBeenCalled();
  });
});

describe("BS4 the server's refusals", () => {
  test("a shared place over its places: asked, then sent again allowing it", async () => {
    let calls = 0;
    const { server } = await open(appointment(), {
      "PUT /api/v1/appointments/a1": () =>
        ++calls === 1
          ? { status: 409, body: { error: "over_capacity", staff_name: "ΣΑΟΥΝΑ", persons: 6, capacity: 5 } }
          : { body: { id: "a1", version: 3 } },
    });
    await save();
    await answerConfirm(true);
    expect(sent(server)).toHaveLength(2);
    expect(sent(server)[1].allow_over_capacity).toBe(true);
  });

  test("a staff member the server finds unavailable: its message, and the dialog stays open", async () => {
    const { saved } = await open(appointment(), {
      "PUT /api/v1/appointments/a1": { status: 409, body: { error: "staff_unavailable" } },
    });
    await save();
    expect(pageText()).toContain(el.booking.validation.staffUnavailable);
    expect(saved).not.toHaveBeenCalled();
    expect(document.querySelector(".p-dialog")).not.toBeNull();
  });

  test("any other refusal shows the server's own words", async () => {
    await open(appointment(), { "PUT /api/v1/appointments/a1": { status: 400, body: { error: "Something specific" } } });
    await save();
    expect(pageText()).toContain("Something specific");
  });
});

describe("BS5 deleting a booking", () => {
  const remove = async () => {
    document.querySelector<HTMLElement>('[data-testid="booking-delete"]')!.click();
    await settle();
    const reason = document.querySelector<HTMLTextAreaElement>('[data-testid="delete-reason"]')!;
    reason.value = "Client called";
    reason.dispatchEvent(new Event("input"));
    await settle();
    await answerConfirm(true);
  };

  test("asks first, sends the reason, and closes", async () => {
    const { server, saved } = await open(appointment(), { "DELETE /api/v1/appointments/a1": { body: { success: true } } });
    await remove();
    const calls = server.called("DELETE", "/api/v1/appointments/a1");
    expect(calls.map((c: any) => c.body)).toEqual([{ reason: "Client called" }]);
    expect(calls[0].url).toContain("scope=single");
    expect(saved).toHaveBeenCalled();
  });

  test("a booking with payments is offered a cancellation instead, which keeps them", async () => {
    const { server, saved } = await open(appointment("10:00", { deposit_amount: 20 }), {
      "POST /api/v1/appointments/a1/cancel": { body: { new_balance: -20 } },
    });
    await remove();
    expect(server.called("DELETE", "/api/v1/appointments/a1")).toHaveLength(0);
    await answerConfirm(true);
    expect(server.called("POST", "/api/v1/appointments/a1/cancel")).toHaveLength(1);
    expect(pageText()).toContain(el.booking.toast.cancelledKeptPayments);
    expect(saved).toHaveBeenCalled();
  });
});

describe("BS6 recording a payment", () => {
  const pay = async (split: any = null) => {
    document.querySelector<HTMLElement>('[data-testid="booking-payment-tab"]')!.click();
    await settle();
    const { wrapper } = opened;
    wrapper.findComponent(BookingPayments).vm.$emit("pay", split);
    await settle();
  };
  let opened: any;

  test("saves the booking first, then sends the amount and the way of paying", async () => {
    opened = await open(appointment(), {
      "POST /api/v1/transactions": { body: { success: true, new_balance: 0, appointment_version: 4, packages_purchased: [], gift_cards_purchased: [] } },
    });
    await pay();
    expect(sent(opened.server)).toHaveLength(1);
    const [payment] = opened.server.called("POST", "/api/v1/transactions");
    expect(payment.body).toEqual(expect.objectContaining({ appointment_id: "a1", client_id: "c1", amount: 30, payment_method: "card" }));
    expect(payment.body.amount2).toBeUndefined();
    expect(pageText()).toContain(el.payment.recordedToast);
  });

  test("a split payment sends both ways", async () => {
    opened = await open(appointment(), {
      "POST /api/v1/transactions": { body: { success: true, new_balance: 0, packages_purchased: [], gift_cards_purchased: [] } },
    });
    await pay({ amount2: 10, payment_method2: "cash", gift_card_id2: null });
    const [payment] = opened.server.called("POST", "/api/v1/transactions");
    expect(payment.body).toEqual(expect.objectContaining({ amount: 30, amount2: 10, payment_method2: "cash", extras_amount2: 0 }));
    expect(pageText()).toContain(el.payment.split.paidToast);
  });

  test("a refused payment shows the server's reason", async () => {
    opened = await open(appointment(), { "POST /api/v1/transactions": { status: 400, body: { error: "Amount exceeds total owed" } } });
    await pay();
    expect(pageText()).toContain("Amount exceeds total owed");
  });
});
