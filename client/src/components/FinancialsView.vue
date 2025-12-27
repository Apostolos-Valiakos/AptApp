<template>
  <div class="p-6 max-w-7xl mx-auto">
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-gray-900 text-white">
        Financial Reports
      </h1>
      <p class="text-gray-500">
        View your business performance, sales, and payments.
      </p>
    </div>

    <div
      class="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 flex gap-4 items-end"
    >
      <div class="flex-grow">
        <label class="block text-sm font-bold text-gray-700 mb-1"
          >Date Range</label
        >
        <div class="flex gap-2">
          <Calendar
            v-model="filters.from"
            placeholder="From Date"
            showIcon
            class="w-full"
          />
          <Calendar
            v-model="filters.to"
            placeholder="To Date"
            showIcon
            class="w-full"
          />
        </div>
      </div>
      <Button
        label="Apply Filters"
        icon="pi pi-filter"
        @click="fetchAllReports"
        :loading="loading"
      />
      <Button
        label="Clear"
        icon="pi pi-times"
        class="p-button-outlined p-button-secondary"
        @click="clearFilters"
      />
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      <div
        class="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl p-6 text-white shadow-lg"
      >
        <div class="text-indigo-100 font-medium mb-1">Total Sales</div>
        <div class="text-3xl font-bold">
          €{{ formatCurrency(finances.total_sales) }}
        </div>
        <div class="text-xs text-indigo-200 mt-2">Completed appointments</div>
      </div>
      <div class="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
        <div class="text-gray-500 font-medium mb-1">Total Collected</div>
        <div class="text-3xl font-bold text-green-600">
          €{{ formatCurrency(finances.total_payments) }}
        </div>
        <div class="text-xs text-gray-400 mt-2">Actual payments received</div>
      </div>
      <div class="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
        <div class="text-gray-500 font-medium mb-1">Pending Balance</div>
        <div class="text-3xl font-bold text-orange-500">
          €{{
            formatCurrency(
              Math.max(0, finances.total_sales - finances.total_payments)
            )
          }}
        </div>
        <div class="text-xs text-gray-400 mt-2">Outstanding from clients</div>
      </div>
    </div>

    <TabView class="bg-white rounded-xl shadow-sm border border-gray-200 p-2">
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
          :value="staffReport"
          responsiveLayout="scroll"
          :paginator="true"
          :rows="10"
          class="p-datatable-sm"
        >
          <Column field="staff_name" header="Staff Member"></Column>
          <Column
            field="appointment_count"
            header="Appointments"
            sortable
          ></Column>
          <Column field="total_hours" header="Hours Booked" sortable>
            <template #body="slotProps">
              {{ (slotProps.data.total_hours / 60).toFixed(1) }}h
            </template>
          </Column>
          <Column field="total_revenue" header="Revenue Generated" sortable>
            <template #body="slotProps">
              €{{ formatCurrency(slotProps.data.total_revenue) }}
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

      <TabPanel header="Appointments List">
        <DataTable
          :value="appointmentsReport"
          responsiveLayout="scroll"
          :paginator="true"
          :rows="10"
          class="p-datatable-sm"
          sortField="created_at"
          :sortOrder="-1"
        >
          <Column field="created_at" header="Date">
            <template #body="slotProps">
              {{ new Date(slotProps.data.created_at).toLocaleDateString() }}
            </template>
          </Column>
          <Column header="Client">
            <template #body="slotProps">
              {{ slotProps.data.first_name }} {{ slotProps.data.last_name }}
            </template>
          </Column>
          <Column field="status" header="Status">
            <template #body="slotProps">
              <span
                class="px-2 py-1 rounded text-xs font-bold uppercase"
                :class="{
                  'bg-green-100 text-green-800':
                    slotProps.data.status === 'completed',
                  'bg-blue-100 text-blue-800': slotProps.data.status === 'new',
                  'bg-red-100 text-red-800':
                    slotProps.data.status === 'cancelled',
                }"
              >
                {{ slotProps.data.status }}
              </span>
            </template>
          </Column>
          <Column header="Services">
            <template #body="slotProps">
              <div
                v-for="s in slotProps.data.services"
                :key="s.service_name"
                class="text-xs"
              >
                {{ s.service_name }} (€{{ s.price }})
              </div>
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

const toast = useToast();
const loading = ref(false);

const filters = ref({
  from: null as Date | null,
  to: null as Date | null,
});

// Data State
const finances = ref({ total_sales: 0, total_payments: 0 });
const salesReport = ref([]);
const staffReport = ref([]);
const paymentsReport = ref([]);
const appointmentsReport = ref([]);

// FIX: Changed 'en-EUR' to 'en-US' to fix the RangeError
const formatCurrency = (val: any) => {
  return Number(val).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const clearFilters = () => {
  filters.value.from = null;
  filters.value.to = null;
  fetchAllReports();
};

const fetchAllReports = async () => {
  loading.value = true;
  const token = localStorage.getItem("token");

  // FIX: Added Authorization header to prevent 401 Unauthorized
  const headers = { Authorization: `Bearer ${token}` };

  // Build Query Params
  const params = new URLSearchParams();
  if (filters.value.from)
    params.append("from", filters.value.from.toISOString());
  if (filters.value.to) params.append("to", filters.value.to.toISOString());
  const qs = params.toString() ? `?${params.toString()}` : "";

  try {
    const [finRes, salesRes, staffRes, payRes, apptRes] = await Promise.all([
      fetch(`/api/v1/reports/finances${qs}`, { headers }),
      fetch(`/api/v1/reports/sales${qs}`, { headers }),
      fetch(`/api/v1/reports/staff${qs}`, { headers }),
      fetch(`/api/v1/reports/payments${qs}`, { headers }),
      fetch(`/api/v1/reports/appointments${qs}`, { headers }),
    ]);

    // Check for 401s specifically
    if (payRes.status === 401) {
      throw new Error("Unauthorized: Please log in again.");
    }

    if (
      !finRes.ok ||
      !salesRes.ok ||
      !staffRes.ok ||
      !payRes.ok ||
      !apptRes.ok
    ) {
      throw new Error("Failed to fetch some reports");
    }

    const finData = await finRes.json();
    const salesData = await salesRes.json();

    finances.value = finData;
    salesReport.value = salesData.details || [];
    staffReport.value = await staffRes.json();
    paymentsReport.value = await payRes.json();
    appointmentsReport.value = await apptRes.json();
  } catch (err: any) {
    console.error(err);
    toast.add({
      severity: "error",
      summary: "Error loading reports",
      detail: err.message,
      life: 4000,
    });
  } finally {
    loading.value = false;
  }
};

onMounted(fetchAllReports);
</script>
