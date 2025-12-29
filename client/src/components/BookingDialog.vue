<template>
  <Dialog
    v-model:visible="dialogVisible"
    modal
    class="fresha-dialog h-full md:h-auto"
    :style="{ width: '150vw', maxWidth: '80%', margin: '0' }"
    :breakpoints="{ '960px': '100vw' }"
    :showHeader="false"
    :contentStyle="{
      padding: '0',
      borderRadius: '12px',
      overflow: 'hidden',
      height: '100%',
    }"
  >
    <div class="flex flex-col md:flex-row h-full md:h-[750px] bg-white">
      <div
        class="flex-grow flex flex-col w-full md:w-2/3 border-b md:border-b-0 md:border-r border-gray-200 order-2 md:order-1 h-full overflow-hidden"
      >
        <div
          class="px-4 md:px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-white sticky top-0 z-10 flex-shrink-0"
        >
          <div>
            <h2 class="text-lg md:text-xl font-bold text-gray-900">
              {{ isEditMode ? "Edit Appointment" : "New Appointment" }}
            </h2>
            <div class="text-sm text-gray-500 mt-1 flex items-center gap-2">
              <span>{{ formatDate(form.start_time) }}</span>
              <span
                v-if="isEditMode"
                class="px-2 py-0.5 rounded text-xs font-bold uppercase"
                :class="getStatusColor(form.status)"
              >
                {{ form.status }}
              </span>
            </div>
          </div>
          <button
            @click="dialogVisible = false"
            class="text-gray-400 hover:text-gray-600"
          >
            <i class="pi pi-times text-xl"></i>
          </button>
        </div>

        <div
          class="flex border-b border-gray-200 px-4 md:px-6 overflow-x-auto flex-shrink-0"
        >
          <button
            v-for="tab in tabs"
            :key="tab"
            @click="currentTab = tab"
            class="py-3 px-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap"
            :class="
              currentTab === tab
                ? 'border-black text-black'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            "
          >
            {{ tab }}
          </button>
        </div>

        <div class="flex-grow overflow-y-auto p-4 md:p-6 space-y-6">
          <div v-if="currentTab === 'Booking'" class="space-y-6">
            <div class="space-y-2">
              <label
                class="text-xs font-bold text-gray-500 uppercase tracking-wider"
                >Client</label
              >

              <div v-if="!form.client_id" class="flex gap-2">
                <Dropdown
                  v-model="form.client_id"
                  :options="clients"
                  optionLabel="full_name"
                  optionValue="id"
                  placeholder="Search or select client..."
                  filter
                  class="w-full"
                />
                <Button
                  icon="pi pi-plus"
                  class="p-button-outlined"
                  v-tooltip="'New Client'"
                  @click="showQuickAddClient = true"
                />
              </div>

              <div v-else class="flex gap-2">
                <div
                  class="flex-grow flex justify-between items-center p-3 border border-gray-300 rounded-lg bg-gray-50 hover:border-gray-400 transition-colors cursor-pointer group"
                  @click="form.client_id = null"
                >
                  <div class="flex items-center gap-3">
                    <div
                      class="w-8 h-8 rounded-full bg-blue-100 text-blue-600 font-bold flex items-center justify-center text-sm"
                    >
                      {{ selectedClient?.first_name?.[0] || "?"
                      }}{{ selectedClient?.last_name?.[0] || "?" }}
                    </div>
                    <div>
                      <div class="font-bold text-gray-900 text-sm">
                        {{ selectedClient?.full_name }}
                      </div>
                      <div class="text-xs text-gray-500">
                        {{ selectedClient?.phone }}
                      </div>
                    </div>
                  </div>
                  <i
                    class="pi pi-times text-gray-400 group-hover:text-red-500"
                  ></i>
                </div>
                <Button
                  icon="pi pi-eye"
                  class="p-button-outlined p-button-secondary w-12"
                  v-tooltip.top="'View Full Profile'"
                  @click="openClientProfile"
                />
              </div>
            </div>

            <BookingServices
              v-model="servicesList"
              :services="services"
              :staff="staff"
              :baseStartTime="new Date(form.start_time)"
              :default-staff-id="currentStaffId"
            />

            <div
              class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-gray-100"
            >
              <div>
                <label
                  class="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2"
                  >Status</label
                >
                <Dropdown
                  v-model="form.status"
                  :options="statusOptions"
                  optionLabel="label"
                  optionValue="value"
                  class="w-full"
                >
                  <template #option="slotProps">
                    <div class="flex items-center gap-2">
                      <div
                        class="w-3 h-3 rounded-full"
                        :class="getStatusDot(slotProps.option.value)"
                      ></div>
                      {{ slotProps.option.label }}
                    </div>
                  </template>
                </Dropdown>
              </div>

              <div class="flex flex-col justify-end gap-3 pb-2">
                <!-- <div class="flex items-center gap-2">
                  <Checkbox
                    v-model="form.save_receipt"
                    binary
                    inputId="saveReceipt"
                  />
                  <label
                    for="saveReceipt"
                    class="text-sm font-medium text-gray-700 cursor-pointer"
                  >
                    Save Receipt
                  </label>
                </div> -->

                <div class="flex items-center gap-2">
                  <Checkbox v-model="form.is_block" binary inputId="isBlock" />
                  <label
                    for="isBlock"
                    class="text-sm text-gray-700 cursor-pointer"
                  >
                    Block time off (Unavailable)
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div v-if="currentTab === 'Products'" class="space-y-4">
            <div
              class="bg-blue-50 border border-blue-100 p-4 rounded-lg flex items-start gap-3"
            >
              <i class="pi pi-shopping-bag text-blue-600 mt-1"></i>
              <div>
                <h4 class="text-sm font-bold text-blue-900">Retail Products</h4>
                <p class="text-xs text-blue-700">
                  Add products to this appointment. Stock will be deducted
                  automatically upon saving.
                </p>
              </div>
            </div>

            <BookingProducts
              v-model="productsList"
              :allProducts="allProducts"
            />
          </div>

          <div v-if="currentTab === 'Payment'">
            <BookingPayments
              :totalDueNow="totalDueNow"
              :currentApptTotal="currentApptTotal"
              :previousDebt="previousDebt"
              :depositAmount="form.deposit_amount"
              :loading="paymentLoading"
              v-model:paymentMethod="selectedPaymentMethod"
              v-model:amountToPay="amountToPayNow"
              @pay="recordPayment"
            />
          </div>

          <div v-if="currentTab === 'Notes'" class="space-y-4">
            <div>
              <label class="text-sm font-semibold text-gray-700 block mb-1"
                >Booking Note (Visible to Client)</label
              >
              <Textarea
                v-model="form.booking_notes"
                rows="3"
                class="w-full"
                placeholder="e.g. Please arrive 10 mins early"
              />
            </div>
            <div>
              <label class="text-sm font-semibold text-gray-700 block mb-1"
                >Internal Note (Staff Only)</label
              >
              <Textarea
                v-model="form.internal_notes"
                rows="3"
                class="w-full bg-yellow-50"
                placeholder="e.g. Client prefers tea, be careful with sensitive scalp"
              />
            </div>
          </div>
        </div>

        <div
          class="px-4 md:px-6 py-4 border-t border-gray-200 flex flex-col-reverse sm:flex-row justify-between items-center bg-gray-50 flex-shrink-0 gap-3"
        >
          <Button
            v-if="isEditMode"
            label="Cancel Appt"
            icon="pi pi-trash"
            class="p-button-danger p-button-text p-button-sm w-full sm:w-auto"
            @click="confirmDelete"
          />
          <div class="flex flex-col sm:flex-row gap-3 ml-auto w-full sm:w-auto">
            <div
              class="flex items-center gap-2 justify-center sm:justify-start sm:mr-4 mb-2 sm:mb-0"
            >
              <Checkbox v-model="notifyClient" binary inputId="notify" />
              <label for="notify" class="text-sm text-gray-600"
                >Email client</label
              >
            </div>
            <Button
              label="Save"
              @click="save"
              :loading="loading"
              class="w-full sm:w-auto px-8"
            />
          </div>
        </div>
      </div>

      <div
        class="w-full md:w-[35%] bg-gray-50 order-1 md:order-2 border-b md:border-b-0 md:border-l border-gray-200 md:h-full md:overflow-y-auto flex-shrink-0"
      >
        <div
          class="md:hidden p-4 flex justify-between items-center bg-gray-100 border-b border-gray-200 cursor-pointer"
          @click="toggleMobileSidebar"
        >
          <span class="font-bold text-sm text-gray-700">
            Client Details: {{ selectedClient?.full_name || "None selected" }}
          </span>
          <i
            class="pi"
            :class="showMobileSidebar ? 'pi-chevron-up' : 'pi-chevron-down'"
          ></i>
        </div>

        <div v-show="showMobileSidebar || !isMobile" class="h-full">
          <BookingSidebar
            class="w-full bg-gray-50 h-full"
            :client="selectedClient"
          />
        </div>
      </div>
    </div>

    <Dialog
      v-model:visible="showQuickAddClient"
      header="Add New Client"
      modal
      :style="{ width: '400px', maxWidth: '90vw' }"
    >
      <div class="space-y-4 pt-2">
        <span class="p-float-label">
          <label for="qa_first">First Name</label>
          <InputText
            id="qa_first"
            v-model="newClient.first_name"
            class="w-full"
          />
        </span>
        <span class="p-float-label">
          <label for="qa_last">Last Name</label>
          <InputText
            id="qa_last"
            v-model="newClient.last_name"
            class="w-full"
          />
        </span>
        <span class="p-float-label">
          <label for="qa_phone">Mobile</label>
          <InputText id="qa_phone" v-model="newClient.phone" class="w-full" />
        </span>
      </div>
      <template #footer>
        <Button label="Save Client" @click="saveNewClient" class="w-full" />
      </template>
    </Dialog>

    <ClientProfileDialog
      v-model:visible="showClientProfile"
      :clientId="currentProfileId"
      @refresh="
        () => {} /* Optional: You can trigger a client list refresh here if needed */
      "
    />
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import BookingProducts from "./booking/bookingProducts.vue";
import BookingServices from "./booking/bookingServices.vue";
import BookingPayments from "./booking/bookingPayments.vue";
import BookingSidebar from "./booking/bookingSideBar.vue";
import ClientProfileDialog from "./ClientProfileDialog.vue";

const props = defineProps([
  "visible",
  "appointment",
  "clients",
  "services",
  "staff",
  "allProducts",
]);

const emit = defineEmits(["update:visible", "save"]);
const currentStaffId = ref<number | string | null>(null);

const dialogVisible = computed({
  get: () => props.visible,
  set: (val) => emit("update:visible", val),
});

// === STATE ===
const form = ref<any>({
  id: null,
  client_id: null,
  start_time: new Date(),
  status: "new",
  internal_notes: "",
  booking_notes: "",
  deposit_amount: 0,
  payment_status: "unpaid",
  payment_method: "card",
  is_block: false,
  save_receipt: true,
});

// State lifted from children
const servicesList = ref<Array<any>>([]);
const productsList = ref<Array<any>>([]);

// UI State
const currentTab = ref("Booking");
const tabs = ["Booking", "Notes"] as const; // "Products", "Payment",

const loading = ref(false);
const paymentLoading = ref(false);
const showQuickAddClient = ref(false);
const showClientProfile = ref(false);
const currentProfileId = ref<string | null>(null);
const notifyClient = ref(true);
const newClient = ref({ first_name: "", last_name: "", phone: "" });
const amountToPayNow = ref(0);
const selectedPaymentMethod = ref<"card" | "cash" | "gift-card">("card");

const statusOptions = [
  { label: "New", value: "new" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Arrived", value: "arrived" },
  { label: "Started", value: "started" },
  { label: "Completed", value: "completed" },
  { label: "No-Show", value: "no-show" },
  { label: "Cancelled", value: "cancelled" },
];

// Mobile Sidebar Logic
const showMobileSidebar = ref(false);
const isMobile = ref(false);

const checkMobile = () => {
  isMobile.value = window.innerWidth < 768;
};

const toggleMobileSidebar = () => {
  showMobileSidebar.value = !showMobileSidebar.value;
};

onMounted(() => {
  checkMobile();
  window.addEventListener("resize", checkMobile);
});

onUnmounted(() => {
  window.removeEventListener("resize", checkMobile);
});

// === COMPUTED ===
const isEditMode = computed(() => !!form.value.id);
const selectedClient = computed(() =>
  props.clients.find((c: any) => c.id === form.value.client_id)
);

// Financial Calculations
const currentApptTotal = computed(() => {
  const servicesTotal = servicesList.value.reduce(
    (sum, s) => sum + (Number(s.price_override) || 0),
    0
  );
  // Note: productsList is available even if the tab is not 'Products',
  // ensuring the Total is always accurate across tabs.
  const productsTotal = productsList.value.reduce(
    (sum, p) => sum + (Number(p.price) || 0) * (p.quantity || 1),
    0
  );
  return servicesTotal + productsTotal;
});

const originalSnapshot = ref({ price: 0, deposit: 0 });

const previousDebt = computed(() => {
  const dbBalance = Number(selectedClient.value?.outstanding_balance || 0);
  if (!form.value.id) return dbBalance;

  const originalDebtContribution = Math.max(
    0,
    originalSnapshot.value.price - originalSnapshot.value.deposit
  );
  return Math.max(0, dbBalance - originalDebtContribution);
});

const totalDueNow = computed(() => {
  const dbBalance = Number(selectedClient.value?.outstanding_balance || 0);
  if (!form.value.id) {
    return Math.max(
      0,
      dbBalance + currentApptTotal.value - form.value.deposit_amount
    );
  } else {
    const originalDebtContribution = Math.max(
      0,
      originalSnapshot.value.price - originalSnapshot.value.deposit
    );
    const trueHistoricalDebt = dbBalance - originalDebtContribution;
    const currentApptDebt = Math.max(
      0,
      currentApptTotal.value - form.value.deposit_amount
    );
    return Math.max(0, trueHistoricalDebt + currentApptDebt);
  }
});

watch(totalDueNow, (val) => {
  amountToPayNow.value = val;
});

// === INITIALIZATION ===
watch(
  () => props.appointment,
  (val) => {
    let resolvedStaffId = null;
    if (val?.staff_id && props.staff) {
      const found = props.staff.find((s: any) => s.id == val.staff_id);
      if (found) resolvedStaffId = found.id;
    }

    if (val && val.id) {
      // === EDIT MODE ===
      form.value = {
        id: val.id,
        client_id: val.client_id || null,
        start_time: val.start_time ? new Date(val.start_time) : new Date(),
        status: val.status || "new",
        internal_notes: val.internal_notes || "",
        booking_notes: val.booking_notes || "",
        deposit_amount: Number(val.deposit_amount || 0),
        payment_status: val.payment_status || "unpaid",
        payment_method: val.payment_method || "card",
        is_block: !!val.is_block,
        save_receipt:
          val.save_receipt !== undefined ? !!val.save_receipt : true,
      };

      if (val.services?.length > 0) {
        servicesList.value = val.services.map((s: any) => ({
          service_id: s.service_id,
          staff_id: s.staff_id,
          start_time: s.start_time
            ? new Date(s.start_time)
            : new Date(val.start_time),
          duration_override: s.duration_minutes || 60,
          price_override: Number(s.price || 0),
        }));
      } else {
        servicesList.value = [
          {
            service_id: null,
            staff_id: resolvedStaffId,
            start_time: new Date(form.value.start_time),
            duration_override: 60,
            price_override: 0,
          },
        ];
      }

      productsList.value = Array.isArray(val.products)
        ? val.products.map((p: any) => ({
            product_id: p.product_id,
            quantity: p.quantity || 1,
            price: Number(p.price || 0),
          }))
        : [];

      originalSnapshot.value = {
        price: currentApptTotal.value,
        deposit: form.value.deposit_amount,
      };
    } else {
      // === NEW MODE ===
      const newStart = val?.start_time ? new Date(val.start_time) : new Date();

      form.value = {
        id: null,
        client_id: null,
        start_time: newStart,
        status: "new",
        deposit_amount: 0,
        payment_status: "unpaid",
        is_block: false,
        save_receipt: true,
      };

      servicesList.value = [
        {
          service_id: null,
          staff_id: resolvedStaffId,
          start_time: newStart,
          duration_override: 60,
          price_override: 0,
        },
      ];

      productsList.value = [];
      originalSnapshot.value = { price: 0, deposit: 0 };
    }

    amountToPayNow.value = 0;
    currentTab.value = "Booking";
    showMobileSidebar.value = false;
  },
  { immediate: true }
);

// === METHODS ===

const save = async (close = true) => {
  loading.value = true;
  const token = localStorage.getItem("token");
  const url = form.value.id
    ? `/api/v1/appointments/${form.value.id}`
    : "/api/v1/appointments";
  const method = form.value.id ? "PUT" : "POST";

  try {
    // Prepare Payload
    const payload = {
      ...form.value,
      // Safety mapping: ensure price_override is used
      services: servicesList.value.map((s) => ({
        ...s,
        price_override: Number(s.price_override) || Number(s.price) || 0,
      })),
      products: productsList.value,
    };

    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (method === "POST") {
      form.value.id = data.id;
    }

    // === BALANCE FIX ===
    if (data.new_balance !== undefined && selectedClient.value) {
      selectedClient.value.outstanding_balance = Number(data.new_balance);
    }

    originalSnapshot.value = {
      price: currentApptTotal.value,
      deposit: form.value.deposit_amount,
    };

    if (close) {
      emit("save");
      dialogVisible.value = false;
    }
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
};

const recordPayment = async () => {
  if (amountToPayNow.value <= 0) return;
  paymentLoading.value = true;
  const token = localStorage.getItem("token");

  await save(false);

  if (!form.value.id) {
    paymentLoading.value = false;
    return;
  }

  try {
    const res = await fetch("/api/v1/transactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        appointment_id: form.value.id,
        client_id: form.value.client_id,
        amount: amountToPayNow.value,
        payment_method: selectedPaymentMethod.value,
      }),
    });

    if (res.ok) {
      form.value.deposit_amount += amountToPayNow.value;
      if (selectedClient.value) {
        selectedClient.value.outstanding_balance -= amountToPayNow.value;
      }
      originalSnapshot.value.deposit = form.value.deposit_amount;
      emit("save");
    }
  } catch (e) {
    console.error(e);
  } finally {
    paymentLoading.value = false;
  }
};

const confirmDelete = async () => {
  if (confirm("Cancel this appointment?")) {
    const token = localStorage.getItem("token");
    await fetch(`/api/v1/appointments/${form.value.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    emit("save");
    dialogVisible.value = false;
  }
};

// --- Client Helpers ---

const saveNewClient = async () => {
  const token = localStorage.getItem("token");
  const res = await fetch("/api/v1/clients", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(newClient.value),
  });
  const data = await res.json();
  if (data.success || data.client) {
    const client = data.client || data;
    client.full_name = `${client.first_name} ${client.last_name}`;
    props.clients.push(client);
    form.value.client_id = client.id;
    showQuickAddClient.value = false;
    newClient.value = { first_name: "", last_name: "", phone: "" };
  }
};

const openClientProfile = () => {
  if (!form.value.client_id) return;
  currentProfileId.value = form.value.client_id;
  showClientProfile.value = true;
};

// --- Formatters ---

const formatDate = (d: Date) =>
  d
    ? new Date(d).toLocaleString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

const getStatusColor = (s: string) => {
  const map: any = {
    new: "bg-blue-100 text-blue-800",
    confirmed: "bg-purple-100 text-purple-800",
    arrived: "bg-orange-100 text-orange-800",
    started: "bg-green-100 text-green-800",
    completed: "bg-gray-200 text-gray-800",
    cancelled: "bg-red-100 text-red-800",
    "no-show": "bg-red-200 text-red-900",
  };
  return map[s] || "bg-gray-100";
};

const getStatusDot = (s: string) => {
  const map: any = {
    new: "bg-blue-500",
    confirmed: "bg-purple-500",
    arrived: "bg-orange-500",
    started: "bg-green-500",
    completed: "bg-gray-500",
    cancelled: "bg-red-500",
    "no-show": "bg-red-700",
  };
  return map[s] || "bg-gray-400";
};
</script>

<style scoped>
.fresha-dialog .p-dialog-header {
  display: none;
}
.p-dropdown,
.p-inputtext,
.p-calendar {
  border-radius: 0.5rem;
}
</style>
