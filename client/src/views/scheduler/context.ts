// How the calendar page's components (SchedulerToolbar, SchedulerDayStrip,
// SchedulerDockedCalendar) reach its parts: SchedulerView provides them all.
import { inject, type InjectionKey } from "vue";
import type { useSchedulerCore } from "./useSchedulerCore";
import type { useSchedulerPhone } from "./useSchedulerPhone";
import type { useDockedCalendar } from "./useDockedCalendar";
import type { useCalendarData } from "./useCalendarData";
import type { useHoverCard } from "./useHoverCard";
import type { useSchedulerZoom } from "./useSchedulerZoom";
import type { useCalendarMoves } from "./useCalendarMoves";
import type { useLiveReload } from "./useLiveReload";
import type { useCalendarOptions } from "./useCalendarOptions";

export type SchedulerContext = ReturnType<typeof useSchedulerCore> &
  ReturnType<typeof useSchedulerPhone> &
  ReturnType<typeof useDockedCalendar> &
  ReturnType<typeof useCalendarData> &
  ReturnType<typeof useHoverCard> &
  ReturnType<typeof useSchedulerZoom> &
  ReturnType<typeof useCalendarMoves> &
  ReturnType<typeof useLiveReload> &
  ReturnType<typeof useCalendarOptions>;

export const SchedulerKey: InjectionKey<SchedulerContext> = Symbol("scheduler");

/** The calendar page's parts, for its components. */
export const useScheduler = () => {
  const ctx = inject(SchedulerKey);
  if (!ctx) throw new Error("useScheduler() outside the calendar page");
  return ctx;
};
