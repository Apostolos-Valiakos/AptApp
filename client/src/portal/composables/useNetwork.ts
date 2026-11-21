import { onBeforeUnmount, onMounted, ref } from "vue";

/** Whether the device says it's online, kept up to date (the app build uses @capacitor/network). */
export const useNetwork = () => {
  const online = ref(typeof navigator === "undefined" || navigator.onLine !== false);
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
