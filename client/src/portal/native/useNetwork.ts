// Whether the phone is online, for the offline banner (N13). In the app,
// @capacitor/network, which knows about airplane mode and lost Wi-Fi at once;
// in a browser, its online / offline events.
import { onBeforeUnmount, onMounted, ref } from "vue";
import { Network } from "@capacitor/network";
import { isNative, quietly } from "./platform";

export const useNetwork = () => {
  const online = ref(typeof navigator === "undefined" || navigator.onLine !== false);

  if (isNative()) {
    let remove: (() => void) | undefined;
    onMounted(async () => {
      const status = await quietly(() => Network.getStatus());
      if (status) online.value = status.connected;
      const handle = await quietly(() => Network.addListener("networkStatusChange", (s) => (online.value = s.connected)));
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
