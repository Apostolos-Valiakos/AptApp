// The date popup and the month calendar pinned beside the grid (its width can be dragged, and is remembered).
import { ref, onMounted, onUnmounted, nextTick } from "vue";
import type { useSchedulerCore } from "./useSchedulerCore";

export const useDockedCalendar = (ctx: ReturnType<typeof useSchedulerCore>) => {
  const {
    currentView, calendarApi, 
  } = ctx;

  const showDatePicker = ref(false);
  const pickerDate = ref<Date | null>(null);
  // The date calendar can be pinned next to the schedule instead of opening as
  // a popup; each device remembers the choice.
  const DOCKED_KEY = "scheduler.calendarDocked";
  const readDocked = () => {
    try {
      return localStorage.getItem(DOCKED_KEY) === "1";
    } catch {
      return false;
    }
  };
  const calendarDocked = ref(readDocked());
  // Its width comes from dragging the line beside it; each device remembers that too.
  const DOCKED_WIDTH_KEY = "scheduler.calendarDockedWidth";
  const DOCKED_DEFAULT_WIDTH = 272;
  const DOCKED_MIN_WIDTH = 200;
  const DOCKED_MAX_WIDTH = 560;
  const clampDockedWidth = (width: number) => {
    // At least half the window stays for the schedule (on a phone, the default width).
    const roomy = Math.max(
      DOCKED_DEFAULT_WIDTH,
      Math.floor(window.innerWidth / 2),
    );
    return Math.round(
      Math.max(DOCKED_MIN_WIDTH, Math.min(DOCKED_MAX_WIDTH, roomy, width)),
    );
  };
  const readDockedWidth = () => {
    try {
      const saved = Number(localStorage.getItem(DOCKED_WIDTH_KEY));
      return clampDockedWidth(saved || DOCKED_DEFAULT_WIDTH);
    } catch {
      return DOCKED_DEFAULT_WIDTH;
    }
  };
  const dockedWidth = ref(readDockedWidth());
  const resizingDock = ref(false);
  /** The docked calendar's selection: follows the day the schedule shows. */
  const dockedDate = ref<Date | null>(new Date());

  // --- Date picker popover ---
  const dockCalendar = async (docked: boolean) => {
    calendarDocked.value = docked;
    showDatePicker.value = false;
    try {
      localStorage.setItem(DOCKED_KEY, docked ? "1" : "0");
    } catch {}
    // The schedule's width changed: FullCalendar has to re-measure.
    await nextTick();
    calendarApi.value?.updateSize();
  };

  // The schedule beside it re-measures at most once a frame while dragging.
  let dockResizeFrame = 0;
  const setDockedWidth = (width: number, save = false) => {
    dockedWidth.value = clampDockedWidth(width);
    if (!dockResizeFrame) {
      dockResizeFrame = requestAnimationFrame(async () => {
        dockResizeFrame = 0;
        await nextTick();
        calendarApi.value?.updateSize();
      });
    }
    if (save) {
      try {
        localStorage.setItem(DOCKED_WIDTH_KEY, String(dockedWidth.value));
      } catch {}
    }
  };
  let dockDragStartX = 0;
  let dockDragStartWidth = 0;
  const startDockResize = (e: PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dockDragStartX = e.clientX;
    dockDragStartWidth = dockedWidth.value;
    resizingDock.value = true;
  };
  const moveDockResize = (e: PointerEvent) => {
    if (resizingDock.value)
      setDockedWidth(dockDragStartWidth + e.clientX - dockDragStartX);
  };
  const endDockResize = () => {
    if (!resizingDock.value) return;
    resizingDock.value = false;
    setDockedWidth(dockedWidth.value, true);
  };

  // A narrower window can leave too little room for the width chosen earlier.
  const fitDockedWidth = () => {
    if (
      calendarDocked.value &&
      dockedWidth.value !== clampDockedWidth(dockedWidth.value)
    ) {
      setDockedWidth(dockedWidth.value);
    }
  };
  onMounted(() => window.addEventListener("resize", fitDockedWidth));
  onUnmounted(() => window.removeEventListener("resize", fitDockedWidth));

  const toggleDatePicker = () => {
    if (calendarDocked.value) return; // already on screen
    if (!showDatePicker.value)
      pickerDate.value = calendarApi.value?.getDate() ?? new Date();
    showDatePicker.value = !showDatePicker.value;
  };

  const onDatePicked = (date: Date) => {
    const api = calendarApi.value;
    if (api) {
      // Don't read api.view.title synchronously here — when the date range
      // actually changes, FullCalendar hasn't recomputed it yet. Let the
      // existing datesSet callback update the title once it actually renders.
      api.changeView("resourceTimeGridDay", date);
      currentView.value = "resourceTimeGridDay";
    }
    showDatePicker.value = false;
  };

  return { showDatePicker, pickerDate, DOCKED_KEY, readDocked, calendarDocked, DOCKED_WIDTH_KEY, DOCKED_DEFAULT_WIDTH, DOCKED_MIN_WIDTH, DOCKED_MAX_WIDTH, clampDockedWidth, readDockedWidth, dockedWidth, resizingDock, dockedDate, dockCalendar, dockResizeFrame, setDockedWidth, dockDragStartX, dockDragStartWidth, startDockResize, moveDockResize, endDockResize, fitDockedWidth, toggleDatePicker, onDatePicked };
};
