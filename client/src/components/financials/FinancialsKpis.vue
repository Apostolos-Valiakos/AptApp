<template>
  <!-- Row 1: the money of the period at a glance — in, out, and what's left. -->
  <div class="kpi-grid grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6 mb-6" data-testid="kpi-money-row">
    <!-- In: payments received in the period -->
    <button
      type="button"
      class="text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-6 border-l-4 border-l-green-500 hover:shadow-md transition cursor-pointer"
      data-testid="tile-payments"
      @click="openDetails('payments')"
    >
      <div class="flex items-center justify-between mb-3">
        <span class="text-sm font-medium text-gray-500">{{ t("analytics.kpi.periodPayments") }}</span>
        <div class="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
          <i class="pi pi-wallet text-green-600"></i>
        </div>
      </div>
      <Skeleton v-if="loading" height="2.25rem" width="60%" />
      <div v-else class="text-3xl font-bold text-gray-900">{{ formatMoney(finances.total_payments) }}</div>
      <p class="text-xs text-gray-400 mt-2">{{ t("analytics.kpi.periodPaymentsNote") }}</p>
    </button>

    <!-- Out: expenses in the period -->
    <button
      type="button"
      class="text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-6 border-l-4 border-l-red-400 hover:shadow-md transition cursor-pointer"
      data-testid="tile-expenses"
      @click="openDetails('expenses')"
    >
      <div class="flex items-center justify-between mb-3">
        <span class="text-sm font-medium text-gray-500">{{ t("analytics.kpi.periodExpenses") }}</span>
        <div class="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
          <i class="pi pi-receipt text-red-500"></i>
        </div>
      </div>
      <Skeleton v-if="loading" height="2.25rem" width="60%" />
      <div v-else class="text-3xl font-bold text-gray-900">{{ formatMoney(finances.total_expenses) }}</div>
      <p class="text-xs text-gray-400 mt-2">{{ t("analytics.kpi.periodExpensesNote") }}</p>
    </button>

    <!-- Total: payments minus expenses -->
    <button
      type="button"
      class="text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-6 border-l-4 border-l-indigo-500 hover:shadow-md transition cursor-pointer"
      data-testid="tile-net"
      @click="openDetails('net')"
    >
      <div class="flex items-center justify-between mb-3">
        <span class="text-sm font-medium text-gray-500">{{ t("analytics.kpi.netProfit") }}</span>
        <div class="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
          <i class="pi pi-calculator text-indigo-600"></i>
        </div>
      </div>
      <Skeleton v-if="loading" height="2.25rem" width="60%" />
      <div v-else class="text-3xl font-bold" :class="finances.net_profit < 0 ? 'text-red-600' : 'text-gray-900'">
        {{ finances.net_profit < 0 ? "−" : "" }}{{ formatMoney(Math.abs(finances.net_profit)) }}
      </div>
      <p class="text-xs text-gray-400 mt-2">{{ t("analytics.kpi.netProfitNote") }}</p>
    </button>
  </div>

  <!-- Row 2: sales, debts and clients; "collected today" only when the period is today. -->
  <div
    class="kpi-grid grid grid-cols-2 gap-3 sm:gap-6 mb-6"
    :class="periodIsToday ? 'md:grid-cols-3 xl:grid-cols-5' : 'md:grid-cols-4'"
  >
    <!-- Total Sales -->
    <button
      type="button"
      class="text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-6 hover:shadow-md transition cursor-pointer"
      data-testid="tile-sales"
      @click="openDetails('sales')"
    >
      <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">{{ t("analytics.kpi.totalSales") }}</h4>
      <Skeleton v-if="loading" height="1.75rem" width="6rem" />
      <div v-else class="text-2xl font-bold text-gray-800">{{ formatMoney(finances.total_sales) }}</div>
      <p class="text-xs text-gray-400 mt-1">
        {{ t("analytics.kpi.totalSalesNote") }} ({{ formatDate(filters.from) }} – {{ formatDate(filters.to) }})
      </p>
      <p class="text-[10px] text-gray-400 mt-1 leading-tight">* {{ t("analytics.serviceNote") }}</p>
    </button>

    <!-- Collected Today: only when today is the period looked at -->
    <button
      v-if="periodIsToday"
      type="button"
      class="text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-6 hover:shadow-md transition cursor-pointer"
      data-testid="tile-today"
      @click="openDetails('today')"
    >
      <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">{{ t("analytics.kpi.collectedToday") }}</h4>
      <Skeleton v-if="loading" height="1.75rem" width="6rem" />
      <div v-else class="text-2xl font-bold text-gray-800">{{ formatMoney(finances.collected_today) }}</div>
      <p class="text-xs text-gray-400 mt-1">{{ t("analytics.kpi.collectedTodayNote") }}</p>
    </button>

    <!-- Total Business Debt: opens who owes it -->
    <button
      type="button"
      class="text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-6 hover:shadow-md transition cursor-pointer"
      data-testid="tile-debts"
      @click="openDetails('debts')"
    >
      <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">{{ t("analytics.kpi.totalDebt") }}</h4>
      <Skeleton v-if="loading" height="1.75rem" width="6rem" />
      <div v-else class="text-2xl font-bold text-gray-800">{{ formatMoney(finances.total_debt) }}</div>
      <p class="text-xs text-gray-400 mt-1">{{ t("analytics.kpi.totalDebtNote") }}</p>
    </button>

    <!-- Client Retention -->
    <button
      type="button"
      class="text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-6 hover:shadow-md transition cursor-pointer"
      data-testid="tile-retention"
      @click="openDetails('retention')"
    >
      <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">{{ t("analytics.kpi.retention") }}</h4>
      <Skeleton v-if="loading" height="1.75rem" width="4rem" />
      <div v-else class="text-2xl font-bold text-gray-800">{{ analytics.retention_rate }}%</div>
      <p class="text-xs text-gray-400 mt-1">
        {{ t("analytics.kpi.retentionReturning", { returning: analytics.returning_clients, new: analytics.new_clients }) }}
      </p>
    </button>

    <!-- Cancellation Rate -->
    <button
      type="button"
      class="text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-6 hover:shadow-md transition cursor-pointer"
      data-testid="tile-cancellations"
      @click="openDetails('cancellations')"
    >
      <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">{{ t("analytics.kpi.cancellationRate") }}</h4>
      <Skeleton v-if="loading" height="1.75rem" width="4rem" />
      <div v-else class="text-2xl font-bold text-gray-800">{{ analytics.cancellation_rate }}%</div>
      <p class="text-xs text-gray-400 mt-1">{{ t("analytics.kpi.cancellationNote") }}</p>
    </button>
  </div>
</template>

<script setup lang="ts">
// The tiles at the top (most open their list). Row 1 is the period's money:
// payments in, expenses out, net. Row 2: sales, debts, retention and
// cancellations, plus "collected today" when the period is today alone.
import { computed } from "vue";
import { formatMoney } from "../../utils/format";
import { toLocalDateStr } from "../../utils/staffAvailability";
import Skeleton from "primevue/skeleton";
import { useFinancialsPage } from "./context";

const {
  loading, filters, finances, analytics, openDetails, formatDate, t,
} = useFinancialsPage();

// Both dates of the period filter on today ("Σήμερα" sets them so).
const periodIsToday = computed(() => {
  const today = toLocalDateStr(new Date());
  return !!filters.value.from && !!filters.value.to && toLocalDateStr(filters.value.from) === today && toLocalDateStr(filters.value.to) === today;
});
</script>
