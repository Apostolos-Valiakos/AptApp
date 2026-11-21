import { onBeforeUnmount, onMounted, ref } from "vue";

/** The time now, moved on every `everyMs` while the screen is open (countdowns). */
export const useNow = (everyMs = 30_000) => {
  const now = ref(new Date());
  let timer: ReturnType<typeof setInterval> | undefined;
  onMounted(() => (timer = setInterval(() => (now.value = new Date()), everyMs)));
  onBeforeUnmount(() => clearInterval(timer));
  return now;
};
