// Moving and resizing bookings on the grid (with Ctrl, a booking's cards move together), the checks before a move, and new bookings from an empty slot.
import { onMounted, onUnmounted, computed } from "vue";
import { snapshotServices, describeServiceChanges } from "../../utils/appointmentChanges";
import { isStaffAvailable, describeWorkingDay, overtimeConfirmMessage, askOvertime } from "../../utils/staffAvailability";
import { fetchOrQueue } from "../../offline/queue";
import { knownOverlapIds } from "../../offline/overlaps";
import { isTempId } from "../../offline/tempIds";
import { askOverCapacity } from "../../utils/capacity";
import type { useSchedulerCore } from "./useSchedulerCore";
import type { useHoverCard } from "./useHoverCard";
import type { useSchedulerZoom } from "./useSchedulerZoom";

export type OvertimeEntry = { name: string; hours: string | null };
export const useCalendarMoves = (ctx: ReturnType<typeof useSchedulerCore> & ReturnType<typeof useHoverCard> & ReturnType<typeof useSchedulerZoom>) => {
  const {
    flags, authStore, toast, confirm, calendarStore, isStaffRole, dialogVisible, selectedAppointment,
    currentStart, currentEnd, t, locale, hideHoverCard, formatSlotIso,
  } = ctx;

  // Keeps one overtime line per staff member (and drops the empty ones).
  const oncePerStaff = (o: OvertimeEntry | null, i: number, all: (OvertimeEntry | null)[]): o is OvertimeEntry =>
    !!o && all.findIndex((x) => x?.name === o.name) === i;
  const confirmMove = (
    before: any[],
    after: any[],
    overtime: OvertimeEntry[] = [],
  ): Promise<boolean> => {
    const lines = describeServiceChanges(
      snapshotServices(before),
      snapshotServices(after),
      {
        services: calendarStore.services,
        staff: calendarStore.resources,
        t,
        locale: locale.value,
      },
    );
    if (lines.length === 0) return Promise.resolve(true);
    hideHoverCard();
    flags.moveConfirmOpen = true;
    return new Promise((resolve) => {
      const done = (v: boolean) => {
        flags.moveConfirmOpen = false;
        resolve(v);
      };
      const changes = `${t("booking.changeConfirm.intro")}\n\n${lines.map((l) => `• ${l}`).join("\n")}`;
      confirm.require({
        header: overtime.length
          ? t("booking.overtime.header")
          : t("booking.changeConfirm.header"),
        // With overtime, the overtime question replaces the generic one.
        message: overtime.length
          ? `${changes}\n\n${overtimeConfirmMessage(overtime, t)}`
          : `${changes}\n\n${t("booking.changeConfirm.question")}`,
        icon: overtime.length ? "pi pi-clock" : "pi pi-question-circle",
        acceptLabel: overtime.length
          ? t("booking.overtime.accept")
          : t("booking.changeConfirm.apply"),
        rejectLabel: t("booking.changeConfirm.cancel"),
        accept: () => done(true),
        reject: () => done(false),
        onHide: () => done(false),
      });
    });
  };

  const prepareServicesForUpdate = (services: any[]) =>
    services.map((s) => ({
      ...s,
      price_override:
        s.price_override !== undefined ? s.price_override : Number(s.price || 0),
      duration_override:
        s.duration_override !== undefined
          ? s.duration_override
          : s.duration_minutes,
    }));

  // Returns whether the update succeeded, so eventDrop/eventResize can revert
  // the optimistic drag on rejection (previously swallowed silently, leaving
  // the event visually stuck in the rejected spot — now common once staff
  // working-hours/time-off enforcement can reject a drag).
  // `refresh: false` leaves reloading the calendar to the caller (a group move
  // saves several appointments, then reloads once).
  const updateAppointment = async (
    id: string,
    updates: any,
    { refresh = true } = {},
  ): Promise<boolean> => {
    try {
      // Offline the move is queued and shown right away (see offline/queue.ts);
      // base_version lets the server refuse it if the appointment changed
      // meanwhile instead of overwriting that change.
      const body = {
        ...updates,
        ...(updates.version != null && !isTempId(String(id))
          ? { base_version: updates.version }
          : {}),
      };
      delete body.version;
      delete body._offline;
      const result = await fetchOrQueue(
        `/api/v1/appointments/${id}`,
        "PUT",
        body,
        {
          kind: "appointment",
          label:
            `${updates.first_name || ""} ${updates.last_name || ""}`.trim() ||
            t("booking.editDialog.title"),
          offlineExtras: {
            offline_known_overlaps: knownOverlapIds(
              calendarStore.events,
              updates.services || [],
              id,
            ),
          },
        },
      );
      if (result.queued) {
        toast.add({
          severity: "warn",
          summary: t("booking.toast.savedOffline"),
          detail: t("booking.toast.savedOfflineDetail"),
          life: 4000,
        });
        return true;
      }
      const res = result.response;
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        // A shared place (the sauna) would be over its places: ask, then send again.
        if (err.error === "over_capacity") {
          hideHoverCard();
          return (await askOverCapacity(confirm, t, err))
            ? updateAppointment(
                id,
                { ...updates, allow_over_capacity: true },
                { refresh },
              )
            : false;
        }
        if (
          err.error === "stale_appointment" ||
          err.error === "appointment_missing"
        ) {
          // Changed (or deleted) on another device meanwhile: show the current state.
          await calendarStore.fetchAppointments(
            currentStart.value,
            currentEnd.value,
          );
          throw new Error(t(`offline.conflict.${err.error}`));
        }
        throw new Error(err.error || t("scheduler.toasts.updateFailedError"));
      }
      if (refresh)
        await calendarStore.fetchAppointments(
          currentStart.value,
          currentEnd.value,
        );
      return true;
    } catch (e: any) {
      toast.add({
        severity: "error",
        summary: t("scheduler.toasts.updateFailed"),
        detail: e.message || t("scheduler.toasts.updateFailedDetail"),
        life: 3000,
      });
      return false;
    }
  };

  // Shared gate for selectAllow/eventAllow — rejects a drag-select or an
  // existing appointment's drag/resize if it would land during a staff
  // member's time-off or outside their configured working hours. This is a
  // UX convenience only (prevents the gesture from ever completing); the
  // server-side assertStaffAvailable guard is the actual authority.
  const staffAvailability = (staffId: any, start: Date, end: Date) =>
    isStaffAvailable({
      staffList: calendarStore.resources,
      workingHours: calendarStore.workingHours,
      timeOff: calendarStore.timeOff,
      staffId,
      start,
      end,
    });

  // Admin, super admin and frontdesk may book outside a staff member's working
  // hours (incl. a scheduled day off) as overtime, after a confirmation; leave
  // and breaks stay blocked for everyone.
  const canBookOvertime = computed(() => authStore.isShopAdmin);

  const isRangeAllowedForResource = (start: Date, end: Date, resource: any) => {
    if (!resource) return true;
    const result = staffAvailability(resource.id, start, end);
    return (
      result.available ||
      (result.reason === "outside_hours" && canBookOvertime.value)
    );
  };

  // The overtime entry for a staff member and time range, or null when the
  // range is within their working hours.
  const overtimeEntryFor = (
    staffId: any,
    start: Date,
    end: Date,
  ): OvertimeEntry | null => {
    if (!staffId) return null;
    if (staffAvailability(staffId, start, end).reason !== "outside_hours")
      return null;
    return {
      name:
        calendarStore.resources.find((r: any) => String(r.id) === String(staffId))
          ?.name || "",
      hours: describeWorkingDay(
        calendarStore.workingHours,
        calendarStore.resources,
        staffId,
        start,
      ),
    };
  };

  const confirmOvertimeSlot = (entry: OvertimeEntry) => askOvertime(confirm, t, [entry]);

  // A new booking for a staff member and time, as a click on the empty grid
  // starts one. Outside the staff member's hours: ask first; the booking
  // dialog then doesn't ask again for the same staff member.
  const openNewBooking = async (
    start: Date,
    end: Date,
    staffId: string | null,
    staffName: string,
  ) => {
    if (isStaffRole.value) return;
    const overtime = overtimeEntryFor(staffId, start, end);
    if (overtime && !(await confirmOvertimeSlot(overtime))) return;
    selectedAppointment.value = {
      start_time: formatSlotIso(start),
      end_time: formatSlotIso(end),
      staff_id: staffId,
      staff_name: staffName,
      overtime_confirmed_staff_id: overtime ? staffId : null,
    };
    dialogVisible.value = true;
  };


  // Dropping a card at a new time or staff member (Ctrl: all of its
  // appointment's cards), after confirming the change.
  const dropCard = async (info: any) => {
    const { appointmentId, serviceIndex, fullAppointment } =
      info.event.extendedProps;
    const newResourceId = info.newResource?.id;
    const start = info.event.start.getTime();
    const end = info.event.end.getTime();
    let services = prepareServicesForUpdate(
      JSON.parse(JSON.stringify(fullAppointment.services)),
    );
    // Ctrl (⌘ on a Mac) held when dropping: every card of this appointment
    // moves by the same time, and all to the column it was dropped in.
    const moveAll = isMoveTogether(info.jsEvent) && services.length > 1;
    if (moveAll) {
      const shift = start - info.oldEvent.start.getTime();
      services = services.map((s: any) => ({
        ...s,
        start_time: new Date(
          new Date(s.start_time).getTime() + shift,
        ).toISOString(),
        ...(newResourceId ? { staff_id: newResourceId } : {}),
      }));
    } else if (services[serviceIndex]) {
      services[serviceIndex].start_time = info.event.start.toISOString();
      services[serviceIndex].duration_minutes = (end - start) / 60000;
      services[serviceIndex].duration_override = (end - start) / 60000;
      if (newResourceId) services[serviceIndex].staff_id = newResourceId;
    }
    const overtime = (moveAll ? services : [services[serviceIndex]])
      .map((s: any) => {
        if (!s) return null;
        const from = new Date(s.start_time);
        const to = new Date(
          from.getTime() + (Number(s.duration_override) || 60) * 60000,
        );
        return overtimeEntryFor(s.staff_id, from, to);
      })
      .filter(oncePerStaff);
    if (!(await confirmMove(fullAppointment.services, services, overtime))) {
      info.revert();
      return;
    }
    const ok = await updateAppointment(appointmentId, {
      ...fullAppointment,
      services,
      allow_overtime: overtime.length > 0,
    });
    if (!ok) info.revert();
  };

  // Stretching or shortening a card, after confirming the change.
  const resizeCard = async (info: any) => {
    const { appointmentId, serviceIndex, fullAppointment } =
      info.event.extendedProps;
    const start = info.event.start.getTime();
    const end = info.event.end.getTime();
    const newDuration = (end - start) / 60000;
    let services = prepareServicesForUpdate(
      JSON.parse(JSON.stringify(fullAppointment.services)),
    );
    if (services[serviceIndex]) {
      services[serviceIndex].start_time = info.event.start.toISOString();
      services[serviceIndex].duration_minutes = newDuration;
      services[serviceIndex].duration_override = newDuration;
    }
    const overtime = overtimeEntryFor(
      services[serviceIndex]?.staff_id,
      info.event.start,
      info.event.end,
    );
    if (
      !(await confirmMove(
        fullAppointment.services,
        services,
        overtime ? [overtime] : [],
      ))
    ) {
      info.revert();
      return;
    }
    const ok = await updateAppointment(appointmentId, {
      ...fullAppointment,
      services,
      allow_overtime: !!overtime,
    });
    if (!ok) info.revert();
  };

  // --- Calendar Options ---
  // Ctrl (or ⌘) + drag moves all of an appointment's cards together. While
  // dragging with it held, the other cards of that appointment are outlined.
  // FullCalendar won't start a drag when Ctrl is held on pressing (it keeps
  // Ctrl-click for the Mac context menu), so a Ctrl + press on a card is
  // remembered here and handed on without Ctrl (see onCardMouseDown).
  let moveTogetherArmed = false;
  const isMoveTogether = (e: MouseEvent | undefined) =>
    moveTogetherArmed || !!(e?.ctrlKey || e?.metaKey);
  let moveTogetherId: string | null = null;
  const markMoveTogether = (on: boolean) => {
    if (!moveTogetherId) return;
    document
      .querySelectorAll(
        `.fc-event[data-appointment-id="${CSS.escape(moveTogetherId)}"]`,
      )
      .forEach((el) => el.classList.toggle("fc-move-together", on));
  };
  const onMoveTogetherKey = (e: KeyboardEvent) =>
    markMoveTogether(isMoveTogether(e as unknown as MouseEvent));
  const startMoveTogetherHint = (appointmentId: string | undefined) => {
    moveTogetherId = appointmentId ? String(appointmentId) : null;
    markMoveTogether(moveTogetherArmed);
    window.addEventListener("keydown", onMoveTogetherKey);
    window.addEventListener("keyup", onMoveTogetherKey);
  };
  const stopMoveTogetherHint = () => {
    markMoveTogether(false);
    moveTogetherId = null;
    // Cleared after eventDrop has read it (it runs right after this).
    setTimeout(() => (moveTogetherArmed = false));
    window.removeEventListener("keydown", onMoveTogetherKey);
    window.removeEventListener("keyup", onMoveTogetherKey);
  };
  // Ctrl + press on a card (before FullCalendar sees it): note it, and pass the
  // same press on without Ctrl so the drag starts.
  const onCardMouseDown = (e: MouseEvent) => {
    if (
      !e.ctrlKey ||
      e.button !== 0 ||
      !(e.target as HTMLElement)?.closest?.(".fc-event")
    )
      return;
    moveTogetherArmed = true;
    e.stopImmediatePropagation();
    e.preventDefault();
    e.target!.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 0,
        buttons: 1,
        clientX: e.clientX,
        clientY: e.clientY,
        screenX: e.screenX,
        screenY: e.screenY,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
        ctrlKey: false,
      }),
    );
  };
  // A Ctrl + press that didn't become a drag (just a click) mustn't count later.
  const disarmMoveTogether = () => {
    if (!flags.dragInProgress) setTimeout(() => (moveTogetherArmed = false), 0);
  };
  onMounted(() => {
    document.addEventListener("mousedown", onCardMouseDown, true);
    document.addEventListener("mouseup", disarmMoveTogether, true);
  });
  onUnmounted(() => {
    document.removeEventListener("mousedown", onCardMouseDown, true);
    document.removeEventListener("mouseup", disarmMoveTogether, true);
  });

  return { oncePerStaff, confirmMove, prepareServicesForUpdate, updateAppointment, staffAvailability, canBookOvertime, isRangeAllowedForResource, overtimeEntryFor, confirmOvertimeSlot, openNewBooking, dropCard, resizeCard, moveTogetherArmed, isMoveTogether, moveTogetherId, markMoveTogether, onMoveTogetherKey, startMoveTogetherHint, stopMoveTogetherHint, onCardMouseDown, disarmMoveTogether };
};
