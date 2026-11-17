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
  <DataTable
    :value="analytics.staff_utilization"
    responsiveLayout="scroll"
    class="p-datatable-sm"
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
</template>

<script setup lang="ts">
// Each staff member's bookings, sales and days worked, with a bar chart.
import { formatMoney } from "../../utils/format";
import { computed } from "vue";
import { useFinancialsPage } from "./context";

const {
  numericSort, analytics, chartOptions, t,
} = useFinancialsPage();

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
