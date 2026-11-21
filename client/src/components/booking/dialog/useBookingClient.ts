// The booking's client: picking or clearing one, the walk-in client, their
// balance, their notes (saved with the booking) and their other bookings
// that day.
import { watch } from "vue";
import { api } from "../../../api/http";
import { fetchOrQueue } from "../../../offline/queue";
import { toLocalDateStr } from "../../../utils/staffAvailability";
import type { BookingState } from "./useBookingState";
import type { Later } from "./context";

export const useBookingClient = (state: BookingState, later: Later) => {
  const {
    t, toast, authStore, emit, dialogVisible,
    form, selectedClient, clientNotesDraft, walkInClientId, showClientProfile, currentProfileId,
    siblingAppointments, selectedSiblingIds, siblingsLoading, canCombineDayPayment,
  } = state;

  const savedClientNotes = () => String(selectedClient.value?.notes ?? selectedClient.value?.client_notes ?? "");
  watch(selectedClient, () => {
    clientNotesDraft.value = savedClientNotes();
  });
  const saveClientNotes = async () => {
    const client = selectedClient.value;
    if (!client?.id || authStore.isStaff) return;
    const notes = clientNotesDraft.value.trim();
    if (notes === savedClientNotes().trim()) return;
    const result = await fetchOrQueue(`/api/v1/clients/${client.id}/notes`, "PUT", { notes }, {
      kind: "client",
      label: `${t("common.clientNotes")} · ${client.full_name || `${client.first_name || ""} ${client.last_name || ""}`.trim()}`,
    }).catch(() => null);
    if (result && (result.queued || result.response.ok)) {
      client.notes = notes;
      return;
    }
    toast.add({ severity: "error", summary: t("booking.toast.clientNotesFailed"), life: 5000 });
  };

  // The stored balance can be stale (debt appears when an appointment's time
  // passes), so the server recalculates it whenever a client is shown here.
  const refreshClientBalance = async (clientId: string) => {
    if (!clientId) return;
    try {
      const { balance } = await api.get(`/api/v1/clients/${clientId}/balance`);
      if (selectedClient.value?.id === clientId) {
        selectedClient.value.outstanding_balance = Number(balance) || 0;
      }
    } catch {
      // keep the stored figure if the refresh fails
    }
  };

  const onClientPicked = (client: any) => {
    selectedClient.value = client;
    form.value.client_id = client.id;
    refreshClientBalance(client.id);
    later.groupWithSameDayAppointment(client.id);
  };

  const clearSelectedClient = () => {
    form.value.client_id = null;
    selectedClient.value = null;
  };

  // A payment or write-off made from the sidebar.
  const onDebtChanged = (e: { appointmentId?: string; amount: number; remaining?: number; newBalance: number }) => {
    if (selectedClient.value) selectedClient.value.outstanding_balance = Number(e.newBalance) || 0;
    if (e.appointmentId && e.appointmentId === form.value.id) {
      form.value.deposit_amount = Number(form.value.deposit_amount || 0) + Number(e.amount || 0);
      // Part of it settled: still partly unpaid.
      form.value.payment_status = Number(e.remaining) > 0 ? "partial" : "paid";
    }
    emit("refresh");
  };

  // Re-hydrates selectedClient for an existing appointment without ever loading
  // the full client list — an instant approximation from the appointment payload
  // itself, refined a moment later with the full slim record (adds custom_fields).
  const loadClientById = async (clientId: string, fallback: any) => {
    selectedClient.value = fallback;
    if (!clientId) return;
    try {
      const rows = await api.get(`/api/v1/clients?slim=true&id=${clientId}`);
      if (rows[0]) selectedClient.value = rows[0];
    } catch {
      // keep the fallback if the lookup fails
    }
    await refreshClientBalance(clientId);
  };

  // Pre-selects the shop's single walk-in client on a brand-new, blank
  // appointment — lets staff save fast and attribute it to a real client
  // later via the same "×" clear-and-search flow used for any appointment.
  // Silently does nothing if it fails; staff can still pick a client by hand.
  const loadWalkInClient = async () => {
    try {
      const walkIn = await api.get("/api/v1/clients/walk-in").catch(() => null);
      if (walkIn) {
        walkInClientId.value = walkIn.id;
        selectedClient.value = walkIn;
        form.value.client_id = walkIn.id;
        refreshClientBalance(walkIn.id);
      }
    } catch {
      // leave the client picker blank if this fails
    }
  };

  // This client's other active appointments the same calendar day, across
  // every staff member — powers the Payment tab's combined-day checklist.
  // Fetched regardless of role (so a plain staff member still sees the full
  // day read-only); only the checkbox interaction is gated client-side by
  // canCombineDayPayment.
  const loadSiblingAppointments = async (clientId: string, startTime: Date) => {
    siblingsLoading.value = true;
    try {
      const dateStr = toLocalDateStr(startTime);
      const all = await api.get(`/api/v1/clients/${clientId}/appointments-on-date?date=${dateStr}`).catch(() => null);
      if (all) {
        siblingAppointments.value = all.filter((a: any) => a.id !== form.value.id);
        // Pre-select the day's other unpaid appointments, so checkout totals
        // the whole day by default; staff can untick to pay one only.
        if (canCombineDayPayment.value) {
          selectedSiblingIds.value = siblingAppointments.value.filter((s: any) => Number(s.owed) > 0).map((s: any) => s.id);
        }
      }
    } catch {
      // leave the list empty if this fails — not critical to saving/paying
    } finally {
      siblingsLoading.value = false;
    }
  };

  const openClientProfile = () => {
    if (!form.value.client_id) return;
    currentProfileId.value = form.value.client_id;
    showClientProfile.value = true;
  };
  // Closing the booking dialog while the client profile is open leaves
  // showClientProfile stuck true (this component instance is never unmounted),
  // so the next open would remount ClientProfileDialog already-visible and empty.
  watch(
    () => dialogVisible.value,
    (val) => {
      if (!val) {
        showClientProfile.value = false;
        currentProfileId.value = null;
      }
    },
  );

  return {
    savedClientNotes, saveClientNotes, refreshClientBalance, onClientPicked, clearSelectedClient, onDebtChanged,
    loadClientById, loadWalkInClient, loadSiblingAppointments, openClientProfile,
  };
};
