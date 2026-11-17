<template>
  <!-- KPI Cards Row 1 — 4 uniform cards -->
  <div class="kpi-grid grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6 mb-6">
    <!-- Total Sales -->
    <button
      type="button"
      class="text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-6 border-l-4 border-l-indigo-500 hover:shadow-md transition cursor-pointer"
      data-testid="tile-sales"
      @click="openDetails('sales')"
    >
      <div class="flex items-center justify-between mb-3">
        <span class="text-sm font-medium text-gray-500">{{
          t("analytics.kpi.totalSales")
        }}</span>
        <div
          class="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center"
        >
          <i class="pi pi-chart-line text-indigo-600"></i>
        </div>
      </div>
      <Skeleton v-if="loading" height="2.25rem" width="60%" />
      <div v-else class="text-3xl font-bold text-gray-900">
        {{ formatMoney(finances.total_sales) }}
      </div>
      <p class="text-xs text-gray-400 mt-2">
        {{ t("analytics.kpi.totalSalesNote") }} ({{
          formatDate(filters.from)
        }}
        – {{ formatDate(filters.to) }})
      </p>
      <p class="text-[10px] text-gray-400 mt-1 leading-tight">
        * {{ t("analytics.serviceNote") }}
      </p>
    </button>

    <!-- Collected Today -->
    <button
      type="button"
      class="text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-6 border-l-4 border-l-green-500 hover:shadow-md transition cursor-pointer"
      data-testid="tile-today"
      @click="openDetails('today')"
    >
      <div class="flex items-center justify-between mb-3">
        <span class="text-sm font-medium text-gray-500">{{
          t("analytics.kpi.collectedToday")
        }}</span>
        <div
          class="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center"
        >
          <i class="pi pi-wallet text-green-600"></i>
        </div>
      </div>
      <Skeleton v-if="loading" height="2.25rem" width="60%" />
      <div v-else class="text-3xl font-bold text-gray-900">
        {{ formatMoney(finances.collected_today) }}
      </div>
      <p class="text-xs text-gray-400 mt-2">
        {{ t("analytics.kpi.collectedTodayNote") }}
      </p>
      <p class="text-[10px] text-gray-400 mt-1 leading-tight">
        * {{ t("analytics.kpi.collectedTodayNote") }}
      </p>
    </button>

    <!-- Total Business Debt: opens who owes it -->
    <button
      type="button"
      class="text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-6 border-l-4 border-l-red-400 hover:shadow-md hover:border-red-200 transition cursor-pointer"
      data-testid="tile-debts"
      @click="openDetails('debts')"
    >
      <div class="flex items-center justify-between mb-3">
        <span class="text-sm font-medium text-gray-500">{{
          t("analytics.kpi.totalDebt")
        }}</span>
        <div
          class="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center"
        >
          <i class="pi pi-exclamation-circle text-red-500"></i>
        </div>
      </div>
      <Skeleton v-if="loading" height="2.25rem" width="60%" />
      <div v-else class="text-3xl font-bold text-gray-900">
        {{ formatMoney(finances.total_debt) }}
      </div>
      <p class="text-xs text-gray-400 mt-2">
        {{ t("analytics.kpi.totalDebtNote") }}
      </p>
    </button>

    <!-- Client Retention -->
    <button
      type="button"
      class="text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-6 border-l-4 border-l-blue-500 hover:shadow-md transition cursor-pointer"
      data-testid="tile-retention"
      @click="openDetails('retention')"
    >
      <div class="flex items-center justify-between mb-3">
        <span class="text-sm font-medium text-gray-500">{{
          t("analytics.kpi.retention")
        }}</span>
        <div
          class="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center"
        >
          <i class="pi pi-users text-blue-600"></i>
        </div>
      </div>
      <Skeleton v-if="loading" height="2.25rem" width="40%" />
      <div v-else class="text-3xl font-bold text-gray-900">
        {{ analytics.retention_rate }}%
      </div>
      <p class="text-xs text-gray-400 mt-2">
        {{
          t("analytics.kpi.retentionReturning", {
            returning: analytics.returning_clients,
            new: analytics.new_clients,
          })
        }}
      </p>
    </button>
  </div>

  <!-- KPI Cards Row 2 — 4 mini cards, unified style -->
  <div class="kpi-grid grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-6 mb-6">
    <!-- Cancellation Rate -->
    <button
      type="button"
      class="text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-6 hover:shadow-md transition cursor-pointer"
      data-testid="tile-cancellations"
      @click="openDetails('cancellations')"
    >
      <div class="flex items-center justify-between">
        <div>
          <h4
            class="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1"
          >
            {{ t("analytics.kpi.cancellationRate") }}
          </h4>
          <Skeleton v-if="loading" height="1.75rem" width="4rem" />
          <div v-else class="text-2xl font-bold text-gray-800">
            {{ analytics.cancellation_rate }}%
          </div>
          <div class="text-xs text-gray-400 mt-1">
            {{ t("analytics.kpi.cancellationNote") }}
          </div>
        </div>
        <div
          class="w-12 h-12 rounded-full flex items-center justify-center bg-gray-100 text-gray-500"
        >
          <i class="pi pi-ban text-xl"></i>
        </div>
      </div>
    </button>

    <!-- Selected Period Payments -->
    <button
      type="button"
      class="text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-6 hover:shadow-md transition cursor-pointer"
      data-testid="tile-payments"
      @click="openDetails('payments')"
    >
      <div class="flex items-center justify-between">
        <div>
          <h4
            class="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1"
          >
            {{ t("analytics.kpi.periodPayments") }}
          </h4>
          <Skeleton v-if="loading" height="1.75rem" width="6rem" />
          <div v-else class="text-2xl font-bold text-gray-800">
            {{ formatMoney(finances.total_payments) }}
          </div>
          <div class="text-xs text-gray-400 mt-1">
            {{ t("analytics.kpi.periodPaymentsNote") }}
          </div>
        </div>
        <div
          class="w-12 h-12 rounded-full flex items-center justify-center bg-green-50 text-green-600"
        >
          <i class="pi pi-wallet text-xl"></i>
        </div>
      </div>
    </button>

    <!-- Expenses in the selected period -->
    <button
      type="button"
      class="text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-6 hover:shadow-md transition cursor-pointer"
      data-testid="tile-expenses"
      @click="openDetails('expenses')"
    >
      <div class="flex items-center justify-between">
        <div>
          <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">
            {{ t("analytics.kpi.periodExpenses") }}
          </h4>
          <Skeleton v-if="loading" height="1.75rem" width="6rem" />
          <div v-else class="text-2xl font-bold text-gray-800">
            {{ formatMoney(finances.total_expenses) }}
          </div>
          <div class="text-xs text-gray-400 mt-1">
            {{ t("analytics.kpi.periodExpensesNote") }}
          </div>
        </div>
        <div class="w-12 h-12 rounded-full flex items-center justify-center bg-red-50 text-red-600">
          <i class="pi pi-receipt text-xl"></i>
        </div>
      </div>
    </button>

    <!-- Net: collected minus expenses -->
    <button
      type="button"
      class="text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-6 hover:shadow-md transition cursor-pointer"
      data-testid="tile-net"
      @click="openDetails('net')"
    >
      <div class="flex items-center justify-between">
        <div>
          <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">
            {{ t("analytics.kpi.netProfit") }}
          </h4>
          <Skeleton v-if="loading" height="1.75rem" width="6rem" />
          <div
            v-else
            class="text-2xl font-bold"
            :class="finances.net_profit < 0 ? 'text-red-600' : 'text-gray-800'"
          >
            {{ finances.net_profit < 0 ? "−" : "" }}{{ formatMoney(Math.abs(finances.net_profit)) }}
          </div>
          <div class="text-xs text-gray-400 mt-1">
            {{ t("analytics.kpi.netProfitNote") }}
          </div>
        </div>
        <div class="w-12 h-12 rounded-full flex items-center justify-center bg-indigo-50 text-indigo-600">
          <i class="pi pi-calculator text-xl"></i>
        </div>
      </div>
    </button>
  </div>

</template>

<script setup lang="ts">
// The money tiles at the top: sales, collected, debts, retention, cancellations, payments, expenses and net (most open their list).
import { formatMoney } from "../../utils/format";
import Skeleton from "primevue/skeleton";
import { useFinancialsPage } from "./context";

const {
  loading, today, filters, finances, analytics, openDetails, formatDate, t,
} = useFinancialsPage();
</script>
