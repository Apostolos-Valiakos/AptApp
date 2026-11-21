// Deleting a booking (with an optional reason, kept in the log), or
// cancelling it instead when it has payments, which stay the client's credit.
import { fetchOrQueue } from "../../../offline/queue";
import type { BookingState } from "./useBookingState";
import type { Later } from "./context";

export const useBookingDelete = (state: BookingState, later: Later) => {
  const {
    props, emit, dialogVisible, confirm, toast, t, form, isReadOnly,
    selectedClient, deleteReason, freedSlots,
  } = state;

  const confirmDelete = () => {
    if (isReadOnly.value) return;
    const isSeries = !!props.appointment?.group_id;
    deleteReason.value = "";

    confirm.require({
      group: "delete-booking",
      message: isSeries
        ? t("booking.deleteDialog.messageRecurring")
        : t("booking.deleteDialog.messageSingle"),
      header: t("booking.deleteDialog.header"),
      icon: "pi pi-exclamation-triangle",
      rejectLabel: isSeries
        ? t("booking.editDialog.thisOnly")
        : t("booking.deleteDialog.no"),
      acceptLabel: isSeries
        ? t("booking.editDialog.thisAndFuture")
        : t("booking.deleteDialog.yes"),
      rejectClass: "p-button-outlined p-button-secondary",
      acceptClass: "p-button-danger",

      accept: async () => {
        await executeDelete(isSeries ? "series" : "single");
      },
      reject: async () => {
        if (isSeries) {
          await executeDelete("single");
        }
      },
    });
  };

  // A booking with payments isn't deleted (the server refuses: has_payments):
  // it's cancelled instead — kept, marked cancelled, and what was paid stays
  // the client's credit.
  // Opened after the current question has closed: it's asked from the delete
  // confirmation's accept, and PrimeVue hides the dialog right after that runs,
  // which would hide this one too.
  const offerCancelInstead = () => {
    setTimeout(askCancelInstead, 0);
  };
  const askCancelInstead = () => {
    confirm.require({
      header: t("booking.hasPayments.header"),
      message: t("booking.hasPayments.message"),
      icon: "pi pi-exclamation-triangle",
      acceptLabel: t("booking.hasPayments.accept"),
      rejectLabel: t("booking.hasPayments.reject"),
      acceptClass: "p-button-danger",
      rejectClass: "p-button-outlined p-button-secondary",
      accept: cancelInstead,
    });
  };

  const cancelInstead = async () => {
    try {
      const result = await fetchOrQueue(`/api/v1/appointments/${form.value.id}/cancel`, "POST", {}, {
        kind: "appointment",
        label: `${t("booking.cancelAppt")} · ${selectedClient.value?.first_name || ""} ${selectedClient.value?.last_name || ""}`.trim(),
      });
      if (result.queued) {
        toast.add({ severity: "warn", summary: t("booking.toast.savedOffline"), detail: t("booking.toast.savedOfflineDetail"), life: 4000 });
      } else {
        const data = await result.response.json().catch(() => ({}));
        if (!result.response.ok) {
          toast.add({ severity: "error", summary: t("booking.toast.deleteFailed"), detail: data.error || t("booking.toast.deleteFailedDetail"), life: 4000 });
          return;
        }
        if (data.new_balance !== undefined && selectedClient.value) {
          selectedClient.value.outstanding_balance = Number(data.new_balance);
        }
        toast.add({ severity: "success", summary: t("booking.toast.cancelledKeptPayments"), detail: t("booking.toast.cancelledKeptPaymentsDetail"), life: 5000 });
        emit("freed", freedSlots());
      }
      emit("save");
      dialogVisible.value = false;
    } catch (e) {
      console.error(e);
      toast.add({ severity: "error", summary: t("booking.toast.deleteFailed"), detail: t("booking.toast.networkError"), life: 4000 });
    }
  };

  const executeDelete = async (scope: string) => {
    // Payments already known here: don't even try to delete.
    if (Number(form.value.deposit_amount || 0) !== 0) return offerCancelInstead();
    try {
      // Offline the deletion is queued (and the booking hidden right away).
      const result = await fetchOrQueue(`/api/v1/appointments/${form.value.id}?scope=${scope}`, "DELETE", { reason: deleteReason.value }, {
        kind: "delete",
        label: `${t("booking.cancelAppt")} · ${selectedClient.value?.first_name || ""} ${selectedClient.value?.last_name || ""}`.trim(),
      });
      if (result.queued) {
        toast.add({
          severity: "warn",
          summary: t("booking.toast.savedOffline"),
          detail: t("booking.toast.savedOfflineDetail"),
          life: 4000,
        });
        emit("save");
        dialogVisible.value = false;
        return;
      }
      const res = result.response;
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.error === "has_payments") return offerCancelInstead();
        toast.add({
          severity: "error",
          summary: t("booking.toast.deleteFailed"),
          detail: data.error || t("booking.toast.deleteFailedDetail"),
          life: 4000,
        });
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (data.new_balance !== undefined && selectedClient.value) {
        selectedClient.value.outstanding_balance = Number(data.new_balance);
      }
      emit("freed", freedSlots());
      emit("save");
      dialogVisible.value = false;
    } catch (e) {
      console.error(e);
      toast.add({
        severity: "error",
        summary: t("booking.toast.deleteFailed"),
        detail: t("booking.toast.networkError"),
        life: 4000,
      });
    }
  };

  return { confirmDelete };
};
