<template>
  <!-- Revenue Over Time Chart -->
  <div
    class="mb-6 bg-white rounded-xl border border-gray-100 p-4"
    style="height: 280px"
  >
    <h4 class="text-sm font-bold text-gray-600 mb-3">
      {{ t("analytics.charts.revenueOverTime") }}
    </h4>
    <Chart
      type="line"
      :data="revenueChartData"
      :options="chartOptions"
      style="height: 220px"
    />
  </div>

  <!-- CSV Export -->
  <div class="flex justify-end mb-4">
    <Button
      :label="t('analytics.exportCSV')"
      icon="pi pi-download"
      size="small"
      severity="secondary"
      @click="exportPaymentsCSV"
    />
  </div>

  <DataTable
    :value="paymentsReport"
    responsiveLayout="scroll"
    :paginator="true"
    :rows="15"
    class="p-datatable-sm"
    sortField="created_at"
    :sortOrder="-1"
  >
    <Column
      field="created_at"
      :header="t('analytics.tables.date')"
      sortable
    >
      <template #body="slotProps">
        {{
          new Date(slotProps.data.created_at).toLocaleDateString("el-GR")
        }}
        <span class="text-gray-400 text-xs">
          {{
            new Date(slotProps.data.created_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })
          }}
        </span>
      </template>
    </Column>
    <Column :header="t('analytics.tables.client')">
      <template #body="slotProps">
        <span class="font-medium"
          >{{ slotProps.data.first_name }}
          {{ slotProps.data.last_name }}</span
        >
      </template>
    </Column>
    <Column field="payment_method" :header="t('analytics.tables.method')">
      <template #body="slotProps">
        <span
          v-if="slotProps.data.transaction_type === 'refund'"
          class="mr-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-red-100 text-red-700"
        >
          {{ t('analytics.tables.refund') }}
        </span>
        <span
          :class="[
            'px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase',
            getMethodBadge(slotProps.data.payment_method),
          ]"
        >
          {{
            t(
              `common.paymentMethod.${slotProps.data.payment_method}`,
              slotProps.data.payment_method,
            )
          }}
        </span>
        <span
          v-if="slotProps.data.split_group_id"
          class="ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-purple-100 text-purple-700"
          v-tooltip.top="t('analytics.tables.splitPaymentTooltip')"
        >
          {{ t('analytics.tables.splitPayment') }}
        </span>
      </template>
    </Column>
    <Column :header="t('analytics.tables.reason')">
      <template #body="slotProps">
        <span class="text-xs text-gray-500">{{ slotProps.data.reason || '—' }}</span>
      </template>
    </Column>
    <Column
      field="amount"
      :header="t('analytics.tables.amount')"
      sortable
    >
      <template #body="slotProps">
        <span
          :class="Number(slotProps.data.amount) < 0 ? 'font-bold text-red-700' : 'font-bold text-green-700'"
          >{{ Number(slotProps.data.amount) < 0 ? '−' : '+' }}{{ formatMoney(Math.abs(slotProps.data.amount)) }}</span
        >
      </template>
    </Column>
  </DataTable>

  <!-- Checkout Price Changes -->
  <h4 class="text-sm font-bold text-gray-600 mt-8 mb-3">
    {{ t('analytics.tables.priceChangesTitle') }}
  </h4>
  <DataTable
    :value="priceAdjustmentsReport"
    responsiveLayout="scroll"
    :paginator="true"
    :rows="10"
    class="p-datatable-sm"
    sortField="created_at"
    :sortOrder="-1"
  >
    <template #empty>
      <p class="text-sm text-gray-400 py-4">{{ t('analytics.tables.priceChangesEmpty') }}</p>
    </template>
    <Column field="created_at" :header="t('analytics.tables.date')" sortable>
      <template #body="slotProps">
        {{ new Date(slotProps.data.created_at).toLocaleDateString('el-GR') }}
        <span class="text-gray-400 text-xs">
          {{
            new Date(slotProps.data.created_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })
          }}
        </span>
      </template>
    </Column>
    <Column :header="t('analytics.tables.client')">
      <template #body="slotProps">
        <span class="font-medium">{{ slotProps.data.first_name }} {{ slotProps.data.last_name }}</span>
      </template>
    </Column>
    <Column :header="t('analytics.tables.reason')">
      <template #body="slotProps">
        <span class="text-xs text-gray-500">{{ slotProps.data.reason }}</span>
      </template>
    </Column>
    <Column :header="t('analytics.tables.oldTotal')">
      <template #body="slotProps">
        {{ formatMoney(slotProps.data.old_total) }}
      </template>
    </Column>
    <Column :header="t('analytics.tables.newTotal')">
      <template #body="slotProps">
        <b>{{ formatMoney(slotProps.data.new_total) }}</b>
      </template>
    </Column>
  </DataTable>
</template>

<script setup lang="ts">
// Every payment in the period (with a chart over time and a CSV export), and checkout price changes.
import { saveBlob } from "../../api/http";
import { formatMoney } from "../../utils/format";
import { computed } from "vue";
import { useFinancialsPage } from "./context";

const {
  analytics, paymentsReport, priceAdjustmentsReport, chartOptions, t,
} = useFinancialsPage();

// ── Chart computed data ──────────────────────────────────────────────────────

// Revenue over time: aggregate paymentsReport by date
const revenueChartData = computed(() => {
  const map: Record<string, number> = {};
  paymentsReport.value.forEach((p: any) => {
    const dateKey = new Date(p.created_at).toLocaleDateString("el-GR", {
      day: "2-digit",
      month: "2-digit",
    });
    map[dateKey] = (map[dateKey] || 0) + Number(p.amount);
  });
  const sorted = Object.entries(map).sort();
  return {
    labels: sorted.map(([d]) => d),
    datasets: [
      {
        label: t("analytics.charts.revenueDataset"),
        data: sorted.map(([, v]) => v),
        fill: true,
        tension: 0.4,
        backgroundColor: "rgba(99, 102, 241, 0.1)",
        borderColor: "var(--p-primary-color)",
        pointBackgroundColor: "var(--p-primary-color)",
        pointRadius: 4,
      },
    ],
  };
});

// CSV export for payments log
const exportPaymentsCSV = () => {
  if (!paymentsReport.value.length) return;
  const headers = ["Date", "Time", "Client", "Method", "Amount (EUR)"];
  const rows = paymentsReport.value.map((p: any) => {
    const d = new Date(p.created_at);
    return [
      d.toLocaleDateString("el-GR"),
      d.toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" }),
      `${p.first_name} ${p.last_name}`,
      p.payment_method === "CASH" ? "cash" : p.payment_method,
      Number(p.amount).toFixed(2),
    ];
  });
  const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
  saveBlob(new Blob([csv], { type: "text/csv;charset=utf-8;" }), `payments-export-${new Date().toISOString().split("T")[0]}.csv`);
};

// Payment method badge helper
const getMethodBadge = (method: string) => {
  const map: Record<string, string> = {
    cash: "bg-green-100 text-green-700",
    CASH: "bg-green-100 text-green-700",
    card: "bg-blue-100 text-blue-700",
    "bank-transfer": "bg-purple-100 text-purple-700",
    migration: "bg-gray-100 text-gray-600",
  };
  return map[method] || "bg-gray-100 text-gray-600";
};
</script>
