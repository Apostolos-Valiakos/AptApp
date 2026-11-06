import { onBeforeUnmount, onMounted, ref } from "vue";

// True below Tailwind's md breakpoint (768px), kept up to date on resize and
// rotation. For layout that CSS classes can't switch by themselves, such as
// a paginator's template.
export const PHONE_MAX_WIDTH = 768;

export function useIsPhone() {
  const isPhone = ref(typeof window !== "undefined" && window.innerWidth < PHONE_MAX_WIDTH);
  const update = () => (isPhone.value = window.innerWidth < PHONE_MAX_WIDTH);
  onMounted(() => window.addEventListener("resize", update));
  onBeforeUnmount(() => window.removeEventListener("resize", update));
  return isPhone;
}

// A paginator that fits a phone: ‹ page x of y ›, no page numbers or
// rows-per-page dropdown.
export const PHONE_PAGINATOR_TEMPLATE = "PrevPageLink CurrentPageReport NextPageLink";
