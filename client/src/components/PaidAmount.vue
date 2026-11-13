<template>
  <!-- What was paid for an appointment; the total only when it isn't fully
       paid ("€20 of €40"). -->
  <span
    class="tabular-nums font-semibold whitespace-nowrap"
    :class="state === 'paid' ? 'text-green-700' : state === 'partial' ? 'text-amber-700' : 'text-red-600'"
    data-testid="paid-amount"
  >
    {{ state === "paid" ? formatMoney(paidValue) : t("common.paidOf", { paid: formatMoney(paidValue), total: formatMoney(totalValue) }) }}
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { formatMoney } from "../utils/format";
import { paymentStatus, round2 } from "../utils/money";

const props = defineProps<{ paid: number | string | null | undefined; total: number | string | null | undefined }>();
const { t } = useI18n();

const paidValue = computed(() => round2(Number(props.paid) || 0));
const totalValue = computed(() => round2(Number(props.total) || 0));
// Nothing to pay (a free visit) reads as paid.
const state = computed(() => (totalValue.value <= 0 ? "paid" : paymentStatus(totalValue.value, paidValue.value)));
</script>
