<template>
  <div class="space-y-6" data-testid="expense-report">
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div class="flex items-end justify-between flex-wrap gap-3">
        <div>
          <label class="block text-xs font-medium text-gray-500 mb-1">{{ t("expenses.report.month") }}</label>
          <Calendar v-model="month" view="month" dateFormat="mm/yy" showIcon data-testid="report-month" @update:modelValue="load" />
        </div>
        <Button icon="pi pi-file-excel" :label="t('expenses.report.export')" severity="secondary" outlined :disabled="!report" data-testid="report-export" @click="exportExcel" />
      </div>

      <div v-if="report" class="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
        <div class="bg-gray-50 rounded-xl border border-gray-100 p-4">
          <div class="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">{{ monthName(report.month) }}</div>
          <div class="text-2xl font-bold text-gray-900 tabular-nums" data-testid="report-total">{{ formatMoney(current.total) }}</div>
          <div class="text-xs text-gray-500 mt-1">
            {{ t("expenses.kinds.daily") }} {{ formatMoney(current.daily) }} · {{ t("expenses.kinds.monthly") }} {{ formatMoney(current.monthly) }}
          </div>
        </div>
        <div v-for="c in comparisons" :key="c.key" class="bg-gray-50 rounded-xl border border-gray-100 p-4">
          <div class="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">{{ c.label }}</div>
          <div class="text-2xl font-bold text-gray-900 tabular-nums">{{ formatMoney(c.amount) }}</div>
          <div class="text-xs mt-1" :class="changeClass(current.total, c.amount)" :data-testid="`report-change-${c.key}`">{{ changeText(current.total, c.amount) }}</div>
        </div>
      </div>
    </div>

    <div v-if="report" class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h3 class="font-bold text-gray-800 mb-4">{{ t("expenses.report.trend") }}</h3>
      <div style="height: 300px">
        <Chart type="bar" :data="chartData" :options="chartOptions" style="height: 300px" />
      </div>
    </div>

    <div v-if="report" class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h3 class="font-bold text-gray-800 mb-4">{{ t("expenses.report.byCategory") }}</h3>
      <DataTable :value="categoryRows" class="p-datatable-sm" responsiveLayout="scroll" data-testid="report-categories">
        <template #empty><div class="text-center py-8 text-gray-400">{{ t("expenses.report.empty") }}</div></template>
        <Column field="name" :header="t('expenses.category')" />
        <Column :header="monthName(report.month)" bodyClass="tabular-nums font-semibold">
          <template #body="{ data }">{{ formatMoney(data.current) }}</template>
        </Column>
        <Column :header="monthName(previousMonth)" bodyClass="tabular-nums">
          <template #body="{ data }">{{ formatMoney(data.previous) }}</template>
        </Column>
        <Column :header="t('expenses.report.change')">
          <template #body="{ data }"><span class="whitespace-nowrap" :class="changeClass(data.current, data.previous)">{{ changeText(data.current, data.previous) }}</span></template>
        </Column>
        <Column :header="monthName(lastYearMonth)" bodyClass="tabular-nums">
          <template #body="{ data }">{{ formatMoney(data.last_year) }}</template>
        </Column>
        <Column :header="t('expenses.report.change')">
          <template #body="{ data }"><span class="whitespace-nowrap" :class="changeClass(data.current, data.last_year)">{{ changeText(data.current, data.last_year) }}</span></template>
        </Column>
      </DataTable>
    </div>

    <div v-if="report" class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h3 class="font-bold text-gray-800 mb-4">{{ t("expenses.report.perMonth") }}</h3>
      <DataTable :value="monthRows" class="p-datatable-sm" responsiveLayout="scroll" data-testid="report-months">
        <Column :header="t('expenses.report.month')"><template #body="{ data }">{{ monthName(data.month) }}</template></Column>
        <Column :header="t('expenses.kinds.daily')" bodyClass="tabular-nums"><template #body="{ data }">{{ formatMoney(data.daily) }}</template></Column>
        <Column :header="t('expenses.kinds.monthly')" bodyClass="tabular-nums"><template #body="{ data }">{{ formatMoney(data.monthly) }}</template></Column>
        <Column :header="t('expenses.total')" bodyClass="tabular-nums font-semibold"><template #body="{ data }">{{ formatMoney(data.total) }}</template></Column>
        <Column :header="t('expenses.report.changeFromPrevious')">
          <template #body="{ data }">
            <span v-if="data.previous !== null" class="whitespace-nowrap" :class="changeClass(data.total, data.previous)">{{ changeText(data.total, data.previous) }}</span>
            <span v-else class="text-gray-400">—</span>
          </template>
        </Column>
      </DataTable>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useToast } from "primevue/usetoast";
import { api } from "../../api/http";
import { formatMoney } from "../../utils/format";

const { t, locale } = useI18n();
const toast = useToast();

const month = ref<Date>(new Date());
const report = ref<any>(null);

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const shiftMonth = (key: string, by: number) => {
  const [y, m] = key.split("-").map(Number);
  return monthKey(new Date(y, m - 1 + by, 1));
};
const monthName = (key: string, style: "long" | "short" = "long") => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(locale.value === "el" ? "el-GR" : "en-GB", { month: style, year: "numeric" });
};
const previousMonth = computed(() => shiftMonth(report.value.month, -1));
const lastYearMonth = computed(() => shiftMonth(report.value.month, -12));

const withTotal = (m: any) => ({ ...m, total: Number(m.daily) + Number(m.monthly) });
const monthRows = computed(() => {
  const months = (report.value?.months || []).map(withTotal);
  return months.map((m: any, i: number) => ({ ...m, previous: i > 0 ? months[i - 1].total : null })).reverse();
});
const current = computed(() => monthRows.value[0] || { daily: 0, monthly: 0, total: 0 });
const comparisons = computed(() => [
  { key: "previous", label: monthName(previousMonth.value), amount: monthRows.value[1]?.total || 0 },
  { key: "year", label: monthName(lastYearMonth.value), amount: withTotal(report.value.last_year).total },
]);
const categoryRows = computed(() =>
  (report.value?.categories || []).map((c: any) => ({ ...c, name: c.category || t("expenses.noCategory") })),
);

// More spent is what an owner watches for: an arrow and a sign say which way,
// so the colour is never the only signal.
const changeText = (now: number, before: number) => {
  const diff = Math.round((now - before) * 100) / 100;
  if (diff === 0) return t("expenses.report.noChange");
  const money = formatMoney(Math.abs(diff));
  const percent = before > 0 ? ` (${Math.round((Math.abs(diff) / before) * 100)}%)` : "";
  return `${diff > 0 ? "▲ +" : "▼ −"}${money}${percent}`;
};
const changeClass = (now: number, before: number) =>
  now > before ? "text-red-600" : now < before ? "text-emerald-700" : "text-gray-500";

const chartData = computed(() => {
  const months = report.value?.months || [];
  const dataset = (key: "daily" | "monthly", color: string) => ({
    label: t(`expenses.kinds.${key}`),
    data: months.map((m: any) => m[key]),
    backgroundColor: color,
    borderColor: "#ffffff",
    borderWidth: 2,
    borderRadius: 4,
    borderSkipped: false,
    maxBarThickness: 32,
  });
  return {
    labels: months.map((m: any) => monthName(m.month, "short")),
    datasets: [dataset("monthly", "#2a78d6"), dataset("daily", "#eb6834")],
  };
});
const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: "index" as const, intersect: false },
  plugins: {
    legend: { display: true, position: "bottom" as const },
    tooltip: {
      callbacks: {
        label: (c: any) => `${c.dataset.label}: ${formatMoney(c.parsed.y)}`,
        footer: (items: any[]) => `${t("expenses.total")}: ${formatMoney(items.reduce((sum, i) => sum + i.parsed.y, 0))}`,
      },
    },
  },
  scales: {
    x: { stacked: true, grid: { display: false } },
    y: { stacked: true, beginAtZero: true, grid: { color: "#f3f4f6" }, ticks: { callback: (v: any) => formatMoney(Number(v), { compact: true }) } },
  },
}));

let latest = 0;
const load = async () => {
  if (!month.value) return;
  const request = ++latest;
  const params = new URLSearchParams({ month: monthKey(month.value) });
  try {
    const data = await api.get(`/api/v1/reports/expenses?${params}`);
    if (request === latest) report.value = data;
  } catch {
    if (request === latest) toast.add({ severity: "error", summary: t("common.error"), detail: t("expenses.failed"), life: 3500 });
  }
};
const exportExcel = async () => {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      categoryRows.value.map((c: any) => ({
        [t("expenses.category")]: c.name,
        [monthName(report.value.month)]: c.current,
        [monthName(previousMonth.value)]: c.previous,
        [monthName(lastYearMonth.value)]: c.last_year,
      })),
    ),
    t("expenses.report.sheetCategories"),
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      monthRows.value.map((m: any) => ({
        [t("expenses.report.month")]: monthName(m.month),
        [t("expenses.kinds.daily")]: m.daily,
        [t("expenses.kinds.monthly")]: m.monthly,
        [t("expenses.total")]: m.total,
      })),
    ),
    t("expenses.report.sheetMonths"),
  );
  XLSX.writeFile(wb, `expenses_${report.value.month}.xlsx`);
};

onMounted(load);
</script>
