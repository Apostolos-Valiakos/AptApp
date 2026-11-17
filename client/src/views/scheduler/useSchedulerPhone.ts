// Phones: the compact top bar, the week strip under it (swipe for the previous or next week) and narrow staff columns.
import { ref, computed } from "vue";
import { toLocalDateStr, mondayOf } from "../../utils/staffAvailability";
import type { useSchedulerCore } from "./useSchedulerCore";

export const useSchedulerPhone = (ctx: ReturnType<typeof useSchedulerCore>) => {
  const {
    isStaffRole, currentView, currentStart, todayDate, calendarApi, locale,
  } = ctx;

  // --- Phone layout: compact top bar, day strip, narrow staff columns ---
  const PHONE_MAX_WIDTH = 768;
  const isPhone = ref(window.innerWidth < PHONE_MAX_WIDTH);
  const mobileMenuOpen = ref(false);

  const viewDate = computed(() => {
    if (!currentStart.value) return new Date();
    const d = new Date(currentStart.value);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const sameDay = (a: Date, b: Date) => toLocalDateStr(a) === toLocalDateStr(b);
  const dateLocale = computed(() => (locale.value === "el" ? "el-GR" : "en-GB"));

  // Browsers give the Greek month in the genitive ("Οκτωβρίου") when formatted
  // alone; a heading needs the nominative.
  const GREEK_MONTHS = [
    "Ιανουάριος",
    "Φεβρουάριος",
    "Μάρτιος",
    "Απρίλιος",
    "Μάιος",
    "Ιούνιος",
    "Ιούλιος",
    "Αύγουστος",
    "Σεπτέμβριος",
    "Οκτώβριος",
    "Νοέμβριος",
    "Δεκέμβριος",
  ];
  const mobileMonthTitle = computed(() => {
    const d = viewDate.value;
    const month =
      locale.value === "el"
        ? GREEK_MONTHS[d.getMonth()]
        : d.toLocaleDateString("en-GB", { month: "long" });
    return d.getFullYear() === new Date().getFullYear()
      ? month
      : `${month} ${d.getFullYear()}`;
  });

  const weekStrip = computed(() => {
    const monday = mondayOf(viewDate.value);
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      return {
        date,
        key: toLocalDateStr(date),
        letter: date.toLocaleDateString(dateLocale.value, { weekday: "narrow" }),
        day: date.getDate(),
        weekend: date.getDay() === 0 || date.getDay() === 6,
        selected:
          currentView.value !== "dayGridMonth" && sameDay(date, viewDate.value),
        today: sameDay(date, new Date()),
        disabled: isStaffRole.value && date < todayDate.value,
      };
    });
  });

  const goToDay = (date: Date) => {
    const api = calendarApi.value;
    if (!api) return;
    const target =
      isStaffRole.value && date < todayDate.value ? todayDate.value : date;
    api.changeView("resourceTimeGridDay", target);
    currentView.value = "resourceTimeGridDay";
  };

  const shiftWeek = (weeks: number) => {
    const d = new Date(viewDate.value);
    d.setDate(d.getDate() + weeks * 7);
    goToDay(d);
  };

  let stripTouch: { x: number; y: number } | null = null;
  const onStripTouchStart = (e: TouchEvent) => {
    stripTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onStripTouchEnd = (e: TouchEvent) => {
    if (!stripTouch) return;
    const dx = e.changedTouches[0].clientX - stripTouch.x;
    const dy = e.changedTouches[0].clientY - stripTouch.y;
    stripTouch = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5)
      shiftWeek(dx < 0 ? 1 : -1);
  };

  return { PHONE_MAX_WIDTH, isPhone, mobileMenuOpen, viewDate, sameDay, dateLocale, GREEK_MONTHS, mobileMonthTitle, weekStrip, goToDay, shiftWeek, stripTouch, onStripTouchStart, onStripTouchEnd };
};
