<template>
  <div class="bg-white border border-gray-100 rounded-2xl shadow-sm p-6" data-testid="daily-reconciliation">
    <div class="flex items-center justify-between flex-wrap gap-2 mb-3">
      <h2 class="font-bold text-gray-800">{{ t("dailyReport.reconciliation.title") }}</h2>
      <Tag
        v-if="result"
        :value="balanced ? t('dailyReport.reconciliation.balanced') : t('dailyReport.reconciliation.unbalanced')"
        :severity="balanced ? 'success' : 'danger'"
        data-testid="reconciliation-status"
      />
    </div>

    <!-- Sales and debts are Analytics figures: the password is retyped first, as
         on the Analytics pages. -->
    <SensitiveGate :cancelable="false">
    <p v-if="failed" class="text-sm text-red-600">{{ t("dailyReport.reconciliation.failed") }}</p>
    <div v-else-if="result" class="text-sm">
      <div class="max-w-xl">
        <div class="flex justify-between py-1"><span class="text-gray-600">{{ t("dailyReport.reconciliation.sales") }}</span><span class="tabular-nums font-medium" data-testid="reconciliation-sales">{{ formatMoney(result.sales) }}</span></div>
        <div class="flex justify-between py-1"><span class="text-gray-600">− {{ t("dailyReport.reconciliation.uncollected") }}</span><span class="tabular-nums font-medium">{{ formatMoney(result.uncollected) }}</span></div>
        <div class="flex justify-between py-1 border-t border-gray-100 font-semibold"><span>= {{ t("dailyReport.reconciliation.expected") }}</span><span class="tabular-nums" data-testid="reconciliation-expected">{{ formatMoney(result.expected) }}</span></div>
        <div class="flex justify-between py-1"><span class="text-gray-600">{{ t("dailyReport.reconciliation.payments") }}</span><span class="tabular-nums font-medium" data-testid="reconciliation-payments">{{ formatMoney(result.payments) }}</span></div>
        <div class="flex justify-between py-1 border-t border-gray-100 font-semibold"><span>{{ t("dailyReport.reconciliation.delta") }}</span><span class="tabular-nums" data-testid="reconciliation-delta">{{ signed(result.delta) }}</span></div>
      </div>

      <div v-if="result.lines.length" class="mt-4">
        <div class="text-xs uppercase tracking-wider text-gray-400 font-bold mb-1">{{ t("dailyReport.reconciliation.explainedBy") }}</div>
        <div v-for="l in result.lines" :key="l.key" class="border-b border-gray-50 last:border-0" :data-testid="`reconciliation-line-${l.key}`">
          <button type="button" class="w-full flex justify-between items-center gap-3 py-1.5 text-left hover:bg-gray-50 rounded" @click="toggle(l.key)">
            <span class="flex items-center gap-2 min-w-0">
              <i class="pi text-[10px] text-gray-400" :class="open[l.key] ? 'pi-chevron-down' : 'pi-chevron-right'"></i>
              <span class="text-gray-700">{{ t(`dailyReport.reconciliation.lines.${l.key}`) }}</span>
              <span class="text-xs text-gray-400">({{ l.rows.length }})</span>
            </span>
            <span class="tabular-nums whitespace-nowrap" :class="l.amount < 0 ? 'text-red-600' : 'text-gray-900'">{{ signed(l.amount) }}</span>
          </button>
          <table v-if="open[l.key]" class="w-full text-xs text-gray-600 mb-2 ml-5">
            <tbody>
              <tr v-for="row in l.rows" :key="row.id">
                <td class="py-0.5 pr-3 whitespace-nowrap tabular-nums">{{ when(row) }}</td>
                <td class="py-0.5 pr-3">{{ who(row) }}</td>
                <td class="py-0.5 pr-3">{{ methodLabel(row.payment_method) }}</td>
                <td class="py-0.5 text-right tabular-nums whitespace-nowrap pr-6">{{ formatMoney(row.amount) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div
        class="flex justify-between items-center mt-3 pt-2 border-t border-gray-100 font-semibold max-w-xl"
        :class="balanced ? 'text-green-700' : 'text-red-600'"
        data-testid="reconciliation-unexplained"
      >
        <span>{{ t("dailyReport.reconciliation.unexplained") }}</span>
        <span class="tabular-nums">{{ signed(result.unexplained) }}</span>
      </div>
      <p v-if="result.paid_later.amount" class="text-xs text-gray-500 mt-2" data-testid="reconciliation-paid-later">
        {{ t("dailyReport.reconciliation.paidLater", { amount: formatMoney(result.paid_later.amount) }) }}
      </p>
      <p class="text-xs text-gray-400 mt-3">{{ t("dailyReport.reconciliation.note") }}</p>
    </div>
    </SensitiveGate>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { api } from "../api/http";
import { formatMoney } from "../utils/format";
import { reauthToken } from "../utils/reauth";
import SensitiveGate from "./SensitiveGate.vue";

// Does the day's money add up? Sales − what was still owed at the day's end,
// against the day's payments, with each difference explained (server:
// domain/reconciliation.js). Admins only; the Daily Report leaves the whole
// card out while amounts are hidden (Ctrl+1 / Ctrl+8).
const props = defineProps<{ day: string; reloadKey?: number }>();
const { t, te, locale } = useI18n();

const result = ref<any>(null);
const failed = ref(false);
const open = ref<Record<string, boolean>>({});
const balanced = computed(() => !!result.value && Math.abs(result.value.unexplained) < 0.005);

const signed = (n: number) => (n > 0 ? `+${formatMoney(n)}` : formatMoney(n));
const toggle = (key: string) => (open.value = { ...open.value, [key]: !open.value[key] });
const methodLabel = (m: string | null) => (!m ? "" : te(`common.paymentMethod.${m}`) ? t(`common.paymentMethod.${m}`) : m);
const who = (row: any) => row.client || [row.first_name, row.last_name].filter(Boolean).join(" ") || "—";
const when = (row: any) =>
  new Date(row.created_at).toLocaleString(locale.value, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// Quick clicks through the days: only the latest day's answer is shown.
let latest = 0;
const load = async () => {
  const request = ++latest;
  if (!reauthToken.value) return;
  failed.value = false;
  try {
    const data = await api.get(`/api/v1/reports/daily/reconciliation?date=${props.day}`);
    if (request === latest) {
      result.value = data;
      open.value = {};
    }
  } catch {
    if (request === latest) {
      result.value = null;
      failed.value = true;
    }
  }
};
watch(() => [props.day, props.reloadKey, reauthToken.value], load, { immediate: true });
</script>
