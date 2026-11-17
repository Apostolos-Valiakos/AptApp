// FullCalendar's options: how cards are drawn, and what clicks, drags and hovers do.
import type { OutsideHours } from "../../utils/staffAvailability";
import { ref, onMounted, watch, nextTick } from "vue";
import resourceTimeGridPlugin from "@fullcalendar/resource-timegrid";
import scrollGridPlugin from "@fullcalendar/scrollgrid";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import timeGridPlugin from "@fullcalendar/timegrid";
import elLocale from "@fullcalendar/core/locales/el";
import { api as http } from "../../api/http";
import { hhmm } from "../../utils/capacity";
import type { useSchedulerCore } from "./useSchedulerCore";
import type { useSchedulerPhone } from "./useSchedulerPhone";
import type { useDockedCalendar } from "./useDockedCalendar";
import type { useCalendarData } from "./useCalendarData";
import type { useHoverCard } from "./useHoverCard";
import type { useSchedulerZoom } from "./useSchedulerZoom";
import type { useCalendarMoves } from "./useCalendarMoves";

export const useCalendarOptions = (ctx: ReturnType<typeof useSchedulerCore> & ReturnType<typeof useSchedulerPhone> & ReturnType<typeof useDockedCalendar> & ReturnType<typeof useCalendarData> & ReturnType<typeof useHoverCard> & ReturnType<typeof useSchedulerZoom> & ReturnType<typeof useCalendarMoves>) => {
  const {
    flags, authStore, calendarStore, isStaffRole, todayDateStr, dialogVisible, selectedAppointment, fullCalendar,
    currentTitle, currentView, currentStart, currentEnd, isFetching, shopSlotMinTime, shopSlotMaxTime, getDayMinWidth,
    fitStaff, calendarApi, t, locale, PHONE_MAX_WIDTH, isPhone, dockedDate, calendarResources,
    DID_NOT_HAPPEN, calendarEvents, timeOffBackgroundEvents, breakBlockEvents, workingHoursBackgroundEvents, hideHoverCard, highlightLinkedEvents, clearLinkedHighlight,
    dayServices, showHoverCard, SLOT_MINUTES, fitRowsToScreen, setSnapMinutes, roundRangeToSlots, isRangeAllowedForResource, openNewBooking,
    dropCard, resizeCard, startMoveTogetherHint, stopMoveTogetherHint,
  } = ctx;

  // A card booked outside working hours: the outside part is striped, and
  // where the schedule starts or ends inside it there's a line with the time
  // (the grey "not working" background is hidden under the card itself).
  const overtimeMarksHtml = (overtime: OutsideHours | null | undefined, start: Date | null, end: Date | null) => {
    if (!overtime || !start || !end) return "";
    const from = start.getTime();
    const span = end.getTime() - from;
    if (span <= 0) return "";
    const percent = (ms: number) => ((ms / span) * 100).toFixed(2);
    const stripes = overtime.parts
      .map((p) => `<div class="fc-overtime-part" style="top:${percent(p.from - from)}%;height:${percent(p.to - p.from)}%"></div>`)
      .join("");
    const lines = overtime.boundaries
      .map((t) => `<div class="fc-hours-line" style="top:${percent(t - from)}%"><span>${hhmm(t)}</span></div>`)
      .join("");
    return stripes + lines;
  };

  // eventContent/resourceLabelContent below build raw HTML strings from
  // client/staff/service names, which are user-editable text, not code — always
  // escape before interpolating into either HTML content or an attribute value.
  const escapeHtml = (value: unknown): string =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
          c
        ] as string,
    );

  const calendarOptions = ref({
    schedulerLicenseKey: "CC-Attribution-NonCommercial-NoDerivatives",
    longPressDelay: 350,
    eventLongPressDelay: 350,
    selectLongPressDelay: 350,
    eventResizableFromStart: true,
    locale: elLocale,
    plugins: [
      resourceTimeGridPlugin,
      scrollGridPlugin,
      dayGridPlugin,
      interactionPlugin,
      timeGridPlugin,
    ],
    titleFormat: {
      weekday: "long",
      year: "numeric",
      month: "short",
      day: "numeric",
    } as const,
    resourceOrder: "sort_order",
    initialView: "resourceTimeGridDay",
    validRange: isStaffRole.value ? { start: todayDateStr() } : undefined,
    allDaySlot: false,
    // Compact 24h time on appointment boxes (e.g. "14:00 - 15:30" instead of
    // "10:00 π.μ. - 11:00 π.μ.") — roughly half the characters, same info
    // within a single day view where AM/PM is redundant.
    eventTimeFormat: {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    } as const,
    // Fixed: zoom changes row height, not this (see utils/schedulerZoom.ts).
    slotDuration: "00:15:00",
    // Clicks and selections on the empty grid snap to the 15-minute rows;
    // hovering an appointment switches this to 5 minutes so dragging and
    // resizing move in 5-minute steps (see setSnapMinutes).
    snapDuration: "00:15:00",
    slotLabelInterval: "01:00",
    slotMinTime: "07:00:00",
    slotMaxTime: "23:00:00",
    // Big bold hour number + small "00", Fresha/Treatwell-style. The half-hour
    // row shares the hour row's bold divider (see slotLaneClassNames below);
    // only the quarter marks (:15/:45) get the lighter one — no label on any
    // of these, just a visual break.
    slotLabelContent: (arg: any) => ({
      html: `
        <div class="flex items-baseline justify-end gap-0.5 pr-1 leading-none">
          <span class="text-lg md:text-xl font-extrabold text-gray-700">${arg.date.getHours()}</span>
          <span class="text-[9px] md:text-[10px] font-semibold text-gray-400">00</span>
        </div>
      `,
    }),
    slotLaneClassNames: (arg: any) => {
      const mins = arg.date?.getMinutes();
      // Half-hour gets the same 2px weight as the hour line but a lighter
      // shade (fc-slot-half-hour-bold), so the two stay visually distinct
      // while both clearly outrank the quarter marks' 1px divider.
      if (mins === 0) return ["fc-slot-hour"];
      if (mins === 30) return ["fc-slot-half-hour-bold"];
      if (mins === 15 || mins === 45) return ["fc-slot-half-hour"];
      return [];
    },
    height: "100%",
    // Rows keep the zoom height exactly (see utils/schedulerZoom.ts). Stretching them
    // to fill the screen would not stretch the separate time-axis column, so
    // the hour numbers would drift off their lines when zoomed out.
    expandRows: false,
    dayMinWidth:
      localStorage.getItem("fitStaff") === "true" ? 0 : getDayMinWidth(),
    stickyHeaderDates: true,
    nowIndicator: true,
    weekends: true,
    headerToolbar: false as const,
    // Plain staff only look at the calendar (the server refuses their changes too).
    editable: !isStaffRole.value,
    selectable: !isStaffRole.value,
    selectMirror: true,
    selectAllow: (info: any) =>
      isRangeAllowedForResource(info.start, info.end, info.resource),
    eventAllow: (dropInfo: any, draggedEvent: any) => {
      const own = draggedEvent?.getResources?.()[0];
      return isRangeAllowedForResource(
        dropInfo.start,
        dropInfo.end,
        dropInfo.resource || own,
      );
    },
    resources: [],
    events: [],

    datesSet: async (arg: any) => {
      fitRowsToScreen();
      currentTitle.value = arg.view.title;
      dockedDate.value = arg.view.calendar.getDate();
      currentView.value = arg.view.type;
      currentStart.value = arg.startStr;
      currentEnd.value = arg.endStr;
      if (calendarStore.fetchAppointments) {
        isFetching.value = true;
        try {
          await calendarStore.fetchAppointments(arg.startStr, arg.endStr);
        } finally {
          isFetching.value = false;
        }
      }
    },

    windowResize: () => {
      isPhone.value = window.innerWidth < PHONE_MAX_WIDTH;
      // A turned phone has new room; the on-screen keyboard changes only the
      // height, and mustn't resize the rows behind it.
      if (window.innerWidth !== flags.lastFitWidth) {
        flags.lastFitWidth = window.innerWidth;
        fitRowsToScreen();
      }
      if (fullCalendar.value) {
        fullCalendar.value
          .getApi()
          .setOption("dayMinWidth", fitStaff.value ? 0 : getDayMinWidth());
      }
    },

    // Phone: the current time as a small pill on the time axis.
    nowIndicatorContent: (arg: any) => {
      if (!arg.isAxis || !isPhone.value) return "";
      const d = arg.date as Date;
      return { html: `<span class="fc-now-pill">${hhmm(d)}</span>` };
    },

    resourceLabelContent: (arg: any) => {
      const title = escapeHtml(arg.resource.title);
      const notWorking = !!arg.resource.extendedProps.notWorking;
      // Phones: the name in a pill (two lines at most), not just an initial,
      // which two staff can share. Grey on a day off.
      if (isPhone.value) {
        return {
          html: `
          <div class="flex items-center justify-center py-1 px-0.5 w-full" title="${title}">
            <span class="block max-w-full px-1 py-1 rounded-lg text-[11px] font-bold leading-tight text-center break-words line-clamp-2 ${notWorking ? "bg-gray-100 text-gray-400" : "bg-[var(--p-primary-50)] text-[var(--p-primary-700)]"}">${title}</span>
          </div>
        `,
        };
      }
      return {
        html: `
          <div class="flex flex-col items-center justify-center py-1 w-full h-full ${notWorking ? "opacity-60" : ""}">
            <div style="white-space:normal;word-break:break-word;" class="font-bold ${notWorking ? "text-gray-400" : "text-gray-800"} text-[10px] md:text-[11px] leading-tight text-center px-0.5">
              ${title}
            </div>
            ${notWorking ? `<div class="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">${escapeHtml(t("staff.workingHours.dayOff"))}</div>` : ""}
          </div>
        `,
      };
    },

    eventContent: (arg: any) => {
      const props = arg.event.extendedProps;

      if (props.isTimeOff) {
        return {
          html: `
          <div class="relative w-full h-full p-1.5 flex flex-col leading-tight overflow-hidden">
            <div class="text-[10px] md:text-[12px] font-bold text-gray-600 whitespace-normal">${escapeHtml(props.typeLabel)}</div>
            <div class="text-[10px] md:text-[11px] text-gray-500 whitespace-normal">${escapeHtml(props.durationLabel)}</div>
            ${props.reason ? `<div class="text-[10px] md:text-[11px] text-gray-400 italic whitespace-normal">${escapeHtml(props.reason)}</div>` : ""}
          </div>
        `,
        };
      }

      // Off-hours shading (working-hours gaps) is a plain textured background
      // with no label — just the diagonal-stripe CSS class, nothing to render.
      if (props.isOffHours) {
        return { html: "" };
      }

      // A "break" time-off block — clickable like a real appointment (see
      // eventClick/isTimeOffBlock), but with no client/service to show.
      if (props.isTimeOffBlock) {
        return {
          html: `
          <div class="relative w-full h-full p-1.5 flex flex-col leading-tight overflow-hidden">
            <div class="text-[10px] md:text-[12px] font-bold text-gray-700 flex items-center gap-1"><i class="pi pi-ban text-[9px]"></i> ${escapeHtml(arg.event.title)}</div>
            ${props.reason ? `<div class="text-[10px] md:text-[11px] text-gray-500 italic whitespace-normal">${escapeHtml(props.reason)}</div>` : ""}
          </div>
        `,
        };
      }

      const timeText = arg.timeText;
      const status = props.fullAppointment?.status;

      const isCancelled = DID_NOT_HAPPEN.includes(status);
      const isCashPaid = !!props.paidInCash;
      const isConfirmed = status === "confirmed";
      const isMonthView = arg.view.type === "dayGridMonth";
      const start = arg.event.start;
      const end = arg.event.end;
      const durationMins =
        end && start ? (end.getTime() - start.getTime()) / 60000 : 60;
      const overtimeMarks = isMonthView ? "" : overtimeMarksHtml(props.overtime, start, end);
      // Only genuinely tight (<20 min) boxes drop to the compact, single-line
      // "name — service" layout — everything 20 min and up keeps the full
      // two-line name/service layout.
      const isShort = durationMins <= 20;

      const paddingClass =
        isShort && !isMonthView
          ? "p-1 pl-1.5"
          : isMonthView
            ? "p-2"
            : // Tighter than the old flat p-2 — with 3 lines now allowed to wrap
              // (time/name/service), every px of padding is px the text doesn't
              // get, and this tier (20+ min, day/week view) is exactly the one
              // tightest on room relative to what it now needs to fit.
              "px-2 py-1";
      // The name reads first because it's bold + near-black against the muted
      // service line, which stays close to it in size; the time is much smaller.
      const titleClass =
        isShort && !isMonthView
          ? "text-[10px] md:text-[11px] leading-tight"
          : "text-[11px] md:text-[12px] leading-tight";

      const timeSizeClass = "text-[8px] md:text-[9px]";

      const textClass = isCancelled
        ? "line-through opacity-60 text-gray-500"
        : isCashPaid
          ? "line-through text-orange-700"
          : "text-gray-900";
      const serviceClass = isCancelled
        ? "opacity-40 text-gray-500"
        : isCashPaid
          ? "opacity-70 text-orange-600"
          : "text-gray-600";
      const timeClass = isCancelled
        ? "text-red-400"
        : isCashPaid
          ? "text-orange-500"
          : "text-gray-500";

      const statusBadge = isConfirmed
        ? `<span class="absolute top-1 right-1 text-violet-700"><i class="pi pi-check text-[9px]"></i></span>`
        : "";

      const archivedBadge = props.serviceArchived
        ? `<span class="absolute top-1 right-6 text-gray-500" title="${escapeHtml(t("services.archivedTooltip"))}"><i class="pi pi-box text-[9px]"></i></span>`
        : "";

      // While dragging or resizing, FullCalendar renders a "mirror" copy at the
      // new position; label it with the exact new time, since a 5-minute step
      // is only a few pixels when zoomed out.
      if (arg.isMirror && !isMonthView && start && end) {
        return {
          html: `<div class="fc-drag-time-pill">${hhmm(start)} – ${hhmm(end)}</div>`,
        };
      }

      // A phone's card is as narrow as it gets: surname first over up to two
      // lines, then the service. Its place on the grid already says the time.
      if (isPhone.value && !isMonthView) {
        return {
          html: `
          <div lang="el" class="relative w-full h-full px-1 py-0.5 flex flex-col leading-tight overflow-hidden uppercase">
            ${overtimeMarks}
            <div class="flex-shrink-0 text-[9px] font-bold break-words ${durationMins > 15 ? "line-clamp-2" : "line-clamp-1"} ${textClass}">${escapeHtml(props.inPlace ? props.client_surname : props.client_name)}</div>
            ${durationMins > 15 ? `<div class="min-h-0 text-[8px] break-words ${serviceClass}">${escapeHtml(props.service_name)}</div>` : ""}
          </div>
        `,
        };
      }

      return {
        html: `
        <div lang="el" class="relative w-full ${paddingClass} flex flex-col leading-tight overflow-hidden uppercase hover:brightness-95 transition-all ${isMonthView ? "" : "h-full"}">
          ${overtimeMarks}
          ${statusBadge}
          ${archivedBadge}
          ${!isShort && !isMonthView ? `<div class="flex-shrink-0 ${timeSizeClass} font-semibold mb-0.5 truncate ${timeClass}">${timeText}</div>` : ""}
          ${
            isShort && !isMonthView
              ? `<div class="font-bold ${titleClass} pr-2 truncate ${textClass}" title="${escapeHtml(props.client_name)} — ${escapeHtml(props.service_name)}"><span class="${timeSizeClass} font-semibold ${timeClass}">${timeText.split(" - ")[0]}</span> ${escapeHtml(props.client_surname)}<span class="font-normal ${serviceClass}"> — ${escapeHtml(props.service_name)}</span></div>`
              : isMonthView
                ? `<div class="font-bold ${titleClass} pr-4 truncate ${textClass}" title="${escapeHtml(props.client_name)}">${escapeHtml(props.client_name)}</div>
          <div class="text-[10px] md:text-[12px] font-medium mt-0.5 truncate ${serviceClass}" title="${escapeHtml(props.service_name)}">${escapeHtml(props.service_name)}</div>`
                : // Enough vertical room at 20+ min for the full name and service
                  // to just wrap onto another line rather than truncate — nothing
                  // gets cut off mid-word (whitespace-normal only, no break-words),
                  // matching the earlier "keep words intact" preference.
                  `<div class="font-bold ${titleClass} pr-4 whitespace-normal ${textClass}" title="${escapeHtml(props.client_name)}">${
                    // A shared place's narrow cards: the surname (see .fc-place-card).
                    props.inPlace
                      ? `<span class="fc-name-full">${escapeHtml(props.client_name)}</span><span class="fc-name-short">${escapeHtml(props.client_surname)}</span>`
                      : escapeHtml(props.client_name)
                  }</div>
          <div class="text-[10px] md:text-[12px] font-medium mt-0.5 whitespace-normal ${serviceClass}" title="${escapeHtml(props.service_name)}">${escapeHtml(props.service_name)}</div>`
          }
        </div>
      `,
      };
    },

    // Hover card — triggered from anywhere on the box (FullCalendar fires this
    // for the whole event element, not a sub-element), skipping time-off/
    // off-hours background events (only real service events carry isServiceEvent).
    eventDidMount: (info: any) => {
      const key = info.event.extendedProps?.linkKey;
      if (key) info.el.dataset.linkKey = key;
      const dayKey = info.event.extendedProps?.dayClientKey;
      if (dayKey) info.el.dataset.dayClientKey = dayKey;
      const apptId = info.event.extendedProps?.appointmentId;
      if (apptId) info.el.dataset.appointmentId = apptId; // used by the browser tests
    },

    eventDragStart: (info: any) => {
      flags.dragInProgress = true;
      hideHoverCard();
      startMoveTogetherHint(info.event.extendedProps?.appointmentId);
    },
    eventDragStop: (info: any) => {
      flags.dragInProgress = false;
      hideHoverCard();
      stopMoveTogetherHint();
      setTimeout(() => setSnapMinutes(SLOT_MINUTES));
    },
    eventResizeStart: () => {
      flags.dragInProgress = true;
      hideHoverCard();
    },
    eventResizeStop: () => {
      flags.dragInProgress = false;
      hideHoverCard();
      setTimeout(() => setSnapMinutes(SLOT_MINUTES));
    },

    eventMouseEnter: (info: any) => {
      if (info.event.display !== "background") setSnapMinutes(5);
      if (!info.event.extendedProps?.isServiceEvent) return;
      if (flags.dragInProgress || flags.moveConfirmOpen) return;
      highlightLinkedEvents(info.event.extendedProps, info.el);
      showHoverCard(info.el, {
        ...info.event.extendedProps.fullAppointment,
        client_name: info.event.extendedProps.client_name,
        service_name: info.event.extendedProps.service_name,
        ...info.event.extendedProps.shownMoney,
        start: info.event.start,
        end: info.event.end,
        day_services: dayServices(info.event.extendedProps),
        overtime: info.event.extendedProps.overtime,
      });
    },

    eventMouseLeave: () => {
      setSnapMinutes(SLOT_MINUTES);
      clearLinkedHighlight();
      hideHoverCard();
    },

    eventClick: (info: any) => {
      const fullAppt = info.event.extendedProps.fullAppointment;
      if (fullAppt) {
        selectedAppointment.value = fullAppt;
        dialogVisible.value = true;
        return;
      }
      if (info.event.extendedProps.isTimeOffBlock) {
        const p = info.event.extendedProps;
        selectedAppointment.value = {
          time_off_id: p.timeOffId,
          staff_id: p.staffId,
          start_time: info.event.start,
          end_time: info.event.end,
          reason: p.reason,
        };
        dialogVisible.value = true;
      }
    },

    eventDrop: async (info: any) => {
      if (isStaffRole.value) return info.revert();
      return dropCard(info);
    },

    eventResize: async (info: any) => {
      if (isStaffRole.value) return info.revert();
      return resizeCard(info);
    },

    select: async (info: any) => {
      // Clear the selection right away; FullCalendar ignores a click that
      // repeats the current selection, so re-clicking a slot after closing the
      // dialog would otherwise do nothing.
      info.view.calendar.unselect();
      const { start, end } = roundRangeToSlots(info.start, info.end);
      await openNewBooking(
        start,
        end,
        info.resource ? info.resource.id : null,
        info.resource ? info.resource.title : "",
      );
    },
  });

  watch(
    [
      calendarResources,
      calendarEvents,
      timeOffBackgroundEvents,
      breakBlockEvents,
      workingHoursBackgroundEvents,
    ],
    ([
      newResources,
      newEvents,
      newTimeOffEvents,
      newBreakBlockEvents,
      newWorkingHoursEvents,
    ]) => {
      if (!fullCalendar.value) return;
      const api = fullCalendar.value.getApi();
      api.setOption("resources", newResources);
      api.setOption("events", [
        ...newEvents,
        ...newTimeOffEvents,
        ...newBreakBlockEvents,
        ...newWorkingHoursEvents,
      ]);
    },
    { deep: true },
  );

  onMounted(async () => {
    await calendarStore.fetchBaseResources();
    nextTick(async () => {
      if (fullCalendar.value) {
        currentTitle.value = fullCalendar.value.getApi().view.title;
      }
      if (authStore.token) {
        try {
          const shop = await http.get("/api/v1/shop").catch(() => null);
          if (shop) {
            if (shop.slot_min_time)
              shopSlotMinTime.value = shop.slot_min_time + ":00";
            if (shop.slot_max_time)
              shopSlotMaxTime.value = shop.slot_max_time + ":00";
            const api = calendarApi.value;
            if (api) {
              if (shop.slot_min_time)
                api.setOption("slotMinTime", shopSlotMinTime.value);
              if (shop.slot_max_time)
                api.setOption("slotMaxTime", shopSlotMaxTime.value);
              if (typeof shop.show_weekends === "boolean")
                api.setOption("weekends", shop.show_weekends);
            }
            fitRowsToScreen();
          }
        } catch {}
      }
    });
  });

  return { overtimeMarksHtml, escapeHtml, calendarOptions };
};
