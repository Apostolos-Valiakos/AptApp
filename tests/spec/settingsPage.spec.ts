// The settings page (Προφίλ): what each card shows and saves, and who sees
// which card. Written before the page was split into one component per card
// (so the split can't change any of it). SP1–SP6.
import { describe, expect, test, vi } from "vitest";
import ProfileView from "../../client/src/views/profileView.vue";
import el from "../../client/src/i18n/locales/el";
import { answerConfirm, fakeServer, mountScreen, pageText, saveLogin, settle, type Handler } from "./helpers";

const profile = {
  user_id: "11111111-2222-3333-4444-555555555555",
  username: "maria",
  role: "admin",
  staff_id: "st1",
  staff_name: "Maria Papa",
  staff_email: "maria@example.invalid",
  staff_phone: "6900000000",
  shop_name: "Pure",
  shop_reply_email: "desk@example.invalid",
  shop_phone: "2410000000",
  shop_address: "Larisa",
  shop_website: "https://pure.example",
  slot_min_time: "08:00",
  slot_max_time: "21:00",
  show_weekends: false,
  reminder_hours_before: 12,
  self_booking_enabled: true,
};

const open = async (role = "admin", routes: Record<string, Handler> = {}) => {
  saveLogin({ id: "u1", role, shop_id: "s1" });
  const server = fakeServer({
    "GET /api/v1/profile": { body: { ...profile, role } },
    "GET /api/v1/contests": { body: [] },
    "GET /api/v1/broadcasts": { body: [] },
    "GET /api/v1/discount-codes": { body: [] },
    "GET /api/v1/discounts/usage": { body: [] },
    ...routes,
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  const wrapper = mountScreen(ProfileView);
  await settle();
  return { server, wrapper };
};
const inputs = () => [...document.querySelectorAll<HTMLInputElement>("input:not([type=file]), textarea")];
const valueOf = (v: string) => inputs().some((i) => i.value === v);
/** The card with this heading. */
const card = (title: string) => {
  const heading = [...document.querySelectorAll("h2, h3")].find((h) => h.textContent?.trim() === title);
  if (!heading) throw new Error(`no card "${title}"`);
  return heading.closest(".rounded-2xl") as HTMLElement;
};
const type = async (field: HTMLInputElement | HTMLTextAreaElement, text: string) => {
  field.value = text;
  field.dispatchEvent(new Event("input"));
  await settle();
};
const typeInto = (current: string, next: string) => type(inputs().find((i) => i.value === current)!, next);
const clickIn = async (title: string, label?: string) => {
  const buttons = [...card(title).querySelectorAll<HTMLButtonElement>("button")];
  (label ? buttons.find((b) => b.textContent?.trim() === label)! : buttons[0]).click();
  await settle();
};

describe("SP1 the cards are filled from the profile", () => {
  test("personal details, the shop's contact details, the reply email and the calendar settings", async () => {
    await open();
    for (const v of ["Maria", "Papa", "maria@example.invalid", "2410000000", "Larisa", "https://pure.example", "desk@example.invalid", "08:00", "21:00"]) {
      expect(valueOf(v), v).toBe(true);
    }
    expect(pageText()).toContain("Maria Papa");
  });
});

describe("SP2 saving", () => {
  test("personal details", async () => {
    const { server } = await open("admin", { "PUT /api/v1/profile": { body: {} } });
    await typeInto("Papa", "Papadopoulou");
    await clickIn(el.profile.personalInfo.title, el.profile.personalInfo.saveChanges);
    expect(server.called("PUT", "/api/v1/profile")[0].body).toEqual({ firstName: "Maria", lastName: "Papadopoulou", email: "maria@example.invalid", phone: "6900000000" });
    expect(pageText()).toContain("Maria Papadopoulou");
  });

  test("the shop's contact details, the reply email and the calendar settings", async () => {
    const { server } = await open("admin", {
      "PUT /api/v1/shop/contact": { body: {} },
      "PUT /api/v1/shop/reply-email": { body: {} },
      "PUT /api/v1/shop/calendar-settings": { body: {} },
    });
    await typeInto("Larisa", "Volos");
    await clickIn(el.profile.clinicInfo.title, el.common.save);
    expect(server.called("PUT", "/api/v1/shop/contact")[0].body).toEqual({ phone: "2410000000", address: "Volos", website: "https://pure.example" });
    await clickIn(el.profile.clinicSettings.title, el.common.save);
    expect(server.called("PUT", "/api/v1/shop/reply-email")[0].body).toEqual({ reply_email: "desk@example.invalid" });
    await clickIn(el.profile.calendarSettings.title, el.common.save);
    expect(server.called("PUT", "/api/v1/shop/calendar-settings")[0].body).toEqual({
      slot_min_time: "08:00", slot_max_time: "21:00", show_weekends: false, reminder_hours_before: 12,
    });
  });

  test("self-booking goes back if the server refuses it", async () => {
    const { server } = await open("admin", { "PUT /api/v1/shop/self-booking": { status: 500, body: { error: "No" } } });
    const selfBooking = card(el.profile.selfBooking.title).querySelector<HTMLInputElement>("input")!;
    expect(selfBooking.checked).toBe(true);
    selfBooking.click();
    await settle();
    expect(server.called("PUT", "/api/v1/shop/self-booking")[0].body).toEqual({ self_booking_enabled: false });
    expect(selfBooking.checked).toBe(true);
  });

  test("the online-booking rules: the notice and the cancellation note are saved together", async () => {
    const { server } = await open("admin", { "PUT /api/v1/shop/portal-rules": { body: { success: true } } });
    const note = document.querySelector<HTMLTextAreaElement>('[data-testid="portal-rules"] textarea')!;
    note.value = "Δωρεάν ακύρωση έως 24 ώρες πριν.";
    note.dispatchEvent(new Event("input"));
    await settle();
    document.querySelector<HTMLElement>('[data-testid="save-rules"]')!.click();
    await settle();
    expect(server.called("PUT", "/api/v1/shop/portal-rules")[0].body).toEqual({ portal_min_notice_minutes: 0, cancellation_note: "Δωρεάν ακύρωση έως 24 ώρες πριν.", google_review_url: "" });
  });
});

describe("SP3 the password", () => {
  test("can be changed once it is long enough, has a number and matches; the form then empties", async () => {
    const { server } = await open("admin", { "PUT /api/v1/profile/password": { body: {} } });
    const fields = [...card(el.profile.password.title).querySelectorAll<HTMLInputElement>("input")];
    await type(fields[0], "old-one");
    await type(fields[1], "newpass12");
    await type(fields[2], "newpass12");
    await clickIn(el.profile.password.title, el.profile.password.update);
    expect(server.called("PUT", "/api/v1/profile/password")[0].body).toEqual({ currentPassword: "old-one", newPassword: "newpass12" });
    expect(fields.every((f) => f.value === "")).toBe(true);
  });
});

describe("SP4 a push message to clients", () => {
  test("is sent with its title and text, and the form empties", async () => {
    const { server } = await open("admin", { "POST /api/v1/broadcasts": { body: { recipient_count: 7 } } });
    await type(card(el.profile.broadcast.title).querySelector("input")!, "Closed on Monday");
    const text = card(el.profile.broadcast.title).querySelector("textarea")!;
    await type(text, "We are closed on Monday.");
    await clickIn(el.profile.broadcast.title, el.profile.broadcast.send);
    expect(server.called("POST", "/api/v1/broadcasts")[0].body).toEqual({ title: "Closed on Monday", body: "We are closed on Monday." });
    expect(text.value).toBe("");
  });
});

describe("SP5 logging everyone out (super admin)", () => {
  test("asks first, then logs everyone out", async () => {
    const { server } = await open("super_admin", { "POST /api/v1/shop/force-logout": { body: { token: "fresh" } } });
    await clickIn(el.profile.forceLogout.title, el.profile.forceLogout.button);
    expect(server.called("POST", "/api/v1/shop/force-logout")).toHaveLength(0);
    await answerConfirm(true);
    expect(server.called("POST", "/api/v1/shop/force-logout")).toHaveLength(1);
  });
});

describe("SP6 who sees which card", () => {
  test("staff: their own details and password only", async () => {
    await open("staff");
    expect(pageText()).toContain(el.profile.personalInfo.title);
    expect(pageText()).toContain(el.profile.password.title);
    for (const hidden of [el.profile.clinicInfo.title, el.profile.calendarSettings.title, el.profile.broadcast.title, el.profile.contests.title, el.profile.forceLogout.title]) {
      expect(pageText()).not.toContain(hidden);
    }
  });

  test("front desk: the shop's settings too, but not the admin-only ones", async () => {
    await open("frontdesk");
    expect(pageText()).toContain(el.profile.clinicInfo.title);
    expect(pageText()).toContain(el.profile.calendarSettings.title);
    expect(pageText()).not.toContain(el.profile.broadcast.title);
    expect(pageText()).not.toContain(el.profile.forceLogout.title);
  });

  test("admin: everything but logging everyone out", async () => {
    await open("admin");
    expect(pageText()).toContain(el.profile.broadcast.title);
    expect(pageText()).toContain(el.profile.contests.title);
    expect(pageText()).not.toContain(el.profile.forceLogout.title);
  });
});
