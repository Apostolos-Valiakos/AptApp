<template>
  <Dialog
    v-model:visible="dialogVisible"
    modal
    class="fresha-dialog h-full md:h-auto md:rounded-xl rounded-none"
    :showHeader="false"
    :breakpoints="{ '960px': '100vw', '640px': '100vw' }"
    :style="{ width: '95vw', maxWidth: '1200px' }"
    :contentStyle="{
      padding: '0',
      borderRadius: '12px',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }"
  >
    <div
      class="flex flex-col md:flex-row h-full md:max-h-[90vh] md:h-[800px] bg-white"
    >
      <!-- Left pane: form -->
      <div
        class="flex-grow flex flex-col w-full md:w-2/3 border-b md:border-b-0 md:border-r border-gray-200 order-2 md:order-1 h-full overflow-hidden"
        :class="
          isEditMode ? 'border-l-4 border-l-[var(--p-primary-color)]' : ''
        "
      >
        <!-- Header -->
        <div
          class="px-4 md:px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-white sticky top-0 z-10 flex-shrink-0"
        >
          <div>
            <h2 class="text-lg md:text-xl font-bold text-gray-900">
              {{
                isEditMode
                  ? t("booking.editAppointment")
                  : t("booking.newAppointment")
              }}
            </h2>
            <div class="text-sm text-gray-500 mt-1 flex items-center gap-2">
              <i class="pi pi-clock text-xs opacity-60"></i>
              <span>{{ formatDate(form.start_time) }}</span>
              <span
                v-if="isEditMode"
                class="rounded-full px-3 py-1 text-xs font-bold uppercase"
                :class="getStatusColor(form.status)"
              >
                {{ form.status }}
              </span>
            </div>
          </div>
          <button
            @click="dialogVisible = false"
            class="w-8 h-8 rounded-full bg-gray-100 hover:bg-red-50 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors duration-200"
          >
            <i class="pi pi-times text-sm"></i>
          </button>
        </div>

        <!-- Tab bar — pill group -->
        <div class="flex px-4 md:px-6 py-2 flex-shrink-0">
          <div class="flex gap-1 p-1 bg-gray-50 rounded-full">
            <button
              v-for="tab in tabs"
              :key="tab.key"
              @click="currentTab = tab.key"
              class="py-2 px-4 text-sm font-medium transition-colors whitespace-nowrap rounded-full"
              :class="
                currentTab === tab.key
                  ? 'bg-[var(--p-primary-50)] text-[var(--p-primary-700)] font-bold'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              "
            >
              {{ tab.label }}
            </button>
          </div>
        </div>

        <!-- Tab content -->
        <div class="flex-grow overflow-y-auto p-4 md:p-6 space-y-6">
          <!-- BOOKING TAB -->
          <div v-if="currentTab === 'Booking'" class="space-y-6">
            <!-- Client selector -->
            <div class="space-y-2">
              <label
                class="text-xs font-bold text-gray-500 uppercase tracking-wider"
                >{{ t("booking.clientLabel") }}</label
              >

              <div v-if="!form.client_id" class="flex gap-2">
                <Dropdown
                  v-model="form.client_id"
                  :options="clients"
                  optionLabel="full_name"
                  optionValue="id"
                  :placeholder="t('booking.searchClient')"
                  filter
                  class="w-full"
                />
                <Button
                  icon="pi pi-plus"
                  class="p-button-outlined"
                  v-tooltip="t('booking.newClientBtn')"
                  @click="showQuickAddClient = true"
                />
              </div>

              <div v-else class="flex gap-2">
                <div
                  class="flex-grow flex justify-between items-center p-3 border border-gray-200 rounded-xl bg-gray-50 hover:bg-red-50 hover:border-red-200 transition-colors cursor-pointer group"
                  @click="form.client_id = null"
                >
                  <div class="flex items-center gap-3">
                    <div
                      class="w-8 h-8 rounded-full bg-[var(--p-primary-100)] text-[var(--p-primary-600)] font-bold flex items-center justify-center text-sm"
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
                  <div
                    class="w-6 h-6 rounded-full bg-gray-200 group-hover:bg-red-100 flex items-center justify-center transition-colors"
                  >
                    <i
                      class="pi pi-times text-xs text-gray-400 group-hover:text-red-500"
                    ></i>
                  </div>
                </div>
                <Button
                  icon="pi pi-eye"
                  class="p-button-outlined p-button-secondary w-12"
                  style="
                    color: var(--p-primary-color);
                    border-color: var(--p-primary-color);
                  "
                  v-tooltip.top="t('booking.viewProfile')"
                  @click="openClientProfile"
                />
              </div>
            </div>

            <!-- Services -->
            <BookingServices
              v-model="servicesList"
              :services="services"
              :staff="staff"
              :baseStartTime="new Date(form.start_time)"
              :default-staff-id="currentStaffId"
            />

            <!-- Recurring appointment -->
            <div class="p-4 bg-gray-50 rounded-xl border border-gray-200">
              <div class="flex items-center gap-2 mb-3">
                <Checkbox v-model="isRecurring" binary inputId="isRecurring" />
                <label
                  for="isRecurring"
                  class="font-bold text-gray-700 cursor-pointer text-sm"
                >
                  {{ t("booking.repeatAppointment") }}
                </label>
              </div>

              <div v-if="isRecurring" class="grid grid-cols-2 gap-4">
                <div>
                  <label
                    class="text-xs font-bold text-gray-500 uppercase block mb-1"
                    >{{ t("booking.frequency") }}</label
                  >
                  <Dropdown
                    v-model="recurrenceForm.freq"
                    :options="['Daily', 'Weekly', 'Bi-Weekly', 'Monthly']"
                    class="w-full p-inputtext-sm"
                  />
                </div>
                <div>
                  <label
                    class="text-xs font-bold text-gray-500 uppercase block mb-1"
                    >{{ t("booking.endsOn") }}</label
                  >
                  <Calendar
                    v-model="recurrenceForm.end_date"
                    :minDate="form.start_time"
                    class="w-full p-inputtext-sm"
                    dateFormat="dd/mm/yy"
                  />
                </div>
              </div>
            </div>

            <!-- ΕΟΠΠΥ toggle -->
            <div
              class="p-3 bg-[var(--p-primary-50)] rounded-lg border border-[var(--p-primary-100)] flex items-center justify-between"
            >
              <div class="flex items-center gap-3">
                <div
                  class="w-8 h-8 rounded-full bg-[var(--p-primary-100)] flex items-center justify-center text-[var(--p-primary-600)]"
                >
                  <i class="pi pi-file text-sm"></i>
                </div>
                <div class="flex flex-col">
                  <label
                    for="eoppySwitch"
                    class="font-bold text-[var(--p-primary-700)] cursor-pointer text-sm"
                  >
                    {{ t("booking.eoppy") }}
                  </label>
                  <span
                    class="text-xs text-[var(--p-primary-500)]"
                    v-if="isRecurring"
                  >
                    {{ t("booking.eoppyRecurringNote") }}
                  </span>
                </div>
              </div>
              <ToggleSwitch v-model="form.is_eoppy" inputId="eoppySwitch" />
            </div>

            <!-- Status + Block time -->
            <div
              class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-gray-100"
            >
              <div>
                <label
                  class="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2"
                  >{{ t("booking.statusLabel") }}</label
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

              <div class="flex flex-col justify-end pb-2">
                <div
                  class="p-3 bg-gray-50 rounded-lg border border-gray-100 flex items-center gap-2"
                >
                  <Checkbox v-model="form.is_block" binary inputId="isBlock" />
                  <label
                    for="isBlock"
                    class="text-sm text-gray-700 cursor-pointer"
                  >
                    {{ t("booking.blockTime") }}
                  </label>
                </div>
              </div>
            </div>
          </div>

          <!-- PRODUCTS TAB -->
          <div v-if="currentTab === 'Products'" class="space-y-4">
            <div
              class="bg-blue-50 border border-blue-100 p-4 rounded-xl flex items-start gap-3"
            >
              <i class="pi pi-shopping-bag text-blue-600 mt-1"></i>
              <div>
                <h4 class="text-sm font-bold text-blue-900">
                  {{ t("booking.retailProducts.title") }}
                </h4>
                <p class="text-xs text-blue-700">
                  {{ t("booking.retailProducts.note") }}
                </p>
              </div>
            </div>

            <BookingProducts
              v-model="productsList"
              :allProducts="allProducts"
            />
          </div>

          <!-- PAYMENT TAB -->
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

          <!-- NOTES TAB -->
          <div v-if="currentTab === 'Notes'" class="space-y-4">
            <div>
              <label
                class="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2"
              >
                {{ t("booking.notes.bookingNote") }}
              </label>
              <Textarea
                v-model="form.booking_notes"
                rows="3"
                class="w-full"
                :placeholder="t('booking.notes.bookingPlaceholder')"
              />
            </div>
            <div>
              <label
                class="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2"
              >
                {{ t("booking.notes.internalNote") }}
              </label>
              <div
                class="border-l-4 border-l-amber-400 rounded-r-lg overflow-hidden"
              >
                <Textarea
                  v-model="form.internal_notes"
                  rows="3"
                  class="w-full bg-amber-50"
                  :placeholder="t('booking.notes.internalPlaceholder')"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Footer bar -->
        <div
          class="px-4 md:px-6 py-4 border-t border-gray-200 flex flex-col-reverse sm:flex-row justify-between items-center bg-gradient-to-r from-gray-50 to-white flex-shrink-0 gap-3"
        >
          <Button
            v-if="isEditMode"
            :label="t('booking.cancelAppt')"
            icon="pi pi-trash"
            class="p-button-danger p-button-text p-button-sm w-full sm:w-auto"
            @click="confirmDelete"
          />
          <div class="flex flex-col sm:flex-row gap-3 ml-auto w-full sm:w-auto">
            <div
              class="flex items-center gap-2 justify-center sm:justify-start sm:mr-4 mb-2 sm:mb-0"
            >
              <Checkbox v-model="notifyClient" binary inputId="notify" />
              <label for="notify" class="text-sm text-gray-600">
                {{ t("booking.emailClient") }}
              </label>
            </div>
            <Button
              :label="t('booking.save')"
              @click="save()"
              :loading="loading"
              class="w-full sm:w-auto px-8"
            />
          </div>
        </div>
      </div>

      <!-- Right pane: client sidebar -->
      <div
        class="w-full md:w-[35%] bg-gray-50 order-1 md:order-2 border-b md:border-b-0 md:border-l border-gray-200 md:h-full md:overflow-y-auto flex-shrink-0"
      >
        <div
          class="md:hidden p-4 flex justify-between items-center bg-gray-100 border-b border-gray-200 cursor-pointer"
          @click="toggleMobileSidebar"
        >
          <span class="font-bold text-sm text-gray-700">
            {{ t("bookingSidebar.clientDetails") }}:
            {{ selectedClient?.full_name || t("bookingSidebar.noneSelected") }}
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
            :calculated-balance="previousDebt"
          />
        </div>
      </div>
    </div>

    <!-- Quick-add client dialog -->
    <Dialog
      v-model:visible="showQuickAddClient"
      :header="t('booking.quickAdd.title')"
      modal
      :style="{ width: '400px', maxWidth: '90vw' }"
    >
      <div class="space-y-4 pt-2">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{{
            t("booking.quickAdd.firstName")
          }}</label>
          <InputText
            id="qa_first"
            v-model="newClient.first_name"
            class="w-full"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{{
            t("booking.quickAdd.lastName")
          }}</label>
          <InputText
            id="qa_last"
            v-model="newClient.last_name"
            class="w-full"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{{
            t("booking.quickAdd.mobile")
          }}</label>
          <InputText id="qa_phone" v-model="newClient.phone" class="w-full" />
        </div>
      </div>
      <template #footer>
        <Button
          :label="t('booking.quickAdd.saveClient')"
          @click="saveNewClient"
          class="w-full"
        />
      </template>
    </Dialog>

    <ClientProfileDialog
      v-model:visible="showClientProfile"
      :clientId="currentProfileId"
      @refresh="() => {}"
    />
  </Dialog>
  <ConfirmDialog></ConfirmDialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";
import BookingProducts from "./booking/bookingProducts.vue";
import BookingServices from "./booking/bookingServices.vue";
import BookingPayments from "./booking/bookingPayments.vue";
import BookingSidebar from "./booking/bookingSideBar.vue";
import ClientProfileDialog from "./ClientProfileDialog.vue";
import { useConfirm } from "primevue/useconfirm";
import { useToast } from "primevue/usetoast";
const confirm = useConfirm();
const toast = useToast();
const { t } = useI18n();

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

const isRecurring = ref(false);
const recurrenceForm = ref<{ freq: string; end_date: Date | null }>({
  freq: "Weekly",
  end_date: null,
});

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
  is_eoppy: false,
});

// State lifted from children
const servicesList = ref<Array<any>>([]);
const productsList = ref<Array<any>>([]);

// UI State
const currentTab = ref("Booking");
const tabs = [
  { key: "Booking", label: computed(() => t("booking.tabs.booking")) },
  { key: "Notes", label: computed(() => t("booking.tabs.notes")) },
  { key: "Payment", label: computed(() => t("booking.tabs.payment")) },
] as const;

const loading = ref(false);
const paymentLoading = ref(false);
const showQuickAddClient = ref(false);
const showClientProfile = ref(false);
const currentProfileId = ref<string | null>(null);
const notifyClient = ref(true);
const newClient = ref({ first_name: "", last_name: "", phone: "" });
const amountToPayNow = ref(0);
const selectedPaymentMethod = ref<"card" | "cash" | "gift-card">("card");

const statusOptions = computed(() => [
  { label: t("common.status.new"), value: "new" },
  { label: t("common.status.confirmed"), value: "confirmed" },
  { label: t("common.status.arrived"), value: "arrived" },
  { label: t("common.status.started"), value: "started" },
  { label: t("common.status.completed"), value: "completed" },
  { label: t("common.status.noShow"), value: "no-show" },
  { label: t("common.status.cancelled"), value: "cancelled" },
]);

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
  props.clients.find((c: any) => c.id === form.value.client_id),
);

// Financial Calculations
const currentApptTotal = computed(() => {
  const servicesTotal = servicesList.value.reduce(
    (sum, s) => sum + (Number(s.price_override) || 0),
    0,
  );
  const productsTotal = productsList.value.reduce(
    (sum, p) => sum + (Number(p.price) || 0) * (p.quantity || 1),
    0,
  );
  return servicesTotal + productsTotal;
});

const originalSnapshot = ref({ price: 0, deposit: 0, isPast: false });

const originalDebtContribution = computed(() => {
  if (!form.value.id) return 0;
  // Mirror the backend logic: future appointments only contributed their deposit (as a credit) to the DB balance
  if (originalSnapshot.value.isPast) {
    return originalSnapshot.value.price - originalSnapshot.value.deposit;
  } else {
    return -originalSnapshot.value.deposit;
  }
});
const isApptInDatabaseBalance = computed(() => {
  if (!form.value.id || !form.value.start_time) return false;

  const apptDate = new Date(form.value.start_time);
  const startDateLimit = new Date("2026-03-01T00:00:00");

  // 1. If the appointment is before March 1st, 2026, it is NOT in the balance calculation
  if (apptDate < startDateLimit) return false;

  // 2. Matches SQL: Only appointments that have already happened (<= NOW)
  // are included in the database's outstanding_balance field.
  return apptDate <= new Date();
});

// Replace your existing previousDebt and totalDueNow with this:

const previousDebt = computed(() => {
  if (!selectedClient.value) return 0;

  const totalBalance = Number(selectedClient.value.outstanding_balance || 0);

  // If we are editing an appointment that is already "Past" (and thus included in the DB balance)
  if (isEditMode.value && isApptInDatabaseBalance.value) {
    // The DB balance contains: other_debt + (currentApptTotal - alreadyPaid).
    // Subtract only the unpaid portion of this appointment so we isolate other_debt.
    const currentApptUnpaid = Math.max(
      0,
      currentApptTotal.value - form.value.deposit_amount,
    );
    return Math.max(0, totalBalance - currentApptUnpaid);
  }

  // For NEW or FUTURE appointments, the database balance IS the previous debt
  return totalBalance;
});

const totalDueNow = computed(() => {
  // 1. Calculate what is still owed specifically for THIS appointment
  const currentApptUnpaid = Math.max(
    0,
    currentApptTotal.value - form.value.deposit_amount,
  );

  // 2. Total Due = (Old Debt) + (Unpaid part of current visit)
  return previousDebt.value + currentApptUnpaid;
});

// Only clamp the entered amount when the total due drops below it (e.g. a service is removed).
// The initial suggestion is set by the appointment watcher via nextTick so a user's
// custom partial-payment amount is never silently overwritten by a service-price change.
watch(totalDueNow, (newVal) => {
  if (amountToPayNow.value > newVal) {
    amountToPayNow.value = newVal;
  }
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
        is_eoppy: !!val.is_eoppy,
      };

      let rule = null;
      if (val.recurrence) {
        try {
          rule =
            typeof val.recurrence === "string"
              ? JSON.parse(val.recurrence)
              : val.recurrence;
        } catch (e) {
          console.warn("Invalid recurrence format, resetting:", val.recurrence);
          rule = null;
        }
      }

      if (rule) {
        isRecurring.value = true;
        recurrenceForm.value = {
          freq: rule.freq || "Weekly",
          end_date: rule.end_date ? new Date(rule.end_date) : null,
        };
      } else {
        isRecurring.value = false;
        recurrenceForm.value = { freq: "Weekly", end_date: null };
      }

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

      const apptStartTime = val.services?.[0]?.start_time || val.start_time;
      originalSnapshot.value = {
        price: currentApptTotal.value,
        deposit: form.value.deposit_amount,
        isPast: apptStartTime ? new Date(apptStartTime) < new Date() : false,
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
        is_eoppy: false,
      };

      isRecurring.value = false;
      recurrenceForm.value = { freq: "Weekly", end_date: null };

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
      originalSnapshot.value = { price: 0, deposit: 0, isPast: false };
    }

    // Suggest a sensible default amount after the form (and computed values) have settled.
    // Using nextTick so computed properties (currentApptTotal, totalDueNow) read the new form state.
    nextTick(() => {
      const currentApptUnpaid = Math.max(
        0,
        currentApptTotal.value - form.value.deposit_amount,
      );
      if (currentApptUnpaid > 0) {
        amountToPayNow.value = currentApptUnpaid;
      } else {
        amountToPayNow.value = Math.max(0, totalDueNow.value);
      }
    });
    currentTab.value = "Booking";
    showMobileSidebar.value = false;
  },
  { immediate: true },
);

// === METHODS ===

const save = async (close = true) => {
  // Check if editing an existing recurring appointment
  const isSeriesEdit = form.value.id && props.appointment?.group_id;
  const isConvertingToSeries =
    form.value.id && !props.appointment?.group_id && isRecurring.value;

  if (isSeriesEdit) {
    confirm.require({
      message: t("booking.editDialog.message"),
      header: t("booking.editDialog.header"),
      icon: "pi pi-question-circle",
      rejectLabel: t("booking.editDialog.thisOnly"),
      acceptLabel: t("booking.editDialog.thisAndFuture"),
      accept: () => executeSave(close, "series"),
      reject: () => executeSave(close, "single"),
    });
  } else if (isConvertingToSeries) {
    executeSave(close, "series");
  } else {
    executeSave(close, "single");
  }
};

const executeSave = async (close = true, scope = "single") => {
  if (!form.value.client_id && !form.value.is_block) {
    toast.add({
      severity: "warn",
      summary: t("common.error"),
      detail: t("booking.validation.selectClient"),
      life: 3000,
    });
    return;
  }
  if (servicesList.value.length === 0) {
    toast.add({
      severity: "warn",
      summary: t("common.error"),
      detail: t("booking.validation.addService"),
      life: 3000,
    });
    return;
  }

  loading.value = true;
  const token = localStorage.getItem("token");

  let url = form.value.id
    ? `/api/v1/appointments/${form.value.id}?scope=${scope}`
    : "/api/v1/appointments";

  const method = form.value.id ? "PUT" : "POST";

  try {
    const payload = {
      ...form.value,
      recurrence: isRecurring.value
        ? {
            freq: recurrenceForm.value.freq,
            end_date: recurrenceForm.value.end_date,
          }
        : null,
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

    if (!res.ok) {
      throw new Error(data.error || "Failed to save");
    }

    if (method === "POST") {
      form.value.id = data.id;
    }

    if (data.new_balance !== undefined && selectedClient.value) {
      selectedClient.value.outstanding_balance = Number(data.new_balance);
    }

    originalSnapshot.value = {
      price: currentApptTotal.value,
      deposit: form.value.deposit_amount,
      isPast: originalSnapshot.value.isPast,
    };

    if (close) {
      emit("save");
      dialogVisible.value = false;
    }
  } catch (e) {
    console.error(e);
    toast.add({
      severity: "error",
      summary: t("booking.toast.saveFailed"),
      detail: (e as Error).message || t("booking.toast.saveFailedDetail"),
      life: 4000,
    });
  } finally {
    loading.value = false;
  }
};

const recordPayment = async () => {
  if (amountToPayNow.value <= 0) return;
  paymentLoading.value = true;
  const token = localStorage.getItem("token");

  // Save any pending form changes (services, notes) before processing payment.
  // Do NOT force status='completed' here — the transaction endpoint handles that
  // atomically so a failed payment can't leave the appointment marked complete.
  await save(false);

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
      const data = await res.json();

      // Update local deposit_amount for immediate UI feedback
      form.value.deposit_amount += amountToPayNow.value;

      // Use the authoritative balance returned by the server instead of guessing by subtraction
      if (data.new_balance !== undefined && selectedClient.value) {
        selectedClient.value.outstanding_balance = Number(data.new_balance);
      }

      emit("save"); // Refresh the background calendar
    } else {
      const errData = await res.json().catch(() => ({}));
      toast.add({
        severity: "error",
        summary: t("booking.toast.paymentFailed"),
        detail: errData.error || t("booking.toast.paymentFailedDetail"),
        life: 4000,
      });
    }
  } catch (e) {
    console.error(e);
    toast.add({
      severity: "error",
      summary: t("booking.toast.paymentFailed"),
      detail: t("booking.toast.networkError"),
      life: 4000,
    });
  } finally {
    paymentLoading.value = false;
  }
};

const confirmDelete = () => {
  const isSeries = !!props.appointment?.group_id;

  confirm.require({
    message: isSeries
      ? t("booking.deleteDialog.messageRecurring")
      : t("booking.deleteDialog.messageSingle"),
    header: t("booking.deleteDialog.header"),
    icon: "pi pi-exclamation-triangle",
    rejectLabel: isSeries
      ? t("booking.editDialog.thisOnly")
      : t("booking.deleteDialog.no"),
    acceptLabel: isSeries
      ? t("booking.editDialog.thisAndFuture")
      : t("booking.deleteDialog.yes"),
    rejectClass: "p-button-outlined p-button-secondary",
    acceptClass: "p-button-danger",

    accept: async () => {
      await executeDelete(isSeries ? "series" : "single");
    },
    reject: async () => {
      if (isSeries) {
        await executeDelete("single");
      }
    },
  });
};

const executeDelete = async (scope: string) => {
  const token = localStorage.getItem("token");
  try {
    const res = await fetch(
      `/api/v1/appointments/${form.value.id}?scope=${scope}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.add({
        severity: "error",
        summary: t("booking.toast.deleteFailed"),
        detail: data.error || t("booking.toast.deleteFailedDetail"),
        life: 4000,
      });
      return;
    }
    emit("save");
    dialogVisible.value = false;
  } catch (e) {
    console.error(e);
    toast.add({
      severity: "error",
      summary: t("booking.toast.deleteFailed"),
      detail: t("booking.toast.networkError"),
      life: 4000,
    });
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

    // 1. Format the name
    client.full_name = `${client.first_name} ${client.last_name}`;

    // 2. ADD THE MISSING STRUCTURES HERE so the sidebar doesn't crash
    client.eoppy_breakdown = { total: 0, services: {} };
    client.non_eoppy_breakdown = { total: 0, services: {} };
    client.outstanding_balance = 0; // Good practice to default this too

    // 3. Push to state and select it
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
