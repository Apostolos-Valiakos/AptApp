<template>
  <Dialog
    v-model:visible="dialogVisible"
    modal
    class="fresha-dialog"
    :style="{ width: '900px', maxWidth: '95vw' }"
    :showHeader="false"
    :contentStyle="{ padding: '0', borderRadius: '12px', overflow: 'hidden' }"
  >
    <div class="flex h-[750px] bg-white">
      <div class="flex-grow flex flex-col w-2/3 border-r border-gray-200">
        <div
          class="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-white sticky top-0 z-10"
        >
          <div>
            <h2 class="text-xl font-bold text-gray-900">
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

        <div class="flex border-b border-gray-200 px-6">
          <button
            v-for="tab in tabs"
            :key="tab"
            @click="currentTab = tab"
            class="py-3 px-4 text-sm font-medium border-b-2 transition-colors"
            :class="
              currentTab === tab
                ? 'border-black text-black'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            "
          >
            {{ tab }}
          </button>
        </div>

        <div class="flex-grow overflow-y-auto p-6 space-y-6">
          <div v-if="currentTab === 'Details'" class="space-y-6">
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
                  @change="onClientSelect"
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
                      {{ selectedClient?.first_name[0]
                      }}{{ selectedClient?.last_name[0] }}
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
                  v-tooltip.top="'View Client Info'"
                  @click="openClientInfoDialog"
                />
              </div>
            </div>

            <div class="space-y-3">
              <label
                class="text-xs font-bold text-gray-500 uppercase tracking-wider"
              >
                Services
              </label>

              <div
                v-for="(service, index) in servicesList"
                :key="index"
                class="relative p-4 border border-gray-200 rounded-lg hover:border-indigo-300 transition-colors bg-gray-50 group"
              >
                <button
                  v-if="servicesList.length > 1"
                  @click="removeService(index)"
                  class="absolute -right-2 -top-2 bg-white p-1 rounded-full shadow border border-gray-200 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                >
                  <i class="pi pi-times text-xs"></i>
                </button>

                <div class="flex gap-3 mb-3">
                  <div class="flex-grow">
                    <label class="text-xs text-gray-500 block mb-1">
                      Service
                    </label>

                    <Dropdown
                      v-model="service.service_id"
                      :options="services"
                      optionLabel="name"
                      optionValue="id"
                      placeholder="Select Service"
                      class="w-full p-inputtext-sm"
                      @change="() => updateServiceDetails(index)"
                    />
                  </div>

                  <div class="w-1/3">
                    <label class="text-xs text-gray-500 block mb-1">
                      Staff
                    </label>

                    <Dropdown
                      v-model="service.staff_id"
                      :options="getFilteredStaff(service.service_id)"
                      optionLabel="name"
                      optionValue="id"
                      class="w-full p-inputtext-sm"
                      placeholder="Any Staff"
                    />
                  </div>
                </div>

                <div class="grid grid-cols-4 gap-4">
                  <div class="col-span-2 min-w-0">
                    <label class="text-xs text-gray-500 block mb-1">Time</label>

                    <Calendar
                      v-model="service.start_time"
                      showTime
                      hourFormat="24"
                      class="w-full p-inputtext-sm"
                      @hide="recalcTimes"
                    />
                  </div>

                  <div class="col-span-1 min-w-0">
                    <label class="text-xs text-gray-500 block mb-1">
                      Duration
                    </label>

                    <InputNumber
                      v-model="service.duration_override"
                      suffix=" min"
                      class="w-full p-inputtext-sm"
                      inputClass="w-full"
                      @update:modelValue="recalcTimes"
                    />
                  </div>

                  <div class="col-span-1 min-w-0">
                    <label class="text-xs text-gray-500 block mb-1">
                      Price
                    </label>

                    <InputNumber
                      v-model="service.price_override"
                      mode="currency"
                      currency="EUR"
                      class="w-full p-inputtext-sm"
                      inputClass="w-full"
                    />
                  </div>
                </div>
              </div>

              <button
                @click="addService"
                class="text-indigo-600 text-sm font-semibold hover:underline flex items-center gap-1 mt-2"
              >
                <i class="pi pi-plus-circle"></i> Add another service
              </button>
            </div>
            <div class="space-y-3 pt-4 border-t border-gray-100">
              <label
                class="text-xs font-bold text-gray-500 uppercase tracking-wider"
              >
                Products
              </label>

              <div
                v-for="(product, index) in productsList"
                :key="'prod-' + index"
                class="relative p-4 border border-gray-200 rounded-lg hover:border-emerald-300 transition-colors bg-white group"
              >
                <button
                  @click="removeProduct(index)"
                  class="absolute -right-2 -top-2 bg-white p-1 rounded-full shadow border border-gray-200 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                >
                  <i class="pi pi-times text-xs"></i>
                </button>

                <div class="flex gap-3">
                  <div class="flex-grow">
                    <label class="text-xs text-gray-500 block mb-1"
                      >Product</label
                    >
                    <Dropdown
                      v-model="product.product_id"
                      :options="allProducts"
                      optionLabel="name"
                      optionValue="id"
                      placeholder="Select Product"
                      class="w-full p-inputtext-sm"
                      filter
                      @change="() => updateProductDetails(index)"
                    />
                  </div>

                  <div class="w-24">
                    <label class="text-xs text-gray-500 block mb-1">Qty</label>
                    <InputNumber
                      v-model="product.quantity"
                      class="w-full p-inputtext-sm"
                      inputClass="w-full"
                      :min="1"
                    />
                  </div>

                  <div class="w-32">
                    <label class="text-xs text-gray-500 block mb-1"
                      >Price</label
                    >
                    <InputNumber
                      v-model="product.price_override"
                      mode="currency"
                      currency="EUR"
                      class="w-full p-inputtext-sm"
                      inputClass="w-full"
                    />
                  </div>
                </div>
              </div>

              <button
                @click="addProduct"
                class="text-emerald-600 text-sm font-semibold hover:underline flex items-center gap-1 mt-2"
              >
                <i class="pi pi-plus-circle"></i> Add a product
              </button>
            </div>
            <div class="grid grid-cols-2 gap-4 pt-2">
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
                <div class="flex items-center gap-2">
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
                </div>

                <div class="flex items-center gap-2">
                  <Checkbox v-model="form.is_block" binary inputId="isBlock" />
                  <label
                    for="isBlock"
                    class="text-sm text-gray-700 cursor-pointer"
                    >Block time off (Unavailable)</label
                  >
                </div>
              </div>
            </div>
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

          <div v-if="currentTab === 'Payments'" class="space-y-6 pt-4">
            <div
              class="bg-gray-900 text-white rounded-xl p-8 shadow-xl relative overflow-hidden"
            >
              <div class="flex justify-between items-center mb-1 opacity-70">
                <span class="text-xs uppercase tracking-wider font-bold"
                  >Total Due Now</span
                >
              </div>
              <div class="text-5xl font-extrabold mb-6 tracking-tight">
                €{{ totalDueNow.toFixed(2) }}
              </div>
              <div
                class="space-y-2 border-t border-gray-700 pt-4 text-sm opacity-90"
              >
                <div class="flex justify-between">
                  <span>Current Appointment</span>
                  <span class="font-medium"
                    >€{{ currentApptTotal.toFixed(2) }}</span
                  >
                </div>
                <div
                  v-if="previousDebt > 0"
                  class="flex justify-between text-orange-300"
                >
                  <span>Previous Unpaid Balance</span>
                  <span class="font-bold"
                    >+ €{{ previousDebt.toFixed(2) }}</span
                  >
                </div>
                <div class="border-t border-gray-700 pt-2 flex justify-between">
                  <span>Paid Today</span>
                  <span>- €{{ form.deposit_amount.toFixed(2) }}</span>
                </div>
              </div>
            </div>

            <div v-if="totalDueNow > 0" class="animate-fade-in">
              <div class="mb-6">
                <label
                  class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2"
                  >Payment Method</label
                >
                <Dropdown
                  v-model="selectedPaymentMethod"
                  :options="paymentMethods"
                  class="w-full"
                />
              </div>
              <div class="mb-6">
                <label
                  class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2"
                  >Amount to Pay</label
                >
                <InputNumber
                  v-model="amountToPayNow"
                  mode="currency"
                  currency="EUR"
                  class="w-full fresha-input-large"
                  inputClass="!text-lg !font-bold"
                  :max="totalDueNow"
                />
              </div>
              <Button
                label="Charge & Complete"
                icon="pi pi-check"
                class="w-full !py-4 !text-lg !bg-green-600 hover:!bg-green-700 !border-none"
                :loading="paymentLoading"
                @click="recordPayment"
              />
            </div>

            <div
              v-else
              class="text-center p-8 bg-green-50 rounded-xl border border-green-100"
            >
              <h3 class="text-xl font-bold text-green-900">Payment Complete</h3>
              <p class="text-green-700 text-sm">No outstanding balance.</p>
            </div>
          </div>
        </div>

        <div
          class="px-6 py-4 border-t border-gray-200 flex justify-between items-center bg-gray-50"
        >
          <Button
            v-if="isEditMode"
            label="Cancel Appt"
            icon="pi pi-trash"
            class="p-button-danger p-button-text p-button-sm"
            @click="confirmDelete"
          />
          <div class="flex gap-3 ml-auto">
            <div class="flex items-center gap-2 mr-4">
              <Checkbox v-model="notifyClient" binary inputId="notify" />
              <label for="notify" class="text-sm text-gray-600"
                >Email client</label
              >
            </div>
            <Button
              label="Save"
              @click="save"
              :loading="loading"
              class="px-8"
            />
          </div>
        </div>
      </div>

      <div
        class="w-full md:w-[35%] bg-gray-50 flex flex-col h-full border-l border-gray-200 overflow-hidden"
      >
        <div v-if="selectedClient" class="p-8 text-center">
          <div
            class="w-20 h-20 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto text-2xl font-bold mb-4"
          >
            {{ selectedClient.first_name[0] }}{{ selectedClient.last_name[0] }}
          </div>
          <h3 class="text-xl font-bold">{{ selectedClient.full_name }}</h3>
          <p class="text-gray-500 text-sm">{{ selectedClient.email }}</p>
          <p class="text-gray-500 text-sm mb-4">{{ selectedClient.phone }}</p>

          <div
            v-if="selectedClient.outstanding_balance > 0"
            class="inline-block bg-red-100 text-red-800 text-xs font-bold px-3 py-1 rounded-full mb-6"
          >
            Balance: €{{
              Number(selectedClient.outstanding_balance).toFixed(2)
            }}
          </div>

          <div
            v-if="
              selectedClient.custom_fields &&
              selectedClient.custom_fields.length
            "
            class="text-left bg-white p-4 rounded-lg shadow-sm border border-gray-100"
          >
            <h4 class="text-xs font-bold text-gray-400 uppercase mb-3">
              Details
            </h4>
            <div
              v-for="(field, i) in selectedClient.custom_fields"
              :key="i"
              class="flex justify-between text-sm mb-2 border-b border-gray-50 pb-1 last:border-0"
            >
              <span class="text-gray-600">{{ field.title }}</span>
              <span class="font-medium text-gray-900">{{ field.value }}</span>
            </div>
          </div>
        </div>
        <div
          v-else
          class="h-full flex flex-col items-center justify-center text-gray-400"
        >
          <i class="pi pi-user text-3xl mb-2"></i>
          <p>Select a client to view details</p>
        </div>
      </div>
    </div>

    <Dialog
      v-model:visible="showQuickAddClient"
      header="Add New Client"
      modal
      :style="{ width: '400px' }"
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

    <Dialog
      v-model:visible="showClientInfo"
      header="Client Details"
      modal
      class="w-full max-w-lg"
    >
      <div class="space-y-4 pt-2" v-if="clientInfoData">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium mb-1">First Name</label>
            <InputText v-model="clientInfoData.first_name" class="w-full" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Last Name</label>
            <InputText v-model="clientInfoData.last_name" class="w-full" />
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Email</label>
          <InputText v-model="clientInfoData.email" class="w-full" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Phone</label>
          <InputText v-model="clientInfoData.phone" class="w-full" />
        </div>
        <div class="bg-gray-50 p-3 rounded border border-gray-200">
          <div class="flex justify-between items-center mb-2">
            <span class="text-xs font-bold text-gray-700 uppercase"
              >Additional Info</span
            >
            <Button
              icon="pi pi-plus"
              size="small"
              class="p-button-text p-button-sm"
              @click="addClientInfoField"
            />
          </div>
          <div
            v-for="(field, idx) in clientInfoData.custom_fields"
            :key="idx"
            class="flex gap-2 mb-2"
          >
            <InputText
              v-model="field.title"
              placeholder="Title"
              class="w-1/3 p-inputtext-sm font-bold"
            />
            <InputText
              v-model="field.value"
              placeholder="Value"
              class="flex-grow p-inputtext-sm"
            />
            <Button
              icon="pi pi-trash"
              class="p-button-text p-button-danger p-button-sm"
              @click="clientInfoData.custom_fields.splice(idx, 1)"
            />
          </div>
        </div>
      </div>
      <template #footer>
        <Button
          label="Cancel"
          icon="pi pi-times"
          class="p-button-text"
          @click="showClientInfo = false"
        />
        <Button
          label="Save Changes"
          icon="pi pi-check"
          @click="saveClientInfo"
          :loading="clientSaving"
        />
      </template>
    </Dialog>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";

const props = defineProps([
  "visible",
  "appointment",
  "clients",
  "services",
  "staff",
  "allProducts",
]);

const emit = defineEmits(["update:visible", "save"]);

const dialogVisible = computed({
  get: () => props.visible,
  set: (val) => emit("update:visible", val),
});

// Form & state
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
  save_receipt: false,
});

const servicesList = ref<Array<any>>([]);
const productsList = ref<Array<any>>([]); // Reactive products list
const originalSnapshot = ref({ price: 0, deposit: 0 });
const currentTab = ref("Details");
const loading = ref(false);
const paymentLoading = ref(false);
const showQuickAddClient = ref(false);
const showClientInfo = ref(false);
const clientInfoData = ref<any>(null);
const clientSaving = ref(false);
const notifyClient = ref(true);
const newClient = ref({ first_name: "", last_name: "", phone: "" });
const amountToPayNow = ref(0);
const selectedPaymentMethod = ref<"card" | "cash" | "gift-card">("card");

const tabs = ["Details", "Notes", "Payments"] as const;
const paymentMethods = ["card", "cash", "gift-card"] as const;
const statusOptions = [
  { label: "New", value: "new" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Arrived", value: "arrived" },
  { label: "Started", value: "started" },
  { label: "Completed", value: "completed" },
  { label: "No-Show", value: "no-show" },
  { label: "Cancelled", value: "cancelled" },
];

const isEditMode = computed(() => !!form.value.id);
const selectedClient = computed(() =>
  props.clients.find((c: any) => c.id === form.value.client_id)
);

// Calculation including both Services and Products
const currentApptTotal = computed(() => {
  const servicesTotal = servicesList.value.reduce(
    (sum, s) => sum + (Number(s.price_override) || 0),
    0
  );
  const productsTotal = productsList.value.reduce(
    (sum, p) => sum + (Number(p.price_override) || 0) * (p.quantity || 1),
    0
  );
  return servicesTotal + productsTotal;
});

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

// Watch appointment to fill form
watch(
  () => props.appointment,
  (val) => {
    if (val) {
      form.value = {
        id: val.id || null,
        client_id: val.client_id || null,
        start_time: val.start_time ? new Date(val.start_time) : new Date(),
        status: val.status || "new",
        internal_notes: val.internal_notes || "",
        booking_notes: val.booking_notes || "",
        deposit_amount: Number(val.deposit_amount || 0),
        payment_status: val.payment_status || "unpaid",
        payment_method: val.payment_method || "card",
        is_block: !!val.is_block,
        save_receipt: !!val.save_receipt,
      };

      // Handle Services
      if (val.services?.length > 0 && val.services[0].service_id) {
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
            staff_id: null,
            start_time: new Date(form.value.start_time),
            duration_override: 60,
            price_override: 0,
          },
        ];
      }

      // Handle Products (FIXED INITIALIZATION)
      if (
        val.products &&
        Array.isArray(val.products) &&
        val.products.length > 0
      ) {
        productsList.value = val.products.map((p: any) => ({
          product_id: p.product_id,
          quantity: p.quantity || 1,
          price_override: Number(p.price || 0),
        }));
      } else {
        productsList.value = [];
      }

      // 2. Set the snapshot based on the new totals
      originalSnapshot.value = {
        price: currentApptTotal.value,
        deposit: form.value.deposit_amount,
      };
    } else {
      // New Appointment Defaults
      form.value = {
        id: null,
        client_id: null,
        start_time: new Date(),
        status: "new",
        deposit_amount: 0,
        payment_status: "unpaid",
        is_block: false,
        save_receipt: false,
      };
      servicesList.value = [
        {
          service_id: null,
          staff_id: null,
          start_time: new Date(),
          duration_override: 60,
          price_override: 0,
        },
      ];
      productsList.value = [];
      originalSnapshot.value = { price: 0, deposit: 0 };
    }
    amountToPayNow.value = 0;
    currentTab.value = "Details";
  },
  { immediate: true }
);

const addProduct = () => {
  productsList.value.push({
    product_id: null,
    quantity: 1,
    price_override: 0,
  });
};

const removeProduct = (index: number) => {
  productsList.value.splice(index, 1);
};

const updateProductDetails = (index: number) => {
  const item = productsList.value[index];
  // Find the product in the master list to get its default price
  const found = props.allProducts?.find((p: any) => p.id === item.product_id);
  if (found) {
    item.price_override = Number(found.price);
  }
};

// ... Existing Service Helpers (addService, removeService, updateServiceDetails, recalcTimes) ...
const addService = () => {
  let nextStart = new Date(form.value.start_time);
  if (servicesList.value.length > 0) {
    const last = servicesList.value[servicesList.value.length - 1];
    nextStart = new Date(
      new Date(last.start_time).getTime() +
        (last.duration_override || 60) * 60000
    );
  }
  servicesList.value.push({
    service_id: null,
    staff_id: null,
    start_time: nextStart,
    duration_override: 60,
    price_override: 0,
  });
};

const removeService = (index: number) => {
  servicesList.value.splice(index, 1);
  recalcTimes();
};

const updateServiceDetails = (index: number) => {
  const svc = servicesList.value[index];
  const found = props.services.find((s: any) => s.id === svc.service_id);
  if (found) {
    svc.price_override = Number(found.price);
    svc.duration_override = found.duration_minutes || 60;
  }
  recalcTimes();
};

const recalcTimes = () => {
  if (servicesList.value.length <= 1) return;
  let currentStart = new Date(servicesList.value[0].start_time);
  for (let i = 0; i < servicesList.value.length; i++) {
    servicesList.value[i].start_time = new Date(currentStart);
    currentStart = new Date(
      currentStart.getTime() +
        (servicesList.value[i].duration_override || 60) * 60000
    );
  }
};

const getFilteredStaff = (serviceId: any) => {
  if (!serviceId) return props.staff;
  return props.staff.filter(
    (s: any) =>
      !s.service_ids ||
      s.service_ids.length === 0 ||
      s.service_ids.includes(serviceId)
  );
};

const onClientSelect = () => {};

const save = async (close = true) => {
  loading.value = true;
  const token = localStorage.getItem("token");
  const url = form.value.id
    ? `/api/v1/appointments/${form.value.id}`
    : "/api/v1/appointments";
  const method = form.value.id ? "PUT" : "POST";

  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        ...form.value,
        services: servicesList.value,
        products: productsList.value, // Sending products to backend
      }),
    });

    if (method === "POST") {
      const data = await res.json();
      form.value.id = data.id;
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

// ... Existing logic for saveNewClient, openClientInfoDialog, recordPayment, confirmDelete, formatters ...
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

const openClientInfoDialog = () => {
  if (!selectedClient.value) return;
  clientInfoData.value = JSON.parse(JSON.stringify(selectedClient.value));
  if (!clientInfoData.value.custom_fields)
    clientInfoData.value.custom_fields = [];
  showClientInfo.value = true;
};

const addClientInfoField = () => {
  clientInfoData.value.custom_fields.push({ title: "", value: "" });
};

const saveClientInfo = async () => {
  clientSaving.value = true;
  const token = localStorage.getItem("token");
  try {
    const res = await fetch(`/api/v1/clients/${clientInfoData.value.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(clientInfoData.value),
    });
    if (res.ok) {
      const index = props.clients.findIndex(
        (c: any) => c.id === clientInfoData.value.id
      );
      if (index !== -1) {
        props.clients[index] = {
          ...clientInfoData.value,
          full_name: `${clientInfoData.value.first_name} ${clientInfoData.value.last_name}`,
        };
      }
      showClientInfo.value = false;
    }
  } catch (e) {
    console.error(e);
  } finally {
    clientSaving.value = false;
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
      if (selectedClient.value)
        selectedClient.value.outstanding_balance -= amountToPayNow.value;
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
console.log(productsList.value);
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
