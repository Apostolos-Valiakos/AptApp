<template>
  <div class="p-6 max-w-7xl mx-auto">
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-[var(--p-primary-400)] text-primary">
        Financial & Analytics
      </h1>
      <p class="text-primary-700">
        Performance metrics, revenue, and client retention.
      </p>
    </div>

    <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6">
      <div class="flex flex-col lg:flex-row gap-4 lg:items-end">
        <div class="flex-grow w-full">
          <label class="block text-sm font-bold text-gray-700 mb-2">
            Date Range (Affects Sales & Reports)
          </label>

          <div class="flex flex-col sm:flex-row gap-3">
            <div class="flex-1">
              <Calendar
                v-model="filters.from"
                placeholder="From Date"
                showIcon
                class="w-full"
                dateFormat="dd/mm/yy"
              />
            </div>
            <div class="flex-1">
              <Calendar
                v-model="filters.to"
                placeholder="To Date"
                showIcon
                class="w-full"
                dateFormat="dd/mm/yy"
              />
            </div>
            <Button
              label="Today"
              icon="pi pi-calendar"
              class="p-button-outlined w-full sm:w-auto flex-shrink-0"
              @click="setToday"
            />
          </div>
        </div>

        <div class="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
          <Button
            label="Apply"
            icon="pi pi-filter"
            class="w-full sm:w-auto"
            @click="fetchAllReports"
            :loading="loading"
          />
          <Button
            label="Clear"
            icon="pi pi-times"
            class="p-button-outlined p-button-secondary w-full sm:w-auto"
            @click="clearFilters"
          />
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
      <div
        class="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl p-6 text-white shadow-lg"
      >
        <div class="text-indigo-100 font-medium mb-1 flex justify-between">
          <span>Total Sales</span>
          <i class="pi pi-calendar"></i>
        </div>
        <div class="text-3xl font-bold">
          €{{ formatCurrency(finances.total_sales) }}
        </div>
        <div class="text-xs text-indigo-200 mt-2">
          Completed revenue ({{ formatDate(filters.from) }} -
          {{ formatDate(filters.to) }})
        </div>
        <div class="text-[10px] text-indigo-100 mt-1 opacity-80 leading-tight">
          * Value of services finished in this period (includes services that
          haven't been paid yet)
        </div>
      </div>

      <div
        class="bg-white rounded-xl p-6 border border-gray-200 shadow-sm border-l-4 border-l-green-500"
      >
        <div class="text-gray-500 font-medium mb-1">Collected Today</div>
        <div class="text-3xl font-bold text-green-700">
          €{{ formatCurrency(finances.collected_today) }}
        </div>
        <div class="text-xs text-gray-400 mt-2">Cash flow received today</div>
        <div class="text-[10px] text-gray-500 mt-1 leading-tight">
          * Actual payments (deposits + debts) received today
        </div>
      </div>

      <div
        class="bg-white rounded-xl p-6 border border-gray-200 shadow-sm border-l-4 border-l-red-500"
      >
        <div class="text-gray-500 font-medium mb-1">Total Business Debt</div>
        <div class="text-3xl font-bold text-red-600">
          €{{ formatCurrency(finances.total_debt) }}
        </div>
        <div class="text-xs text-gray-400 mt-2">All client balances</div>
      </div>

      <div
        class="bg-white rounded-xl p-6 border border-gray-200 shadow-sm border-l-4 border-l-blue-500"
      >
        <div class="text-gray-500 font-medium mb-1">Client Retention</div>
        <div class="text-3xl font-bold text-blue-600">
          {{ analytics.retention_rate }}%
        </div>
        <div class="text-xs text-gray-400 mt-2">
          {{ analytics.returning_clients }} Returning vs
          {{ analytics.new_clients }} New
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
      <div
        class="bg-white p-4 rounded-xl border border-gray-200 flex items-center justify-between"
      >
        <div>
          <h4 class="text-gray-500 font-bold text-sm uppercase">
            Cancellation Rate
          </h4>
          <div class="text-2xl font-bold text-gray-800">
            {{ analytics.cancellation_rate }}%
          </div>
          <div class="text-xs text-gray-400">Cancelled or No-show</div>
        </div>
        <div
          class="h-12 w-12 rounded-full flex items-center justify-center bg-gray-100 text-gray-500"
        >
          <i class="pi pi-ban text-xl"></i>
        </div>
      </div>

      <div
        class="bg-white p-4 rounded-xl border border-gray-200 flex items-center justify-between"
      >
        <div>
          <h4 class="text-gray-500 font-bold text-sm uppercase">
            Selected Period Payments
          </h4>
          <div class="text-2xl font-bold text-gray-800">
            €{{ formatCurrency(finances.total_payments) }}
          </div>
          <div class="text-xs text-gray-400">Collected in selected dates</div>
        </div>
        <div
          class="h-12 w-12 rounded-full flex items-center justify-center bg-green-50 text-green-600"
        >
          <i class="pi pi-wallet text-xl"></i>
        </div>
      </div>
    </div>

    <TabView class="bg-white rounded-xl shadow-sm border border-gray-200 p-2">
      <TabPanel header="Client Demographics">
        <div class="p-6 max-w-7xl mx-auto">
          <div class="grid grid-cols-1 gap-6 mb-8">
            <div
              class="bg-white p-6 rounded-xl shadow-sm border border-gray-200"
            >
              <h2 class="text-xl font-bold mb-6 text-gray-800">
                Client Demographics
              </h2>
              <ClientDemographics
                :clients="clientsReport"
                @view-group="openAgeGroupDialog"
              />
            </div>
          </div>

          <Dialog
            v-model:visible="displayGroupDialog"
            :header="'Clients: ' + selectedGroupName"
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
              <Column header="Client">
                <template #body="slotProps">
                  <div class="flex flex-col">
                    <span class="font-bold"
                      >{{ slotProps.data.first_name }}
                      {{ slotProps.data.last_name }}</span
                    >
                    <span class="text-xs text-gray-500">{{
                      slotProps.data.email
                    }}</span>
                  </div>
                </template>
              </Column>

              <Column field="phone" header="Phone"></Column>

              <Column
                field="appointment_count"
                header="Appts"
                sortable
                class="text-center"
              ></Column>

              <Column header="Balance">
                <template #body="slotProps">
                  <span
                    :class="
                      Number(slotProps.data.outstanding_balance || 0) > 0
                        ? 'text-red-600 font-bold'
                        : ''
                    "
                  >
                    €{{
                      formatCurrency(slotProps.data.outstanding_balance || 0)
                    }}
                  </span>
                </template>
              </Column>

              <Column header="Services">
                <template #body="slotProps">
                  <div class="flex gap-1">
                    <span
                      v-if="slotProps.data.ergotherapia"
                      class="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-bold"
                    >
                      ΕΡΓΟ
                    </span>
                    <span
                      v-if="slotProps.data.physiotherapia"
                      class="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-bold"
                    >
                      ΦΥΣΙΟ
                    </span>
                  </div>
                </template>
              </Column>
            </DataTable>
          </Dialog>
        </div>
      </TabPanel>

      <TabPanel header="Sales by Service">
        <DataTable
          :value="salesReport"
          responsiveLayout="scroll"
          :paginator="true"
          :rows="10"
          class="p-datatable-sm"
        >
          <Column field="service_name" header="Service"></Column>
          <Column field="count" header="Qty" sortable></Column>
          <Column field="total_revenue" header="Revenue" sortable>
            <template #body="slotProps">
              €{{ formatCurrency(slotProps.data.total_revenue) }}
            </template>
          </Column>
        </DataTable>
      </TabPanel>

      <TabPanel header="Staff Performance">
        <DataTable
          :value="analytics.staff_utilization"
          responsiveLayout="scroll"
          :paginator="true"
          :rows="10"
          class="p-datatable-sm"
        >
          <Column field="name" header="Staff Member"></Column>
          <Column field="appt_count" header="Appointments" sortable></Column>
          <Column field="hours_booked" header="Hours Booked" sortable>
            <template #body="slotProps">
              {{ Number(slotProps.data.hours_booked).toFixed(1) }}h
            </template>
          </Column>
          <Column field="total_revenue" header="Revenue Generated" sortable>
            <template #body="slotProps">
              €{{ formatCurrency(slotProps.data.total_revenue || 0) }}
            </template>
          </Column>
        </DataTable>
      </TabPanel>

      <TabPanel header="Payments Log">
        <DataTable
          :value="paymentsReport"
          responsiveLayout="scroll"
          :paginator="true"
          :rows="15"
          class="p-datatable-sm"
          sortField="created_at"
          :sortOrder="-1"
        >
          <Column field="created_at" header="Date" sortable>
            <template #body="slotProps">
              {{ new Date(slotProps.data.created_at).toLocaleDateString() }}
              <span class="text-gray-400 text-xs">{{
                new Date(slotProps.data.created_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              }}</span>
            </template>
          </Column>
          <Column header="Client">
            <template #body="slotProps">
              <span class="font-medium"
                >{{ slotProps.data.first_name }}
                {{ slotProps.data.last_name }}</span
              >
            </template>
          </Column>
          <Column field="payment_method" header="Method">
            <template #body="slotProps">
              <span
                class="uppercase text-xs font-bold px-2 py-1 bg-gray-100 rounded text-gray-600"
              >
                {{ slotProps.data.payment_method }}
              </span>
            </template>
          </Column>
          <Column field="amount" header="Amount" sortable>
            <template #body="slotProps">
              <span class="font-bold text-green-700"
                >+€{{ formatCurrency(slotProps.data.amount) }}</span
              >
            </template>
          </Column>
        </DataTable>
      </TabPanel>
    </TabView>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useToast } from "primevue/usetoast";
import TabView from "primevue/tabview";
import TabPanel from "primevue/tabpanel";
import ClientDemographics from "./ClientDemographics.vue";

const toast = useToast();
const loading = ref(false);

// Initialize filters with Current Month
const today = new Date();
const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

// FIX 1: Explicitly define type so 'null' is allowed
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

const analytics = ref({
  cancellation_rate: 0,
  retention_rate: 0,
  new_clients: 0,
  returning_clients: 0,
  staff_utilization: [],
});

const salesReport = ref([]);
const staffReport = ref([]);
const paymentsReport = ref([]);
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
    fromDate.setHours(0, 0, 0, 0); // Start of day
    params.append("from", fromDate.toISOString());
  }

  if (filters.value.to) {
    const toDate = new Date(filters.value.to);
    toDate.setHours(23, 59, 59, 999); // End of day
    params.append("to", toDate.toISOString());
  }

  const qs = params.toString() ? `?${params.toString()}` : "";

  try {
    const [finRes, salesRes, staffRes, payRes, apptRes, anaRes, clientsRes] =
      await Promise.all([
        fetch(`/api/v1/reports/finances${qs}`, { headers }),
        fetch(`/api/v1/reports/sales${qs}`, { headers }),
        fetch(`/api/v1/reports/staff${qs}`, { headers }),
        fetch(`/api/v1/reports/payments${qs}`, { headers }),
        fetch(`/api/v1/reports/appointments${qs}`, { headers }),
        fetch(`/api/v1/reports/analytics${qs}`, { headers }),
        fetch(`/api/v1/reports/clients`, { headers }),
      ]);

    if (finRes.status === 401) throw new Error("Unauthorized");

    if (
      !finRes.ok ||
      !salesRes.ok ||
      !anaRes.ok ||
      !payRes.ok ||
      !clientsRes.ok
    ) {
      throw new Error("Failed to fetch reports");
    }

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
  } catch (err: any) {
    console.error(err);
    toast.add({
      severity: "error",
      summary: "Error",
      detail: err.message,
      life: 4000,
    });
  } finally {
    loading.value = false;
  }
};

onMounted(fetchAllReports);
</script>
