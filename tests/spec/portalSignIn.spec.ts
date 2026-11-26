// Signing in within the Android app (docs/redesign/ANDROID_HANDOFF.md step
// 7.5, REDESIGN_SPEC.md §6.6): the login kept in secure storage, put back at
// start, behind the fingerprint when that's on; logout clears all of it.
// Capacitor's plugins are device APIs, mocked. SI1–SI5.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createMemoryHistory } from "vue-router";

const native = vi.hoisted(() => ({ on: true }));
const plugins = vi.hoisted(() => ({
  BiometricAuth: { authenticate: vi.fn(), checkBiometry: vi.fn() },
  SecureStoragePlugin: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
  LocalNotifications: { getPending: vi.fn(), cancel: vi.fn(), checkPermissions: vi.fn(), addListener: vi.fn() },
  PushNotifications: { unregister: vi.fn(), checkPermissions: vi.fn(), register: vi.fn(), addListener: vi.fn() },
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => native.on } }));
vi.mock("@aparajita/capacitor-biometric-auth", () => ({ BiometricAuth: plugins.BiometricAuth }));
vi.mock("capacitor-secure-storage-plugin", () => ({ SecureStoragePlugin: plugins.SecureStoragePlugin }));
vi.mock("@capacitor/local-notifications", () => ({ LocalNotifications: plugins.LocalNotifications }));
vi.mock("@capacitor/push-notifications", () => ({ PushNotifications: plugins.PushNotifications }));

import { restoreSession, saveSession, useBiometricUnlock } from "../../client/src/portal/native/useSecureSession";
import { forgetPortal } from "../../client/src/portal/logout";
import { createPortalRouter } from "../../client/src/portal/router";
import { fakeServer, settle } from "./helpers";

const CLIENT = { id: "u1", role: "client", shop_id: "s1", client_id: "c1" };
const keep = (session: any) => plugins.SecureStoragePlugin.get.mockResolvedValue({ value: JSON.stringify(session) });

beforeEach(() => {
  native.on = true;
  vi.unstubAllEnvs();
  for (const plugin of Object.values(plugins)) for (const fn of Object.values(plugin)) (fn as any).mockReset();
  plugins.SecureStoragePlugin.get.mockRejectedValue(new Error("Item with given key does not exist"));
  plugins.LocalNotifications.getPending.mockResolvedValue({ notifications: [] });
  localStorage.clear();
  useBiometricUnlock().disable();
});

describe("SI1 unlock off: the kept login is simply put back", () => {
  test("restored into localStorage, no fingerprint asked", async () => {
    keep({ token: "tok-1", user: CLIENT });
    expect(await restoreSession()).toBe("restored");
    expect(localStorage.getItem("token")).toBe("tok-1");
    expect(JSON.parse(localStorage.getItem("user")!)).toEqual(CLIENT);
    expect(plugins.BiometricAuth.authenticate).not.toHaveBeenCalled();
  });

  test("a login is kept in secure storage, never the password", async () => {
    await saveSession("tok-2", CLIENT);
    const saved = JSON.parse(plugins.SecureStoragePlugin.set.mock.calls[0][0].value);
    expect(saved).toEqual({ token: "tok-2", user: CLIENT });
  });

  test("nothing kept: nothing restored", async () => {
    expect(await restoreSession()).toBe("none");
    expect(localStorage.getItem("token")).toBeNull();
  });
});

describe("SI2 unlock on: the fingerprint first", () => {
  test("the WebView's copy is dropped, then put back after the fingerprint", async () => {
    plugins.BiometricAuth.authenticate.mockResolvedValue(undefined);
    expect(await useBiometricUnlock().enable()).toBe(true);
    localStorage.setItem("token", "stale");
    keep({ token: "tok-3", user: CLIENT });
    let tokenWhileAsking: string | null = "unset";
    plugins.BiometricAuth.authenticate.mockImplementation(async () => {
      tokenWhileAsking = localStorage.getItem("token");
    });
    expect(await restoreSession()).toBe("restored");
    expect(tokenWhileAsking).toBeNull();
    expect(localStorage.getItem("token")).toBe("tok-3");
  });

  test("turned on only after one successful unlock", async () => {
    plugins.BiometricAuth.authenticate.mockRejectedValue(new Error("cancelled"));
    expect(await useBiometricUnlock().enable()).toBe(false);
    expect(useBiometricUnlock().enabled.value).toBe(false);
    expect(localStorage.getItem("portal.biometricUnlock")).toBeNull();
  });
});

describe("SI3 unlock failed or cancelled: the login page", () => {
  test("no login put back, and the app's router sends to /login", async () => {
    plugins.BiometricAuth.authenticate.mockResolvedValue(undefined);
    await useBiometricUnlock().enable();
    localStorage.setItem("token", "stale");
    localStorage.setItem("user", JSON.stringify(CLIENT));
    keep({ token: "tok-4", user: CLIENT });
    plugins.BiometricAuth.authenticate.mockRejectedValue(new Error("failed"));
    expect(await restoreSession()).toBe("locked");
    expect(localStorage.getItem("token")).toBeNull();
    fakeServer();
    const router = createPortalRouter(createMemoryHistory());
    await router.push("/portal/home").catch(() => {});
    await settle();
    expect(router.currentRoute.value.path).toBe("/login");
  });
});

describe("SI4 the Security switch only where it works", () => {
  test("in the app with a fingerprint enrolled", async () => {
    plugins.BiometricAuth.checkBiometry.mockResolvedValue({ isAvailable: true });
    expect(await useBiometricUnlock().check()).toBe(true);
  });
  test("not without one, and never in a browser", async () => {
    plugins.BiometricAuth.checkBiometry.mockResolvedValue({ isAvailable: false });
    expect(await useBiometricUnlock().check()).toBe(false);
    native.on = false;
    plugins.BiometricAuth.checkBiometry.mockResolvedValue({ isAvailable: true });
    expect(await useBiometricUnlock().check()).toBe(false);
    expect(await restoreSession()).toBe("none");
  });
});

describe("SI5 logout clears everything on the phone", () => {
  test("secure storage, every reminder, the announcement token and the fingerprint choice", async () => {
    vi.stubEnv("VITE_FCM_ENABLED", "true");
    saveLoginFor("tok-5");
    localStorage.setItem("portal.pushToken", "fcm-token-123456789012345");
    plugins.BiometricAuth.authenticate.mockResolvedValue(undefined);
    await useBiometricUnlock().enable();
    plugins.LocalNotifications.getPending.mockResolvedValue({
      notifications: [{ id: 11, extra: { kind: "reminder" } }, { id: 12, extra: { kind: "reminder" } }, { id: 99, extra: {} }],
    });
    const server = fakeServer({ "DELETE /api/v1/portal/push-device": { body: { success: true } } });

    await forgetPortal();

    const removal = server.called("DELETE", "/api/v1/portal/push-device")[0];
    expect(removal?.body).toEqual({ token: "fcm-token-123456789012345" });
    expect(removal?.token).toBe("tok-5"); // sent with the client's own login, before it goes
    expect(plugins.PushNotifications.unregister).toHaveBeenCalled();
    expect(plugins.LocalNotifications.cancel.mock.calls[0][0].notifications.map((n: any) => n.id)).toEqual([11, 12]);
    expect(plugins.SecureStoragePlugin.remove).toHaveBeenCalledWith({ key: "portal.session" });
    expect(localStorage.getItem("portal.biometricUnlock")).toBeNull();
    expect(localStorage.getItem("portal.pushToken")).toBeNull();
  });
});

function saveLoginFor(token: string) {
  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(CLIENT));
}
