<template>
  <div v-if="currentTab === 'Payment'" class="space-y-6">
    <PaymentSteps
      v-if="!isPaymentSettled"
      v-model="paymentStep"
      :canReachCharge="canReachCharge"
      :total="combinedTotalDueNow"
    />

    <!-- Step 1: checkout. A booking with nothing to pay shows only this
         side, and what can still be added to it. -->
    <div v-show="isPaymentSettled || paymentStep === 1" class="space-y-6">
      <PaymentSummary
        :totalDueNow="combinedTotalDueNow"
        :servicesTotal="servicesTotal - hiddenServicesTotal"
        :productsTotal="productsTotal"
        :discountAmount="discountAmount"
        :previousDebt="previousDebt"
        :packagesTotal="pendingPackagesTotal"
        :giftCardsTotal="pendingGiftCardsTotal"
        :sameDayAppointmentsTotal="selectedSiblingsOwedTotal"
        :depositAmount="Math.max(0, form.deposit_amount - hiddenServicesTotal) + selectedSiblingsDepositTotal"
      />

      <!-- Same-day appointments (different staff) — visible to any
           role so staff can see the client's full day at a glance;
           only admin/frontdesk/super_admin can select siblings to
           combine into one payment (canCombineDayPayment). -->
      <div
        v-if="siblingAppointments.length"
        class="p-4 bg-gray-50 rounded-xl border border-gray-100"
      >
        <h4 class="text-sm font-bold text-gray-700 mb-3">
          {{ t("payment.sameDayAppointments") }}
        </h4>
        <div
          v-for="sib in siblingAppointments"
          :key="sib.id"
          class="flex items-center gap-3 py-1.5"
        >
          <Checkbox
            v-model="selectedSiblingIds"
            :value="sib.id"
            :disabled="!canCombineDayPayment || sib.owed <= 0"
          />
          <div class="flex-1 min-w-0 text-sm text-gray-700 truncate">
            {{ sib.services.map((s: any) => s.service_name).join(", ") }}
            <span class="text-gray-400">
              — {{ sib.services[0]?.staff_name }}</span
            >
          </div>
          <div class="text-sm font-semibold text-gray-800 flex-shrink-0">
            {{ formatMoney(sib.owed) }}
            <span
              v-if="sib.payment_status === 'paid'"
              class="text-xs font-normal text-green-600"
              >({{ t("payment.paid") }})</span
            >
          </div>
        </div>
      </div>

      <BookingDiscount
        v-if="!isPaymentSettled"
        v-model="discount"
        :codes="discountCodes"
        :discountAmount="discountAmount"
      />

      <div v-if="canSellExtras">
        <BookingPackages
          ref="packageSaleRef"
          view="sell"
          :clientId="form.client_id"
          :appointmentId="form.id"
          :servicesList="servicesList"
          v-model:pendingPackages="pendingPackages"
          :ensureSaved="ensureSavedForPackage"
        />
        <BookingGiftCards
          ref="giftCardSaleRef"
          :clientId="form.client_id"
          :defaultCustomerName="selectedClient?.full_name"
          v-model:pendingGiftCards="pendingGiftCards"
        />
        <div class="flex flex-wrap items-center gap-2 mt-2">
          <button
            type="button"
            class="text-xs font-bold text-[var(--p-primary-600)] hover:underline flex items-center gap-1"
            data-testid="payment-add-sale"
            @click="saleChoicesOpen = !saleChoicesOpen"
          >
            <i class="pi pi-plus text-[10px]"></i>
            {{ t("payment.stepper.addSale") }}
          </button>
          <template v-if="saleChoicesOpen">
            <Button
              :label="t('payment.stepper.salePackage')"
              icon="pi pi-box"
              size="small"
              severity="secondary"
              outlined
              data-testid="payment-sell-package"
              @click="openSale(packageSaleRef)"
            />
            <Button
              :label="t('payment.stepper.saleGiftCard')"
              icon="pi pi-ticket"
              size="small"
              severity="secondary"
              outlined
              data-testid="payment-sell-gift-card"
              @click="openSale(giftCardSaleRef)"
            />
          </template>
        </div>
      </div>
    </div>

    <!-- Step 2 starts with what the client already has; undoing a used
         visit stays possible once it has paid the whole booking. -->
    <div v-show="isPaymentSettled || paymentStep === 2">
      <BookingPackages
        ref="bookingPackagesRef"
        view="use"
        :clientId="form.client_id"
        :appointmentId="form.id"
        :servicesList="servicesList"
        :pendingPackages="pendingPackages"
        :ensureSaved="ensureSavedForPackage"
        @changed="onPackageChanged"
      />
    </div>

    <BookingPayments
      ref="bookingPaymentsRef"
      :step="paymentStep"
      :totalDueNow="combinedTotalDueNow"
      :currentApptTotal="currentApptTotal"
      :previousDebt="previousDebt"
      :salesTotal="pendingPackagesTotal + pendingGiftCardsTotal"
      :depositAmount="form.deposit_amount + selectedSiblingsDepositTotal"
      :loading="paymentLoading"
      :paidPaymentMethod="shownPaidMethod"
      :clientId="form.client_id"
      :catalogServices="props.services"
      :appointmentServices="servicesList"
      v-model:paymentMethod="selectedPaymentMethod"
      v-model:amountToPay="amountToPayNow"
      v-model:giftCardId="selectedGiftCardId"
      v-model:membershipRedemptions="selectedMembershipRedemptions"
      @pay="recordPayment"
    >
      <template #beforeCharge>
        <div v-if="canChangePrice || (canChangePriceOrRefund && form.deposit_amount > 0)" class="flex flex-wrap gap-3">
          <Button
            v-if="canChangePrice"
            :label="t('priceChange.button')"
            icon="pi pi-pencil"
            severity="info"
            outlined
            class="flex-1 !py-3 !font-semibold !border-2"
            data-testid="payment-price-change"
            @click="priceChangeVisible = true"
          />
          <Button
            v-if="form.deposit_amount > 0"
            :label="t('refund.button')"
            icon="pi pi-replay"
            severity="danger"
            outlined
            class="flex-1 !py-3 !font-semibold !border-2"
            @click="refundVisible = true"
          />
          <Button
            v-if="form.deposit_amount > 0"
            :label="t('changeMethod.button')"
            icon="pi pi-arrow-right-arrow-left"
            severity="secondary"
            outlined
            class="flex-1 !py-3 !font-semibold !border-2"
            @click="changeMethodVisible = true"
          />
        </div>
      </template>
    </BookingPayments>

    <!-- Nothing to pay: the price and what was paid can still be corrected. -->
    <div v-if="isPaymentSettled && canChangePriceOrRefund" class="flex flex-wrap gap-3">
      <Button
        v-if="canChangePrice"
        :label="t('priceChange.button')"
        icon="pi pi-pencil"
        severity="info"
        outlined
        class="flex-1 !py-3 !font-semibold !border-2"
        data-testid="payment-price-change"
        @click="priceChangeVisible = true"
      />
      <Button
        v-if="form.deposit_amount > 0"
        :label="t('refund.button')"
        icon="pi pi-replay"
        severity="danger"
        outlined
        class="flex-1 !py-3 !font-semibold !border-2"
        data-testid="payment-refund"
        @click="refundVisible = true"
      />
      <Button
        v-if="form.deposit_amount > 0"
        :label="t('changeMethod.button')"
        icon="pi pi-arrow-right-arrow-left"
        severity="secondary"
        outlined
        class="flex-1 !py-3 !font-semibold !border-2"
        data-testid="payment-change-method"
        @click="changeMethodVisible = true"
      />
    </div>

    <PriceChangeDialog
      v-model:visible="priceChangeVisible"
      :appointmentId="form.id"
      :currentTotal="currentApptTotal + selectedSiblingsTotal"
      :otherAppointmentIds="selectedSiblingIds"
      :ensureSaved="ensureSavedForPackage"
      @changed="onPriceChangedInPayment"
    />
    <RefundDialog
      v-model:visible="refundVisible"
      :appointmentId="form.id"
      :maxRefundable="form.deposit_amount"
      :ensureSaved="ensureSavedForPackage"
      @refunded="onRefunded"
    />
    <ChangePaymentMethodDialog
      v-model:visible="changeMethodVisible"
      :appointmentId="form.id"
      @changed="onPaymentMethodChanged"
    />
  </div>
</template>

<script setup lang="ts">
// The payment tab: checkout, the way of paying, charging, price changes and refunds.
import BookingPayments from "../bookingPayments.vue";
import BookingDiscount from "../BookingDiscount.vue";
import BookingPackages from "../BookingPackages.vue";
import BookingGiftCards from "../BookingGiftCards.vue";
import PriceChangeDialog from "../PriceChangeDialog.vue";
import RefundDialog from "../RefundDialog.vue";
import ChangePaymentMethodDialog from "../ChangePaymentMethodDialog.vue";
import { ref } from "vue";
import PaymentSteps from "../PaymentSteps.vue";
import PaymentSummary from "../PaymentSummary.vue";
import { formatMoney } from "../../../utils/format";
import { useBookingDialog } from "./context";

const {
  props, t, form, servicesList, selectedClient, siblingAppointments, selectedSiblingIds, canCombineDayPayment,
  selectedSiblingsTotal, discount, discountCodes, pendingPackages, pendingPackagesTotal, pendingGiftCards, pendingGiftCardsTotal, hiddenServicesTotal,
  shownPaidMethod, paymentStep, paymentLoading, amountToPayNow, selectedPaymentMethod, selectedGiftCardId, selectedMembershipRedemptions, saleChoicesOpen,
  priceChangeVisible, refundVisible, bookingPaymentsRef, bookingPackagesRef, packageSaleRef, giftCardSaleRef, canChangePriceOrRefund, canChangePrice,
  canSellExtras, isPaymentSettled, canReachCharge, currentTab, selectedSiblingsOwedTotal, selectedSiblingsDepositTotal, servicesTotal,
  productsTotal, discountAmount, currentApptTotal, previousDebt, combinedTotalDueNow, ensureSavedForPackage, openSale,
  onPackageChanged, onRefunded, onPaymentMethodChanged, onPriceChangedInPayment, recordPayment,
} = useBookingDialog();
const changeMethodVisible = ref(false);
</script>
