// The card shown on hovering a booking, and the highlight of the cards that belong together.
import { ref } from "vue";
import type { useSchedulerCore } from "./useSchedulerCore";
import type { useSchedulerPhone } from "./useSchedulerPhone";
import type { useCalendarData } from "./useCalendarData";

export const useHoverCard = (ctx: ReturnType<typeof useSchedulerCore> & ReturnType<typeof useSchedulerPhone> & ReturnType<typeof useCalendarData>) => {
  const {
    flags, calendarStore, isPhone, calendarEvents,
  } = ctx;

  // Uses the ConfirmDialog mounted inside BookingDialog. Resolves true on accept.
  const hideHoverCard = () => {
    if (hoverShowTimer) clearTimeout(hoverShowTimer);
    hoveredAppointment.value = null;
    hoverAnchorRect.value = null;
    clearLinkedHighlight();
  };

  // --- Appointment hover card ---
  const hoveredAppointment = ref<any>(null);
  // The hover card must never show while dragging/resizing or while the
  // "confirm changes" dialog is open (it would sit on top of the dialog).
  const hoverAnchorRect = ref<{
    top: number;
    left: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  } | null>(null);
  let hoverShowTimer: ReturnType<typeof setTimeout> | null = null;

  // Two independent hover-grouping keys, each toggling its own CSS class:
  // linkKey (same client+service+exact start time, split across staff — a
  // subtle darken) and dayClientKey (same client, same calendar day, any
  // staff/service/time — a themed colored highlight). Dictionary-driven since
  // both comparisons are structurally identical; an event can match both
  // simultaneously with no conflict (two classes on one element).
  const HOVER_LINK_CONFIGS = [
    { attr: "linkKey", dataAttr: "linkKey", cssClass: "fc-linked-hover" },
    {
      attr: "dayClientKey",
      dataAttr: "dayClientKey",
      cssClass: "fc-day-client-hover",
    },
  ] as const;

  const highlightLinkedEvents = (
    extendedProps: Record<string, any> | undefined,
    hoveredEl: HTMLElement,
  ) => {
    if (!extendedProps) return;
    for (const { attr, cssClass } of HOVER_LINK_CONFIGS) {
      const key = extendedProps[attr];
      if (!key) continue;
      document
        .querySelectorAll<HTMLElement>(
          `[data-${attr === "linkKey" ? "link-key" : "day-client-key"}]`,
        )
        .forEach((el) => {
          if (el !== hoveredEl && (el.dataset as any)[attr] === key) {
            el.classList.add(cssClass);
          }
        });
    }
  };
  const clearLinkedHighlight = () => {
    for (const { cssClass } of HOVER_LINK_CONFIGS) {
      document
        .querySelectorAll(`.${cssClass}`)
        .forEach((el) => el.classList.remove(cssClass));
    }
  };

  // Everything this client has that day, for the hover card, from what the
  // calendar shows (so it respects the filters and the cash/card hiding), grouped
  // cards included. Nothing to list for a booking with no day key.
  const dayServices = (hovered: Record<string, any>) => {
    if (!hovered.dayClientKey) return [];
    const staffName = (id: any) =>
      calendarStore.resources.find((r: any) => String(r.id) === String(id))?.name || "";
    const row = (props: Record<string, any>, start: any, resourceId: any) => ({
      id: `${props.appointmentId}_${props.serviceIndex}`,
      start: new Date(start),
      service: props.service_name,
      staff: staffName(resourceId),
      current: props.appointmentId === hovered.appointmentId && props.serviceIndex === hovered.serviceIndex,
      key: props.dayClientKey,
    });
    return calendarEvents.value
      .flatMap((e: any) =>
        e.extendedProps?.isServiceEvent ? [row(e.extendedProps, e.start, e.resourceId)] : [],
      )
      .filter((s: any) => s.key === hovered.dayClientKey)
      .sort((a: any, b: any) => a.start.getTime() - b.start.getTime());
  };


  // Hover card for a booking, shown next to `anchor` after a short pause. Not on
  // phones and touch screens: a tap counts as a hover too, so the card would open
  // together with the booking dialog.
  const showHoverCard = (anchor: HTMLElement, appointment: any) => {
    if (isPhone.value || window.matchMedia("(hover: none)").matches) return;
    if (hoverShowTimer) clearTimeout(hoverShowTimer);
    hoverShowTimer = setTimeout(() => {
      if (flags.dragInProgress || flags.moveConfirmOpen) return;
      const rect = anchor.getBoundingClientRect();
      hoverAnchorRect.value = {
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
      hoveredAppointment.value = appointment;
    }, 250);
  };

  return { hideHoverCard, hoveredAppointment, hoverAnchorRect, hoverShowTimer, HOVER_LINK_CONFIGS, highlightLinkedEvents, clearLinkedHighlight, dayServices, showHoverCard };
};
