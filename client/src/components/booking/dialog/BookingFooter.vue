<template>
  <div
    class="booking-footer px-3 md:px-6 py-2.5 md:py-4 border-t border-gray-200 flex flex-row justify-between items-center bg-gradient-to-r from-gray-50 to-white flex-shrink-0 gap-2 md:gap-3"
  >
    <!-- Phones: one row. Repeat and delete go in this menu. -->
    <template v-if="isMobile && moreItems.length && currentTab !== 'Payment'">
      <Button
        icon="pi pi-ellipsis-v"
        severity="secondary"
        outlined
        class="flex-shrink-0"
        :aria-label="t('booking.moreActions')"
        data-testid="booking-more"
        @click="moreMenu?.toggle($event)"
      />
      <Menu ref="moreMenu" :model="moreItems" :popup="true" />
    </template>
    <Button
      v-if="!isMobile && isEditMode && !isReadOnly && currentTab !== 'Payment'"
      :label="t('booking.cancelAppt')"
      icon="pi pi-trash"
      class="p-button-danger p-button-text p-button-sm w-full sm:w-auto"
      data-testid="booking-delete"
      @click="confirmDelete"
    />
    <div class="flex flex-row items-center gap-2 md:gap-3 ml-auto flex-1 md:flex-none min-w-0">
      <Button
        v-if="showPaymentNav && paymentStep > 1"
        :label="t('payment.stepper.back')"
        icon="pi pi-arrow-left"
        severity="secondary"
        outlined
        class="flex-1 sm:flex-none"
        data-testid="payment-back"
        @click="paymentStep--"
      />
      <div
        v-if="currentTab !== 'Payment'"
        class="flex items-center gap-2 md:mr-4"
      >
        <Button
          v-if="currentTab !== 'Payment' && !isReadOnly"
          :label="t('booking.tabs.payment')"
          data-testid="booking-payment-tab"
          @click="currentTab = 'Payment'"
          severity="success"
        />
      </div>
      <Button
        v-if="!isMobile && !form.is_block && !isReadOnly && currentTab !== 'Payment'"
        :label="t('booking.repeat.button')"
        icon="pi pi-copy"
        outlined
        :disabled="!canRepeatBooking"
        v-tooltip.top="!canRepeatBooking ? t('booking.repeat.needClientAndStaff') : null"
        @click="showRepeatDialog = true"
      />
      <Button
        v-if="!isReadOnly"
        :label="t('booking.save')"
        @click="save()"
        data-testid="booking-save"
        :loading="loading"
        :disabled="!canSaveBooking"
        v-tooltip.top="!canSaveBooking ? t('booking.validation.staffRequired') : null"
        class="flex-1 md:flex-none md:px-8 min-w-0"
      />
      <Button
        v-if="showPaymentNav && paymentStep < 3"
        :label="t('payment.stepper.next')"
        icon="pi pi-arrow-right"
        iconPos="right"
        severity="success"
        class="flex-1 sm:flex-none"
        :disabled="paymentStep === 2 && !canReachCharge"
        data-testid="payment-next"
        @click="paymentStep++"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
// The booking dialog's buttons: delete, repeat, payment, save, and the payment steps.
import { computed, ref } from "vue";
import { useBookingDialog } from "./context";

const {
  t, form, isEditMode, isReadOnly, canSaveBooking, canRepeatBooking, paymentStep,
  canReachCharge, currentTab, showPaymentNav, loading, showRepeatDialog, isMobile, save, confirmDelete,
} = useBookingDialog();

// Phones: repeat and delete, behind the ⋯ button.
const moreMenu = ref<any>(null);
const moreItems = computed(() => [
  ...(!form.value.is_block && !isReadOnly.value
    ? [{ label: t("booking.repeat.button"), icon: "pi pi-copy", disabled: !canRepeatBooking.value, command: () => (showRepeatDialog.value = true) }]
    : []),
  ...(isEditMode.value && !isReadOnly.value
    ? [{ label: t("booking.cancelAppt"), icon: "pi pi-trash", class: "booking-menu-danger", command: () => confirmDelete() }]
    : []),
]);
</script>
