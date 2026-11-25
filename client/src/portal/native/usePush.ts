// Shop announcements on the phone through Firebase Cloud Messaging
// (docs/redesign/ANDROID_HANDOFF.md §1): wired in, but off until the owner
// adds the keys. The portal build sets VITE_FCM_ENABLED when
// android/app/google-services.json is there (vite.config.mjs); without it the
// app never registers, since Android stops an app that asks for a push token
// with no Firebase set up.
//
// - Register: after the notification permission is granted (asked after the
//   first booking, see useReminders), the token goes to POST /portal/push-device.
// - A tap opens the notification's page (`url`, e.g. /portal/bookings/<id>).
// - Logout removes the token from the server (unregister).
// Reminders don't come this way: the phone schedules those itself.
import { PushNotifications } from "@capacitor/push-notifications";
import type { Router } from "vue-router";
import { api } from "../../api/http";
import { isNative, quietly } from "./platform";

const TOKEN_KEY = "portal.pushToken";
let listening = false;

/** Whether this build has Firebase (google-services.json was there when it was built). */
export const fcmConfigured = () => String(import.meta.env.VITE_FCM_ENABLED || "") === "true";

const savedToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};
const saveToken = (token: string | null) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
};

export const usePush = () => {
  const available = isNative() && fcmConfigured();

  /** Registers this phone for announcements (only with the permission already granted). */
  const register = async (router: Router) => {
    if (!available) return;
    const permission = await quietly(() => PushNotifications.checkPermissions());
    if (permission?.receive !== "granted") return;
    if (!listening) {
      listening = true;
      await quietly(() =>
        PushNotifications.addListener("registration", async ({ value }) => {
          saveToken(value);
          await api.post("/api/v1/portal/push-device", { token: value, platform: "android" }).catch(() => {});
        }),
      );
      await quietly(() =>
        PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
          const url = notification.data?.url;
          if (typeof url === "string" && url.startsWith("/portal")) router.push(url);
        }),
      );
    }
    await quietly(() => PushNotifications.register());
  };

  /** Takes this phone off the client's devices (logout). */
  const unregister = async () => {
    const token = savedToken();
    saveToken(null);
    if (!available) return;
    if (token) await api.request("DELETE", "/api/v1/portal/push-device", { token }).catch(() => {});
    await quietly(() => PushNotifications.unregister());
  };

  return { available, register, unregister };
};
