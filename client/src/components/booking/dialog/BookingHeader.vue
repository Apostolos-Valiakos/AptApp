<template>
  <!-- Header -->
  <div
    class="px-4 md:px-6 py-2.5 md:py-4 border-b border-gray-100 flex justify-between items-center gap-3 bg-white sticky top-0 z-10 flex-shrink-0"
  >
    <div class="min-w-0">
      <h2 class="text-base md:text-xl font-bold text-gray-900 truncate">
        {{
          isEditMode
            ? t("booking.editAppointment")
            : isBlockEdit
              ? t("booking.editBlock")
              : t("booking.newAppointment")
        }}
      </h2>
      <div class="text-xs md:text-sm text-gray-500 mt-0.5 md:mt-1 flex items-center gap-2">
        <i class="pi pi-clock text-xs opacity-60"></i>
        <span>{{ formatDate(shownStartTime) }}</span>
        <span
          v-if="isEditMode"
          class="rounded-full px-2 md:px-3 py-0.5 md:py-1 text-[10px] md:text-xs font-bold uppercase"
          :class="statusBadge(form.status)"
        >
          {{ form.status }}
        </span>
      </div>
    </div>
    <div class="flex items-center gap-2 flex-shrink-0">
      <!-- Phones: the client's details (notes, history, debts) open
           over the form from here. -->
      <button
        v-if="isMobile"
        type="button"
        class="w-10 h-10 rounded-full bg-[var(--p-primary-50)] text-[var(--p-primary-700)] flex items-center justify-center disabled:opacity-40"
        :disabled="!selectedClient"
        :aria-label="t('bookingSidebar.clientDetails')"
        data-testid="booking-client-panel"
        @click="showMobileSidebar = true"
      >
        <i class="pi pi-user"></i>
      </button>
      <button
        @click="dialogVisible = false"
        :aria-label="t('common.close')"
        class="w-10 h-10 md:w-8 md:h-8 rounded-full bg-gray-100 hover:bg-red-50 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors duration-200"
      >
        <i class="pi pi-times text-sm"></i>
      </button>
    </div>
  </div>

  <!-- Tab bar — pill group -->
  <div class="flex px-3 md:px-6 py-2 flex-shrink-0">
    <div class="flex w-full md:w-auto gap-1 p-1 bg-gray-50 rounded-full" role="tablist">
      <button
        v-for="tab in visibleTabs"
        :key="tab.key"
        role="tab"
        :aria-selected="currentTab === tab.key"
        @click="currentTab = tab.key"
        class="flex-1 md:flex-none min-w-0 truncate py-2 px-1 md:px-4 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap rounded-full"
        :class="
          currentTab === tab.key
            ? 'bg-[var(--p-primary-50)] text-[var(--p-primary-700)] font-bold'
            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
        "
      >
        {{ tab.label }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
// The booking dialog's title, its date and status, and the tab bar.
import { statusBadge } from "../../../utils/appointmentStatus";
import { useBookingDialog } from "./context";

const {
  dialogVisible, t, form, isEditMode, isBlockEdit, selectedClient, shownStartTime, currentTab,
  visibleTabs, showMobileSidebar, isMobile, formatDate,
} = useBookingDialog();
</script>
