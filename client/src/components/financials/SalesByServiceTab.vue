<template>
  <!-- Pie Chart -->
  <div
    class="mb-6 bg-white rounded-xl border border-gray-100 p-4"
    :style="{ height: isNarrowViewport ? '380px' : '300px' }"
  >
    <Chart
      type="pie"
      :data="serviceChartData"
      :options="pieChartOptions"
      :style="{ height: isNarrowViewport ? '340px' : '260px' }"
    />
  </div>
  <DataTable
    :value="salesReport"
    responsiveLayout="scroll"
    :paginator="true"
    :rows="10"
    class="p-datatable-sm"
  >
    <Column
      field="service_name"
      :header="t('analytics.tables.service')"
    ></Column>
    <Column
      field="count"
      :header="t('analytics.tables.qty')"
      sortable
    ></Column>
    <Column
      field="total_revenue"
      :header="t('analytics.tables.revenue')"
      sortable
    >
      <template #body="slotProps">
        {{ formatMoney(slotProps.data.total_revenue) }}
      </template>
    </Column>
  </DataTable>
</template>

<script setup lang="ts">
// Sales by service, with a pie chart.
import { formatMoney } from "../../utils/format";
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useFinancialsPage } from "./context";

const {
  salesReport, t,
} = useFinancialsPage();

// Service breakdown pie: from salesReport
const serviceChartData = computed(() => ({
  labels: salesReport.value.map((s: any) => s.service_name),
  datasets: [
    {
      data: salesReport.value.map((s: any) => Number(s.total_revenue)),
      backgroundColor: [
        "#8B6F4E",
        "#3b82f6",
        "#10b981",
        "#8b5cf6",
        "#f59e0b",
        "#ef4444",
        "#14b8a6",
        "#f97316",
      ],
    },
  ],
}));

const isNarrowViewport = ref(window.innerWidth < 640);
const updateViewportWidth = () => {
  isNarrowViewport.value = window.innerWidth < 640;
};
onMounted(() => window.addEventListener("resize", updateViewportWidth));
onUnmounted(() => window.removeEventListener("resize", updateViewportWidth));

const pieChartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: isNarrowViewport.value
        ? ("bottom" as const)
        : ("right" as const),
    },
  },
}));
</script>
