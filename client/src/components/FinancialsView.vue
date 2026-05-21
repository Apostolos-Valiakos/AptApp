<template>
  <div class="p-6 max-w-7xl mx-auto">
    <!-- Page Header -->
    <div class="mb-8">
      <h1 class="text-2xl font-bold text-gray-900">{{ t('analytics.title') }}</h1>
      <p class="text-gray-500 mt-1 text-sm">{{ t('analytics.subtitle') }}</p>
    </div>

    <!-- Filter Bar -->
    <div class="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm mb-6">
      <h2 class="text-sm font-bold text-gray-700 mb-3">{{ t('analytics.filter.title') }}</h2>
      <div class="flex flex-col lg:flex-row gap-4 lg:items-end">
        <div class="flex-grow w-full">
          <div class="flex flex-col sm:flex-row gap-3">
            <div class="flex-1">
              <Calendar
                v-model="filters.from"
                :placeholder="t('analytics.filter.from')"
                showIcon
                class="w-full"
                dateFormat="dd/mm/yy"
              />
            </div>
            <div class="flex-1">
              <Calendar
                v-model="filters.to"
                :placeholder="t('analytics.filter.to')"
                showIcon
                class="w-full"
                dateFormat="dd/mm/yy"
              />
            </div>
            <Button
              :label="t('analytics.filter.today')"
              icon="pi pi-calendar"
              class="p-button-outlined w-full sm:w-auto flex-shrink-0"
              @click="setToday"
            />
          </div>
        </div>

        <div class="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
          <Button
            :label="t('analytics.filter.apply')"
            icon="pi pi-filter"
            class="w-full sm:w-auto"
            @click="fetchAllReports"
            :loading="loading"
          />
          <Button
            :label="t('analytics.filter.clear')"
            icon="pi pi-times"
            class="p-button-outlined p-button-secondary w-full sm:w-auto"
            @click="clearFilters"
          />
        </div>
      </div>
    </div>

    <!-- KPI Cards Row 1 — 4 uniform cards -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
      <!-- Total Sales -->
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 border-l-4 border-l-indigo-500">
        <div class="flex items-center justify-between mb-3">
          <span class="text-sm font-medium text-gray-500">{{ t('analytics.kpi.totalSales') }}</span>
          <div class="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
            <i class="pi pi-chart-line text-indigo-600"></i>
          </div>
        </div>
        <div class="text-3xl font-bold text-gray-900">€{{ formatCurrency(finances.total_sales) }}</div>
        <p class="text-xs text-gray-400 mt-2">
          {{ t('analytics.kpi.totalSalesNote') }} ({{ formatDate(filters.from) }} – {{ formatDate(filters.to) }})
        </p>
        <p class="text-[10px] text-gray-400 mt-1 leading-tight">
          * {{ t('analytics.serviceNote') }}
        </p>
      </div>

      <!-- Collected Today -->
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 border-l-4 border-l-green-500">
        <div class="flex items-center justify-between mb-3">
          <span class="text-sm font-medium text-gray-500">{{ t('analytics.kpi.collectedToday') }}</span>
          <div class="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
            <i class="pi pi-wallet text-green-600"></i>
          </div>
        </div>
        <div class="text-3xl font-bold text-gray-900">€{{ formatCurrency(finances.collected_today) }}</div>
        <p class="text-xs text-gray-400 mt-2">{{ t('analytics.kpi.collectedTodayNote') }}</p>
        <p class="text-[10px] text-gray-400 mt-1 leading-tight">
          * {{ t('analytics.kpi.collectedTodayNote') }}
        </p>
      </div>

      <!-- Total Business Debt -->
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 border-l-4 border-l-red-400">
        <div class="flex items-center justify-between mb-3">
          <span class="text-sm font-medium text-gray-500">{{ t('analytics.kpi.totalDebt') }}</span>
          <div class="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
            <i class="pi pi-exclamation-circle text-red-500"></i>
          </div>
        </div>
        <div class="text-3xl font-bold text-gray-900">€{{ formatCurrency(finances.total_debt) }}</div>
        <p class="text-xs text-gray-400 mt-2">{{ t('analytics.kpi.totalDebtNote') }}</p>
      </div>

      <!-- Client Retention -->
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 border-l-4 border-l-blue-500">
        <div class="flex items-center justify-between mb-3">
          <span class="text-sm font-medium text-gray-500">{{ t('analytics.kpi.retention') }}</span>
          <div class="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <i class="pi pi-users text-blue-600"></i>
          </div>
        </div>
        <div class="text-3xl font-bold text-gray-900">{{ analytics.retention_rate }}%</div>
        <p class="text-xs text-gray-400 mt-2">
          {{ t('analytics.kpi.retentionReturning', { returning: analytics.returning_clients, new: analytics.new_clients }) }}
        </p>
      </div>
    </div>

    <!-- KPI Cards Row 2 — 2 mini cards, unified style -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
      <!-- Cancellation Rate -->
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div class="flex items-center justify-between">
          <div>
            <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">{{ t('analytics.kpi.cancellationRate') }}</h4>
            <div class="text-2xl font-bold text-gray-800">{{ analytics.cancellation_rate }}%</div>
            <div class="text-xs text-gray-400 mt-1">{{ t('analytics.kpi.cancellationNote') }}</div>
          </div>
          <div class="w-12 h-12 rounded-full flex items-center justify-center bg-gray-100 text-gray-500">
            <i class="pi pi-ban text-xl"></i>
          </div>
        </div>
      </div>

      <!-- Selected Period Payments -->
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div class="flex items-center justify-between">
          <div>
            <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">{{ t('analytics.kpi.periodPayments') }}</h4>
            <div class="text-2xl font-bold text-gray-800">€{{ formatCurrency(finances.total_payments) }}</div>
            <div class="text-xs text-gray-400 mt-1">{{ t('analytics.kpi.periodPaymentsNote') }}</div>
          </div>
          <div class="w-12 h-12 rounded-full flex items-center justify-center bg-green-50 text-green-600">
            <i class="pi pi-wallet text-xl"></i>
          </div>
        </div>
      </div>
    </div>

    <!-- Tab Section -->
    <TabView class="bg-white rounded-2xl shadow-sm border border-gray-100 p-2">
      <!-- Tab: Client Demographics -->
      <TabPanel :header="t('analytics.tabs.demographics')">
        <div class="p-6 max-w-7xl mx-auto">
          <div class="grid grid-cols-1 gap-6 mb-8">
            <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <h2 class="text-xl font-bold mb-6 text-gray-800">{{ t('analytics.demographics.title') }}</h2>
              <ClientDemographics
                :clients="clientsReport"
                @view-group="openAgeGroupDialog"
              />
            </div>
          </div>

          <Dialog
            v-model:visible="displayGroupDialog"
            :header="t('analytics.demographics.clientsLabel', { name: selectedGroupName })"
            modal
            :style="{ width: '50vw' }"
            :breakpoints="{ '960px': '90vw' }"
          >
            <DataTable
              :value="selectedGroupClients"
              paginator
              :rows="10"
              stripedRows
              class="p-datatable-sm"
              responsiveLayout="scroll"
            >
              <Column :header="t('analytics.demographics.clientCol')">
                <template #body="slotProps">
                  <div class="flex flex-col">
                    <span class="font-bold">{{ slotProps.data.first_name }} {{ slotProps.data.last_name }}</span>
                    <span class="text-xs text-gray-500">{{ slotProps.data.email }}</span>
                  </div>
                </template>
              </Column>
              <Column field="phone" header="Τηλέφωνο"></Column>
              <Column field="appointment_count" :header="t('analytics.demographics.apptsCol')" sortable class="text-center"></Column>
              <Column :header="t('analytics.demographics.balanceCol')">
                <template #body="slotProps">
                  <span :class="Number(slotProps.data.outstanding_balance || 0) > 0 ? 'text-red-600 font-bold' : ''">
                    €{{ formatCurrency(slotProps.data.outstanding_balance || 0) }}
                  </span>
                </template>
              </Column>
              <Column :header="t('analytics.demographics.servicesCol')">
                <template #body="slotProps">
                  <div class="flex gap-1">
                    <span
                      v-if="slotProps.data.ergotherapia"
                      class="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-bold"
                    >ΕΡΓΟ</span>
                    <span
                      v-if="slotProps.data.physiotherapia"
                      class="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-bold"
                    >ΦΥΣΙΟ</span>
                  </div>
                </template>
              </Column>
            </DataTable>
          </Dialog>
        </div>
      </TabPanel>

      <!-- Tab: Service Performance (All Statuses) -->
      <TabPanel :header="t('analytics.tabs.servicePerformance')">
        <DataTable
          :value="serviceSummaryReport"
          responsiveLayout="scroll"
          :paginator="true"
          :rows="10"
          class="p-datatable-sm"
          stripedRows
        >
          <Column field="service_name" :header="t('analytics.tables.serviceName')"></Column>
          <Column field="service_count" :header="t('analytics.tables.quantity')" sortable class="text-center">
            <template #body="slotProps">
              <span class="font-medium">{{ slotProps.data.service_count }} {{ t('analytics.demographics.apptsCol') }}</span>
            </template>
          </Column>
          <Column field="total_paid" :header="t('analytics.tables.moneyPaid')" sortable>
            <template #body="slotProps">
              <span class="text-green-700 font-bold">€{{ formatCurrency(slotProps.data.total_paid) }}</span>
            </template>
          </Column>
          <Column field="total_owed" :header="t('analytics.tables.moneyOwed')" sortable>
            <template #body="slotProps">
              <span :class="Number(slotProps.data.total_owed) > 0 ? 'text-red-600 font-bold' : 'text-gray-400'">
                €{{ formatCurrency(slotProps.data.total_owed) }}
              </span>
            </template>
          </Column>
          <Column field="total_value" :header="t('analytics.tables.totalValue')" sortable>
            <template #body="slotProps">
              <span class="text-gray-600 italic">€{{ formatCurrency(slotProps.data.total_value) }}</span>
            </template>
          </Column>
        </DataTable>
        <p class="text-[10px] text-gray-500 mt-2 italic">
          * {{ t('analytics.serviceNote') }}
        </p>
      </TabPanel>

      <!-- Tab: Sales by Service -->
      <TabPanel :header="t('analytics.tabs.sales')">
        <!-- Pie Chart -->
        <div class="mb-6 bg-white rounded-xl border border-gray-100 p-4" style="height: 300px">
          <Chart type="pie" :data="serviceChartData" :options="pieChartOptions" style="height: 260px" />
        </div>
        <DataTable
          :value="salesReport"
          responsiveLayout="scroll"
          :paginator="true"
          :rows="10"
          class="p-datatable-sm"
        >
          <Column field="service_name" :header="t('analytics.tables.service')"></Column>
          <Column field="count" :header="t('analytics.tables.qty')" sortable></Column>
          <Column field="total_revenue" :header="t('analytics.tables.revenue')" sortable>
            <template #body="slotProps">
              €{{ formatCurrency(slotProps.data.total_revenue) }}
            </template>
          </Column>
        </DataTable>
      </TabPanel>

      <!-- Tab: Staff Performance -->
      <TabPanel :header="t('analytics.tabs.staffPerformance')">
        <!-- Bar Chart -->
        <div class="mb-6 bg-white rounded-xl border border-gray-100 p-4" style="height: 280px">
          <Chart type="bar" :data="staffChartData" :options="chartOptions" style="height: 230px" />
        </div>
        <DataTable
          :value="analytics.staff_utilization"
          responsiveLayout="scroll"
          :paginator="true"
          :rows="10"
          class="p-datatable-sm"
        >
          <Column field="name" :header="t('analytics.tables.staffMember')"></Column>
          <Column field="appt_count" :header="t('analytics.tables.appointments')" sortable></Column>
          <Column field="hours_booked" :header="t('analytics.tables.hoursBooked')" sortable>
            <template #body="slotProps">
              {{ Number(slotProps.data.hours_booked).toFixed(1) }}h
            </template>
          </Column>
          <Column field="total_revenue" :header="t('analytics.tables.revenueGenerated')" sortable>
            <template #body="slotProps">
              €{{ formatCurrency(slotProps.data.total_revenue || 0) }}
            </template>
          </Column>
        </DataTable>
      </TabPanel>

      <!-- Tab: Payments Log -->
      <TabPanel :header="t('analytics.tabs.paymentsLog')">
        <!-- Revenue Over Time Chart -->
        <div class="mb-6 bg-white rounded-xl border border-gray-100 p-4" style="height: 280px">
          <h4 class="text-sm font-bold text-gray-600 mb-3">{{ t('analytics.charts.revenueOverTime') }}</h4>
          <Chart type="line" :data="revenueChartData" :options="chartOptions" style="height: 220px" />
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
          <Column field="created_at" :header="t('analytics.tables.date')" sortable>
            <template #body="slotProps">
              {{ new Date(slotProps.data.created_at).toLocaleDateString('el-GR') }}
              <span class="text-gray-400 text-xs">
                {{ new Date(slotProps.data.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
              </span>
            </template>
          </Column>
          <Column :header="t('analytics.tables.client')">
            <template #body="slotProps">
              <span class="font-medium">{{ slotProps.data.first_name }} {{ slotProps.data.last_name }}</span>
            </template>
          </Column>
          <Column field="payment_method" :header="t('analytics.tables.method')">
            <template #body="slotProps">
              <span :class="['px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase', getMethodBadge(slotProps.data.payment_method)]">
                {{ t(`common.paymentMethod.${slotProps.data.payment_method}`, slotProps.data.payment_method) }}
              </span>
            </template>
          </Column>
          <Column field="amount" :header="t('analytics.tables.amount')" sortable>
            <template #body="slotProps">
              <span class="font-bold text-green-700">+€{{ formatCurrency(slotProps.data.amount) }}</span>
            </template>
          </Column>
        </DataTable>
      </TabPanel>
    </TabView>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useToast } from "primevue/usetoast";
import TabView from "primevue/tabview";
import TabPanel from "primevue/tabpanel";
import ClientDemographics from "./ClientDemographics.vue";

const { t } = useI18n();
const toast = useToast();
const loading = ref(false);
const serviceSummaryReport = ref([]);

// Initialize filters with Current Month
const today = new Date();
const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

const filters = ref<{ from: Date | null; to: Date | null }>({
  from: firstDay,
  to: lastDay,
});

// Data State
const finances = ref({
  total_sales: 0,
  total_payments: 0,
  collected_today: 0,
  total_debt: 0,
});

const analytics = ref<any>({
  cancellation_rate: 0,
  retention_rate: 0,
  new_clients: 0,
  returning_clients: 0,
  staff_utilization: [],
});

const salesReport = ref<any[]>([]);
const staffReport = ref([]);
const paymentsReport = ref<any[]>([]);
const appointmentsReport = ref([]);
const clientsReport = ref<any[]>([]);
const displayGroupDialog = ref(false);
const selectedGroupName = ref("");
const selectedGroupClients = ref([]);

const openAgeGroupDialog = (data: any) => {
  selectedGroupName.value = data.label;
  selectedGroupClients.value = data.clients;
  displayGroupDialog.value = true;
};

const formatCurrency = (val: any) => {
  return Number(val).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatDate = (d: Date | null) => {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
};

const clearFilters = () => {
  filters.value.from = null;
  filters.value.to = null;
  fetchAllReports();
};

const setToday = () => {
  const now = new Date();
  filters.value.from = now;
  filters.value.to = now;
  fetchAllReports();
};

const fetchAllReports = async () => {
  loading.value = true;
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const params = new URLSearchParams();

  if (filters.value.from) {
    const fromDate = new Date(filters.value.from);
    fromDate.setHours(0, 0, 0, 0);
    params.append("from", fromDate.toISOString());
  }

  if (filters.value.to) {
    const toDate = new Date(filters.value.to);
    toDate.setHours(23, 59, 59, 999);
    params.append("to", toDate.toISOString());
  }

  const qs = params.toString() ? `?${params.toString()}` : "";

  try {
    const [
      finRes,
      salesRes,
      staffRes,
      payRes,
      apptRes,
      anaRes,
      clientsRes,
      serviceSumRes,
    ] = await Promise.all([
      fetch(`/api/v1/reports/finances${qs}`, { headers }),
      fetch(`/api/v1/reports/sales${qs}`, { headers }),
      fetch(`/api/v1/reports/staff${qs}`, { headers }),
      fetch(`/api/v1/reports/payments${qs}`, { headers }),
      fetch(`/api/v1/reports/appointments${qs}`, { headers }),
      fetch(`/api/v1/reports/analytics${qs}`, { headers }),
      fetch(`/api/v1/reports/clients`, { headers }),
      fetch(`/api/v1/reports/service-summary${qs}`, { headers }),
    ]);

    if (finRes.status === 401) throw new Error("unauthorized");

    if (!finRes.ok || !salesRes.ok || !anaRes.ok || !payRes.ok || !clientsRes.ok) {
      throw new Error("loadFailed");
    }
    if (!serviceSumRes.ok) throw new Error("loadFailed");

    const finData = await finRes.json();
    const salesData = await salesRes.json();
    const anaData = await anaRes.json();

    finances.value = finData;
    salesReport.value = salesData.details || [];
    analytics.value = anaData;
    staffReport.value = await staffRes.json();
    paymentsReport.value = await payRes.json();
    appointmentsReport.value = await apptRes.json();
    clientsReport.value = await clientsRes.json();
    serviceSummaryReport.value = await serviceSumRes.json();
  } catch (err: any) {
    console.error(err);
    const toastKey = err.message === "unauthorized"
      ? "analytics.toast.unauthorized"
      : "analytics.toast.loadFailed";
    toast.add({
      severity: "error",
      summary: t(toastKey),
      detail: t(toastKey),
      life: 4000,
    });
  } finally {
    loading.value = false;
  }
};

// ── Chart computed data ──────────────────────────────────────────────────────

// Revenue over time: aggregate paymentsReport by date
const revenueChartData = computed(() => {
  const map: Record<string, number> = {};
  paymentsReport.value.forEach((p: any) => {
    const dateKey = new Date(p.created_at).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit' });
    map[dateKey] = (map[dateKey] || 0) + Number(p.amount);
  });
  const sorted = Object.entries(map).sort();
  return {
    labels: sorted.map(([d]) => d),
    datasets: [{
      label: t('analytics.charts.revenueDataset'),
      data: sorted.map(([, v]) => v),
      fill: true,
      tension: 0.4,
      backgroundColor: 'rgba(99, 102, 241, 0.1)',
      borderColor: 'var(--p-primary-color)',
      pointBackgroundColor: 'var(--p-primary-color)',
      pointRadius: 4,
    }],
  };
});

// Service breakdown pie: from salesReport
const serviceChartData = computed(() => ({
  labels: salesReport.value.map((s: any) => s.service_name),
  datasets: [{
    data: salesReport.value.map((s: any) => Number(s.total_revenue)),
    backgroundColor: [
      '#ff93d4', '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#14b8a6', '#f97316',
    ],
  }],
}));

// Staff performance bar chart
const staffChartData = computed(() => ({
  labels: analytics.value.staff_utilization?.map((s: any) => s.name) || [],
  datasets: [
    {
      label: t('analytics.tables.appointments'),
      data: analytics.value.staff_utilization?.map((s: any) => Number(s.appt_count)) || [],
      backgroundColor: 'var(--p-primary-color)',
      borderRadius: 6,
    },
    {
      label: t('analytics.tables.revenueGenerated'),
      data: analytics.value.staff_utilization?.map((s: any) => Number(s.total_revenue || 0)) || [],
      backgroundColor: '#10b981',
      borderRadius: 6,
    },
  ],
}));

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: true, position: 'bottom' as const },
  },
  scales: {
    y: { beginAtZero: true, grid: { color: '#f3f4f6' } },
    x: { grid: { display: false } },
  },
}));

const pieChartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'right' as const },
  },
}));

// CSV export for payments log
const exportPaymentsCSV = () => {
  if (!paymentsReport.value.length) return;
  const headers = ['Date', 'Time', 'Client', 'Method', 'Amount (EUR)'];
  const rows = paymentsReport.value.map((p: any) => {
    const d = new Date(p.created_at);
    return [
      d.toLocaleDateString('el-GR'),
      d.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' }),
      `${p.first_name} ${p.last_name}`,
      p.payment_method,
      Number(p.amount).toFixed(2),
    ];
  });
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `payments-export-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

// Payment method badge helper
const getMethodBadge = (method: string) => {
  const map: Record<string, string> = {
    cash: 'bg-green-100 text-green-700',
    card: 'bg-blue-100 text-blue-700',
    'bank-transfer': 'bg-purple-100 text-purple-700',
    migration: 'bg-gray-100 text-gray-600',
  };
  return map[method] || 'bg-gray-100 text-gray-600';
};

onMounted(fetchAllReports);
</script>
