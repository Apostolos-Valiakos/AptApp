<template>
  <!-- Bar Chart -->
  <div
    class="mb-6 bg-white rounded-xl border border-gray-100 p-4"
    style="height: 280px"
  >
    <Chart
      type="bar"
      :data="staffChartData"
      :options="chartOptions"
      style="height: 230px"
    />
  </div>
  <!-- A row opens the lines behind its numbers. -->
  <DataTable
    :value="analytics.staff_utilization"
    responsiveLayout="scroll"
    class="p-datatable-sm"
    :rowClass="() => 'cursor-pointer'"
    data-testid="staff-performance-table"
    @row-click="(e: any) => openStaff(e.data)"
  >
    <Column
      field="name"
      :header="t('analytics.tables.staffMember')"
    ></Column>
    <Column
      field="appt_count"
      :header="t('analytics.tables.appointments')"
      sortable
    ></Column>
    <Column
      field="days_worked"
      :header="t('analytics.tables.daysWorked')"
      sortable
    >
      <template #body="slotProps">
        {{ Number(slotProps.data.days_worked || 0) }}
      </template>
    </Column>
    <!-- Appointments ÷ days with appointments, e.g. 79 ÷ 20 = 4.0 -->
    <Column
      field="avg_per_day"
      :header="t('analytics.tables.avgPerDay')"
      sortable
      :sortField="numericSort('avg_per_day')"
    >
      <template #body="slotProps">
        <span v-tooltip.top="`${slotProps.data.appt_count} ÷ ${slotProps.data.days_worked}`">
          {{ Number(slotProps.data.avg_per_day || 0).toFixed(1) }}
        </span>
      </template>
    </Column>
    <Column
      field="hours_booked"
      :header="t('analytics.tables.hoursBooked')"
      sortable
    >
      <template #body="slotProps">
        {{ Number(slotProps.data.hours_booked).toFixed(1) }}h
      </template>
    </Column>
    <Column
      field="total_revenue"
      :header="t('analytics.tables.revenueGenerated')"
      sortable
    >
      <template #body="slotProps">
        {{ formatMoney(slotProps.data.total_revenue || 0) }}
      </template>
    </Column>
  </DataTable>
  <p class="text-xs text-gray-400 mt-2">{{ t("analytics.staffBreakdown.hint") }}</p>

  <Dialog
    v-model:visible="breakdownVisible"
    modal
    :header="breakdownStaff ? t('analytics.staffBreakdown.title', { name: breakdownStaff.name }) : ''"
    :style="{ width: '56rem', maxWidth: '95vw' }"
    data-testid="staff-breakdown"
  >
    <div v-if="breakdownLoading" class="text-center py-8"><i class="pi pi-spin pi-spinner text-gray-400"></i></div>
    <div v-else class="space-y-3">
      <!-- The table's numbers, worked out from the lines below. -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
        <div class="rounded-lg bg-gray-50 p-2">
          <div class="text-gray-500 text-xs">{{ t("analytics.tables.appointments") }}</div>
          <div class="font-bold tabular-nums">{{ lines.length }}</div>
        </div>
        <div class="rounded-lg bg-gray-50 p-2">
          <div class="text-gray-500 text-xs">{{ t("analytics.tables.daysWorked") }}</div>
          <div class="font-bold tabular-nums">{{ days.length }}</div>
        </div>
        <div class="rounded-lg bg-gray-50 p-2">
          <div class="text-gray-500 text-xs">{{ t("analytics.tables.hoursBooked") }}</div>
          <div class="font-bold tabular-nums">{{ (totalMinutes / 60).toFixed(1) }}h <span class="font-normal text-gray-500">({{ totalMinutes }}′)</span></div>
        </div>
        <div class="rounded-lg bg-gray-50 p-2">
          <div class="text-gray-500 text-xs">{{ t("analytics.tables.revenueGenerated") }}</div>
          <div class="font-bold tabular-nums">{{ formatMoney(totalRevenue) }}</div>
        </div>
      </div>
      <p v-if="flaggedCount" class="text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2" data-testid="staff-breakdown-flagged">
        <i class="pi pi-exclamation-triangle mr-1"></i>{{ t("analytics.staffBreakdown.flagged", { n: flaggedCount }) }}
      </p>
      <DataTable :value="lines" class="p-datatable-sm" :rowClass="(l: any) => (flagsOf(l).length ? 'bg-amber-50' : '')" scrollable scrollHeight="55vh">
        <Column :header="t('analytics.staffBreakdown.when')">
          <template #body="{ data }">
            <span class="tabular-nums whitespace-nowrap">{{ formatDate(data.start_time, locale, "weekdayTime") }}</span>
          </template>
        </Column>
        <Column :header="t('analytics.staffBreakdown.client')" field="client" />
        <Column :header="t('analytics.staffBreakdown.service')">
          <template #body="{ data }">
            {{ data.service }}<span v-if="data.variation_name"> — {{ data.variation_name }}</span>
            <span v-if="data.combo_name" class="text-gray-400"> ({{ data.combo_name }})</span>
            <div v-if="flagsOf(data).length" class="flex flex-wrap gap-1 mt-0.5">
              <span v-for="f in flagsOf(data)" :key="f" class="px-1.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800" data-testid="staff-breakdown-flag">{{ t(`analytics.staffBreakdown.flags.${f}`) }}</span>
            </div>
          </template>
        </Column>
        <Column :header="t('analytics.staffBreakdown.minutes')">
          <template #body="{ data }"><span class="tabular-nums">{{ data.minutes }}′</span></template>
        </Column>
        <Column :header="t('analytics.staffBreakdown.revenue')">
          <template #body="{ data }"><span class="tabular-nums">{{ formatMoney(data.revenue) }}</span></template>
        </Column>
      </DataTable>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
// Each staff member's bookings, sales and days worked, with a bar chart. A
// row opens the lines behind its numbers, so a total that looks wrong (8
// sauna visits at €5 but €30 in all) can be traced to the lines causing it.
import { formatDate, formatMoney } from "../../utils/format";
import { computed, ref } from "vue";
import { api } from "../../api/http";
import { useNotify } from "../../composables/useNotify";
import { useFinancialsPage } from "./context";

const {
  numericSort, analytics, chartOptions, t, locale, lastQuery,
} = useFinancialsPage();
const notify = useNotify();

const breakdownVisible = ref(false);
const breakdownLoading = ref(false);
const breakdownStaff = ref<any>(null);
const lines = ref<any[]>([]);
const openStaff = async (row: any) => {
  if (!row?.id) return;
  breakdownStaff.value = row;
  breakdownVisible.value = true;
  breakdownLoading.value = true;
  lines.value = [];
  try {
    // The same period and cash/card filters as the table.
    lines.value = await api.get(`/api/v1/reports/staff-performance/${row.id}${lastQuery.value || ""}`);
  } catch (e: any) {
    notify.error(e.message);
  } finally {
    breakdownLoading.value = false;
  }
};
const days = computed(() => [...new Set(lines.value.map((l) => l.day))]);
const totalMinutes = computed(() => lines.value.reduce((n, l) => n + (Number(l.minutes) || 0), 0));
const totalRevenue = computed(() => lines.value.reduce((n, l) => n + (Number(l.revenue) || 0), 0));
// What makes a line worth a look: nothing charged, very short (a stray line
// or a resize slip), a combination's own line next to its parts, or part of
// its price hidden by the cash/card filters.
const flagsOf = (l: any) => [
  ...(Number(l.revenue) === 0 ? ["zero"] : []),
  ...(Number(l.minutes) < 15 ? ["short"] : []),
  ...(l.is_combo_line ? ["comboLine"] : []),
  ...(Number(l.revenue) > 0 && Number(l.revenue) < Number(l.charged) ? ["filtered"] : []),
];
const flaggedCount = computed(() => lines.value.filter((l) => flagsOf(l).length).length);

// Staff performance bar chart
const staffChartData = computed(() => ({
  labels: analytics.value.staff_utilization?.map((s: any) => s.name) || [],
  datasets: [
    {
      label: t("analytics.tables.appointments"),
      data:
        analytics.value.staff_utilization?.map((s: any) =>
          Number(s.appt_count),
        ) || [],
      backgroundColor: "var(--p-primary-color)",
      borderRadius: 6,
    },
    {
      label: t("analytics.tables.revenueGenerated"),
      data:
        analytics.value.staff_utilization?.map((s: any) =>
          Number(s.total_revenue || 0),
        ) || [],
      backgroundColor: "#10b981",
      borderRadius: 6,
    },
  ],
}));
</script>
