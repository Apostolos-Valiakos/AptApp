import { ref } from "vue";
import { useAuthStore } from "../stores/auth";

const isSupported =
  "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

const permission = ref<NotificationPermission>(
  isSupported ? Notification.permission : "denied",
);

// Converts the VAPID public key (base64url, as web-push generates it) into
// the Uint8Array shape PushManager.subscribe expects.
const urlBase64ToUint8Array = (base64String: string) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
};

export type SubscribeResult =
  | "subscribed"
  | "unsupported"
  | { error: string };

export function usePushNotifications() {
  const authStore = useAuthStore();

  // Every step here can fail in ways the caller genuinely needs to see —
  // Brave/some Android OEM browsers throw on pushManager.subscribe() for
  // reasons that have nothing to do with permission (missing/blocked push
  // service, no FCM sender configured, etc). Previously any of these threw
  // an unhandled rejection with zero UI feedback — the button just looked
  // broken. Now every failure mode returns something the caller can show,
  // including the browser's own permission string verbatim (Notification
  // .permission can be "default" — dismissed, no decision yet — as well as
  // "denied", and the two need different fixes from the user's side).
  const subscribe = async (): Promise<SubscribeResult> => {
    if (!isSupported) return "unsupported";

    try {
      const result = await Notification.requestPermission();
      permission.value = result;
      if (result !== "granted") {
        return { error: `browser permission is "${result}"` };
      }

      const registration = await navigator.serviceWorker.ready;

      const keyRes = await fetch("/api/v1/push/vapid-public-key", {
        headers: { Authorization: `Bearer ${authStore.token}` },
      });
      if (!keyRes.ok) return { error: `Server error (${keyRes.status})` };
      const { publicKey } = await keyRes.json();
      if (!publicKey) return { error: "Push isn't configured on the server yet" };

      // Reuse an existing subscription if one's already active for this SW
      // registration, instead of unconditionally creating a new one.
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }));

      const saveRes = await fetch("/api/v1/portal/push-subscription", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authStore.token}`,
        },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!saveRes.ok) return { error: `Couldn't save subscription (${saveRes.status})` };

      return "subscribed";
    } catch (err: any) {
      return { error: err?.message || String(err) };
    }
  };

  return { isSupported, permission, subscribe };
}
