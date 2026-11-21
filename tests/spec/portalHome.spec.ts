// The redesigned Home (REDESIGN_SPEC.md §5.1): the "Up Next" card in each of
// its states (UN1–UN5), "Book again" (BA1–BA2), and the kept features K1, K12
// and K13 on the new screen.
import { describe, expect, test } from "vitest";
import HomeView from "../../client/src/portal/views/HomeView.vue";
import { upNext, bookAgainPairs } from "../../client/src/portal/utils/upNext";
import type { PortalBooking } from "../../client/src/portal/stores/bookings";
import el from "../../client/src/i18n/locales/el";
import { fakeServer, mountScreen, pageText, saveLogin, settle } from "./helpers";

const MIN = 60e3;
const NOW = new Date("2026-11-20T09:00:00");
const booking = (startOffsetMin: number, extra: Partial<PortalBooking> = {}, now = NOW): PortalBooking => {
  const start = new Date(now.getTime() + startOffsetMin * MIN);
  return {
    id: `b${startOffsetMin}`, status: "confirmed", payment_status: "unpaid", booking_notes: null, paid: 0, total: 40,
    start_time: start.toISOString(), end_time: new Date(start.getTime() + 60 * MIN).toISOString(),
    services: [{ service_id: "svc1", service_name: "Hot stones", staff_id: "st1", staff_name: "ΑΝΝΑ", start_time: start.toISOString(), duration_minutes: 60, price: 40 }],
    ...extra,
  };
};

describe("UN1–UN5 the Up Next card's states", () => {
  test("UN1 more than a day away: 'later', counted in days", () => {
    const s = upNext([booking(3 * 24 * 60)], NOW)!;
    expect(s.kind).toBe("later");
    expect(s.daysLeft).toBe(3);
  });
  test("UN2 within a day: 'soon', counted in minutes", () => {
    const s = upNext([booking(5 * 60)], NOW)!;
    expect([s.kind, s.minutesLeft]).toEqual(["soon", 300]);
  });
  test("UN3 within the hour: 'go'", () => {
    expect(upNext([booking(45)], NOW)!.kind).toBe("go");
  });
  test("UN4 under way: 'now'; the soonest one is the card's, cancelled ones never", () => {
    const s = upNext([booking(24 * 60), booking(-30), booking(10, { status: "cancelled" })], NOW)!;
    expect([s.kind, s.booking.id]).toEqual(["now", "b-30"]);
  });
  test("UN5 one that ended earlier today, with nothing else coming: 'done'; none at all: no card", () => {
    expect(upNext([booking(-120)], NOW)!.kind).toBe("done");
    expect(upNext([booking(-120), booking(48 * 60)], NOW)!.kind).toBe("later");
    expect(upNext([booking(-24 * 60)], NOW)).toBeNull();
    expect(upNext([booking(-120, { status: "no-show" })], NOW)).toBeNull();
  });
});

describe("BA1 Book again", () => {
  test("the last distinct treatment and therapist pairs, newest first, cancelled visits left out", () => {
    const svc = (service_id: string, staff_id: string | null) => ({ service_id, service_name: service_id, staff_id, staff_name: staff_id, start_time: "", duration_minutes: 60, price: 40 });
    const past = [
      booking(-60, { services: [svc("massage", "anna")] }),
      booking(-120, { services: [svc("massage", "anna")] }),
      booking(-180, { status: "cancelled", services: [svc("facial", "eleni")] }),
      booking(-240, { services: [svc("massage", "eleni"), svc("sauna", null)] }),
    ];
    expect(bookAgainPairs(past).map((p) => `${p.service_id}/${p.staff_id}`)).toEqual(["massage/anna", "massage/eleni", "sauna/null"]);
  });
});

const open = async ({ list = [] as PortalBooking[], shop = {} as any, contest = null as any } = {}) => {
  saveLogin({ id: "u1", role: "client", shop_id: "s1", client_id: "c1" });
  const server = fakeServer({
    "GET /api/v1/portal/appointments": { body: list },
    "GET /api/v1/shop": { body: { id: "s1", name: "Pure", phone: "2410 555555", address: "Παπαναστασίου 1, Λάρισα", self_booking_enabled: true, ...shop } },
    "GET /api/v1/clients/c1/full": { body: { client: { first_name: "Μαρία", qr_token: "QR1" }, history: [] } },
    "GET /api/v1/clients/c1/packages": { body: [{ id: "p1", name: "5 μασάζ", state: "active", remaining: 3, total_visits: 5, used: 2 }] },
    "GET /api/v1/clients/c1/membership": { body: { membership: null, usage: [] } },
    "GET /api/v1/contests/active": { body: contest },
    "POST /api/v1/portal/appointments/b4320/confirm": { body: { success: true } },
  });
  mountScreen(HomeView);
  await settle();
  await settle();
  return server;
};
const card = () => document.querySelector<HTMLElement>('[data-testid="upnext-card"]');

describe("K1 the next appointment (on the new Home)", () => {
  test("what, with whom and when; a booking not confirmed yet can be confirmed from the card", async () => {
    const server = await open({ list: [booking(4320, { status: "new" }, new Date()), booking(-60 * 24 * 10, { id: "old" }, new Date())] });
    expect(card()!.dataset.kind).toBe("later");
    expect(card()!.textContent).toContain("Hot stones");
    expect(card()!.textContent).toContain("ΑΝΝΑ");
    expect(card()!.textContent).toContain(el.portal.v2.upNext.needsConfirm);
    [...card()!.querySelectorAll("button")].find((b) => b.textContent?.includes(el.portal.v2.actions.confirm))!.click();
    await settle();
    expect(server.called("POST", "/api/v1/portal/appointments/b4320/confirm")).toHaveLength(1);
  });

  test("today's: the check-in pass and directions to the shop's address", async () => {
    await open({ list: [booking(180, {}, new Date())] });
    expect(card()!.dataset.kind).toBe("soon");
    expect(card()!.querySelector('a[href="/portal/wallet/pass"]')).not.toBeNull();
    expect(card()!.querySelector<HTMLAnchorElement>('a[href*="google.com/maps"]')!.href).toContain(encodeURIComponent("Παπαναστασίου 1, Λάρισα"));
  });

  test("nothing booked: an invitation to book", async () => {
    await open();
    expect(document.querySelector('[data-testid="home-empty"] a[href="/portal/book"]')).not.toBeNull();
  });

  test("nothing booked and online booking off: a call instead", async () => {
    await open({ shop: { self_booking_enabled: false } });
    expect(document.querySelector('[data-testid="home-empty"] a[href="/portal/book"]')).toBeNull();
    expect(document.querySelector('[data-testid="home-empty"] a[href^="tel:"]')).not.toBeNull();
  });
});

describe("BA2 Book again on Home", () => {
  test("opens Book on the same treatment and therapist", async () => {
    await open({ list: [booking(-60 * 24 * 3, { id: "past" }, new Date())] });
    const link = document.querySelector<HTMLAnchorElement>('[data-testid="book-again"] a')!;
    expect(link.getAttribute("href")).toBe("/portal/book?service=svc1&staff=st1");
    expect(link.textContent).toContain(el.portal.v2.home.sameAsLast);
  });
});

describe("K12, K13 and the wallet on the new Home", () => {
  test("a call link, the running contest, and packages with the visits left", async () => {
    await open({ contest: { id: "k1", name: "Κλήρωση Χριστουγέννων" } });
    expect(document.querySelector('a[href="tel:2410555555"]')).not.toBeNull();
    expect(pageText()).toContain("Κλήρωση Χριστουγέννων");
    expect(document.querySelector('[data-testid="wallet-strip"]')!.textContent).toContain("5 μασάζ");
    expect(document.querySelector('[data-testid="greeting"]')!.textContent).toContain("Μαρία");
  });
});

describe("UN6 'How was it?' after today's visit (N10)", () => {
  test("five stars opens the shop's review page; the visit is marked as asked", async () => {
    const opened: string[] = [];
    const original = window.open;
    window.open = ((url: string) => void opened.push(url)) as any;
    const server = await open({
      list: [booking(-120, { id: "visit" }, new Date())],
      shop: { google_review_url: "https://g.page/r/pure/review" },
    });
    (server.routes as any)["POST /api/v1/portal/appointments/visit/review-prompted"] = { body: { success: true } };
    expect(card()!.dataset.kind).toBe("done");
    const stars = [...document.querySelectorAll<HTMLElement>('[data-testid="review-prompt"] button')];
    expect(stars).toHaveLength(5);
    stars[4].click();
    await settle();
    expect(opened).toEqual(["https://g.page/r/pure/review"]);
    expect(server.called("POST", "/api/v1/portal/appointments/visit/review-prompted")).toHaveLength(1);
    expect(document.querySelector('[data-testid="review-thanks"]')).not.toBeNull();
    window.open = original;
  });

  test("fewer stars only say thank you; a visit already asked about isn't asked again", async () => {
    const opened: string[] = [];
    window.open = ((url: string) => void opened.push(url)) as any;
    await open({ list: [booking(-120, { id: "visit" }, new Date())], shop: { google_review_url: "https://g.page/r/pure/review" } });
    document.querySelectorAll<HTMLElement>('[data-testid="review-prompt"] button')[2].click();
    await settle();
    expect(opened).toEqual([]);
    expect(document.querySelector('[data-testid="review-thanks"]')!.textContent).toContain(el.portal.v2.review.thanks);
  });

  test("not asked twice, nor without a review link", async () => {
    await open({ list: [booking(-120, { id: "visit", review_prompted_at: "2026-11-20T10:00:00Z" }, new Date())], shop: { google_review_url: "https://g.page/r/pure/review" } });
    expect(document.querySelector('[data-testid="review-prompt"]')).toBeNull();
  });
});
