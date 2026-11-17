// Zooming the grid's rows, the 5-minute snap while dragging, and switching day, week and month.
import { ref, watch, computed, nextTick } from "vue";
import { DEFAULT_ROW_HEIGHT, fitRowHeight, readSavedRowHeight, saveRowHeight, zoomedIn, zoomedOut } from "../../utils/schedulerZoom";
import type { useSchedulerCore } from "./useSchedulerCore";
import type { useSchedulerPhone } from "./useSchedulerPhone";
import type { useDockedCalendar } from "./useDockedCalendar";

export const useSchedulerZoom = (ctx: ReturnType<typeof useSchedulerCore> & ReturnType<typeof useSchedulerPhone> & ReturnType<typeof useDockedCalendar>) => {
  const {
    flags, currentTitle, currentView, shopSlotMinTime, shopSlotMaxTime, calendarApi, isPhone, mobileMenuOpen,
    showDatePicker,
  } = ctx;

  // --- Zoom ---
  // The grid always has 15-minute rows (4 lines per hour, see calendarOptions'
  // slotDuration); zooming only changes how tall a row is, via the
  // --slot-row-height CSS variable on the calendar. Clicks therefore land on
  // quarter hours at every zoom, while drag and resize snap to 5 minutes.
  const SLOT_MINUTES = 15;
  // What the user picked on this device; until then a phone fits the shop's
  // hours on its screen, and anything bigger starts at the default.
  const chosenRowHeight = ref(readSavedRowHeight());
  const fittedRowHeight = ref<number | null>(null);
  const slotRowHeight = computed(
    () => chosenRowHeight.value ?? fittedRowHeight.value ?? DEFAULT_ROW_HEIGHT,
  );

  const chooseRowHeight = (height: number) => {
    chosenRowHeight.value = height;
    saveRowHeight(height);
  };
  const zoomIn = () => chooseRowHeight(zoomedIn(slotRowHeight.value));
  const zoomOut = () => chooseRowHeight(zoomedOut(slotRowHeight.value));
  // Only the time grids have rows: a month view leaves the last fit as it is.
  const fitRowsToScreen = async () => {
    if (chosenRowHeight.value !== null) return;
    if (!isPhone.value) {
      fittedRowHeight.value = null;
      return;
    }
    await nextTick();
    const root: HTMLElement | undefined = calendarApi.value?.el;
    const rows = root?.querySelector<HTMLElement>(
      ".fc-timegrid .fc-scrollgrid-section-body .fc-scroller",
    );
    if (!rows) return;
    fittedRowHeight.value = fitRowHeight(
      rows.clientHeight,
      shopSlotMinTime.value,
      shopSlotMaxTime.value,
    );
  };
  // FullCalendar measures row heights to place events, so re-measure once the
  // new height is in the DOM.
  // FullCalendar only re-measures rows when its options change; updateSize()
  // keeps the old positions, leaving events and clicks off by the zoom change.
  // Re-setting the same 15 minutes in the other of two equivalent forms counts
  // as a change and makes it re-measure.
  let slotDurationToggle = false;
  watch(slotRowHeight, async () => {
    await nextTick();
    slotDurationToggle = !slotDurationToggle;
    calendarApi.value?.setOption(
      "slotDuration",
      slotDurationToggle ? { minutes: SLOT_MINUTES } : "00:15:00",
    );
  });

  // FullCalendar has one snap setting for everything: 15 minutes suits clicks
  // on the empty grid, 5 minutes suits moving an appointment. Every drag or
  // resize starts on an appointment, so switch to 5 while the pointer is over
  // one, and back to 15 when it leaves; never mid-drag.
  let snapMinutes = SLOT_MINUTES;
  const setSnapMinutes = (mins: number) => {
    if (flags.dragInProgress || mins === snapMinutes) return;
    snapMinutes = mins;
    calendarApi.value?.setOption("snapDuration", { minutes: mins });
  };

  // Safety net for select: a click on an empty slot should start at the row
  // the user sees, e.g. 10:15 for any click in the 10:15 row. Rows are counted
  // from slotMinTime, matching the grid.
  const roundRangeToSlots = (start: Date, end: Date) => {
    const slot = SLOT_MINUTES;
    const [h, m] = shopSlotMinTime.value.split(":").map(Number);
    const gridStart = (h || 0) * 60 + (m || 0);
    const minutesOf = (d: Date) => d.getHours() * 60 + d.getMinutes() - gridStart;
    const at = (d: Date, mins: number) => {
      const r = new Date(d);
      r.setHours(0, gridStart + mins, 0, 0);
      return r;
    };
    const s = at(start, Math.floor(minutesOf(start) / slot) * slot);
    const endMins =
      minutesOf(end) + (end.getDate() !== start.getDate() ? 24 * 60 : 0);
    const e = at(
      start,
      Math.max(Math.ceil(endMins / slot) * slot, minutesOf(s) + slot),
    );
    return { start: s, end: e };
  };
  const formatSlotIso = (d: Date) =>
    calendarApi.value?.formatIso(d) ?? d.toISOString();

  const changeView = (viewName: string) => {
    const api = calendarApi.value;
    if (api) {
      api.changeView(viewName);
      currentView.value = viewName;
      currentTitle.value = api.view.title;
    }
  };

  const closeMenus = () => {
    showDatePicker.value = false;
    mobileMenuOpen.value = false;
  };

  return { SLOT_MINUTES, chosenRowHeight, fittedRowHeight, slotRowHeight, chooseRowHeight, zoomIn, zoomOut, fitRowsToScreen, slotDurationToggle, snapMinutes, setSnapMinutes, roundRangeToSlots, formatSlotIso, changeView, closeMenus };
};
