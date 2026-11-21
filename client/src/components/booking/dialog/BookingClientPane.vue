<template>
  <div
    v-show="showMobileSidebar || !isMobile"
    class="bg-gray-50 md:w-[35%] md:order-2 md:border-l border-gray-200 md:h-full md:overflow-y-auto flex-shrink-0"
    :class="isMobile ? 'absolute inset-0 z-20 overflow-y-auto' : ''"
  >
    <div
      v-if="isMobile"
      class="sticky top-0 z-10 px-2 py-2 flex items-center gap-2 bg-white border-b border-gray-200"
    >
      <button
        type="button"
        class="w-10 h-10 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-100"
        :aria-label="t('common.back')"
        data-testid="booking-client-panel-back"
        @click="showMobileSidebar = false"
      >
        <i class="pi pi-arrow-left"></i>
      </button>
      <span class="font-bold text-sm text-gray-800 truncate">
        {{ selectedClient?.full_name || t("bookingSidebar.noneSelected") }}
      </span>
    </div>

    <div class="md:h-full" :inert="isReadOnly">
      <BookingSidebar
        class="w-full bg-gray-50 h-full"
        :client="selectedClient"
        :calculated-balance="sidebarBalance"
        v-model:bookingNotes="form.booking_notes"
        v-model:clientNotes="clientNotesDraft"
        @debt-changed="onDebtChanged"
        :loading-id="loadingPastId"
        @open-appointment="openPastAppointment"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
// The client's side of the booking dialog (over the form on phones).
import BookingSidebar from "../bookingSideBar.vue";
import { useBookingDialog } from "./context";

const {
  t, form, isReadOnly, selectedClient, clientNotesDraft, sidebarBalance, loadingPastId,
  showMobileSidebar, isMobile, onDebtChanged, openPastAppointment,
} = useBookingDialog();
</script>
