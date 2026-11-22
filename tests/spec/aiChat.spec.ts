// The portal's AI assistant: its proposals are cards the client confirms, and
// a confirmed card makes the same request the portal's own screens make, so
// the server's rules apply to both ways of booking. AIC1–AIC3.
import { describe, expect, test, vi } from "vitest";
import AiChat from "../../client/src/portal/components/AiChat.vue";
import { defineComponent, h } from "vue";
import el from "../../client/src/i18n/locales/el";
import { fakeServer, mountScreen, pageText, saveLogin, settle } from "./helpers";

// jsdom doesn't scroll; the panel scrolls to the newest message.
Element.prototype.scrollTo ||= () => {};

const sse = (events: [string, unknown][]) =>
  events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join("");

const BOOKING = {
  type: "booking", service_id: "svc1", service_name: "Μασάζ", staff_id: "st1", staff_name: "ΑΝΝΑ",
  start_time: "2026-11-25T08:00:00.000Z", when: "Wednesday 25 November 2026, 10:00", duration_minutes: 60, price: 45,
};

// The chat itself streams; every other request goes to the fake server.
const open = async (routes: Record<string, any>, replies: string[]) => {
  saveLogin({ id: "u1", role: "client", shop_id: "s1", client_id: "c1" });
  const server = fakeServer(routes);
  const json = globalThis.fetch;
  const chats: any[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init: RequestInit = {}) => {
    if (String(input) !== "/ai/chat") return json(input, init);
    chats.push(JSON.parse(String(init.body)));
    return new Response(replies.shift() ?? sse([["done", {}]]), { status: 200, headers: { "Content-Type": "text/event-stream" } });
  });
  mountScreen(defineComponent({ render: () => h("div", { style: "height: 600px" }, [h(AiChat)]) }));
  await settle();
  return { server, chats };
};
const ask = async (text: string) => {
  const input = document.querySelector<HTMLInputElement>('[data-testid="assistant-chat"] form input')!;
  input.value = text;
  input.dispatchEvent(new Event("input"));
  await settle();
  document.querySelector<HTMLFormElement>('[data-testid="assistant-chat"] form')!.dispatchEvent(new Event("submit"));
  await settle();
  await settle();
};
const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("[data-testid=\"assistant-chat\"] button")].find((b) => b.textContent?.trim() === label)!;

describe("AIC1 a proposed booking", () => {
  test("shows what, who, when and the price; nothing is booked until Confirm", async () => {
    const { server } = await open({}, [sse([["text", { text: "Πατήστε Επιβεβαίωση." }], ["action", BOOKING], ["done", {}]])]);
    await ask("Θέλω μασάζ");
    const text = pageText();
    expect(text).toContain("Μασάζ");
    expect(text).toContain("ΑΝΝΑ");
    expect(text).toContain("45,00");
    expect(server.called("POST", "/api/v1/appointments")).toHaveLength(0);
  });

  test("Confirm books it the way the booking screen does, and the portal's lists refresh", async () => {
    const { server, chats } = await open({ "POST /api/v1/appointments": { body: { id: "a1", success: true } } }, [
      sse([["action", BOOKING], ["done", {}]]),
    ]);
    const changed = vi.fn();
    window.addEventListener("appointments-changed", changed);
    await ask("Θέλω μασάζ");
    button(el.portal.ai.card.confirm).click();
    await settle();
    const [call] = server.called("POST", "/api/v1/appointments");
    expect(call.body).toEqual({ services: [{ service_id: "svc1", staff_id: "st1", start_time: BOOKING.start_time }] });
    expect(call.token).toBe("token-client");
    expect(pageText()).toContain(el.portal.ai.card.done);
    expect(changed).toHaveBeenCalled();
    window.removeEventListener("appointments-changed", changed);
    // The assistant learns it went through with the next message.
    await ask("Ευχαριστώ");
    expect(JSON.stringify(chats[1].history)).toContain("succeeded");
  });
});

describe("AIC2 a refused confirmation", () => {
  test("the card says why, in the client's words, and the assistant is told the reason", async () => {
    const { chats } = await open(
      { "POST /api/v1/appointments": { status: 422, body: { error: "self_booking_not_allowed", reason: "slot_unavailable" } } },
      [sse([["action", BOOKING], ["done", {}]])],
    );
    await ask("Θέλω μασάζ");
    button(el.portal.ai.card.confirm).click();
    await settle();
    expect(pageText()).toContain(el.portal.actions.errors.slot_unavailable);
    await ask("Τι έγινε;");
    expect(JSON.stringify(chats[1].history)).toContain("slot_unavailable");
  });
});

describe("AIC3 moving and cancelling", () => {
  test("a move goes to the reschedule route with the new time and staff; a cancel to the cancel route", async () => {
    const { server } = await open(
      {
        "POST /api/v1/portal/appointments/a9/reschedule": { body: { success: true } },
        "POST /api/v1/portal/appointments/a8/cancel": { body: { success: true } },
      },
      [
        sse([
          ["action", { type: "reschedule", appointment_id: "a9", service_name: "Μασάζ", staff_id: "st2", staff_name: "ΕΛΕΝΗ", start_time: "2026-11-26T09:00:00.000Z", when: "x", old_start_time: "2026-11-25T08:00:00.000Z", old_when: "y" }],
          ["action", { type: "cancel", appointment_id: "a8", service_name: "Σάουνα", staff_name: "", start_time: "2026-11-27T09:00:00.000Z", when: "z" }],
          ["done", {}],
        ]),
      ],
    );
    await ask("Άλλαξε το ραντεβού");
    const confirms = [...document.querySelectorAll<HTMLButtonElement>("[data-testid=\"assistant-chat\"] button")].filter((b) => b.textContent?.trim() === el.portal.ai.card.confirm);
    expect(confirms).toHaveLength(2);
    confirms[0].click();
    await settle();
    confirms[1].click();
    await settle();
    expect(server.called("POST", "/api/v1/portal/appointments/a9/reschedule")[0].body).toEqual({ start_time: "2026-11-26T09:00:00.000Z", staff_id: "st2" });
    expect(server.called("POST", "/api/v1/portal/appointments/a8/cancel")).toHaveLength(1);
  });
});

describe("AIC4 a booking from the chat ends like one from Book", () => {
  test("the same done sheet (Add to calendar, Share) and a link to the booking", async () => {
    const { default: BookingSuccessSheet } = await import("../../client/src/portal/components/BookingSuccessSheet.vue");
    const { useBookingSuccessStore } = await import("../../client/src/portal/stores/success");
    {
      await open(
        {
          "POST /api/v1/appointments": { body: { id: "a1", success: true } },
          "GET /api/v1/portal/appointments": {
            body: [{ id: "a1", status: "new", payment_status: "unpaid", booking_notes: null, paid: 0, total: 45, start_time: BOOKING.start_time, end_time: "2026-11-25T09:00:00.000Z", services: [{ service_id: "svc1", service_name: "Μασάζ", staff_id: "st1", staff_name: "ΑΝΝΑ", start_time: BOOKING.start_time, duration_minutes: 60, price: 45 }] }],
          },
        },
        [sse([["action", BOOKING], ["done", {}]])],
      );
      mountScreen(BookingSuccessSheet);
      await ask("Θέλω μασάζ");
      button(el.portal.ai.card.confirm).click();
      await settle();
      await settle();
      expect(useBookingSuccessStore().bookingId).toBe("a1");
      const sheet = document.querySelector('[data-testid="booking-success"]')!;
      expect(sheet.textContent).toContain(el.portal.v2.actions.addToCalendar);
      expect(document.querySelector('[data-testid="card-open-booking"]')!.getAttribute("href")).toBe("/portal/bookings/a1");
    }
  });
});
