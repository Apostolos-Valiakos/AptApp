// Filling the dialog: a booking opened (or a new one from a calendar slot),
// a new booking folded into the client's appointment that day, and a past
// visit opened from the sidebar (after a yes when there are unsaved edits).
import { nextTick, onMounted, watch } from "vue";
import { api } from "../../../api/http";
import { emptyDiscount, discountFromAppointment } from "../../../utils/discount";
import { appendNote, firstStartOf, sameDayAppointmentFor } from "../../../utils/sameDayGrouping";
import { toLocalDateStr } from "../../../utils/staffAvailability";
import { matchVariationName } from "../../../utils/serviceVariations";
import { comboLineLabel } from "../../../utils/comboSplit";
import { markManualStarts } from "../../../utils/serviceSequence";
import { snapshotServices } from "../../../utils/appointmentChanges";
import { personsOf } from "../../../utils/capacity";
import type { BookingState } from "./useBookingState";
import type { Later } from "./context";

export const useBookingLoad = (state: BookingState, later: Later) => {
  const {
    props, emit, dialogVisible, confirm, notify, t, form, servicesList,
    productsList, isRecurring, recurrenceForm, originalServices, originalSnapshot, originalDiscountAmount, currentVersion, savedStatus,
    selectedClient, clientNotesDraft, walkInClientId, groupedWithTime, siblingAppointments, selectedSiblingIds, discount, discountCodes,
    pendingPackages, pendingGiftCards, currentTab, loadingPastId, showMobileSidebar, discountAmount, currentApptTotal, 
  } = state;


  onMounted(async () => {
    try {
      discountCodes.value = (await api.get("/api/v1/discount-codes")).filter((c: any) => c.is_active);
    } catch {
      // codes are optional; fixed/percent discounts still work
    }
  });
  let groupRequest = 0;

  const groupWithSameDayAppointment = async (clientId: string) => {
    if (!clientId || form.value.id || form.value.is_block || isRecurring.value) return;
    if (clientId === walkInClientId.value) return;
    const request = ++groupRequest;
    const dateStr = toLocalDateStr(new Date(form.value.start_time));
    try {
      const existing = sameDayAppointmentFor(await api.get(`/api/v1/appointments?date=${dateStr}`), clientId);
      if (!existing) return;
      if (
        request !== groupRequest ||
        !dialogVisible.value ||
        form.value.id ||
        form.value.client_id !== clientId ||
        isRecurring.value
      ) return;

      const newRows = servicesList.value.map((r: any) => ({ ...r, _manualStart: true }));
      const newProducts = productsList.value.map((p: any) => ({ ...p }));
      const newBookingNotes = (form.value.booking_notes || "").trim();
      const newInternalNotes = (form.value.internal_notes || "").trim();

      loadExistingAppointment(existing, null);
      servicesList.value = [...servicesList.value, ...newRows];
      productsList.value = [...productsList.value, ...newProducts];
      form.value.booking_notes = appendNote(form.value.booking_notes || "", newBookingNotes);
      form.value.internal_notes = appendNote(form.value.internal_notes || "", newInternalNotes);

      const start = new Date(firstStartOf(existing));
      groupedWithTime.value = `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`;
      nextTick(later.suggestAmountToPay);
    } catch {
      // keep it as a separate new booking if the lookup fails
    }
  };

  const loadExistingAppointment = (val: any, resolvedStaffId: any) => {
    currentVersion.value = val.version ?? null;
    savedStatus.value = val.status || "";
    form.value = {
      id: val.id,
      client_id: val.client_id || null,
      start_time: val.start_time ? new Date(val.start_time) : new Date(),
      status: val.status || "new",
      internal_notes: val.internal_notes || "",
      booking_notes: val.booking_notes || "",
      deposit_amount: Number(val.deposit_amount || 0),
      payment_status: val.payment_status || "unpaid",
      payment_method: val.payment_method || "card",
      is_block: !!val.is_block,
      save_receipt:
        val.save_receipt !== undefined ? !!val.save_receipt : true,
      is_eoppy: !!val.is_eoppy,
    };

    if (val.client_id) {
      later.loadClientById(val.client_id, {
        id: val.client_id,
        first_name: val.first_name,
        last_name: val.last_name,
        full_name: `${val.first_name || ""} ${val.last_name || ""}`.trim(),
        phone: val.client_phone,
        notes: val.client_notes ?? undefined,
        outstanding_balance: Number(val.client_outstanding_balance || 0),
      });
    } else {
      selectedClient.value = null;
    }

    let rule = null;
    if (val.recurrence) {
      try {
        rule =
          typeof val.recurrence === "string"
            ? JSON.parse(val.recurrence)
            : val.recurrence;
      } catch (e) {
        console.warn("Invalid recurrence format, resetting:", val.recurrence);
        rule = null;
      }
    }

    if (rule) {
      isRecurring.value = true;
      recurrenceForm.value = {
        freq: rule.freq || "Weekly",
        end_date: rule.end_date ? new Date(rule.end_date) : null,
      };
    } else {
      isRecurring.value = false;
      recurrenceForm.value = { freq: "Weekly", end_date: null };
    }

    if (val.services?.length > 0) {
      servicesList.value = markManualStarts(val.services.map((s: any) => {
        // Which variation this row was is now persisted server-side
        // (appointment_services.variation_name — s.variation_name here),
        // independent of price/duration, so it survives later edits to
        // either (e.g. extending the duration). s.variation_name is only
        // absent for appointments saved before that column existed; for
        // those, fall back once here to reverse-matching the saved price/
        // duration against the service's current variation list — same as
        // before, still breaks if price/duration are edited afterward,
        // but that's now limited to pre-migration data only.
        const catalogService = props.services?.find(
          (cs: any) => cs.id === s.service_id,
        );
        const resolvedVariationName =
          s.variation_name ||
          matchVariationName(
            catalogService,
            Number(s.price || 0),
            s.duration_minutes || 60,
          );
        return {
          service_id: s.service_id,
          staff_id: s.staff_id,
          start_time: s.start_time
            ? new Date(s.start_time)
            : new Date(val.start_time),
          duration_override: s.duration_minutes || 60,
          price_override: Number(s.price || 0),
          variation_name: resolvedVariationName || null,
          combo_service_id: s.combo_service_id || null,
          persons: personsOf(s),
          // This service's own note, for its staff member (shop only).
          notes: s.notes || "",
          service_archived: !!s.service_archived,
          _paidWith: s.paid_with || null,
          _hidden: s.hidden || null,
          _charged: s.charged ?? null,
          _label: comboLineLabel(
            resolvedVariationName
              ? `${catalogService?.name || s.service_name || ""} — ${resolvedVariationName}`
              : catalogService?.name || s.service_name || "",
            s.combo_name,
          ),
        };
      }));
    } else {
      servicesList.value = [
        {
          service_id: null,
          staff_id: resolvedStaffId,
          start_time: new Date(form.value.start_time),
          duration_override: 60,
          price_override: 0,
        },
      ];
    }

    productsList.value = Array.isArray(val.products)
      ? val.products.map((p: any) => ({
          product_id: p.product_id,
          staff_id: p.staff_id ?? null,
          quantity: p.quantity || 1,
          price: Number(p.price || 0),
        }))
      : [];

    originalServices.value = snapshotServices(servicesList.value);
    discount.value = discountFromAppointment(val);
    originalDiscountAmount.value = discountAmount.value;
    const apptStartTime = val.services?.[0]?.start_time || val.start_time;
    originalSnapshot.value = {
      price: currentApptTotal.value,
      deposit: form.value.deposit_amount,
      isPast: apptStartTime ? new Date(apptStartTime) < new Date() : false,
    };

    if (form.value.client_id && form.value.start_time) {
      later.loadSiblingAppointments(form.value.client_id, form.value.start_time);
    }
  };

  // === METHODS ===

  // A past visit clicked in the sidebar replaces this booking in the dialog, so
  // edits not yet saved need a yes first. There is no route for one appointment:
  // it comes from its day's list, the same shape the calendar gets.
  let loadedBooking = "";
  const bookingSnapshot = () =>
    JSON.stringify({
      status: form.value.status,
      start: form.value.start_time,
      internal: form.value.internal_notes || "",
      notes: form.value.booking_notes || "",
      clientNotes: clientNotesDraft.value.trim() === later.savedClientNotes().trim(),
      services: servicesList.value.map((s: any) => [
        s.service_id,
        s.staff_id,
        s.start_time,
        s.duration_override,
        s.price_override,
        s.variation_name || null,
        s.persons || 1,
        (s.notes || "").trim(),
      ]),
      products: productsList.value,
      discount: discount.value,
      sales: [pendingPackages.value, pendingGiftCards.value],
    });

  // === INITIALIZATION ===
  watch(
    [() => props.appointment, () => dialogVisible.value],
    ([val, visible]) => {
      later.resetPayment();
      if (!visible) return;
      // Never carry a stale same-day-payment selection into a new dialog
      // instance — EDIT MODE below repopulates siblingAppointments if this
      // appointment has a client + start_time; NEW MODE (a brand-new,
      // unsaved appointment) never has siblings to show.
      selectedSiblingIds.value = [];
      siblingAppointments.value = [];
      let resolvedStaffId = null;
      if (val?.staff_id && props.staff) {
        const found = props.staff.find((s: any) => s.id == val.staff_id);
        if (found) resolvedStaffId = found.id;
      }

      groupedWithTime.value = null;
      groupRequest++;
      if (val && val.id) {
        // === EDIT MODE ===
        loadExistingAppointment(val, resolvedStaffId);
      } else {
        // === NEW MODE ===
        const newStart = val?.start_time ? new Date(val.start_time) : new Date();
        // A drag-select on the calendar carries both ends of the selected span
        // (SchedulerView's `select` handler passes end_time through) — use that
        // as the new service's duration instead of always defaulting to 60.
        const draggedDurationMinutes = val?.end_time
          ? Math.max(
              5,
              Math.round(
                (new Date(val.end_time).getTime() - newStart.getTime()) / 60000,
              ),
            )
          : 60;

        // A caller (e.g. the client search's "Book an appointment" button) can
        // pre-select a client for a brand-new booking — everything else below
        // still behaves exactly like starting from a blank slot. Otherwise,
        // pre-select the shop's walk-in client so a booking can be saved fast
        // and attributed to a real client later (see loadWalkInClient below).
        if (val?.client_id) {
          later.loadClientById(val.client_id, {
            id: val.client_id,
            first_name: val.first_name,
            last_name: val.last_name,
            full_name: `${val.first_name || ""} ${val.last_name || ""}`.trim(),
            phone: val.phone,
            outstanding_balance: Number(val.outstanding_balance || 0),
          });
        } else {
          selectedClient.value = null;
          later.loadWalkInClient();
        }

        // Clicking an existing "break" block on the scheduler reopens this same
        // dialog in NEW MODE (no appointment id exists for a time-off row) but
        // pre-filled as an edit: is_block starts true, and time_off_id/
        // time_off_staff_id are kept so Save can replace (or, if the block
        // toggle is clicked off, delete) the right staff_time_off row. See
        // saveAsTimeOff/unblockTimeOff below.
        form.value = {
          id: null,
          client_id: val?.client_id || null,
          start_time: newStart,
          status: "new",
          internal_notes: val?.time_off_id ? val.reason || "" : "",
          deposit_amount: 0,
          payment_status: "unpaid",
          is_block: !!val?.time_off_id,
          time_off_id: val?.time_off_id || null,
          time_off_staff_id: val?.time_off_id
            ? val.staff_id || resolvedStaffId
            : null,
          save_receipt: true,
          is_eoppy: false,
          // Booked from the waitlist: the server marks that entry booked.
          ...(val?.waitlist_entry_id ? { waitlist_entry_id: val.waitlist_entry_id } : {}),
        };

        isRecurring.value = false;
        recurrenceForm.value = { freq: "Weekly", end_date: null };

        // A service chosen beforehand (from the waitlist): its usual length and price.
        const chosen = val?.service_id ? (props.services || []).find((s: any) => s.id === val.service_id) : null;
        servicesList.value = [
          {
            service_id: chosen?.id ?? null,
            staff_id: resolvedStaffId,
            start_time: newStart,
            duration_override: chosen ? Number(chosen.duration_minutes) || 60 : draggedDurationMinutes,
            price_override: chosen ? Number(chosen.price) || 0 : 0,
            ...(chosen ? { _label: chosen.name } : {}),
          },
        ];

        productsList.value = [];
        discount.value = emptyDiscount();
        originalDiscountAmount.value = 0;
        originalSnapshot.value = { price: 0, deposit: 0, isPast: false };
        if (val?.client_id && !val?.time_off_id) groupWithSameDayAppointment(val.client_id);
      }

      // Suggest a sensible default amount after the form (and computed values) have settled.
      // Using nextTick so computed properties (currentApptTotal, totalDueNow) read the new form state.
      nextTick(() => {
        later.suggestAmountToPay();
        loadedBooking = bookingSnapshot();
      });
      currentTab.value = "Booking";
      showMobileSidebar.value = false;
    },
    { immediate: true },
  );
  const discardUnsavedEdits = () =>
    new Promise<boolean>((resolve) => {
      if (bookingSnapshot() === loadedBooking) return resolve(true);
      confirm.require({
        header: t("booking.openPast.header"),
        message: t("booking.openPast.message"),
        icon: "pi pi-exclamation-triangle",
        acceptLabel: t("booking.openPast.discard"),
        rejectLabel: t("booking.openPast.keep"),
        accept: () => resolve(true),
        reject: () => resolve(false),
        onHide: () => resolve(false),
      });
    });

  let pastRequest = 0;
  const openPastAppointment = async (past: any) => {
    if (past.id === form.value.id) return;
    const request = ++pastRequest;
    if (!(await discardUnsavedEdits()) || request !== pastRequest) return;
    loadingPastId.value = past.id;
    try {
      const dayRows = await api.get(`/api/v1/appointments?date=${toLocalDateStr(new Date(past.start_time))}`);
      if (request !== pastRequest || !dialogVisible.value) return;
      const found = dayRows.find((a: any) => a.id === past.id);
      if (!found) throw new Error("not in the day's list");
      emit("open-appointment", found);
    } catch {
      if (request !== pastRequest) return;
      notify.error(t("booking.openPast.failed"));
    } finally {
      if (request === pastRequest) loadingPastId.value = null;
    }
  };

  // The dialog as loaded (or last saved): what "unsaved edits" compares against.
  const markLoaded = () => {
    loadedBooking = bookingSnapshot();
  };

  return { groupWithSameDayAppointment, loadExistingAppointment, bookingSnapshot, markLoaded, discardUnsavedEdits, openPastAppointment };
};
