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
                  : isBlockEdit
                    ? t("booking.editBlock")
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

              <ClientSelector
                v-if="!form.client_id"
                @select="onClientPicked"
              />

              <div v-else class="flex gap-2">
                <div
                  class="flex-grow flex justify-between items-center p-3 border border-gray-200 rounded-xl bg-gray-50 hover:bg-red-50 hover:border-red-200 transition-colors cursor-pointer group"
                  data-testid="booking-client-clear"
                  @click="clearSelectedClient"
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
                <!-- No profile for the walk-in client: it stands for "no
                     specific client" and its details can't be edited. Nor
                     for a client added offline, until it syncs. -->
                <Button
                  v-if="!isWalkInSelected && !isTempId(String(form.client_id))"
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

            <div
              v-if="groupedWithTime"
              class="mb-3 flex items-center gap-2 rounded-lg bg-[var(--p-primary-50)] border border-[var(--p-primary-200)] px-3 py-2 text-sm text-[var(--p-primary-800)]"
            >
              <i class="pi pi-link text-xs"></i>
              {{ t("booking.groupedWithExisting", { time: groupedWithTime }) }}
            </div>

            <!-- Services -->
            <BookingServices
              v-model="servicesList"
              :services="services"
              :staff="staff"
              :baseStartTime="new Date(form.start_time)"
              :default-staff-id="currentStaffId"
              :timeOff="props.timeOff || []"
              :workingHours="props.workingHours || []"
              :requireStaff="true"
              :shopMinTime="props.shopMinTime"
              :shopMaxTime="props.shopMaxTime"
            />

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
                <Button
                  type="button"
                  :label="t('booking.blockTime')"
                  icon="pi pi-ban"
                  :class="form.is_block ? '' : 'p-button-outlined'"
                  :severity="form.is_block ? 'warning' : 'secondary'"
                  v-tooltip.top="t('booking.blockTimeNote')"
                  @click="form.is_block = !form.is_block"
                />
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
            <BookingPackages
              ref="bookingPackagesRef"
              :clientId="form.client_id"
              :appointmentId="form.id"
              :servicesList="servicesList"
              v-model:pendingPackages="pendingPackages"
              :ensureSaved="ensureSavedForPackage"
              @changed="onPackageChanged"
            />
            <BookingGiftCards
              :clientId="form.client_id"
              :defaultCustomerName="selectedClient?.full_name"
              v-model:pendingGiftCards="pendingGiftCards"
            />

            <!-- Same-day appointments (different staff) — visible to any
                 role so staff can see the client's full day at a glance;
                 only admin/frontdesk/super_admin can select siblings to
                 combine into one payment (canCombineDayPayment). -->
            <div
              v-if="siblingAppointments.length"
              class="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-100"
            >
              <h4 class="text-sm font-bold text-gray-700 mb-3">
                {{ t("payment.sameDayAppointments") }}
              </h4>
              <div
                v-for="sib in siblingAppointments"
                :key="sib.id"
                class="flex items-center gap-3 py-1.5"
              >
                <Checkbox
                  v-model="selectedSiblingIds"
                  :value="sib.id"
                  :disabled="!canCombineDayPayment || sib.owed <= 0"
                />
                <div class="flex-1 min-w-0 text-sm text-gray-700 truncate">
                  {{ sib.services.map((s: any) => s.service_name).join(", ") }}
                  <span class="text-gray-400">
                    — {{ sib.services[0]?.staff_name }}</span
                  >
                </div>
                <div class="text-sm font-semibold text-gray-800 flex-shrink-0">
                  {{ formatMoney(sib.owed) }}
                  <span
                    v-if="sib.payment_status === 'paid'"
                    class="text-xs font-normal text-green-600"
                    >({{ t("payment.paid") }})</span
                  >
                </div>
              </div>
            </div>

            <BookingDiscount
              v-model="discount"
              :codes="discountCodes"
              :discountAmount="discountAmount"
            />

            <div v-if="canChangePriceOrRefund" class="flex gap-2 mb-6">
              <Button
                :label="t('priceChange.button')"
                icon="pi pi-pencil"
                severity="secondary"
                outlined
                size="small"
                @click="priceChangeVisible = true"
              />
              <Button
                :label="t('refund.button')"
                icon="pi pi-replay"
                severity="secondary"
                outlined
                size="small"
                :disabled="form.deposit_amount <= 0"
                @click="refundVisible = true"
              />
            </div>
            <PriceChangeDialog
              v-model:visible="priceChangeVisible"
              :appointmentId="form.id"
              :currentTotal="currentApptTotal"
              :ensureSaved="ensureSavedForPackage"
              @changed="onPriceChanged"
            />
            <RefundDialog
              v-model:visible="refundVisible"
              :appointmentId="form.id"
              :maxRefundable="form.deposit_amount"
              :ensureSaved="ensureSavedForPackage"
              @refunded="onRefunded"
            />

            <BookingPayments
              ref="bookingPaymentsRef"
              :totalDueNow="combinedTotalDueNow"
              :currentApptTotal="currentApptTotal"
              :servicesTotal="servicesTotal"
              :productsTotal="productsTotal"
              :discountAmount="discountAmount"
              :previousDebt="previousDebt"
              :packagesTotal="pendingPackagesTotal"
              :giftCardsTotal="pendingGiftCardsTotal"
              :sameDayAppointmentsTotal="selectedSiblingsOwedTotal"
              :depositAmount="form.deposit_amount + selectedSiblingsDepositTotal"
              :loading="paymentLoading"
              :paidPaymentMethod="form.payment_method"
              :clientId="form.client_id"
              :catalogServices="services"
              :appointmentServices="servicesList"
              v-model:paymentMethod="selectedPaymentMethod"
              v-model:amountToPay="amountToPayNow"
              v-model:giftCardId="selectedGiftCardId"
              v-model:membershipRedemptions="selectedMembershipRedemptions"
              @pay="recordPayment"
            />
          </div>

          <!-- NOTES TAB -->
          <div v-if="currentTab === 'Notes'" class="space-y-4">
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
            data-testid="booking-delete"
            @click="confirmDelete"
          />
          <div class="flex flex-col sm:flex-row gap-3 ml-auto w-full sm:w-auto">
            <div
              class="flex items-center gap-2 justify-center sm:justify-start sm:mr-4 mb-2 sm:mb-0"
            >
              <!-- <Checkbox v-model="notifyClient" binary inputId="notify" />
              <label for="notify" class="text-sm text-gray-600">
                {{ t("booking.emailClient") }}
              </label> -->
              <!-- <Checkbox
                v-model="form.save_receipt"
                binary
                inputId="saveReceipt"
              />
              <label
                for="saveReceipt"
                class="text-sm font-medium text-gray-700 cursor-pointer"
              >
                Save Receipt
              </label> -->
              <Button
                v-if="currentTab !== 'Payment'"
                :label="t('booking.tabs.payment')"
                data-testid="booking-payment-tab"
                @click="currentTab = 'Payment'"
                severity="success"
              />
            </div>
            <Button
              v-if="!form.is_block"
              :label="t('booking.repeat.button')"
              icon="pi pi-copy"
              outlined
              :disabled="!canRepeatBooking"
              v-tooltip.top="!canRepeatBooking ? t('booking.repeat.needClientAndStaff') : null"
              @click="showRepeatDialog = true"
            />
            <Button
              :label="t('booking.save')"
              @click="save()"
              data-testid="booking-save"
              :loading="loading"
              :disabled="!canSaveBooking"
              v-tooltip.top="!canSaveBooking ? t('booking.validation.staffRequired') : null"
              class="w-full sm:w-auto px-8"
            />
            <!-- <div class="flex flex-col justify-end gap-3 pb-2">
              <div class="flex items-center gap-2">
                <i
                  class="pi pi-info-circle text-gray-400 text-xs"
                  v-tooltip="
                    'If unchecked, this will be hidden from reports when completed'
                  "
                ></i>
              </div>
            </div> -->
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
            v-model:bookingNotes="form.booking_notes"
            @debt-changed="onDebtChanged"
          />
        </div>
      </div>
    </div>

    <RepeatBookingDialog
      v-model:visible="showRepeatDialog"
      :services="servicesList"
      :clientId="form.client_id"
      :staff="props.staff || []"
      :workingHours="props.workingHours || []"
      :timeOff="props.timeOff || []"
      @created="emit('refresh')"
    />

    <ClientProfileDialog
      v-model:visible="showClientProfile"
      :clientId="currentProfileId"
      @refresh="() => {}"
    />
  </Dialog>
  <ConfirmDialog></ConfirmDialog>
</template>

<script setup lang="ts">
import { api, ApiError } from "../api/http";
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";
import BookingProducts from "./booking/bookingProducts.vue";
import BookingServices from "./booking/bookingServices.vue";
import BookingPayments from "./booking/bookingPayments.vue";
import BookingDiscount from "./booking/BookingDiscount.vue";
import BookingPackages from "./booking/BookingPackages.vue";
import BookingGiftCards from "./booking/BookingGiftCards.vue";
import PriceChangeDialog from "./booking/PriceChangeDialog.vue";
import RefundDialog from "./booking/RefundDialog.vue";
import {
  emptyDiscount,
  computeDiscountAmount,
  discountFromAppointment,
  discountPayload,
  type DiscountState,
} from "../utils/discount";
import BookingSidebar from "./booking/bookingSideBar.vue";
import ClientSelector from "./ClientSelector.vue";
import RepeatBookingDialog from "./booking/RepeatBookingDialog.vue";
import ClientProfileDialog from "./ClientProfileDialog.vue";
import { useConfirm } from "primevue/useconfirm";
import { useToast } from "primevue/usetoast";
import { fetchOrQueue } from "../offline/queue";
import { knownOverlapIds } from "../offline/overlaps";
import { isTempId } from "../offline/tempIds";
import { askOverCapacity, personsOf, placesOf } from "../utils/capacity";
import { formatMoney } from "../utils/format";
import { useBookingTotals } from "../composables/useBookingTotals";
import { appendNote, firstStartOf, sameDayAppointmentFor } from "../utils/sameDayGrouping";
import { useCalendarStore } from "../stores/calendar";
import {
  isStaffAvailable,
  toLocalDateStr,
  describeWorkingDay,
  overtimeConfirmMessage,
} from "../utils/staffAvailability";
import { matchVariationName } from "../utils/serviceVariations";
import { markManualStarts } from "../utils/serviceSequence";
import {
  snapshotServices,
  describeServiceChanges,
  type ServiceSnapshot,
} from "../utils/appointmentChanges";
import { useAuthStore } from "../stores/auth";
const confirm = useConfirm();
const toast = useToast();
const { t, locale } = useI18n();
const authStore = useAuthStore();
const canChangePriceOrRefund = computed(() => authStore.isShopAdmin);
// Combining several of a client's same-day appointments into one payment
// crosses staff ownership (a plain "staff" role normally only ever sees/acts
// on their own bookings) — gated the same way canSellExtras already gates
// packages/gift cards server-side. The read (siblingAppointments fetch) stays
// open to every role so a plain staff member can still see the day's total.
const canCombineDayPayment = computed(() => authStore.isShopAdmin);
const priceChangeVisible = ref(false);
const refundVisible = ref(false);

const props = defineProps([
  "visible",
  "appointment",
  "services",
  "staff",
  "allProducts",
  "timeOff",
  "workingHours",
  "shopMinTime",
  "shopMaxTime",
]);

const emit = defineEmits(["update:visible", "save", "refresh"]);
const showRepeatDialog = ref(false);
const canRepeatBooking = computed(
  () =>
    !!form.value.client_id &&
    servicesList.value.length > 0 &&
    servicesList.value.every((s) => s.service_id && s.staff_id),
);
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

// A staff member is required per service row — every block needs to land on
// a specific person's calendar column. A time-off block still needs exactly
// one staff member picked on its single row (see saveAsTimeOff below), even
// though it has no real service selected.
const missingStaffService = computed(() =>
  form.value.is_block
    ? !servicesList.value[0]?.staff_id
    : servicesList.value.some((s: any) => s.service_id && !s.staff_id),
);
const canSaveBooking = computed(
  () => servicesList.value.length > 0 && !missingStaffService.value,
);

// UI State
const currentTab = ref("Booking");
const tabs = [
  { key: "Booking", label: computed(() => t("booking.tabs.booking")) },
  { key: "Products", label: computed(() => t("booking.tabs.products")) },
  { key: "Notes", label: computed(() => t("booking.tabs.notes")) },
  { key: "Payment", label: computed(() => t("booking.tabs.payment")) },
] as const;

const loading = ref(false);
const paymentLoading = ref(false);
const showClientProfile = ref(false);
const currentProfileId = ref<string | null>(null);
const notifyClient = ref(true);
const amountToPayNow = ref(0);
const selectedPaymentMethod = ref<"card" | "cash" | "gift-card" | "membership">(
  "card",
);
const selectedGiftCardId = ref<string | null>(null);
const selectedMembershipRedemptions = ref<any[]>([]);
const bookingPaymentsRef = ref<any>(null);

const statusOptions = computed(() => [
  { label: t("common.status.new"), value: "new" },
  { label: t("common.status.confirmed"), value: "confirmed" },
  { label: t("common.status.arrived"), value: "arrived" },
  { label: t("common.status.started"), value: "started" },
  { label: t("common.status.completed"), value: "completed" },
  { label: t("common.status.noShow"), value: "no-show" },
  { label: t("common.status.noResponse"), value: "no-response" },
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

onMounted(async () => {
  try {
    discountCodes.value = (await api.get("/api/v1/discount-codes")).filter((c: any) => c.is_active);
  } catch {
    // codes are optional; fixed/percent discounts still work
  }
  checkMobile();
  window.addEventListener("resize", checkMobile);
});

onUnmounted(() => {
  window.removeEventListener("resize", checkMobile);
});

// === COMPUTED ===
const isEditMode = computed(() => !!form.value.id);
const isBlockEdit = computed(() => !!form.value.time_off_id);

// --- Client selection (server-side search — with 5000+ clients we never load
// the full list, see calendar.ts) ---
const selectedClient = ref<any>(null);
const onClientPicked = (client: any) => {
  selectedClient.value = client;
  form.value.client_id = client.id;
  refreshClientBalance(client.id);
  groupWithSameDayAppointment(client.id);
};

// The stored balance can be stale (debt appears when an appointment's time
// passes), so the server recalculates it whenever a client is shown here.
const refreshClientBalance = async (clientId: string) => {
  if (!clientId) return;
  try {
    const { balance } = await api.get(`/api/v1/clients/${clientId}/balance`);
    if (selectedClient.value?.id === clientId) {
      selectedClient.value.outstanding_balance = Number(balance) || 0;
    }
  } catch {
    // keep the stored figure if the refresh fails
  }
};

// A payment or write-off made from the sidebar.
const onDebtChanged = (e: { appointmentId?: string; amount: number; remaining?: number; newBalance: number }) => {
  if (selectedClient.value) selectedClient.value.outstanding_balance = Number(e.newBalance) || 0;
  if (e.appointmentId && e.appointmentId === form.value.id) {
    form.value.deposit_amount = Number(form.value.deposit_amount || 0) + Number(e.amount || 0);
    // Part of it settled: still partly unpaid.
    form.value.payment_status = Number(e.remaining) > 0 ? "partial" : "paid";
  }
  emit("refresh");
};

const clearSelectedClient = () => {
  form.value.client_id = null;
  selectedClient.value = null;
};

// Re-hydrates selectedClient for an existing appointment without ever loading
// the full client list — an instant approximation from the appointment payload
// itself, refined a moment later with the full slim record (adds custom_fields).
const loadClientById = async (clientId: string, fallback: any) => {
  selectedClient.value = fallback;
  if (!clientId) return;
  try {
    const rows = await api.get(`/api/v1/clients?slim=true&id=${clientId}`);
    if (rows[0]) selectedClient.value = rows[0];
  } catch {
    // keep the fallback if the lookup fails
  }
  await refreshClientBalance(clientId);
};

// This client's other active appointments the same calendar day, across
// every staff member — powers the Payment tab's combined-day checklist.
// Fetched regardless of role (so a plain staff member still sees the full
// day read-only); only the checkbox interaction is gated client-side by
// canCombineDayPayment.
const loadSiblingAppointments = async (clientId: string, startTime: Date) => {
  siblingsLoading.value = true;
  try {
    const dateStr = toLocalDateStr(startTime);
    const all = await api.get(`/api/v1/clients/${clientId}/appointments-on-date?date=${dateStr}`).catch(() => null);
    if (all) {
      siblingAppointments.value = all.filter(
        (a: any) => a.id !== form.value.id,
      );
      // Pre-select the day's other unpaid appointments, so checkout totals
      // the whole day by default; staff can untick to pay one only.
      if (canCombineDayPayment.value) {
        selectedSiblingIds.value = siblingAppointments.value
          .filter((s: any) => Number(s.owed) > 0)
          .map((s: any) => s.id);
      }
    }
  } catch {
    // leave the list empty if this fails — not critical to saving/paying
  } finally {
    siblingsLoading.value = false;
  }
};

// A new booking for a client who already has an appointment that day is
// added to that appointment instead (same client, same day, not cancelled
// or no-show): the dialog switches to the existing appointment and appends
// the new service rows at their own times. Not for the shared walk-in
// client, time blocks or recurring bookings. groupRequest discards a stale
// lookup when the client, date or dialog changes meanwhile.
const walkInClientId = ref<string | null>(null);
const groupedWithTime = ref<string | null>(null);
let groupRequest = 0;

const groupWithSameDayAppointment = async (clientId: string) => {
  if (!clientId || form.value.id || form.value.is_block || isRecurring.value) return;
  if (clientId === walkInClientId.value) return;
  const request = ++groupRequest;
  const dateStr = toLocalDateStr(new Date(form.value.start_time));
  try {
    const existing = sameDayAppointmentFor(await api.get(`/api/v1/appointments?date=${dateStr}`), clientId);
    if (!existing) return;
    if (
      request !== groupRequest ||
      !props.visible ||
      form.value.id ||
      form.value.client_id !== clientId ||
      isRecurring.value
    ) return;

    const newRows = servicesList.value.map((r: any) => ({ ...r, _manualStart: true }));
    const newProducts = productsList.value.map((p: any) => ({ ...p }));
    const newBookingNotes = (form.value.booking_notes || "").trim();
    const newInternalNotes = (form.value.internal_notes || "").trim();

    loadExistingAppointment(existing, null);
    servicesList.value = [...servicesList.value, ...newRows];
    productsList.value = [...productsList.value, ...newProducts];
    form.value.booking_notes = appendNote(form.value.booking_notes || "", newBookingNotes);
    form.value.internal_notes = appendNote(form.value.internal_notes || "", newInternalNotes);

    const start = new Date(firstStartOf(existing));
    groupedWithTime.value = `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`;
    nextTick(suggestAmountToPay);
  } catch {
    // keep it as a separate new booking if the lookup fails
  }
};

// Pre-selects the shop's single walk-in client on a brand-new, blank
// appointment — lets staff save fast and attribute it to a real client
// later via the same "×" clear-and-search flow used for any appointment.
// Silently does nothing if it fails; staff can still pick a client by hand.
const loadWalkInClient = async () => {
  try {
    const walkIn = await api.get("/api/v1/clients/walk-in").catch(() => null);
    if (walkIn) {
      walkInClientId.value = walkIn.id;
      selectedClient.value = walkIn;
      form.value.client_id = walkIn.id;
      refreshClientBalance(walkIn.id);
    }
  } catch {
    // leave the client picker blank if this fails
  }
};

// Financial Calculations
const discount = ref<DiscountState>(emptyDiscount());
const discountCodes = ref<any[]>([]);
const originalDiscountAmount = ref(0);

// Packages picked to buy alongside this payment (Payment tab) — sold in
// full when the payment is submitted, added to the displayed total so
// staff pay "service + package" as one number. See recordPayment below.
const pendingPackages = ref<
  { package_type_id: string; name: string; price: number }[]
>([]);
const pendingPackagesTotal = computed(() =>
  pendingPackages.value.reduce((sum, p) => sum + Number(p.price), 0),
);
const bookingPackagesRef = ref<any>(null);

const pendingGiftCards = ref<
  { card_number: string; customer_name: string; initial_amount: number }[]
>([]);
const pendingGiftCardsTotal = computed(() =>
  pendingGiftCards.value.reduce((sum, g) => sum + Number(g.initial_amount), 0),
);

// This client's other active appointments the same calendar day (any staff
// member), fetched fresh per-dialog-open — see the watch init below. Lets
// an admin/frontdesk/super_admin fold several same-day appointments into
// one combined payment (canCombineDayPayment); a plain staff member still
// sees the list and the combined total read-only.
const siblingAppointments = ref<any[]>([]);
const selectedSiblingIds = ref<string[]>([]);
const siblingsLoading = ref(false);
// The money side (totals, earlier debt, what's due now): see
// composables/useBookingTotals.ts.
const {
  selectedSiblingsOwedTotal,
  selectedSiblingsDepositTotal,
  servicesTotal,
  productsTotal,
  discountAmount,
  currentApptTotal,
  previousDebt,
  totalDueNow,
  combinedTotalDueNow,
  suggestedAmount,
} = useBookingTotals({
  services: servicesList,
  products: productsList,
  discount,
  client: selectedClient,
  isEdit: isEditMode,
  form,
  siblings: siblingAppointments,
  selectedSiblingIds,
  pendingPackagesTotal,
  pendingGiftCardsTotal,
});

const originalServices = ref<ServiceSnapshot[]>([]);
const originalSnapshot = ref({ price: 0, deposit: 0, isPast: false });

// Suggests a sensible default amount: pay off whatever's explicitly owed for
// this appointment plus any currently-checked same-day siblings, falling
// back to the full combined total (incl. old debt) only once there's
// nothing left owed on the selected set. Called once on dialog open (via
// nextTick below, so currentApptTotal/totalDueNow have settled) and again
// whenever the sibling selection itself changes — selecting a sibling is a
// deliberate "include this in the payment" action, so the suggested amount
// must track it upward too, not just clamp down (see the clamp watch below,
// which only ever handles decreases).
const suggestAmountToPay = () => {
  amountToPayNow.value = suggestedAmount();
};

watch(selectedSiblingIds, () => nextTick(suggestAmountToPay), { deep: true });

// Only clamp the entered amount when the total due drops below it (e.g. a
// service is removed). suggestAmountToPay above handles increases (initial
// suggestion + sibling selection); this only ever needs to handle decreases
// so a user's custom partial-payment amount is never silently overwritten by
// an unrelated service-price change.
watch(combinedTotalDueNow, (newVal) => {
  if (amountToPayNow.value > newVal) {
    amountToPayNow.value = newVal;
  }
});

// Fills the form from an existing appointment (EDIT MODE). Also used when a
// new booking is grouped into the client's existing appointment that day.
// The version of the appointment this dialog is editing: sent with saves as
// base_version, so an edit made from an outdated copy (changed on another
// device, or online while this one was offline) is refused instead of
// overwriting the newer change. Updated after each save/payment here; null
// when unknown (a change of this appointment is already waiting to sync).
const currentVersion = ref<number | null>(null);
const calendarStoreForOverlaps = useCalendarStore();

const loadExistingAppointment = (val: any, resolvedStaffId: any) => {
  currentVersion.value = val.version ?? null;
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

  if (val.client_id) {
    loadClientById(val.client_id, {
      id: val.client_id,
      first_name: val.first_name,
      last_name: val.last_name,
      full_name: `${val.first_name || ""} ${val.last_name || ""}`.trim(),
      phone: val.client_phone,
      outstanding_balance: Number(val.client_outstanding_balance || 0),
    });
  } else {
    selectedClient.value = null;
  }

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
    servicesList.value = markManualStarts(val.services.map((s: any) => {
      // Which variation this row was is now persisted server-side
      // (appointment_services.variation_name — s.variation_name here),
      // independent of price/duration, so it survives later edits to
      // either (e.g. extending the duration). s.variation_name is only
      // absent for appointments saved before that column existed; for
      // those, fall back once here to reverse-matching the saved price/
      // duration against the service's current variation list — same as
      // before, still breaks if price/duration are edited afterward,
      // but that's now limited to pre-migration data only.
      const catalogService = props.services?.find(
        (cs: any) => cs.id === s.service_id,
      );
      const resolvedVariationName =
        s.variation_name ||
        matchVariationName(
          catalogService,
          Number(s.price || 0),
          s.duration_minutes || 60,
        );
      return {
        service_id: s.service_id,
        staff_id: s.staff_id,
        start_time: s.start_time
          ? new Date(s.start_time)
          : new Date(val.start_time),
        duration_override: s.duration_minutes || 60,
        price_override: Number(s.price || 0),
        variation_name: resolvedVariationName || null,
        persons: personsOf(s),
        service_archived: !!s.service_archived,
        _label: resolvedVariationName
          ? `${catalogService?.name || s.service_name || ""} — ${resolvedVariationName}`
          : catalogService?.name || s.service_name || "",
      };
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

  originalServices.value = snapshotServices(servicesList.value);
  discount.value = discountFromAppointment(val);
  originalDiscountAmount.value = discountAmount.value;
  const apptStartTime = val.services?.[0]?.start_time || val.start_time;
  originalSnapshot.value = {
    price: currentApptTotal.value,
    deposit: form.value.deposit_amount,
    isPast: apptStartTime ? new Date(apptStartTime) < new Date() : false,
  };

  if (form.value.client_id && form.value.start_time) {
    loadSiblingAppointments(form.value.client_id, form.value.start_time);
  }
};

// === INITIALIZATION ===
watch(
  [() => props.appointment, () => props.visible],
  ([val, visible]) => {
    if (!visible) return;
    // Never carry a stale same-day-payment selection into a new dialog
    // instance — EDIT MODE below repopulates siblingAppointments if this
    // appointment has a client + start_time; NEW MODE (a brand-new,
    // unsaved appointment) never has siblings to show.
    selectedSiblingIds.value = [];
    siblingAppointments.value = [];
    let resolvedStaffId = null;
    if (val?.staff_id && props.staff) {
      const found = props.staff.find((s: any) => s.id == val.staff_id);
      if (found) resolvedStaffId = found.id;
    }

    groupedWithTime.value = null;
    groupRequest++;
    if (val && val.id) {
      // === EDIT MODE ===
      loadExistingAppointment(val, resolvedStaffId);
    } else {
      // === NEW MODE ===
      const newStart = val?.start_time ? new Date(val.start_time) : new Date();
      // A drag-select on the calendar carries both ends of the selected span
      // (SchedulerView's `select` handler passes end_time through) — use that
      // as the new service's duration instead of always defaulting to 60.
      const draggedDurationMinutes = val?.end_time
        ? Math.max(
            5,
            Math.round(
              (new Date(val.end_time).getTime() - newStart.getTime()) / 60000,
            ),
          )
        : 60;

      // A caller (e.g. the client search's "Book an appointment" button) can
      // pre-select a client for a brand-new booking — everything else below
      // still behaves exactly like starting from a blank slot. Otherwise,
      // pre-select the shop's walk-in client so a booking can be saved fast
      // and attributed to a real client later (see loadWalkInClient below).
      if (val?.client_id) {
        loadClientById(val.client_id, {
          id: val.client_id,
          first_name: val.first_name,
          last_name: val.last_name,
          full_name: `${val.first_name || ""} ${val.last_name || ""}`.trim(),
          phone: val.phone,
          outstanding_balance: Number(val.outstanding_balance || 0),
        });
      } else {
        selectedClient.value = null;
        loadWalkInClient();
      }

      // Clicking an existing "break" block on the scheduler reopens this same
      // dialog in NEW MODE (no appointment id exists for a time-off row) but
      // pre-filled as an edit: is_block starts true, and time_off_id/
      // time_off_staff_id are kept so Save can replace (or, if the block
      // toggle is clicked off, delete) the right staff_time_off row. See
      // saveAsTimeOff/unblockTimeOff below.
      form.value = {
        id: null,
        client_id: val?.client_id || null,
        start_time: newStart,
        status: "new",
        internal_notes: val?.time_off_id ? val.reason || "" : "",
        deposit_amount: 0,
        payment_status: "unpaid",
        is_block: !!val?.time_off_id,
        time_off_id: val?.time_off_id || null,
        time_off_staff_id: val?.time_off_id
          ? val.staff_id || resolvedStaffId
          : null,
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
          duration_override: draggedDurationMinutes,
          price_override: 0,
        },
      ];

      productsList.value = [];
      discount.value = emptyDiscount();
      originalDiscountAmount.value = 0;
      originalSnapshot.value = { price: 0, deposit: 0, isPast: false };
      if (val?.client_id && !val?.time_off_id) groupWithSameDayAppointment(val.client_id);
    }

    // Suggest a sensible default amount after the form (and computed values) have settled.
    // Using nextTick so computed properties (currentApptTotal, totalDueNow) read the new form state.
    nextTick(suggestAmountToPay);
    currentTab.value = "Booking";
    showMobileSidebar.value = false;
  },
  { immediate: true },
);

// === METHODS ===

// Package visits attach to a saved appointment: save pending edits first.
const ensureSavedForPackage = async (): Promise<string | null> => {
  if (!(await save(false))) return null;
  return form.value.id || null;
};

const onPackageChanged = (data: any) => {
  if (data.new_balance !== undefined && selectedClient.value) {
    selectedClient.value.outstanding_balance = Number(data.new_balance);
  }
  if (data.amount) form.value.deposit_amount += Number(data.amount);
  if (data.status) form.value.status = data.status;
  if (data.payment_status) form.value.payment_status = data.payment_status;
  originalSnapshot.value = {
    ...originalSnapshot.value,
    deposit: form.value.deposit_amount,
  };
  emit("save");
};

// A manual checkout price change re-derives each service's price_override
// server-side (see /api/v1/appointments/:id/price-change) — the server is
// the sole authority on the split, so servicesList is replaced verbatim from
// its response rather than re-deriving the same math client-side too.
const onPriceChanged = (data: any) => {
  if (Array.isArray(data.services)) {
    servicesList.value = markManualStarts(data.services.map((s: any) => ({
      service_id: s.service_id,
      staff_id: s.staff_id,
      start_time: new Date(s.start_time),
      duration_override: s.duration_override,
      price_override: Number(s.price_override),
      persons: personsOf(s),
    })));
    originalServices.value = snapshotServices(servicesList.value);
  }
  if (data.new_balance !== undefined && selectedClient.value) {
    selectedClient.value.outstanding_balance = Number(data.new_balance);
  }
  emit("save");
};

const onRefunded = (data: any) => {
  if (data.new_balance !== undefined && selectedClient.value) {
    selectedClient.value.outstanding_balance = Number(data.new_balance);
  }
  // deposit_amount tracks "amount paid so far" for this dialog's own display
  // (max refundable, balance summary) — a refund reduces net-collected, so
  // it needs to shrink the same way a payment grows it.
  form.value.deposit_amount = Math.max(
    0,
    form.value.deposit_amount - Number(data.amount || 0),
  );
  originalSnapshot.value = {
    ...originalSnapshot.value,
    deposit: form.value.deposit_amount,
  };
  emit("save");
};

const confirmChanges = (): Promise<boolean> => {
  if (!form.value.id || form.value.is_block) return Promise.resolve(true);
  const lines = describeServiceChanges(
    originalServices.value,
    snapshotServices(servicesList.value),
    {
      services: props.services || [],
      staff: props.staff || [],
      t,
      locale: locale.value,
    },
  );
  if (discountAmount.value !== originalDiscountAmount.value) {
    lines.push(
      `${t("discount.line")}: ${formatMoney(originalDiscountAmount.value)} → ${formatMoney(discountAmount.value)}`,
    );
  }
  if (lines.length === 0) return Promise.resolve(true);
  return new Promise((resolve) => {
    confirm.require({
      header: t("booking.changeConfirm.header"),
      message: `${t("booking.changeConfirm.intro")}\n\n${lines
        .map((l) => `• ${l}`)
        .join("\n")}\n\n${t("booking.changeConfirm.question")}`,
      icon: "pi pi-question-circle",
      acceptLabel: t("booking.changeConfirm.apply"),
      rejectLabel: t("booking.changeConfirm.cancel"),
      accept: () => resolve(true),
      reject: () => resolve(false),
      onHide: () => resolve(false),
    });
  });
};

const confirmOvertime = (entries: { name: string; hours: string | null }[]): Promise<boolean> =>
  new Promise((resolve) => {
    confirm.require({
      header: t("booking.overtime.header"),
      message: overtimeConfirmMessage(entries, t),
      icon: "pi pi-clock",
      acceptLabel: t("booking.overtime.accept"),
      rejectLabel: t("common.cancel"),
      accept: () => resolve(true),
      reject: () => resolve(false),
      onHide: () => resolve(false),
    });
  });

// A "block time" dialog has no client or real service — it just needs one
// staff member + a time span, which already live on servicesList's single
// row (see missingStaffService above). Saves through the exact same
// staff_time_off mechanism as the Staff page's own time-off dialog (type
// "break", same conflict/force pattern), rather than creating a blocked
// `appointments` row.
const saveAsTimeOff = async (force = false): Promise<boolean> => {
  const svc = servicesList.value[0];
  const staffId = svc?.staff_id;
  if (!staffId || !svc?.start_time) return false;

  const start = new Date(svc.start_time);
  const end = new Date(start.getTime() + (svc.duration_override || 60) * 60000);
  const toDateStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const toTimeStr = (d: Date) =>
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  try {
    // Overlapping bookings: 409 with the list, asked about before forcing.
    const conflict = await api
      .post(`/api/v1/staff/${staffId}/time-off`, {
        type: "break",
        start_date: toDateStr(start),
        end_date: toDateStr(start),
        start_time: toTimeStr(start),
        end_time: toTimeStr(end),
        reason: form.value.internal_notes || null,
        force,
      })
      .then(() => null)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 409) return e.data || {};
        throw e;
      });

    if (conflict) {
      const data = conflict;
      const list = (data.conflicts || [])
        .map(
          (c: any) =>
            `• ${c.client_name || "—"} — ${c.service_name || ""} (${formatDate(c.start_time)})`,
        )
        .join("\n");
      return new Promise((resolve) => {
        confirm.require({
          message: t("staff.timeOff.conflictMessage", {
            count: (data.conflicts || []).length,
            list,
          }),
          header: t("staff.timeOff.conflictHeader"),
          icon: "pi pi-exclamation-triangle",
          acceptClass: "p-button-warning",
          accept: async () => resolve(await saveAsTimeOff(true)),
          reject: () => resolve(false),
          onHide: () => resolve(false),
        });
      });
    }

    // Editing an existing block: the replacement above is already safely
    // created (and conflict-checked only against real appointments, never
    // against this old row), so it's now safe to remove the original —
    // using its original staff id, which may differ if the block was moved
    // to another staff member in this edit.
    if (form.value.time_off_id && form.value.time_off_staff_id) {
      await api.del(`/api/v1/staff/${form.value.time_off_staff_id}/time-off/${form.value.time_off_id}`).catch(() => {});
    }

    toast.add({
      severity: "success",
      summary: t("common.success"),
      detail: t("staff.timeOff.saved"),
      life: 3000,
    });
    emit("save");
    emit("update:visible", false);
    return true;
  } catch (err) {
    toast.add({
      severity: "error",
      summary: t("common.error"),
      detail: t("staff.timeOff.saveFailed"),
      life: 4000,
    });
    return false;
  }
};

// Toggling the block button off while editing an existing block ("unclick")
// just removes the staff_time_off row — the time becomes available again,
// with no appointment created in its place.
const unblockTimeOff = async (): Promise<boolean> => {
  if (!form.value.time_off_id || !form.value.time_off_staff_id) return false;
  try {
    await api.del(`/api/v1/staff/${form.value.time_off_staff_id}/time-off/${form.value.time_off_id}`);
    toast.add({
      severity: "success",
      summary: t("common.success"),
      detail: t("staff.timeOff.deleted"),
      life: 3000,
    });
    emit("save");
    emit("update:visible", false);
    return true;
  } catch (err) {
    toast.add({
      severity: "error",
      summary: t("common.error"),
      detail: t("staff.timeOff.saveFailed"),
      life: 4000,
    });
    return false;
  }
};

// Resolves false only when the user declined the change confirmation.
const save = async (close = true): Promise<boolean> => {
  if (!(await confirmChanges())) return false;

  // Check if editing an existing recurring appointment
  const isSeriesEdit = form.value.id && props.appointment?.group_id;
  const isConvertingToSeries =
    form.value.id && !props.appointment?.group_id && isRecurring.value;

  if (isSeriesEdit) {
    return new Promise((resolve) => {
      confirm.require({
        message: t("booking.editDialog.message"),
        header: t("booking.editDialog.header"),
        icon: "pi pi-question-circle",
        rejectLabel: t("booking.editDialog.thisOnly"),
        acceptLabel: t("booking.editDialog.thisAndFuture"),
        accept: async () => {
          resolve(await executeSave(close, "series"));
        },
        reject: async () => {
          resolve(await executeSave(close, "single"));
        },
      });
    });
  }
  return executeSave(close, isConvertingToSeries ? "series" : "single");
};

// Opened after the current question has closed (see offerCancelInstead).
const askSaveThisOnly = (close: boolean) =>
  new Promise<boolean>((resolve) => {
    setTimeout(() => {
      confirm.require({
        header: t("booking.seriesHasPayments.header"),
        message: t("booking.seriesHasPayments.message"),
        icon: "pi pi-exclamation-triangle",
        acceptLabel: t("booking.editDialog.thisOnly"),
        rejectLabel: t("common.cancel"),
        rejectClass: "p-button-outlined p-button-secondary",
        accept: () => resolve(executeSave(close, "single")),
        reject: () => resolve(false),
        onHide: () => resolve(false),
      });
    }, 0);
  });

/** Saves the booking; true once saved (or queued offline), false if it wasn't. */
const executeSave = async (close = true, scope = "single", allowOverCapacity = false): Promise<boolean> => {
  // Unblocking (toggling an existing block's button off) and editing a
  // block's time/duration are both time-off-only flows with no client/
  // service involved — skip the normal booking validations entirely.
  const isTimeOffFlow = form.value.is_block || !!form.value.time_off_id;
  if (!form.value.client_id && !isTimeOffFlow) {
    toast.add({
      severity: "warn",
      summary: t("common.error"),
      detail: t("booking.validation.selectClient"),
      life: 3000,
    });
    return false;
  }
  if (servicesList.value.length === 0) {
    toast.add({
      severity: "warn",
      summary: t("common.error"),
      detail: t("booking.validation.addService"),
      life: 3000,
    });
    return false;
  }
  if (missingStaffService.value) {
    toast.add({
      severity: "warn",
      summary: t("common.error"),
      detail: t("booking.validation.staffRequired"),
      life: 3000,
    });
    return false;
  }

  if (form.value.time_off_id && !form.value.is_block) {
    loading.value = true;
    const ok = await unblockTimeOff();
    loading.value = false;
    return ok;
  }

  if (form.value.is_block) {
    loading.value = true;
    const ok = await saveAsTimeOff();
    loading.value = false;
    return ok;
  }

  // Hard pre-save check — the staff dropdown in BookingServices already
  // filters out unavailable staff, but that's only a filter on the options
  // list; it isn't re-validated if the time changes after a staff member was
  // picked, or if the field was pre-filled by dragging a calendar slot. The
  // server is the actual authority (see assertStaffAvailable), this is just
  // fast feedback before making a network call.
  // Outside working hours (incl. a scheduled day off) is allowed as overtime
  // for admin, super admin and frontdesk after a confirmation; leave and
  // breaks always block. A click on the calendar may already have confirmed
  // it for that staff member (appointment.overtime_confirmed_staff_id).
  let allowOvertime = false;
  if (!form.value.is_block) {
    const overtime: { staffId: any; name: string; hours: string | null }[] = [];
    for (const svc of servicesList.value) {
      if (!svc.staff_id || !svc.start_time) continue;
      const start = new Date(svc.start_time);
      const end = new Date(
        start.getTime() + (svc.duration_override || 60) * 60000,
      );
      const availability = isStaffAvailable({
        staffList: props.staff || [],
        workingHours: props.workingHours || [],
        timeOff: props.timeOff || [],
        staffId: svc.staff_id,
        start,
        end,
      });
      if (availability.available) continue;
      if (availability.reason === "outside_hours" && authStore.isShopAdmin) {
        overtime.push({
          staffId: svc.staff_id,
          name: (props.staff || []).find((s: any) => String(s.id) === String(svc.staff_id))?.name || "",
          hours: describeWorkingDay(props.workingHours || [], props.staff || [], svc.staff_id, start),
        });
        continue;
      }
      toast.add({
        severity: "error",
        summary: t("common.error"),
        detail: t("booking.validation.staffUnavailable"),
        life: 4000,
      });
      return false;
    }
    if (overtime.length > 0) {
      const preConfirmed = props.appointment?.overtime_confirmed_staff_id;
      const needsConfirm = overtime.some((o) => String(o.staffId) !== String(preConfirmed));
      if (needsConfirm && !(await confirmOvertime(overtime))) return false;
      allowOvertime = true;
    }
  }

  loading.value = true;

  let url = form.value.id
    ? `/api/v1/appointments/${form.value.id}?scope=${scope}`
    : "/api/v1/appointments";

  const method = form.value.id ? "PUT" : "POST";

  try {
    const payload = {
      ...form.value,
      allow_overtime: allowOvertime,
      recurrence: isRecurring.value
        ? {
            freq: recurrenceForm.value.freq,
            end_date: recurrenceForm.value.end_date,
          }
        : null,
      services: servicesList.value.map((s) => ({
        ...s,
        price_override: Number(s.price_override) || Number(s.price) || 0,
        // Persons only mean something in a shared place (the sauna).
        persons: placesOf((props.staff || []).find((m: any) => String(m.id) === String(s.staff_id))) > 1 ? personsOf(s) : 1,
      })),
      ...(allowOverCapacity ? { allow_over_capacity: true } : {}),
      products: productsList.value,
      ...discountPayload(discount.value),
      ...(method === "PUT" && currentVersion.value != null && !isTempId(String(form.value.id))
        ? { base_version: currentVersion.value }
        : {}),
    };

    const firstStart = servicesList.value[0]?.start_time ? new Date(servicesList.value[0].start_time) : null;
    const result = await fetchOrQueue(url, method, payload, {
      kind: "appointment",
      label: [
        selectedClient.value ? `${selectedClient.value.first_name || ""} ${selectedClient.value.last_name || ""}`.trim() : "",
        firstStart ? firstStart.toLocaleString("el-GR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "",
      ].filter(Boolean).join(" · ") || t("booking.editDialog.title"),
      createsId: method === "POST" ? "id" : undefined,
      offlineExtras: {
        offline_known_overlaps: knownOverlapIds(calendarStoreForOverlaps.events, payload.services, form.value.id),
        // Made offline: when it was really booked, not when it syncs.
        ...(method === "POST" ? { booked_at: new Date().toISOString() } : {}),
      },
    });

    if (result.queued) {
      // No network reached the server — the write is kept in IndexedDB,
      // shown on the calendar as "not synced", and replayed once reconnected.
      // A new booking gets a temporary id, so saving or paying again from
      // this dialog updates the same booking instead of making a second one.
      if (method === "POST" && result.tempId) form.value.id = result.tempId;
      // The queued change will move the version on; the next save mustn't
      // repeat the check against the old one.
      currentVersion.value = null;
      toast.add({
        severity: "warn",
        summary: t("booking.toast.savedOffline"),
        detail: t("booking.toast.savedOfflineDetail"),
        life: 5000,
      });
      originalSnapshot.value = {
        price: currentApptTotal.value,
        deposit: form.value.deposit_amount,
        isPast: originalSnapshot.value.isPast,
      };
      if (close) {
        emit("save");
        dialogVisible.value = false;
      }
      return true; // saved on this device, syncs later
    }

    const res = result.response;
    const data = await res.json();

    if (!res.ok) {
      // A shared place (the sauna) would be over its places: ask, then book anyway.
      if (data.error === "over_capacity") {
        loading.value = false;
        return (await askOverCapacity(confirm, t, data)) ? executeSave(close, scope, true) : false;
      }
      // "This and future" would replace a paid booking: offer this one only.
      if (data.error === "series_has_payments") {
        loading.value = false;
        return askSaveThisOnly(close);
      }
      if (data.error === "staff_unavailable") {
        throw new Error(t("booking.validation.staffUnavailable"));
      }
      if (["stale_appointment", "appointment_missing", "slot_taken"].includes(data.error)) {
        throw new Error(t(`offline.conflict.${data.error}`));
      }
      throw new Error(data.error || "Failed to save");
    }

    // A series edit replaces this booking's row, so it answers with the new id too.
    if (method === "POST" || data.id) {
      form.value.id = data.id;
    }
    if (data.version !== undefined) currentVersion.value = data.version;

    if (data.new_balance !== undefined && selectedClient.value) {
      selectedClient.value.outstanding_balance = Number(data.new_balance);
    }

    originalServices.value = snapshotServices(servicesList.value);
    originalDiscountAmount.value = discountAmount.value;
    originalSnapshot.value = {
      price: currentApptTotal.value,
      deposit: form.value.deposit_amount,
      isPast: originalSnapshot.value.isPast,
    };

    if (close) {
      emit("save");
      dialogVisible.value = false;
    }
    return true;
  } catch (e) {
    console.error(e);
    toast.add({
      severity: "error",
      summary: t("booking.toast.saveFailed"),
      detail: (e as Error).message || t("booking.toast.saveFailedDetail"),
      life: 4000,
    });
    return false;
  } finally {
    loading.value = false;
  }
};

const recordPayment = async (
  split: {
    amount2: number;
    payment_method2: string;
    gift_card_id2: string | null;
    redemptions2?: any[];
  } | null,
) => {
  if (
    amountToPayNow.value <= 0 &&
    pendingPackagesTotal.value <= 0 &&
    pendingGiftCardsTotal.value <= 0
  ) {
    toast.add({ severity: "warn", summary: t("booking.toast.paymentFailed"), detail: t("payment.nothingToPay"), life: 3500 });
    return;
  }
  paymentLoading.value = true;

  // The entered amount covers "service + package" together (see totalDueNow),
  // but only the non-package part goes through the appointment's own debt
  // logic server-side — the package is sold in full, separately, regardless
  // of how much of the service itself is actually being paid right now.
  const packageTotal = pendingPackagesTotal.value;
  const giftCardTotal = pendingGiftCardsTotal.value;
  const serviceLegAmount = Math.max(
    0,
    amountToPayNow.value - packageTotal - giftCardTotal,
  );

  // Save any pending form changes (services, notes) before processing payment.
  // Do NOT force status='completed' here — the transaction endpoint handles that
  // atomically so a failed payment can't leave the appointment marked complete.
  if (!(await save(false))) {
    paymentLoading.value = false;
    return;
  }

  if (!form.value.id) {
    // No booking to attach the payment to (the save above didn't go through).
    // A booking saved offline has a temporary id here, and its payment is
    // queued behind it — that case doesn't reach this branch.
    toast.add({
      severity: "warn",
      summary: t("booking.toast.paymentFailed"),
      detail: t("booking.toast.paymentWaitingForSync"),
      life: 5000,
    });
    paymentLoading.value = false;
    return;
  }

  try {
    const result = await fetchOrQueue(
      "/api/v1/transactions",
      "POST",
      {
        appointment_id: form.value.id,
        ...(selectedSiblingIds.value.length > 0
          ? { appointment_ids: [form.value.id, ...selectedSiblingIds.value] }
          : {}),
        client_id: form.value.client_id,
        amount: serviceLegAmount,
        payment_method: selectedPaymentMethod.value,
        gift_card_id: selectedGiftCardId.value,
        redemptions: selectedMembershipRedemptions.value,
        ...(packageTotal > 0
          ? {
              package_purchases: pendingPackages.value.map((p) => ({
                package_type_id: p.package_type_id,
              })),
            }
          : {}),
        ...(giftCardTotal > 0
          ? { gift_card_purchases: pendingGiftCards.value }
          : {}),
        ...(split
          ? {
              amount2: split.amount2,
              payment_method2: split.payment_method2,
              gift_card_id2: split.gift_card_id2,
              redemptions2: split.redemptions2,
            }
          : {}),
      },
      {
        kind: "payment",
        label:
          `${t("payment.title")} — ${selectedClient.value?.first_name || ""}`.trim(),
      },
    );

    if (result.queued) {
      const totalPaidThisVisit = serviceLegAmount + (split?.amount2 || 0);
      // Reflect the payment locally right away so staff aren't blocked, but
      // this is optimistic — the server hasn't actually seen it yet. The
      // queued request already carries package_purchases, so the package(s)
      // will be created once it syncs.
      form.value.deposit_amount += totalPaidThisVisit;
      currentVersion.value = null; // the queued payment will change it
      pendingPackages.value = [];
      pendingGiftCards.value = [];
      // Any selected siblings' owed/payment_status are about to change once
      // the queue flushes server-side — clear rather than show stale figures
      // while offline.
      selectedSiblingIds.value = [];
      siblingAppointments.value = [];
      toast.add({
        severity: "warn",
        summary: t("booking.toast.savedOffline"),
        detail: t("booking.toast.paymentQueuedDetail"),
        life: 5000,
      });
      selectedGiftCardId.value = null;
      selectedMembershipRedemptions.value = [];
      if (
        selectedPaymentMethod.value === "gift-card" ||
        selectedPaymentMethod.value === "membership"
      ) {
        selectedPaymentMethod.value = "card";
      }
      bookingPaymentsRef.value?.disableSplit();
      paymentLoading.value = false;
      return;
    }

    const res = result.response;

    if (res.ok) {
      const data = await res.json();
      const totalPaidThisVisit = serviceLegAmount + (split?.amount2 || 0);

      // Update local deposit_amount for immediate UI feedback (package
      // purchases never touch the appointment's own deposit/payment_status).
      form.value.deposit_amount += totalPaidThisVisit;

      // Any paid siblings' owed/payment_status are now stale (the server
      // already updated them) — clear rather than show outdated figures;
      // re-opening the dialog refetches fresh state.
      selectedSiblingIds.value = [];
      siblingAppointments.value = [];

      // Use the authoritative balance returned by the server instead of guessing by subtraction
      if (data.new_balance !== undefined && selectedClient.value) {
        selectedClient.value.outstanding_balance = Number(data.new_balance);
      }
      if (data.appointment_version !== undefined) currentVersion.value = data.appointment_version;

      if (data.packages_purchased?.length) {
        toast.add({
          severity: "success",
          summary: t("packages.sell.sold"),
          detail: data.packages_purchased.map((p: any) => p.name).join(", "),
          life: 3000,
        });
        pendingPackages.value = [];
        bookingPackagesRef.value?.load();
      }

      if (data.gift_cards_purchased?.length) {
        toast.add({
          severity: "success",
          summary: t("giftCards.quickSell.sold"),
          detail: data.gift_cards_purchased
            .map((g: any) => g.card_number)
            .join(", "),
          life: 3000,
        });
        pendingGiftCards.value = [];
      }

      // Every recorded payment is confirmed: a split one with both legs,
      // otherwise the amount and method (package and gift-card sales have
      // their own toasts above).
      if (!split && (serviceLegAmount > 0 || selectedPaymentMethod.value === "membership")) {
        toast.add({
          severity: "success",
          summary: t("payment.recordedToast"),
          detail: t("payment.recordedToastDetail", {
            amount: formatMoney(serviceLegAmount),
            method: t(`payment.methodLabels.${selectedPaymentMethod.value}`),
          }),
          life: 4000,
        });
      }
      if (split) {
        toast.add({
          severity: "success",
          summary: t("payment.split.paidToast"),
          detail: t("payment.split.paidToastDetail", {
            method1: selectedPaymentMethod.value,
            amount1: formatMoney(amountToPayNow.value),
            method2: split.payment_method2,
            amount2: formatMoney(split.amount2),
          }),
          life: 5000,
        });
      }

      // Reset gift-card selection — its cached remaining_balance is now stale,
      // and any further payment (e.g. covering a shortfall) needs a fresh pick.
      selectedGiftCardId.value = null;
      selectedMembershipRedemptions.value = [];
      if (
        selectedPaymentMethod.value === "gift-card" ||
        selectedPaymentMethod.value === "membership"
      ) {
        selectedPaymentMethod.value = "card";
      }
      bookingPaymentsRef.value?.disableSplit();

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

// A booking with payments isn't deleted (the server refuses: has_payments):
// it's cancelled instead — kept, marked cancelled, and what was paid stays
// the client's credit.
// Opened after the current question has closed: it's asked from the delete
// confirmation's accept, and PrimeVue hides the dialog right after that runs,
// which would hide this one too.
const offerCancelInstead = () => {
  setTimeout(askCancelInstead, 0);
};
const askCancelInstead = () => {
  confirm.require({
    header: t("booking.hasPayments.header"),
    message: t("booking.hasPayments.message"),
    icon: "pi pi-exclamation-triangle",
    acceptLabel: t("booking.hasPayments.accept"),
    rejectLabel: t("booking.hasPayments.reject"),
    acceptClass: "p-button-danger",
    rejectClass: "p-button-outlined p-button-secondary",
    accept: cancelInstead,
  });
};

const cancelInstead = async () => {
  try {
    const result = await fetchOrQueue(`/api/v1/appointments/${form.value.id}/cancel`, "POST", {}, {
      kind: "appointment",
      label: `${t("booking.cancelAppt")} · ${selectedClient.value?.first_name || ""} ${selectedClient.value?.last_name || ""}`.trim(),
    });
    if (result.queued) {
      toast.add({ severity: "warn", summary: t("booking.toast.savedOffline"), detail: t("booking.toast.savedOfflineDetail"), life: 4000 });
    } else {
      const data = await result.response.json().catch(() => ({}));
      if (!result.response.ok) {
        toast.add({ severity: "error", summary: t("booking.toast.deleteFailed"), detail: data.error || t("booking.toast.deleteFailedDetail"), life: 4000 });
        return;
      }
      if (data.new_balance !== undefined && selectedClient.value) {
        selectedClient.value.outstanding_balance = Number(data.new_balance);
      }
      toast.add({ severity: "success", summary: t("booking.toast.cancelledKeptPayments"), detail: t("booking.toast.cancelledKeptPaymentsDetail"), life: 5000 });
    }
    emit("save");
    dialogVisible.value = false;
  } catch (e) {
    console.error(e);
    toast.add({ severity: "error", summary: t("booking.toast.deleteFailed"), detail: t("booking.toast.networkError"), life: 4000 });
  }
};

const executeDelete = async (scope: string) => {
  // Payments already known here: don't even try to delete.
  if (Number(form.value.deposit_amount || 0) !== 0) return offerCancelInstead();
  try {
    // Offline the deletion is queued (and the booking hidden right away).
    const result = await fetchOrQueue(`/api/v1/appointments/${form.value.id}?scope=${scope}`, "DELETE", undefined, {
      kind: "delete",
      label: `${t("booking.cancelAppt")} · ${selectedClient.value?.first_name || ""} ${selectedClient.value?.last_name || ""}`.trim(),
    });
    if (result.queued) {
      toast.add({
        severity: "warn",
        summary: t("booking.toast.savedOffline"),
        detail: t("booking.toast.savedOfflineDetail"),
        life: 4000,
      });
      emit("save");
      dialogVisible.value = false;
      return;
    }
    const res = result.response;
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.error === "has_payments") return offerCancelInstead();
      toast.add({
        severity: "error",
        summary: t("booking.toast.deleteFailed"),
        detail: data.error || t("booking.toast.deleteFailedDetail"),
        life: 4000,
      });
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (data.new_balance !== undefined && selectedClient.value) {
      selectedClient.value.outstanding_balance = Number(data.new_balance);
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
const isWalkInSelected = computed(
  () =>
    !!selectedClient.value?.is_walk_in ||
    (!!walkInClientId.value && form.value.client_id === walkInClientId.value),
);

const openClientProfile = () => {
  if (!form.value.client_id) return;
  currentProfileId.value = form.value.client_id;
  showClientProfile.value = true;
};

// Closing the booking dialog while the client profile is open leaves
// showClientProfile stuck true (this component instance is never unmounted),
// so the next open would remount ClientProfileDialog already-visible and empty.
watch(
  () => props.visible,
  (val) => {
    if (!val) {
      showClientProfile.value = false;
      currentProfileId.value = null;
    }
  },
);

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
    "no-response": "bg-amber-100 text-amber-800",
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
    "no-response": "bg-amber-500",
  };
  return map[s] || "bg-gray-400";
};
</script>

<style scoped>
:global(.p-confirmdialog-message) {
  white-space: pre-line;
}

.fresha-dialog .p-dialog-header {
  display: none;
}
.p-dropdown,
.p-inputtext,
.p-calendar {
  border-radius: 0.5rem;
}
</style>
