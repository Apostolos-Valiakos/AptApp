import { onBeforeUnmount, onMounted, ref } from "vue";

/** True while the window is at least `px` wide, kept up to date on resize and rotation. */
export const useMinWidth = (px: number) => {
  const wide = ref(typeof window !== "undefined" && window.innerWidth >= px);
  const update = () => (wide.value = window.innerWidth >= px);
  onMounted(() => window.addEventListener("resize", update));
  onBeforeUnmount(() => window.removeEventListener("resize", update));
  return wide;
};

/** The portal's desktop layout (rail and side panel) from this width. */
export const PORTAL_DESKTOP_WIDTH = 1024;
