// What the grid shows: the staff columns (who is off that day), the bookings as cards, time off, breaks and working hours.
import { ref, computed } from "vue";
import { resolveServiceColor } from "../../utils/serviceColors";
import { fullyHidden, hiddenAmount, paidInCash } from "../../utils/paymentFilters";
import { toLocalDateStr, getWorkingRangesForDate, outsideWorkingHours, leaveOnDay } from "../../utils/staffAvailability";
import { displayServiceName } from "../../utils/serviceVariations";
import { comboLineLabel } from "../../utils/comboSplit";
import { personsOf, placesOf } from "../../utils/capacity";
import type { useSchedulerCore } from "./useSchedulerCore";
import type { useSchedulerPhone } from "./useSchedulerPhone";

export const useCalendarData = (ctx: ReturnType<typeof useSchedulerCore> & ReturnType<typeof useSchedulerPhone>) => {
  const {
    authStore, calendarStore, settings, todayDateStr, currentView, currentStart, currentEnd, shopSlotMinTime, shopSlotMaxTime,
    statusFilter, t,
  } = ctx;

  // Still used by the unrelated staff-role navigation restriction below
  // (canGoPrev/validRange) — not by the working-hours display logic anymore,
  // now that schedule versions carry their own effective_from and can be
  // resolved correctly for any date, past included.
  const isPastDay = (dateStr: string) => dateStr.slice(0, 10) < todayDateStr();

  // --- Computed data ---
  const isNotWorkingOnDay = (r: any) => {
    if (!r.working_hours_enabled || !currentStart.value) return false;
    const ranges = getWorkingRangesForDate(
      calendarStore.workingHours,
      r.id,
      currentStart.value,
    );
    return ranges !== null && ranges.length === 0;
  };

  // Staff with a live (not cancelled / no-show) appointment on the displayed
  // day, so a day-off staff member still gets a greyed column when they're
  // needed to see that booking.
  const staffWithAppointmentsOnDay = computed(() => {
    const ids = new Set<string>();
    if (!currentStart.value) return ids;
    const dateStr = toLocalDateStr(currentStart.value);
    for (const appt of calendarStore.events || []) {
      if (appt.status === "cancelled" || appt.status === "no-show") continue;
      for (const svc of appt.services || []) {
        if (svc.staff_id && toLocalDateStr(svc.start_time) === dateStr) {
          ids.add(String(svc.staff_id));
        }
      }
    }
    return ids;
  });

  const isOnLeaveOnDay = (r: any) =>
    !!currentStart.value && !!leaveOnDay(calendarStore.timeOff, r.id, currentStart.value);

  // The week view's days (its end is the day after the last one).
  const shownDays = computed(() => {
    const days: string[] = [];
    if (!currentStart.value || !currentEnd.value) return days;
    const last = toLocalDateStr(currentEnd.value);
    const d = new Date(`${toLocalDateStr(currentStart.value)}T12:00:00`);
    while (toLocalDateStr(d) < last && days.length < 31) {
      days.push(toLocalDateStr(d));
      d.setDate(d.getDate() + 1);
    }
    return days;
  });
  // Staff with a live booking on any shown day (the store holds the shown range).
  const staffWithAppointmentsShown = computed(() => {
    const ids = new Set<string>();
    for (const appt of calendarStore.events || []) {
      if (appt.status === "cancelled" || appt.status === "no-show") continue;
      for (const svc of appt.services || []) if (svc.staff_id) ids.add(String(svc.staff_id));
    }
    return ids;
  });
  const isOnLeaveAllWeek = (r: any) =>
    shownDays.value.length > 0 && shownDays.value.every((day) => !!leaveOnDay(calendarStore.timeOff, r.id, day));

  const SHOW_ALL_STAFF_KEY = "scheduler.showAllStaff";
  const readShowAllStaff = () => {
    try {
      return localStorage.getItem(SHOW_ALL_STAFF_KEY) === "1";
    } catch {
      return false;
    }
  };
  const showAllStaff = ref(readShowAllStaff());
  const setShowAllStaff = (show: boolean) => {
    showAllStaff.value = show;
    try {
      localStorage.setItem(SHOW_ALL_STAFF_KEY, show ? "1" : "0");
    } catch {}
  };

  const calendarResources = computed(() => {
    const res = calendarStore.resources;
    if (!Array.isArray(res)) return [];

    let filtered = res.filter((r: any) => r.is_active);
    if (settings.resourceFilter === "me" && authStore.user?.staff_id) {
      filtered = filtered.filter((r: any) => r.id === authStore.user.staff_id);
    }

    // The day view leaves out staff who don't work the shown day (by the
    // schedule in force on it; staff without working hours always show) and
    // staff on leave that day. The week view shows one set of columns for
    // the whole week, so it can't drop someone for a single day: it hides
    // those on leave every day of the shown week. Anyone with a booking in
    // the shown days stays, so the booking isn't hidden with them; the "show
    // everyone" switch brings everyone back (to book someone who is off). If
    // that would leave no one at all, everyone stays.
    if (currentStart.value && !showAllStaff.value) {
      let working = filtered;
      if (currentView.value === "resourceTimeGridDay") {
        working = filtered.filter(
          (r: any) => !(isNotWorkingOnDay(r) || isOnLeaveOnDay(r)) || staffWithAppointmentsOnDay.value.has(String(r.id)),
        );
      } else if (currentView.value === "resourceTimeGridWeek") {
        working = filtered.filter((r: any) => !isOnLeaveAllWeek(r) || staffWithAppointmentsShown.value.has(String(r.id)));
      }
      if (working.length > 0) filtered = working;
    }

    return filtered.map((r: any) => ({
      id: r.id.toString(),
      title: r.name,
      eventBackgroundColor: "#f3f4f6",
      notWorking:
        currentView.value === "resourceTimeGridDay" && isNotWorkingOnDay(r),
    }));
  });

  const placesById = computed(
    () =>
      new Map(
        calendarStore.resources.map((r: any) => [String(r.id), placesOf(r)]),
      ),
  );

  // Bookings that didn't happen: crossed out, with a red line on the left. The
  // database says "no-show"; "no_show" is older spelling.
  const DID_NOT_HAPPEN = ["cancelled", "no-show", "no_show"];

  // A shared place's (ΣΑΟΥΝΑ, ΧΑΜΜΑΜ) bookings are ordinary cards at their own
  // times, like any staff member's. Marked so narrow ones show the surname.
  const markPlaceCards = (events: any[]) =>
    events.map((e) =>
      (placesById.value.get(String(e.resourceId)) || 1) > 1
        ? {
            ...e,
            classNames: [...(e.classNames || []), "fc-place-card"],
            extendedProps: { ...e.extendedProps, inPlace: true },
          }
        : e,
    );

  const calendarEvents = computed(() => {
    const appointments = calendarStore.events;
    if (!Array.isArray(appointments)) return [];

    const events: any[] = [];
    appointments.forEach((appt) => {
      if (!appt.services || appt.services.length === 0) return;

      // Apply status filter
      const status = appt.status || "new";
      if (
        statusFilter.value === "active" &&
        (status === "cancelled" || status === "no_show")
      )
        return;
      if (
        statusFilter.value === "cancelled" &&
        status !== "cancelled" &&
        status !== "no_show"
      )
        return;
      // The cash and card filters hide the services paid that way, or part of
      // one; the booking's other services stay. Its money shown leaves that out.
      const hiddenCost = appt.services.reduce((sum: number, x: any) => sum + hiddenAmount(x.hidden, settings), 0);
      // What the hover card and the sauna dialog show; the booking dialog still
      // gets the whole booking.
      const shownMoney = {
        current_appt_total: Number(appt.current_appt_total || 0) - hiddenCost,
        deposit_amount: Math.max(0, Number(appt.deposit_amount || 0) - hiddenCost),
      };

      appt.services.forEach((svc: any, index: number) => {
        if (fullyHidden(svc.charged, svc.hidden, settings)) return;
        const isCompleted = appt.status === "completed";
        // Completed but not all paid (a refund not paid again, or a debt): the
        // whole booking's money decides, whatever the cash/card filters hide.
        const completedUnpaid =
          isCompleted && Number(appt.deposit_amount || 0) < Number(appt.current_appt_total || 0) - 0.01;
        const bgColor = resolveServiceColor(svc.service_color, svc.category_color);
        const duration = svc.duration_minutes || 60;
        const endTime = svc.start_time
          ? new Date(
              new Date(svc.start_time).getTime() + duration * 60000,
            ).toISOString()
          : null;
        // Which variation this row was is persisted server-side
        // (appointment_services.variation_name → svc.variation_name here),
        // independent of price/duration, so it survives later edits to either
        // (e.g. extending the duration) — see utils/serviceVariations.ts.
        // svc.variation_name is only absent for appointments saved before that
        // column existed, for which this falls back once to reverse-matching
        // price/duration against the service's current variation list (same
        // legacy-only limitation as BookingDialog's EDIT MODE load). Category
        // color stays keyed on the plain base name above; only the DISPLAYED
        // name (box title + the service line under the client name) gets the
        // "Service — Variation" treatment.
        const catalogService = calendarStore.services.find(
          (s: any) => s.id === svc.service_id,
        );
        const displayedServiceName = comboLineLabel(
          (svc.variation_name && svc.service_name
            ? `${svc.service_name} — ${svc.variation_name}`
            : null) ||
          displayServiceName(catalogService, svc.price, svc.duration_minutes) ||
          svc.service_name ||
          "Service",
          svc.combo_name,
        );

        const persons = personsOf(svc);
        const serviceLabel =
          persons > 1
            ? `${displayedServiceName} ×${persons}`
            : displayedServiceName;

        events.push({
          id: `${appt.id}_${index}`,
          resourceId: svc.staff_id?.toString(),
          title: `${appt.first_name} - ${serviceLabel}`,
          start: svc.start_time,
          end: endTime,
          backgroundColor: bgColor,
          borderColor: "transparent",
          textColor: "#1f2937",
          // Changes waiting to sync (offline) are outlined: dashed while pending,
          // red when the server refused them (see the sync banner).
          classNames: [
            "fresha-event",
            ...(isCompleted ? ["fc-completed"] : []),
            ...(completedUnpaid ? ["fc-completed-unpaid"] : []),
            ...(DID_NOT_HAPPEN.includes(appt.status) ? ["fc-did-not-happen"] : []),
            ...(appt._offline === "conflict"
              ? ["fc-offline-conflict"]
              : appt._offline
                ? ["fc-offline-pending"]
                : []),
          ],
          extendedProps: {
            isServiceEvent: true,
            offlineState: appt._offline || null,
            appointmentId: appt.id,
            group_id: appt.group_id,
            serviceIndex: index,
            paidInCash: paidInCash(svc.paid_with),
            shownMoney,
            fullAppointment: {
              ...appt,
              group_id: appt.group_id,
              products: appt.products || [],
            },
            client_name:
              `${appt.last_name || ""} ${appt.first_name || "Unknown"}`.trim(),
            // Just the surname, for the compact combined-line layout on very
            // short appointments — leaves more room for the service name
            // before truncating than the full "Surname Firstname" would.
            client_surname: appt.last_name || appt.first_name || "Unknown",
            // What of it is outside the staff member's working hours (overtime).
            overtime:
              svc.start_time && endTime && !DID_NOT_HAPPEN.includes(appt.status)
                ? outsideWorkingHours(calendarStore.workingHours, calendarStore.resources, svc.staff_id, new Date(svc.start_time), new Date(endTime))
                : null,
            service_name: serviceLabel,
            persons,
            serviceArchived: !!svc.service_archived,
            // Same client + same service + same start time = one booking split
            // across several staff members (shown as separate boxes, one per
            // staff column); hovering any of them highlights the others.
            linkKey: `${appt.client_id || `${appt.last_name}|${appt.first_name}`}|${svc.service_id || svc.service_name}|${svc.start_time}`,
            // Same client, same calendar day, ANY staff/service/time — a
            // broader, separate grouping from linkKey above (e.g. two
            // different appointments with different staff later the same
            // day). Only active appointments group this way (not cancelled/
            // no-show — note the hyphenated "no-show", the DB's actual
            // stored value); no walk-in-name fallback like linkKey has, since
            // grouping two different same-named walk-ins would be a false
            // positive — simply absent when there's no real client_id.
            dayClientKey:
              appt.client_id &&
              !/walk[- ]?in/i.test(`${appt.first_name || ""} ${appt.last_name || ""}`) &&
              appt.status !== "cancelled" &&
              appt.status !== "no-show"
                ? `${appt.client_id}|${toLocalDateStr(svc.start_time)}`
                : undefined,
          },
        });
      });
    });

    // Auto-recolor overlapping appointments within the same staff/resource
    // column — e.g. two bookings sharing a resource like ΣΑΟΥΝΑ/ΧΑΜΜΑΜ often
    // land on the exact same category color (most categories share the default),
    // making the narrow side-by-side slivers FullCalendar
    // renders for them look like one solid block rather than two distinct
    // appointments. The earliest-starting event in any overlapping group keeps
    // its normal service color; each event that overlaps an already-placed one
    // gets bumped to the next accent color not already in use among the
    // events it's actually overlapping (a sweep over each resource's events
    // sorted by start time, tracking which are still "active").
    const OVERLAP_ACCENT_COLORS = [
      "#fde68a", // amber-200
      "#fbcfe8", // pink-200
      "#bfdbfe", // blue-200
      "#c7d2fe", // indigo-200
      "#bbf7d0", // green-200
      "#fecaca", // red-200
    ];
    const shown = markPlaceCards(events);
    const eventsByResource: Record<string, any[]> = {};
    shown.forEach((e) => {
      if (!e.resourceId || !e.start || !e.end) return;
      (eventsByResource[e.resourceId] ||= []).push(e);
    });
    Object.values(eventsByResource).forEach((group) => {
      group.sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
      );
      const active: any[] = [];
      group.forEach((e) => {
        const startMs = new Date(e.start).getTime();
        for (let i = active.length - 1; i >= 0; i--) {
          if (new Date(active[i].end).getTime() <= startMs) active.splice(i, 1);
        }
        if (active.length > 0) {
          const usedColors = new Set(active.map((a) => a.backgroundColor));
          const accent =
            OVERLAP_ACCENT_COLORS.find((c) => !usedColors.has(c)) ||
            OVERLAP_ACCENT_COLORS[active.length % OVERLAP_ACCENT_COLORS.length];
          e.backgroundColor = accent;
        }
        active.push(e);
      });
    });

    return shown;
  });

  // Multi-day leave only — still a non-interactive background tint, since a
  // leave period isn't a single clickable slot the way a break block is.
  const timeOffBackgroundEvents = computed(() => {
    const entries = calendarStore.timeOff;
    if (!Array.isArray(entries)) return [];

    return entries
      .filter((entry: any) => entry.type === "leave")
      .map((entry: any) => {
        const startDateStr = toLocalDateStr(entry.start_date);
        const endDateExclusive = (dateStr: any) => {
          const d = new Date(`${toLocalDateStr(dateStr)}T00:00:00`);
          d.setDate(d.getDate() + 1);
          return toLocalDateStr(d);
        };
        const endDateStr = toLocalDateStr(entry.end_date);
        const days =
          Math.round(
            (new Date(`${endDateStr}T00:00:00`).getTime() -
              new Date(`${startDateStr}T00:00:00`).getTime()) /
              86400000,
          ) + 1;
        const durationLabel =
          days === 1
            ? t("scheduler.timeOff.oneDay")
            : t("scheduler.timeOff.days", { count: days });

        return {
          id: `timeoff_${entry.id}`,
          resourceId: entry.staff_id?.toString(),
          display: "background",
          backgroundColor: "rgba(239, 68, 68, 0.15)",
          start: startDateStr,
          end: endDateExclusive(entry.end_date),
          title: `${t("scheduler.timeOff.leave")} (${durationLabel})`,
          extendedProps: {
            isTimeOff: true,
            timeOffType: "leave",
            reason: entry.reason,
            durationLabel,
            typeLabel: t("scheduler.timeOff.leave"),
          },
        };
      });
  });

  // Single-day "break" entries (both the Staff page's own time-off dialog and
  // the scheduler's "Αποκλεισμός Ωραρίου" button save through this same type)
  // render as a normal, clickable, gray foreground event — not a background
  // tint — so staff can click one to unblock it or change its duration the
  // same way they'd edit any appointment. See eventClick below.
  const breakBlockEvents = computed(() => {
    const entries = calendarStore.timeOff;
    if (!Array.isArray(entries)) return [];

    return entries
      .filter((entry: any) => entry.type === "break")
      .map((entry: any) => {
        const startDateStr = toLocalDateStr(entry.start_date);
        const [sh, sm] = (entry.start_time || "0:0").split(":").map(Number);
        const [eh, em] = (entry.end_time || "0:0").split(":").map(Number);
        const minutes = eh * 60 + em - (sh * 60 + sm);

        return {
          id: `timeoff_${entry.id}`,
          resourceId: entry.staff_id?.toString(),
          title: t("scheduler.timeOff.block", { minutes }),
          start: `${startDateStr}T${entry.start_time}`,
          end: `${startDateStr}T${entry.end_time}`,
          backgroundColor: "#9ca3af",
          borderColor: "transparent",
          textColor: "#1f2937",
          // Edited only via the dialog (click → toggle/duration → Save), never
          // by dragging/resizing on the grid — eventDrop/eventResize below
          // assume a real appointment's fullAppointment/serviceIndex shape and
          // would fail for a time-off block.
          editable: false,
          startEditable: false,
          durationEditable: false,
          classNames: ["fresha-event", "fc-timeoff-block"],
          extendedProps: {
            isTimeOffBlock: true,
            timeOffId: entry.id,
            staffId: entry.staff_id,
            reason: entry.reason,
          },
        };
      });
  });

  // Day view only, mirrors timeOffBackgroundEvents — shades the complement of
  // a staff member's working ranges (including the split-shift gap) within the
  // shop's visible slot window, using whichever schedule version was/is
  // actually active on the displayed date. Staff who haven't opted into
  // working hours — or for whom no version can be resolved as of this date —
  // get no shading at all, exactly as they get no resource-hiding above.
  const workingHoursBackgroundEvents = computed(() => {
    if (currentView.value !== "resourceTimeGridDay" || !currentStart.value)
      return [];

    const dateStr = toLocalDateStr(currentStart.value);
    const dayStart = shopSlotMinTime.value;
    const dayEnd = shopSlotMaxTime.value;
    const events: any[] = [];

    for (const staffMember of calendarStore.resources) {
      if (!staffMember.working_hours_enabled) continue;
      const ranges = getWorkingRangesForDate(
        calendarStore.workingHours,
        staffMember.id,
        currentStart.value,
      );
      if (ranges === null) continue; // no version resolvable for this date — no shading

      let cursor = dayStart;
      const gaps: [string, string][] = [];
      for (const r of ranges) {
        if (r.start > cursor) gaps.push([cursor, r.start]);
        if (r.end > cursor) cursor = r.end;
      }
      if (dayEnd > cursor) gaps.push([cursor, dayEnd]);

      gaps.forEach(([s, e], idx) => {
        events.push({
          id: `offhours_${staffMember.id}_${idx}`,
          resourceId: staffMember.id.toString(),
          display: "background",
          classNames: ["fc-off-hours-bg"],
          start: `${dateStr}T${s}`,
          end: `${dateStr}T${e}`,
          extendedProps: { isOffHours: true },
        });
      });
    }
    return events;
  });

  return { isPastDay, isNotWorkingOnDay, staffWithAppointmentsOnDay, isOnLeaveOnDay, SHOW_ALL_STAFF_KEY, readShowAllStaff, showAllStaff, setShowAllStaff, calendarResources, placesById, DID_NOT_HAPPEN, markPlaceCards, calendarEvents, timeOffBackgroundEvents, breakBlockEvents, workingHoursBackgroundEvents };
};
