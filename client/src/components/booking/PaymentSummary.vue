<template>
  <div
    class="bg-gradient-to-br from-gray-900 to-gray-800 text-white rounded-xl p-8 shadow-xl relative overflow-hidden"
  >
    <div class="flex justify-between items-center mb-1 opacity-70">
      <span class="text-xs uppercase tracking-wider font-bold">{{
        t("payment.totalBalance")
      }}</span>
    </div>
    <div
      class="text-5xl font-extrabold mb-6 tracking-tight"
      :class="{ 'animate-pulse': totalDueNow > 0 }"
    >
      {{ formatMoney(totalDueNow) }}
    </div>
    <div class="space-y-0 border-t border-gray-700 pt-4 text-sm opacity-90">
      <div class="flex justify-between py-2 border-b border-gray-700/50">
        <span>{{ t("payment.appointmentCost") }}</span>
        <span class="font-medium">{{ formatMoney(servicesTotal) }}</span>
      </div>
      <div
        v-if="productsTotal > 0"
        class="flex justify-between py-2 border-b border-gray-700/50"
      >
        <span>{{ t("payment.products") }}</span>
        <span class="font-medium text-amber-300"
          >+ {{ formatMoney(productsTotal) }}</span
        >
      </div>
      <div
        v-if="discountAmount > 0"
        class="flex justify-between py-2 border-b border-gray-700/50"
      >
        <span>{{ t("payment.discount") }}</span>
        <span class="font-medium text-green-300"
          >- {{ formatMoney(discountAmount) }}</span
        >
      </div>
      <div
        v-if="sameDayAppointmentsTotal > 0"
        class="flex justify-between py-2 border-b border-gray-700/50"
      >
        <span>{{ t("payment.sameDayAppointments") }}</span>
        <span class="font-medium text-amber-300"
          >+ {{ formatMoney(sameDayAppointmentsTotal) }}</span
        >
      </div>
      <div
        v-if="previousDebt > 0"
        class="flex justify-between py-2 border-b border-gray-700/50"
      >
        <span>{{ t("payment.previousDebt") }}</span>
        <span class="font-medium text-red-300"
          >+ {{ formatMoney(previousDebt) }}</span
        >
      </div>
      <div
        v-else-if="previousDebt < 0"
        class="flex justify-between py-2 border-b border-gray-700/50"
      >
        <span>{{ t("payment.clientCredit") }}</span>
        <span class="font-medium text-green-300">{{ formatMoney(previousDebt) }}</span>
      </div>
      <div
        v-if="packagesTotal > 0"
        class="flex justify-between py-2 border-b border-gray-700/50"
      >
        <span>{{ t("payment.newPackages") }}</span>
        <span class="font-medium text-amber-300"
          >+ {{ formatMoney(packagesTotal) }}</span
        >
      </div>
      <div
        v-if="giftCardsTotal > 0"
        class="flex justify-between py-2 border-b border-gray-700/50"
      >
        <span>{{ t("payment.newGiftCards") }}</span>
        <span class="font-medium text-amber-300"
          >+ {{ formatMoney(giftCardsTotal) }}</span
        >
      </div>
      <div class="flex justify-between pt-2">
        <span>{{ t("payment.paid") }}</span>
        <span>- {{ formatMoney(depositAmount) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { formatMoney } from "../../utils/format";

const { t } = useI18n();

defineProps<{
  totalDueNow: number;
  servicesTotal: number;
  productsTotal: number;
  discountAmount: number;
  previousDebt: number;
  packagesTotal: number;
  giftCardsTotal: number;
  sameDayAppointmentsTotal: number;
  depositAmount: number;
}>();
</script>
