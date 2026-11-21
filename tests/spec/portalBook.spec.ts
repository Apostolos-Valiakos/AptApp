// The redesigned Book screen (REDESIGN_SPEC.md §5.2): three steps (BK1),
// "Anyone" and who it gets (BK2), the summary bar (BK3), online booking off
// (BK4, K14), Book again's link (BK5), the assistant from Book (BK6), moving a
// booking (BK7), a time taken meanwhile (BK8), and the "done" sheet (BK9).
import { describe, expect, test } from "vitest";
import { RouterView } from "vue-router";
import BookView from "../../client/src/portal/views/BookView.vue";
import BookingSuccessSheet from "../../client/src/portal/components/BookingSuccessSheet.vue";
import { useAssistantStore } from "../../client/src/portal/stores/assistant";
import { toLocalDateStr } from "../../client/src/utils/staffAvailability";
import el from "../../client/src/i18n/locales/el";
import { blankRouter, fakeServer, mountScreen, pageText, saveLogin, settle } from "./helpers";
import { defineComponent, h } from "vue";

const tomorrow = new Date(Date.now() + 864e5);
const DAY = toLocalDateStr(tomorrow);
const at = (hh: number, mm = 0) => {
  const d = new Date(tomorrow);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
};
const SERVICES = [
  { id: "svc1", name: "Μασάζ σώματος", duration_minutes: 60, price: 45, category: "Μασάζ" },
  { id: "svc2", name: "Περιποίηση προσώπου", duration_minutes: 45, price: 35, category: "Πρόσωπο" },
];
const STAFF = [{ id: "st1", name: "ΑΝΝΑ" }, { id: "st2", name: "ΕΛΕΝΗ" }];
const SLOTS = [
  { start_time: at(10), staff_id: "st2", staff_name: "ΕΛΕΝΗ" },
  { start_time: at(11), staff_id: "st1", staff_name: "ΑΝΝΑ" },
  { start_time: at(18), staff_id: "st1", staff_name: "ΑΝΝΑ" },
];
const DAYS = [{ date: toLocalDateStr(new Date()), count: 0 }, { date: DAY, count: 3 }];

const open = async (path = "/portal/book", routes: Record<string, any> = {}, shop: any = {}) => {
  saveLogin({ id: "u1", role: "client", shop_id: "s1", client_id: "c1" });
  const server = fakeServer({
    "GET /api/v1/portal/services": { body: SERVICES },
    "GET /api/v1/portal/staff": { body: STAFF },
    "GET /api/v1/portal/availability/days": { body: DAYS },
    "GET /api/v1/portal/availability/slots": { body: SLOTS },
    "GET /api/v1/shop": { body: { id: "s1", name: "Pure", phone: "2410555555", self_booking_enabled: true, ai_assistant_enabled: true, cancellation_note: "Ακύρωση έως 24 ώρες πριν.", ...shop } },
    "POST /api/v1/appointments": { body: { id: "new1" } },
    "GET /api/v1/portal/appointments": { body: [] },
    ...routes,
  });
  const router = blankRouter([
    { path: "/portal/book", component: BookView },
    { path: "/portal/book/reschedule/:id", component: BookView },
  ]);
  await router.push(path);
  mountScreen(defineComponent({ render: () => [h(RouterView), h(BookingSuccessSheet)] }), { router });
  await settle();
  await settle();
  return { server, router };
};
const all = (id: string) => [...document.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];
const one = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const click = async (el: HTMLElement) => {
  el.click();
  await settle();
  await settle();
};
const chip = (name: string) => [...one("staff-chips")!.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent!.trim() === name)!;

describe("BK1 three steps: treatment, then therapist and time, then confirm (K2)", () => {
  test("books the chosen time with the therapist free then, with the notes", async () => {
    const { server } = await open();
    expect(all("service-option").map((b) => b.textContent)).toEqual([expect.stringContaining("Μασάζ σώματος"), expect.stringContaining("Περιποίηση προσώπου")]);
    await click(all("service-option")[0]);
    // The first day with a free time is chosen.
    expect(server.called("GET", "/api/v1/portal/availability/slots").at(-1)!.url).toContain(`date=${DAY}`);
    expect(all("slot").map((b) => b.textContent!.trim())).toHaveLength(3);
    await click(all("slot")[1]);
    await click(one("continue")!);
    expect(one("summary-staff")!.textContent).toBe("ΑΝΝΑ");
    const notes = document.querySelector<HTMLTextAreaElement>("textarea")!;
    notes.value = "Χωρίς λάδια";
    notes.dispatchEvent(new Event("input"));
    await click(one("submit")!);
    expect(server.called("POST", "/api/v1/appointments")[0].body).toEqual({
      booking_notes: "Χωρίς λάδια",
      services: [{ service_id: "svc1", staff_id: "st1", start_time: at(11) }],
    });
  });

  test("the times are grouped into morning, afternoon and evening; days with free times have dots", async () => {
    await open("/portal/book?service=svc1");
    expect(one("slots")!.textContent).toContain(el.portal.v2.book.morning);
    expect(one("slots")!.textContent).toContain(el.portal.v2.book.evening);
    const days = [...one("date-strip")!.querySelectorAll<HTMLElement>("[data-date]")];
    expect(days.map((d) => d.querySelector("[data-dots]")!.getAttribute("data-dots"))).toEqual(["0", "1"]);
  });
});

describe("BK2 Anyone or a chosen therapist", () => {
  test("Anyone comes first and asks for every therapist's times; choosing one asks for theirs", async () => {
    const { server } = await open("/portal/book?service=svc1");
    expect([...one("staff-chips")!.querySelectorAll("button")].map((b) => b.textContent!.trim())).toEqual([el.portal.v2.home.anyone, "ΑΝΝΑ", "ΕΛΕΝΗ"]);
    expect(chip(el.portal.v2.home.anyone).getAttribute("aria-checked")).toBe("true");
    expect(server.called("GET", "/api/v1/portal/availability/slots").at(-1)!.url).not.toContain("staff_id");
    await click(chip("ΕΛΕΝΗ"));
    expect(server.called("GET", "/api/v1/portal/availability/slots").at(-1)!.url).toContain("staff_id=st2");
  });
});

describe("BK3 the summary bar", () => {
  test("from step 2: the treatment and price; Continue only once a time is picked", async () => {
    await open("/portal/book?service=svc1");
    expect(one("summary-bar")!.textContent).toContain("Μασάζ σώματος");
    expect(one("summary-bar")!.textContent).toContain("45,00");
    expect((one("continue") as HTMLButtonElement).disabled).toBe(true);
    await click(all("slot")[0]);
    expect((one("continue") as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("BK4 online booking off (K14)", () => {
  test("says so, with the shop's phone, and no treatments", async () => {
    await open("/portal/book", { "GET /api/v1/portal/services": { status: 404, body: { error: "self_booking_disabled" } } });
    expect(one("book-disabled")!.textContent).toContain(el.portal.book.disabled);
    expect(one("book-disabled")!.querySelector('a[href="tel:2410555555"]')).not.toBeNull();
    expect(all("service-option")).toHaveLength(0);
  });
});

describe("BK5 Book again's link", () => {
  test("?service=&staff= opens on the times of that therapist", async () => {
    const { server } = await open("/portal/book?service=svc2&staff=st1");
    expect(one("staff-chips")).not.toBeNull();
    expect(chip("ΑΝΝΑ").getAttribute("aria-checked")).toBe("true");
    expect(server.called("GET", "/api/v1/portal/availability/slots").at(-1)!.url).toContain("service_id=svc2");
  });
});

describe("BK6 the assistant from Book", () => {
  test("a card on the first step opens it with a question typed in; a link on the times asks about that treatment", async () => {
    await open();
    await click(one("ask-assistant")!);
    expect(useAssistantStore().visible).toBe(true);
    expect(useAssistantStore().draft).toBe(el.portal.v2.book.askPrompt);
    await click(all("service-option")[0]);
    await click(one("ask-assistant-times")!);
    expect(useAssistantStore().draft).toContain("Μασάζ σώματος");
  });

  test("not shown when the shop has the assistant off", async () => {
    await open("/portal/book", {}, { ai_assistant_enabled: false });
    expect(one("ask-assistant")).toBeNull();
  });
});

const MINE = {
  id: "a9", status: "confirmed", payment_status: "unpaid", booking_notes: null, paid: 0, total: 45,
  start_time: at(9), end_time: at(10),
  services: [{ service_id: "svc1", service_name: "Μασάζ σώματος", staff_id: "st1", staff_name: "ΑΝΝΑ", start_time: at(9), duration_minutes: 60, price: 45 }],
};

describe("BK7 moving a booking", () => {
  test("keeps the treatment and therapist, leaves its own time free, and moves it", async () => {
    const { server } = await open("/portal/book/reschedule/a9", {
      "GET /api/v1/portal/appointments": { body: [MINE] },
      "POST /api/v1/portal/appointments/a9/reschedule": { body: { success: true } },
    });
    expect(one("moving-from")).not.toBeNull();
    expect(chip("ΑΝΝΑ").getAttribute("aria-checked")).toBe("true");
    expect(server.called("GET", "/api/v1/portal/availability/slots").at(-1)!.url).toContain("exclude=a9");
    await click(all("slot")[1]);
    await click(one("continue")!);
    expect(document.querySelector("textarea")).toBeNull();
    await click(one("submit")!);
    expect(server.called("POST", "/api/v1/portal/appointments/a9/reschedule")[0].body).toEqual({ start_time: at(11), staff_id: "st1" });
    expect(server.called("POST", "/api/v1/appointments")).toHaveLength(0);
  });

  test("one with several treatments: call the shop instead", async () => {
    await open("/portal/book/reschedule/a9", { "GET /api/v1/portal/appointments": { body: [{ ...MINE, services: [MINE.services[0], MINE.services[0]] }] } });
    expect(one("book-error")!.textContent).toContain(el.portal.actions.errors.multi_service);
  });
});

describe("BK8 a time taken meanwhile", () => {
  test("says so and goes back to freshly loaded times", async () => {
    const { server } = await open("/portal/book?service=svc1", {
      "POST /api/v1/appointments": { status: 422, body: { error: "self_booking_not_allowed", reason: "slot_unavailable" } },
    });
    await click(all("slot")[0]);
    await click(one("continue")!);
    const asked = server.called("GET", "/api/v1/portal/availability/slots").length;
    await click(one("submit")!);
    expect(pageText()).toContain(el.portal.actions.errors.slot_unavailable);
    expect(one("slots")).not.toBeNull();
    expect(server.called("GET", "/api/v1/portal/availability/slots").length).toBeGreaterThan(asked);
  });
});

describe("BK9 the done sheet", () => {
  test("after booking: the booking, Add to calendar, Share; the shop's cancellation note is shown before", async () => {
    await open("/portal/book?service=svc1", {
      "GET /api/v1/portal/appointments": { body: [{ ...MINE, id: "new1", start_time: at(11), end_time: at(12) }] },
    });
    await click(all("slot")[1]);
    await click(one("continue")!);
    expect(one("cancellation-note")!.textContent).toContain("24 ώρες");
    await click(one("submit")!);
    const sheet = one("booking-success")!;
    expect(sheet.textContent).toContain("Μασάζ σώματος");
    expect(sheet.textContent).toContain(el.portal.v2.actions.addToCalendar);
    expect(sheet.textContent).toContain(el.portal.v2.actions.share);
  });
});
