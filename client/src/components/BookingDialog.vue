<template>
  <Dialog
    v-model:visible="dialogVisible"
    modal
    class="fresha-dialog h-full md:h-auto md:rounded-xl rounded-none"
    :showHeader="false"
    :breakpoints="{ '960px': '100vw', '640px': '100vw' }"
    :style="{ width: '95vw', maxWidth: '1200px' }"
    :contentStyle="{
      padding: '0',
      borderRadius: '12px',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }"
  >
    <div
      class="relative flex flex-col md:flex-row flex-1 min-h-0 md:flex-none md:max-h-[90vh] md:h-[800px] bg-white"
    >
      <!-- Left pane: form -->
      <div
        class="flex-grow flex flex-col w-full md:w-2/3 border-b md:border-b-0 md:border-r border-gray-200 order-2 md:order-1 h-full overflow-hidden"
        :class="
          isEditMode ? 'border-l-4 border-l-[var(--p-primary-color)]' : ''
        "
      >
        <BookingHeader />

        <!-- Opening a past visit: a moving bar, and the form dimmed and locked
             until its data is in. -->
        <ProgressBar
          v-if="loadingPastId"
          mode="indeterminate"
          class="flex-shrink-0 !h-[3px] !rounded-none"
          data-testid="booking-loading-bar"
        />
        <!-- Tab content -->
        <div
          class="flex-grow overflow-y-auto p-4 md:p-6 space-y-6 transition-opacity"
          :class="{ 'opacity-40 pointer-events-none': loadingPastId }"
          :aria-busy="!!loadingPastId"
        >
          <!-- Inert for staff: they read the booking but can't use anything in it. -->
          <div class="space-y-6" :inert="isReadOnly">
          <BookingMainTab v-if="currentTab === 'Booking'" />

          <!-- PRODUCTS TAB -->
          <div v-if="currentTab === 'Products'" class="space-y-4">
            <div
              class="bg-blue-50 border border-blue-100 p-4 rounded-xl flex items-start gap-3"
            >
              <i class="pi pi-shopping-bag text-blue-600 mt-1"></i>
              <div>
                <h4 class="text-sm font-bold text-blue-900">
                  {{ t("booking.retailProducts.title") }}
                </h4>
                <p class="text-xs text-blue-700">
                  {{ t("booking.retailProducts.note") }}
                </p>
              </div>
            </div>

            <BookingProducts
              v-model="productsList"
              :allProducts="props.allProducts"
            />
          </div>

          <BookingPaymentTab v-if="currentTab === 'Payment'" />

          <!-- NOTES TAB -->
          <div v-if="currentTab === 'Notes'" class="space-y-4">
            <div>
              <label
                class="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2"
              >
                {{ t("booking.notes.internalNote") }}
              </label>
              <div
                class="border-l-4 border-l-amber-400 rounded-r-lg overflow-hidden"
              >
                <Textarea
                  v-model="form.internal_notes"
                  rows="3"
                  class="w-full bg-amber-50"
                  :placeholder="t('booking.notes.internalPlaceholder')"
                />
              </div>
            </div>
          </div>
          </div>
        </div>

        <BookingFooter />
      </div>

      <!-- Right pane: client sidebar -->
      <BookingClientPane />
    </div>

    <RepeatBookingDialog
      v-model:visible="showRepeatDialog"
      :services="servicesList"
      :clientId="form.client_id"
      :staff="props.staff || []"
      :workingHours="props.workingHours || []"
      :timeOff="props.timeOff || []"
      @created="emit('refresh')"
    />

    <ClientProfileDialog
      v-model:visible="showClientProfile"
      :clientId="currentProfileId"
      @refresh="() => {}"
    />
  </Dialog>
  <ConfirmDialog></ConfirmDialog>
  <!-- Deleting a booking: the question, and why (optional, kept in the log). -->
  <ConfirmDialog group="delete-booking">
    <template #message="{ message }">
      <div class="w-full space-y-3">
        <p>{{ message.message }}</p>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{{ t("booking.deleteDialog.reason") }}</label>
          <Textarea v-model="deleteReason" rows="2" maxlength="500" class="w-full" data-testid="delete-reason" />
        </div>
      </div>
    </template>
  </ConfirmDialog>
</template>

<script setup lang="ts">
// The booking dialog: a booking (or a time block) opened from the calendar,
// a new one, or a past visit. Its state and logic live in booking/dialog/
// (see context.ts there); this file puts them together and draws the frame,
// the products and notes tabs, and the delete question.
import { provide } from "vue";
import BookingProducts from "./booking/bookingProducts.vue";
import RepeatBookingDialog from "./booking/RepeatBookingDialog.vue";
import ClientProfileDialog from "./ClientProfileDialog.vue";
import BookingHeader from "./booking/dialog/BookingHeader.vue";
import BookingMainTab from "./booking/dialog/BookingMainTab.vue";
import BookingPaymentTab from "./booking/dialog/BookingPaymentTab.vue";
import BookingFooter from "./booking/dialog/BookingFooter.vue";
import BookingClientPane from "./booking/dialog/BookingClientPane.vue";
import { createBookingState } from "./booking/dialog/useBookingState";
import { useBookingClient } from "./booking/dialog/useBookingClient";
import { useBookingPayment } from "./booking/dialog/useBookingPayment";
import { useBookingLoad } from "./booking/dialog/useBookingLoad";
import { useBookingSave } from "./booking/dialog/useBookingSave";
import { useBookingDelete } from "./booking/dialog/useBookingDelete";
import { BookingDialogKey, type Later } from "./booking/dialog/context";

const props = defineProps([
  "appointment",
  "services",
  "staff",
  "allProducts",
  "timeOff",
  "workingHours",
  "shopMinTime",
  "shopMaxTime",
]);
const emit = defineEmits(["save", "refresh", "open-appointment", "freed"]);
const dialogVisible = defineModel<boolean>("visible", { default: false });

const state = createBookingState(props, emit, dialogVisible);
// The calls between parts (see Later in context.ts), filled in as each part
// is made. In this order: the client's and the payment's parts must be ready
// before loading, whose watcher fills the form at once.
const later = {} as Later;
const client = useBookingClient(state, later);
const payment = useBookingPayment(state, later);
Object.assign(later, {
  loadClientById: client.loadClientById,
  loadWalkInClient: client.loadWalkInClient,
  loadSiblingAppointments: client.loadSiblingAppointments,
  savedClientNotes: client.savedClientNotes,
  saveClientNotes: client.saveClientNotes,
  resetPayment: payment.resetPayment,
  suggestAmountToPay: payment.suggestAmountToPay,
});
const load = useBookingLoad(state, later);
const saving = useBookingSave(state, later);
const removal = useBookingDelete(state, later);
Object.assign(later, {
  groupWithSameDayAppointment: load.groupWithSameDayAppointment,
  markLoaded: load.markLoaded,
  save: saving.save,
});
provide(BookingDialogKey, { ...state, ...client, ...load, ...saving, ...payment, ...removal });

const {
  t, form, servicesList, productsList, isEditMode, isReadOnly, currentTab, loadingPastId,
  showRepeatDialog, showClientProfile, currentProfileId, deleteReason,
} = state;
</script>

<style scoped>
:global(.p-confirmdialog-message) {
  white-space: pre-line;
}

.fresha-dialog .p-dialog-header {
  display: none;
}
.p-dropdown,
.p-inputtext,
.p-calendar {
  border-radius: 0.5rem;
}
</style>

<!-- Not scoped: the dialog and the ⋯ menu are drawn outside this component. -->
<style>
/* Phones: the whole visible screen (the backdrop is 100dvh, see tailwind.css). */
@media (max-width: 767px) {
  .p-dialog.fresha-dialog {
    width: 100vw !important;
    height: 100% !important;
    max-height: 100% !important;
    margin: 0 !important;
    border-radius: 0 !important;
  }
  .p-dialog.fresha-dialog .p-dialog-content {
    border-radius: 0 !important;
    flex: 1 1 auto;
    min-height: 0;
  }
  .booking-footer {
    padding-bottom: calc(0.625rem + env(safe-area-inset-bottom));
  }
}
.booking-menu-danger .p-menu-item-label,
.booking-menu-danger .p-menu-item-icon {
  color: #dc2626 !important;
}
</style>
