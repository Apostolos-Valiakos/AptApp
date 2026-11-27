// Whether the phone is online, for the offline banner (N13). In the app,
// @capacitor/network, which knows about airplane mode and lost Wi-Fi at once;
// in a browser, its online / offline events.
//
// Offline means no network at all, not Android's "connected" (validated):
// a Wi-Fi network that blocks Google's connectivity check, or a slow mobile
// one still being checked, reaches the shop fine, and the banner would
// otherwise sit over freshly loaded bookings. A load that does fail shows the
// banner through its own `stale` flag.
import { onBeforeUnmount, onMounted, ref } from "vue";
import { Network, type ConnectionStatus } from "@capacitor/network";
import { isNative, quietly } from "./platform";

const hasNetwork = (s: Pick<ConnectionStatus, "connected" | "connectionType">) => s.connected || s.connectionType !== "none";

export const useNetwork = () => {
  const online = ref(typeof navigator === "undefined" || navigator.onLine !== false);

  if (isNative()) {
    let remove: (() => void) | undefined;
    onMounted(async () => {
      const status = await quietly(() => Network.getStatus());
      if (status) online.value = hasNetwork(status);
      const handle = await quietly(() => Network.addListener("networkStatusChange", (s) => (online.value = hasNetwork(s))));
      remove = () => void handle?.remove();
    });
    onBeforeUnmount(() => remove?.());
    return { online };
  }

  const update = () => (online.value = navigator.onLine !== false);
  onMounted(() => {
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
  });
  onBeforeUnmount(() => {
    window.removeEventListener("online", update);
    window.removeEventListener("offline", update);
  });
  return { online };
};
