// Saving: the change confirmation, what's checked before anything is sent
// (client, services, staff and their hours), what is sent, the server's
// refusals, saving offline, and time blocks (saved as staff time off).
import { api, ApiError } from "../../../api/http";
import { fetchOrQueue } from "../../../offline/queue";
import { knownOverlapIds } from "../../../offline/overlaps";
import { isTempId } from "../../../offline/tempIds";
import { useCalendarStore } from "../../../stores/calendar";
import { askOverCapacity, personsOf, placesOf } from "../../../utils/capacity";
import { clockTime, formatMoney } from "../../../utils/format";
import { discountPayload } from "../../../utils/discount";
import { askOvertime, describeWorkingDay, isStaffAvailable, toLocalDateStr } from "../../../utils/staffAvailability";
import { describeServiceChanges, snapshotServices } from "../../../utils/appointmentChanges";
import type { BookingState } from "./useBookingState";
import type { Later } from "./context";

export const useBookingSave = (state: BookingState, later: Later) => {
  const {
    props, emit, dialogVisible, confirm, toast, notify, t, locale,
    authStore, form, servicesList, productsList, isRecurring, recurrenceForm, isReadOnly, missingStaffService,
    originalServices, originalSnapshot, originalDiscountAmount, currentVersion, savedStatus, selectedClient, discount, loading,
    formatDate, freedSlots, discountAmount, currentApptTotal,
  } = state;

  const calendarStoreForOverlaps = useCalendarStore();

  // Package visits attach to a saved appointment: save pending edits first.
  const ensureSavedForPackage = async (): Promise<string | null> => {
    if (!(await save(false))) return null;
    return form.value.id || null;
  };

  const confirmChanges = (): Promise<boolean> => {
    if (!form.value.id || form.value.is_block) return Promise.resolve(true);
    const lines = describeServiceChanges(
      originalServices.value,
      snapshotServices(servicesList.value),
      {
        services: props.services || [],
        staff: props.staff || [],
        t,
        locale: locale.value,
      },
    );
    if (discountAmount.value !== originalDiscountAmount.value) {
      lines.push(
        `${t("discount.line")}: ${formatMoney(originalDiscountAmount.value)} → ${formatMoney(discountAmount.value)}`,
      );
    }
    if (lines.length === 0) return Promise.resolve(true);
    return new Promise((resolve) => {
      confirm.require({
        header: t("booking.changeConfirm.header"),
        message: `${t("booking.changeConfirm.intro")}\n\n${lines
          .map((l) => `• ${l}`)
          .join("\n")}\n\n${t("booking.changeConfirm.question")}`,
        icon: "pi pi-question-circle",
        acceptLabel: t("booking.changeConfirm.apply"),
        rejectLabel: t("booking.changeConfirm.cancel"),
        accept: () => resolve(true),
        reject: () => resolve(false),
        onHide: () => resolve(false),
      });
    });
  };

  const confirmOvertime = (entries: { name: string; hours: string | null }[]) => askOvertime(confirm, t, entries);

  // A "block time" dialog has no client or real service — it just needs one
  // staff member + a time span, which already live on servicesList's single
  // row (see missingStaffService above). Saves through the exact same
  // staff_time_off mechanism as the Staff page's own time-off dialog (type
  // "break", same conflict/force pattern), rather than creating a blocked
  // `appointments` row.
  const saveAsTimeOff = async (force = false): Promise<boolean> => {
    const svc = servicesList.value[0];
    const staffId = svc?.staff_id;
    if (!staffId || !svc?.start_time) return false;

    const start = new Date(svc.start_time);
    const end = new Date(start.getTime() + (svc.duration_override || 60) * 60000);
    const toDateStr = toLocalDateStr;
    const toTimeStr = clockTime;

    try {
      // Overlapping bookings: 409 with the list, asked about before forcing.
      const conflict = await api
        .post(`/api/v1/staff/${staffId}/time-off`, {
          type: "break",
          start_date: toDateStr(start),
          end_date: toDateStr(start),
          start_time: toTimeStr(start),
          end_time: toTimeStr(end),
          reason: form.value.internal_notes || null,
          force,
        })
        .then(() => null)
        .catch((e) => {
          if (e instanceof ApiError && e.status === 409) return e.data || {};
          throw e;
        });

      if (conflict) {
        const data = conflict;
        const list = (data.conflicts || [])
          .map(
            (c: any) =>
              `• ${c.client_name || "—"} — ${c.service_name || ""} (${formatDate(c.start_time)})`,
          )
          .join("\n");
        return new Promise((resolve) => {
          confirm.require({
            message: t("staff.timeOff.conflictMessage", {
              count: (data.conflicts || []).length,
              list,
            }),
            header: t("staff.timeOff.conflictHeader"),
            icon: "pi pi-exclamation-triangle",
            acceptClass: "p-button-warning",
            accept: async () => resolve(await saveAsTimeOff(true)),
            reject: () => resolve(false),
            onHide: () => resolve(false),
          });
        });
      }

      // Editing an existing block: the replacement above is already safely
      // created (and conflict-checked only against real appointments, never
      // against this old row), so it's now safe to remove the original —
      // using its original staff id, which may differ if the block was moved
      // to another staff member in this edit.
      if (form.value.time_off_id && form.value.time_off_staff_id) {
        await api.del(`/api/v1/staff/${form.value.time_off_staff_id}/time-off/${form.value.time_off_id}`).catch(() => {});
      }

      notify.success(t("staff.timeOff.saved"));
      emit("save");
      dialogVisible.value = false;
      return true;
    } catch (err) {
      notify.error(t("staff.timeOff.saveFailed"));
      return false;
    }
  };

  // Toggling the block button off while editing an existing block ("unclick")
  // just removes the staff_time_off row — the time becomes available again,
  // with no appointment created in its place.
  const unblockTimeOff = async (): Promise<boolean> => {
    if (!form.value.time_off_id || !form.value.time_off_staff_id) return false;
    try {
      await api.del(`/api/v1/staff/${form.value.time_off_staff_id}/time-off/${form.value.time_off_id}`);
      notify.success(t("staff.timeOff.deleted"));
      emit("save");
      dialogVisible.value = false;
      return true;
    } catch (err) {
      notify.error(t("staff.timeOff.saveFailed"));
      return false;
    }
  };

  // Resolves false only when the user declined the change confirmation.
  const save = async (close = true): Promise<boolean> => {
    if (isReadOnly.value) return false;
    if (!(await confirmChanges())) return false;

    // Check if editing an existing recurring appointment
    const isSeriesEdit = form.value.id && props.appointment?.group_id;
    const isConvertingToSeries =
      form.value.id && !props.appointment?.group_id && isRecurring.value;

    if (isSeriesEdit) {
      return new Promise((resolve) => {
        confirm.require({
          message: t("booking.editDialog.message"),
          header: t("booking.editDialog.header"),
          icon: "pi pi-question-circle",
          rejectLabel: t("booking.editDialog.thisOnly"),
          acceptLabel: t("booking.editDialog.thisAndFuture"),
          accept: async () => {
            resolve(await executeSave(close, "series"));
          },
          reject: async () => {
            resolve(await executeSave(close, "single"));
          },
        });
      });
    }
    return executeSave(close, isConvertingToSeries ? "series" : "single");
  };

  // Opened after the current question has closed (see offerCancelInstead).
  const askSaveThisOnly = (close: boolean) =>
    new Promise<boolean>((resolve) => {
      setTimeout(() => {
        confirm.require({
          header: t("booking.seriesHasPayments.header"),
          message: t("booking.seriesHasPayments.message"),
          icon: "pi pi-exclamation-triangle",
          acceptLabel: t("booking.editDialog.thisOnly"),
          rejectLabel: t("common.cancel"),
          rejectClass: "p-button-outlined p-button-secondary",
          accept: () => resolve(executeSave(close, "single")),
          reject: () => resolve(false),
          onHide: () => resolve(false),
        });
      }, 0);
    });

  // What's missing before a booking can be saved (a translation key), or null.
  // Time off has no client or services to check.
  const bookingFormProblem = (isTimeOffFlow: boolean): string | null => {
    if (!form.value.client_id && !isTimeOffFlow) return "booking.validation.selectClient";
    if (servicesList.value.length === 0) return "booking.validation.addService";
    if (missingStaffService.value) return "booking.validation.staffRequired";
    return null;
  };
  // Hard pre-save check — the staff dropdown in BookingServices already
  // filters out unavailable staff, but that's only a filter on the options
  // list; it isn't re-validated if the time changes after a staff member was
  // picked, or if the field was pre-filled by dragging a calendar slot. The
  // server is the actual authority (see assertStaffAvailable), this is just
  // fast feedback before making a network call.
  // Outside working hours (incl. a scheduled day off) is allowed as overtime
  // for admin, super admin and frontdesk after a confirmation; leave and
  // breaks always block. A click on the calendar may already have confirmed
  // it for that staff member (appointment.overtime_confirmed_staff_id).
  // Answers whether to send it as overtime, or null when it can't be saved.
  const checkStaffTimes = async (): Promise<boolean | null> => {
    if (!form.value.is_block) {
      const overtime: { staffId: any; name: string; hours: string | null }[] = [];
      for (const svc of servicesList.value) {
        if (!svc.staff_id || !svc.start_time) continue;
        const start = new Date(svc.start_time);
        const end = new Date(
          start.getTime() + (svc.duration_override || 60) * 60000,
        );
        const availability = isStaffAvailable({
          staffList: props.staff || [],
          workingHours: props.workingHours || [],
          timeOff: props.timeOff || [],
          staffId: svc.staff_id,
          start,
          end,
        });
        if (availability.available) continue;
        if (availability.reason === "outside_hours" && authStore.isShopAdmin) {
          overtime.push({
            staffId: svc.staff_id,
            name: (props.staff || []).find((s: any) => String(s.id) === String(svc.staff_id))?.name || "",
            hours: describeWorkingDay(props.workingHours || [], props.staff || [], svc.staff_id, start),
          });
          continue;
        }
        notify.error(t("booking.validation.staffUnavailable"));
        return null;
      }
      if (overtime.length > 0) {
        const preConfirmed = props.appointment?.overtime_confirmed_staff_id;
        const needsConfirm = overtime.some((o) => String(o.staffId) !== String(preConfirmed));
        if (needsConfirm && !(await confirmOvertime(overtime))) return null;
        return true;
      }
    }
    return false;
  };

  // What a save sends: the form, its services as the server takes them, the
  // repeat rule, the discount, and the version it was loaded at.
  const bookingPayload = (method: string, allowOvertime: boolean, allowOverCapacity: boolean) => ({
    ...form.value,
    allow_overtime: allowOvertime,
    recurrence: isRecurring.value
      ? {
          freq: recurrenceForm.value.freq,
          end_date: recurrenceForm.value.end_date,
        }
      : null,
    services: servicesList.value.map((s) => ({
      ...s,
      price_override: Number(s.price_override) || Number(s.price) || 0,
      // Persons only mean something in a shared place (the sauna).
      persons: placesOf((props.staff || []).find((m: any) => String(m.id) === String(s.staff_id))) > 1 ? personsOf(s) : 1,
    })),
    ...(allowOverCapacity ? { allow_over_capacity: true } : {}),
    products: productsList.value,
    ...discountPayload(discount.value),
    ...(method === "PUT" && currentVersion.value != null && !isTempId(String(form.value.id))
      ? { base_version: currentVersion.value }
      : {}),
  });

  // A save the server refused: asks and saves again where it can (over the
  // places, or this booking only), otherwise throws the message to show.
  const handleSaveRefusal = async (data: any, close: boolean, scope: string): Promise<boolean> => {
    // A shared place (the sauna) would be over its places: ask, then book anyway.
    if (data.error === "over_capacity") {
      loading.value = false;
      return (await askOverCapacity(confirm, t, data)) ? executeSave(close, scope, true) : false;
    }
    // "This and future" would replace a paid booking: offer this one only.
    if (data.error === "series_has_payments") {
      loading.value = false;
      return askSaveThisOnly(close);
    }
    if (data.error === "staff_unavailable") {
      throw new Error(t("booking.validation.staffUnavailable"));
    }
    if (data.error === "repeated_service") {
      throw new Error(t("booking.validation.repeatedService"));
    }
    if (["stale_appointment", "appointment_missing", "slot_taken"].includes(data.error)) {
      throw new Error(t(`offline.conflict.${data.error}`));
    }
    throw new Error(data.error || "Failed to save");
  };

  // A save kept on this device (no network): it is replayed once back online.
  const afterSavedOffline = async (method: string, result: { tempId?: string }) => {
    // No network reached the server — the write is kept in IndexedDB,
    // shown on the calendar as "not synced", and replayed once reconnected.
    // A new booking gets a temporary id, so saving or paying again from
    // this dialog updates the same booking instead of making a second one.
    if (method === "POST" && result.tempId) form.value.id = result.tempId;
    // The queued change will move the version on; the next save mustn't
    // repeat the check against the old one.
    currentVersion.value = null;
    toast.add({
      severity: "warn",
      summary: t("booking.toast.savedOffline"),
      detail: t("booking.toast.savedOfflineDetail"),
      life: 5000,
    });
    originalSnapshot.value = {
      price: currentApptTotal.value,
      deposit: form.value.deposit_amount,
      isPast: originalSnapshot.value.isPast,
    };
    await later.saveClientNotes();
  };

  // Takes in what the server answered to a save: the booking's id and version,
  // the client's balance, and the state the next save compares against.
  const afterSaved = async (method: string, data: any) => {
    // A series edit replaces this booking's row, so it answers with the new id too.
    if (method === "POST" || data.id) {
      form.value.id = data.id;
    }
    if (data.version !== undefined) currentVersion.value = data.version;
    // Saved as cancelled: its time is free for the waitlist.
    if (form.value.status === "cancelled" && savedStatus.value !== "cancelled") emit("freed", freedSlots());
    savedStatus.value = form.value.status;

    if (data.new_balance !== undefined && selectedClient.value) {
      selectedClient.value.outstanding_balance = Number(data.new_balance);
    }

    originalServices.value = snapshotServices(servicesList.value);
    originalDiscountAmount.value = discountAmount.value;
    originalSnapshot.value = {
      price: currentApptTotal.value,
      deposit: form.value.deposit_amount,
      isPast: originalSnapshot.value.isPast,
    };
    await later.saveClientNotes();
  };

  /** Saves the booking; true once saved (or queued offline), false if it wasn't. */
  const executeSave = async (close = true, scope = "single", allowOverCapacity = false): Promise<boolean> => {
    // Unblocking (toggling an existing block's button off) and editing a
    // block's time/duration are both time-off-only flows with no client/
    // service involved — skip the normal booking validations entirely.
    const isTimeOffFlow = form.value.is_block || !!form.value.time_off_id;
    const problem = bookingFormProblem(isTimeOffFlow);
    if (problem) {
      toast.add({ severity: "warn", summary: t("common.error"), detail: t(problem), life: 3000 });
      return false;
    }

    if (form.value.time_off_id && !form.value.is_block) {
      loading.value = true;
      const ok = await unblockTimeOff();
      loading.value = false;
      return ok;
    }

    if (form.value.is_block) {
      loading.value = true;
      const ok = await saveAsTimeOff();
      loading.value = false;
      return ok;
    }

    const allowOvertime = await checkStaffTimes();
    if (allowOvertime === null) return false;

    loading.value = true;

    let url = form.value.id
      ? `/api/v1/appointments/${form.value.id}?scope=${scope}`
      : "/api/v1/appointments";

    const method = form.value.id ? "PUT" : "POST";

    try {
      const payload = bookingPayload(method, allowOvertime, allowOverCapacity);
      const firstStart = servicesList.value[0]?.start_time ? new Date(servicesList.value[0].start_time) : null;
      const result = await fetchOrQueue(url, method, payload, {
        kind: "appointment",
        label: [
          selectedClient.value ? `${selectedClient.value.first_name || ""} ${selectedClient.value.last_name || ""}`.trim() : "",
          firstStart ? firstStart.toLocaleString("el-GR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "",
        ].filter(Boolean).join(" · ") || t("booking.editDialog.title"),
        createsId: method === "POST" ? "id" : undefined,
        offlineExtras: {
          offline_known_overlaps: knownOverlapIds(calendarStoreForOverlaps.events, payload.services, form.value.id),
          // Made offline: when it was really booked, not when it syncs.
          ...(method === "POST" ? { booked_at: new Date().toISOString() } : {}),
        },
      });

      if (result.queued) {
        await afterSavedOffline(method, result);
      } else {
        const res = result.response;
        const data = await res.json();
        if (!res.ok) return await handleSaveRefusal(data, close, scope);
        await afterSaved(method, data);
      }

      if (close) {
        emit("save");
        dialogVisible.value = false;
      }
      return true;
    } catch (e) {
      console.error(e);
      toast.add({
        severity: "error",
        summary: t("booking.toast.saveFailed"),
        detail: (e as Error).message || t("booking.toast.saveFailedDetail"),
        life: 4000,
      });
      return false;
    } finally {
      loading.value = false;
    }
  };

  return { ensureSavedForPackage, save, executeSave, saveAsTimeOff, unblockTimeOff };
};
