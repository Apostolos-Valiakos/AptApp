// The Android app's native side (docs/redesign/ANDROID_HANDOFF.md step 7.4,
// REDESIGN_SPEC.md §6.4): each composable uses the phone's own feature in the
// app and does what the portal did before in a browser, never throwing.
// Capacitor's plugins are device APIs here, mocked like the browser's. NT1–NT10.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";

const native = vi.hoisted(() => ({ on: false }));
const plugins = vi.hoisted(() => ({
  Haptics: { selectionChanged: vi.fn(), impact: vi.fn(), notification: vi.fn() },
  LocalNotifications: {
    checkPermissions: vi.fn(),
    requestPermissions: vi.fn(),
    registerActionTypes: vi.fn(),
    getPending: vi.fn(),
    cancel: vi.fn(),
    schedule: vi.fn(),
    addListener: vi.fn(),
  },
  PushNotifications: { checkPermissions: vi.fn(), register: vi.fn(), unregister: vi.fn(), addListener: vi.fn() },
  CapacitorCalendar: { requestWriteOnlyCalendarAccess: vi.fn(), createEvent: vi.fn() },
  Share: { share: vi.fn() },
  AppLauncher: { openUrl: vi.fn() },
  ScreenBrightness: { getBrightness: vi.fn(), setBrightness: vi.fn() },
  Network: { getStatus: vi.fn(), addListener: vi.fn() },
  App: { addListener: vi.fn(), minimizeApp: vi.fn() },
  StatusBar: { setStyle: vi.fn(), setBackgroundColor: vi.fn() },
  SplashScreen: { hide: vi.fn() },
}));

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => native.on } }));
vi.mock("@capacitor/haptics", () => ({ Haptics: plugins.Haptics, ImpactStyle: { Light: "LIGHT", Medium: "MEDIUM" }, NotificationType: { Success: "SUCCESS", Warning: "WARNING", Error: "ERROR" } }));
vi.mock("@capacitor/local-notifications", () => ({ LocalNotifications: plugins.LocalNotifications }));
vi.mock("@capacitor/push-notifications", () => ({ PushNotifications: plugins.PushNotifications }));
vi.mock("@ebarooni/capacitor-calendar", () => ({ CapacitorCalendar: plugins.CapacitorCalendar }));
vi.mock("@capacitor/share", () => ({ Share: plugins.Share }));
vi.mock("@capacitor/app-launcher", () => ({ AppLauncher: plugins.AppLauncher }));
vi.mock("@capacitor-community/screen-brightness", () => ({ ScreenBrightness: plugins.ScreenBrightness }));
vi.mock("@capacitor/network", () => ({ Network: plugins.Network }));
vi.mock("@capacitor/app", () => ({ App: plugins.App }));
vi.mock("@capacitor/status-bar", () => ({ StatusBar: plugins.StatusBar, Style: { Dark: "DARK", Light: "LIGHT" } }));
vi.mock("@capacitor/splash-screen", () => ({ SplashScreen: plugins.SplashScreen }));

import { useHaptics } from "../../client/src/portal/native/useHaptics";
import { planReminders, reminderId, reminderOffsets, useReminders } from "../../client/src/portal/native/useReminders";
import { usePush } from "../../client/src/portal/native/usePush";
import { useCalendarSync } from "../../client/src/portal/native/useCalendarSync";
import { useShare } from "../../client/src/portal/native/useShare";
import { useMaps } from "../../client/src/portal/native/useMaps";
import { useBrightness } from "../../client/src/portal/native/useBrightness";
import { useNetwork } from "../../client/src/portal/native/useNetwork";
import { appPathFor, useDeepLinks } from "../../client/src/portal/native/useDeepLinks";
import { barFor, useNativeChrome } from "../../client/src/portal/native/useNativeChrome";
import { usePortalShopStore } from "../../client/src/portal/stores/shop";
import { usePortalWalletStore } from "../../client/src/portal/stores/wallet";
import { createMemoryHistory, createRouter } from "vue-router";
import { fakeServer, settle } from "./helpers";

const HOUR = 3_600_000;
const booking = (id: string, inHours: number, status = "confirmed") => {
  const start = new Date(Date.now() + inHours * HOUR);
  return {
    id, status, payment_status: "unpaid", booking_notes: null, paid: 0, total: 30,
    start_time: start.toISOString(), end_time: new Date(start.getTime() + HOUR).toISOString(),
    services: [{ service_id: "s1", service_name: "Holistic", staff_id: "st1", staff_name: "Άννα", start_time: start.toISOString(), duration_minutes: 60, price: 30 }],
  } as any;
};
const scheduled = () => plugins.LocalNotifications.schedule.mock.calls.flatMap((c: any[]) => c[0].notifications);
const cancelled = () => plugins.LocalNotifications.cancel.mock.calls.flatMap((c: any[]) => c[0].notifications.map((n: any) => n.id));

beforeEach(() => {
  native.on = false;
  vi.unstubAllEnvs();
  for (const plugin of Object.values(plugins)) for (const fn of Object.values(plugin)) (fn as any).mockReset?.();
  plugins.LocalNotifications.checkPermissions.mockResolvedValue({ display: "granted" });
  plugins.LocalNotifications.getPending.mockResolvedValue({ notifications: [] });
  plugins.LocalNotifications.addListener.mockResolvedValue({ remove: vi.fn() });
  plugins.Network.addListener.mockResolvedValue({ remove: vi.fn() });
  plugins.App.addListener.mockResolvedValue({ remove: vi.fn() });
  plugins.PushNotifications.addListener.mockResolvedValue({ remove: vi.fn() });
});

describe("NT1 haptics: the phone's own in the app, a vibration in a browser", () => {
  test("native", () => {
    native.on = true;
    const h = useHaptics();
    h.tick();
    h.success();
    h.warning();
    expect(plugins.Haptics.selectionChanged).toHaveBeenCalled();
    expect(plugins.Haptics.notification.mock.calls.map((c) => c[0].type)).toEqual(["SUCCESS", "WARNING"]);
  });
  test("web", () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
    useHaptics().success();
    expect(vibrate).toHaveBeenCalledWith([12, 60, 24]);
    expect(plugins.Haptics.notification).not.toHaveBeenCalled();
  });
});

describe("NT2 reminders: which, when and with which id", () => {
  test("ids are stable for a booking and an offset, and differ between them", () => {
    expect(reminderId("b1", 60)).toBe(reminderId("b1", 60));
    expect(new Set([reminderId("b1", 60), reminderId("b1", 1440), reminderId("b2", 60)]).size).toBe(3);
    expect(reminderId("b1", 60)).toBeGreaterThan(0);
    expect(reminderId("b1", 60)).toBeLessThan(2 ** 31);
  });

  test("the client's offsets, else the shop's hours; only 24 h, 2 h and 1 h", () => {
    expect(reminderOffsets([60, 120], 24)).toEqual([60, 120]);
    expect(reminderOffsets(null, 2)).toEqual([120]);
    expect(reminderOffsets([], undefined)).toEqual([1440]);
    expect(reminderOffsets([30, 60], 24)).toEqual([60]);
  });

  test("one per offset for each booking still to come; none for a cancelled one, none already past", () => {
    const soon = booking("soon", 1.5);
    const plan = planReminders([soon, booking("later", 30), booking("gone", 30, "cancelled")], [1440, 60]);
    expect(plan.map((r) => `${r.bookingId}:${r.offset}`).sort()).toEqual(["later:1440", "later:60", "soon:60"]);
    expect(plan.find((r) => r.bookingId === "soon")!.at.getTime()).toBe(new Date(soon.start_time).getTime() - 60 * 60_000);
  });
});

describe("NT3 reminders on the phone", () => {
  const setOffsets = (offsets: number[]) => {
    usePortalWalletStore().client = { reminder_offsets_minutes: offsets } as any;
    usePortalShopStore().shop = { name: "Pure", reminder_hours_before: 24 } as any;
  };

  test("native: scheduled with the Confirm / Directions actions, at the chosen offsets", async () => {
    native.on = true;
    setOffsets([60]);
    await useReminders().syncAll([booking("b1", 3)]);
    expect(plugins.LocalNotifications.registerActionTypes.mock.calls[0][0].types[0].actions.map((a: any) => a.id)).toEqual(["confirm", "directions"]);
    const [n] = scheduled();
    expect(n).toMatchObject({ id: reminderId("b1", 60), actionTypeId: "appt", extra: { kind: "reminder", bookingId: "b1", url: "/portal/bookings/b1" } });
    expect(n.body).not.toContain("Holistic"); // no treatment names
  });

  test("re-syncing replaces them: a cancelled booking's reminders go", async () => {
    native.on = true;
    setOffsets([60]);
    plugins.LocalNotifications.getPending.mockResolvedValue({
      notifications: [{ id: reminderId("b1", 60), extra: { kind: "reminder" } }, { id: reminderId("b2", 60), extra: { kind: "reminder" } }, { id: 7, extra: { kind: "other" } }],
    });
    await useReminders().syncAll([booking("b1", 3), booking("b2", 5, "cancelled")]);
    expect(cancelled()).toEqual([reminderId("b2", 60)]);
    expect(scheduled().map((n: any) => n.id)).toEqual([reminderId("b1", 60)]);
  });

  test("permission is asked only after a booking, once; allowed, the reminders are scheduled", async () => {
    native.on = true;
    setOffsets([60]);
    localStorage.removeItem("portal.remindersAsked");
    plugins.LocalNotifications.checkPermissions.mockResolvedValue({ display: "prompt" });
    const reminders = useReminders();
    await reminders.syncAll([]);
    expect(reminders.shouldAsk.value).toBe(false); // no booking yet
    await reminders.syncAll([booking("b1", 3)]);
    expect(reminders.shouldAsk.value).toBe(true);
    expect(plugins.LocalNotifications.requestPermissions).not.toHaveBeenCalled();
    expect(scheduled()).toEqual([]);
    plugins.LocalNotifications.requestPermissions.mockResolvedValue({ display: "granted" });
    plugins.LocalNotifications.checkPermissions.mockResolvedValue({ display: "granted" });
    expect(await reminders.requestPermission()).toBe(true);
    expect(scheduled().map((n: any) => n.id)).toEqual([reminderId("b1", 60)]);
    expect(reminders.shouldAsk.value).toBe(false);
  });

  test("web: nothing scheduled, nothing asked", async () => {
    setOffsets([60]);
    const reminders = useReminders();
    await reminders.syncAll([booking("b1", 3)]);
    expect(await reminders.requestPermission()).toBe(false);
    expect(plugins.LocalNotifications.schedule).not.toHaveBeenCalled();
    expect(reminders.shouldAsk.value).toBe(false);
  });

  test("Confirm from a reminder confirms the booking; a tap opens it", async () => {
    native.on = true;
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/:p(.*)*", component: { render: () => null } }] });
    const confirm = vi.fn().mockResolvedValue({});
    useReminders().listenForActions(router, confirm);
    await settle();
    const handler = plugins.LocalNotifications.addListener.mock.calls[0][1];
    handler({ actionId: "confirm", notification: { extra: { kind: "reminder", bookingId: "b1", url: "/portal/bookings/b1" } } });
    expect(confirm).toHaveBeenCalledWith("b1");
    handler({ actionId: "tap", notification: { extra: { kind: "reminder", bookingId: "b1", url: "/portal/bookings/b1" } } });
    await settle();
    expect(router.currentRoute.value.path).toBe("/portal/bookings/b1");
  });
});

describe("NT4 announcements (FCM): only in a build with Firebase", () => {
  const router = () => createRouter({ history: createMemoryHistory(), routes: [{ path: "/:p(.*)*", component: { render: () => null } }] });

  test("no google-services.json in the build: never registers", async () => {
    native.on = true;
    plugins.PushNotifications.checkPermissions.mockResolvedValue({ receive: "granted" });
    await usePush().register(router());
    expect(plugins.PushNotifications.register).not.toHaveBeenCalled();
  });

  test("with it: registers, and the token goes to the server", async () => {
    native.on = true;
    vi.stubEnv("VITE_FCM_ENABLED", "true");
    const server = fakeServer({ "POST /api/v1/portal/push-device": { status: 201, body: {} } });
    plugins.PushNotifications.checkPermissions.mockResolvedValue({ receive: "granted" });
    await usePush().register(router());
    expect(plugins.PushNotifications.register).toHaveBeenCalled();
    const onRegistration = plugins.PushNotifications.addListener.mock.calls.find((c) => c[0] === "registration")![1];
    await onRegistration({ value: "fcm-token-123456789012345" });
    expect(server.called("POST", "/api/v1/portal/push-device")[0]?.body).toEqual({ token: "fcm-token-123456789012345", platform: "android" });
  });

  test("web: nothing", async () => {
    vi.stubEnv("VITE_FCM_ENABLED", "true");
    expect(usePush().available).toBe(false);
    await usePush().register(router());
    expect(plugins.PushNotifications.register).not.toHaveBeenCalled();
  });
});

describe("NT5 add to calendar", () => {
  const event = { uid: "b1", title: "Holistic · Pure", start: new Date(2027, 2, 10, 10), end: new Date(2027, 2, 10, 11), location: "Λάρισα", description: "" };
  test("native: into the phone's calendar after asking", async () => {
    native.on = true;
    plugins.CapacitorCalendar.requestWriteOnlyCalendarAccess.mockResolvedValue({ result: "granted" });
    plugins.CapacitorCalendar.createEvent.mockResolvedValue({ id: "1" });
    expect(await useCalendarSync().add(event)).toBe(true);
    expect(plugins.CapacitorCalendar.createEvent.mock.calls[0][0]).toMatchObject({ title: "Holistic · Pure", startDate: event.start.getTime(), endDate: event.end.getTime(), location: "Λάρισα" });
  });
  test("native, access refused: false, so the caller offers another way", async () => {
    native.on = true;
    plugins.CapacitorCalendar.requestWriteOnlyCalendarAccess.mockResolvedValue({ result: "denied" });
    expect(await useCalendarSync().add(event)).toBe(false);
    expect(plugins.CapacitorCalendar.createEvent).not.toHaveBeenCalled();
  });
  test("web: not used (the .ics download stays)", async () => {
    expect(await useCalendarSync().add(event)).toBe(false);
    expect(plugins.CapacitorCalendar.requestWriteOnlyCalendarAccess).not.toHaveBeenCalled();
  });
});

describe("NT6 share", () => {
  test("native: the phone's share sheet", async () => {
    native.on = true;
    expect(await useShare().share({ title: "Pure", text: "x", url: "https://purespabooking.gr/portal/book" })).toBe("shared");
    expect(plugins.Share.share).toHaveBeenCalledWith(expect.objectContaining({ url: "https://purespabooking.gr/portal/book" }));
  });
  test("web without a share sheet: copied", async () => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    expect(await useShare().share({ title: "Pure", text: "x", url: "u" })).toBe("copied");
    expect(plugins.Share.share).not.toHaveBeenCalled();
  });
});

describe("NT7 directions", () => {
  test("native: the Maps app opens; the link isn't followed in the app", () => {
    native.on = true;
    usePortalShopStore().shop = { name: "Pure", address: "Παπαναστασίου 1, Λάρισα" } as any;
    const event = new Event("click", { cancelable: true });
    useMaps().onLinkClick(event);
    expect(event.defaultPrevented).toBe(true);
    expect(plugins.AppLauncher.openUrl.mock.calls[0][0].url).toContain(encodeURIComponent("Παπαναστασίου 1, Λάρισα"));
  });
  test("web: the link does its job", () => {
    usePortalShopStore().shop = { name: "Pure", address: "Λάρισα" } as any;
    const event = new Event("click", { cancelable: true });
    useMaps().onLinkClick(event);
    expect(event.defaultPrevented).toBe(false);
    expect(plugins.AppLauncher.openUrl).not.toHaveBeenCalled();
  });
});

describe("NT8 the pass at full brightness", () => {
  test("native: full while open, back to what it was after", async () => {
    native.on = true;
    plugins.ScreenBrightness.getBrightness.mockResolvedValue({ brightness: 0.4 });
    const b = useBrightness();
    await b.boost();
    await b.restore();
    expect(plugins.ScreenBrightness.setBrightness.mock.calls.map((c) => c[0].brightness)).toEqual([1, 0.4]);
  });
  test("web: nothing", async () => {
    await useBrightness().boost();
    expect(plugins.ScreenBrightness.setBrightness).not.toHaveBeenCalled();
  });
});

describe("NT9 online or not", () => {
  const Probe = defineComponent({ setup: () => useNetwork(), render: () => h("div") });
  test("native: from @capacitor/network, following changes", async () => {
    native.on = true;
    plugins.Network.getStatus.mockResolvedValue({ connected: false });
    const w = mount(Probe);
    await settle();
    expect((w.vm as any).online).toBe(false);
    plugins.Network.addListener.mock.calls[0][1]({ connected: true });
    expect((w.vm as any).online).toBe(true);
    w.unmount();
  });
  test("web: the browser's events", async () => {
    const w = mount(Probe);
    window.dispatchEvent(new Event("offline"));
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    window.dispatchEvent(new Event("offline"));
    expect((w.vm as any).online).toBe(false);
    expect(plugins.Network.getStatus).not.toHaveBeenCalled();
    w.unmount();
  });
});

describe("NT10 links, the back button and the app's frame", () => {
  test("a link to /portal/... opens that screen; other links aren't the app's", () => {
    expect(appPathFor("https://purespabooking.gr/portal/bookings/b1?x=1")).toBe("/portal/bookings/b1?x=1");
    expect(appPathFor("https://purespabooking.gr/app/scheduler")).toBeNull();
    expect(appPathFor("not a url")).toBeNull();
  });

  test("native: the back button closes a sheet first, then goes back, and leaves at the first screen", async () => {
    native.on = true;
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/:p(.*)*", component: { render: () => null } }] });
    await router.push("/portal/home");
    await router.push("/portal/bookings/b1");
    useDeepLinks().install(router);
    await settle();
    const back = plugins.App.addListener.mock.calls.find((c) => c[0] === "backButton")![1];
    const open = plugins.App.addListener.mock.calls.find((c) => c[0] === "appUrlOpen")![1];

    const sheet = document.body.appendChild(Object.assign(document.createElement("div"), { className: "p-drawer" }));
    const escape = vi.fn();
    document.addEventListener("keydown", escape);
    back();
    expect(escape.mock.calls[0][0].key).toBe("Escape");
    sheet.remove();

    vi.spyOn(window.history, "length", "get").mockReturnValue(3);
    back();
    await settle();
    expect(router.currentRoute.value.path).toBe("/portal/home");
    back();
    expect(plugins.App.minimizeApp).toHaveBeenCalled();

    open({ url: "https://purespabooking.gr/portal/wallet" });
    await settle();
    expect(router.currentRoute.value.path).toBe("/portal/wallet");
  });

  test("the status bar: the shop's colour with readable icons, dark in dark mode", () => {
    expect(barFor(false, "#8B6F4E")).toEqual({ background: "#8B6F4E", style: "DARK" });
    expect(barFor(false, "#f5e9a0")).toEqual({ background: "#f5e9a0", style: "LIGHT" });
    expect(barFor(true, "#f5e9a0").style).toBe("DARK");
    native.on = true;
    useNativeChrome().applyTheme(false, "#8B6F4E");
    useNativeChrome().hideSplash();
    expect(plugins.StatusBar.setBackgroundColor).toHaveBeenCalledWith({ color: "#8B6F4E" });
    expect(plugins.SplashScreen.hide).toHaveBeenCalled();
  });

  test("web: the page's theme-color instead, no native calls", () => {
    const meta = document.head.appendChild(Object.assign(document.createElement("meta"), { name: "theme-color" }));
    useNativeChrome().applyTheme(false, "#123456");
    useNativeChrome().hideSplash();
    expect(meta.getAttribute("content")).toBe("#123456");
    expect(plugins.StatusBar.setStyle).not.toHaveBeenCalled();
    expect(plugins.SplashScreen.hide).not.toHaveBeenCalled();
    meta.remove();
  });
});
