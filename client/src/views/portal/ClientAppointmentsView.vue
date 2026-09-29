<template>
  <div class="p-4 space-y-4">
    <!-- Sub-tab pills -->
    <div class="flex gap-2 bg-gray-100 rounded-xl p-1">
      <button
        type="button"
        class="flex-1 py-2 rounded-lg text-sm font-semibold transition-colors"
        :class="
          activeTab === 'myAppointments'
            ? 'bg-white shadow-sm text-[var(--p-primary-600)]'
            : 'text-gray-500'
        "
        @click="activeTab = 'myAppointments'"
      >
        {{ t("portal.appointmentsTab.myAppointments") }}
      </button>
      <button
        type="button"
        class="flex-1 py-2 rounded-lg text-sm font-semibold transition-colors"
        :class="
          activeTab === 'book'
            ? 'bg-white shadow-sm text-[var(--p-primary-600)]'
            : 'text-gray-500'
        "
        @click="activeTab = 'book'"
      >
        {{ t("portal.appointmentsTab.book") }}
      </button>
    </div>

    <!-- ================= MY APPOINTMENTS ================= -->
    <div v-if="activeTab === 'myAppointments'" class="space-y-4">
      <div v-if="loadingHistory" class="text-center py-10">
        <i class="pi pi-spin pi-spinner text-2xl text-gray-300"></i>
      </div>
      <template v-else>
        <div class="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <h3 class="font-bold text-gray-700 mb-4">
            {{ t("portal.upcoming.title") }}
          </h3>
          <div
            v-if="upcomingAppointments.length === 0"
            class="flex flex-col items-center justify-center py-8 text-center"
          >
            <i class="pi pi-calendar text-4xl text-gray-300 mb-3"></i>
            <h3 class="text-base font-medium text-gray-400">
              {{ t("portal.upcoming.empty") }}
            </h3>
          </div>

          <div
            v-for="appt in upcomingAppointments"
            :key="appt.id"
            class="mb-4 pb-4 border-b last:border-0 last:pb-0 last:mb-0"
          >
            <div class="flex items-start justify-between">
              <div>
                <div class="font-bold text-[var(--p-primary-600)]">
                  {{ getRelativeDate(appt.start_time) }}
                </div>
                <div class="text-sm text-gray-500">
                  {{
                    new Date(appt.start_time).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  }}
                </div>
              </div>
              <span
                v-if="appt.status === 'cancelled'"
                class="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-600"
                >{{ t("portal.upcoming.cancelled") }}</span
              >
            </div>
            <div class="text-sm font-medium mt-1">{{ appt.service_names }}</div>
            <div
              v-if="appt.staff_names"
              class="text-xs text-gray-500 flex items-center gap-1 mt-1"
            >
              <i class="pi pi-user text-[10px]"></i>
              <span>{{ appt.staff_names }}</span>
            </div>
            <div
              v-if="appt.status !== 'cancelled'"
              class="flex gap-3 mt-2"
            >
              <button
                v-if="appt.status !== 'confirmed' && appt.payment_status !== 'paid'"
                @click="confirmAppointment(appt)"
                class="text-xs text-green-600 hover:text-green-800 font-medium flex items-center gap-1 transition-colors"
              >
                <i class="pi pi-check-circle text-xs"></i>
                {{ t("portal.upcoming.confirm") }}
              </button>
              <button
                @click="confirmCancel(appt)"
                class="text-xs text-red-500 hover:text-red-700 font-medium flex items-center gap-1 transition-colors"
              >
                <i class="pi pi-times-circle text-xs"></i>
                {{ t("portal.upcoming.cancel") }}
              </button>
            </div>
          </div>
        </div>

        <div class="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <h3 class="font-bold text-gray-700 mb-4">
            {{ t("portal.past.title") }}
          </h3>
          <div
            v-if="pastAppointments.length === 0"
            class="text-sm text-gray-400 text-center py-4"
          >
            —
          </div>
          <div
            v-for="appt in pastAppointments"
            :key="appt.id"
            class="mb-3 pb-3 border-b last:border-0 last:pb-0 last:mb-0"
          >
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium">{{ appt.service_names }}</span>
              <span
                :class="[
                  'px-2 py-0.5 rounded-full text-xs font-semibold uppercase',
                  getStatusBadge(appt.status),
                ]"
                >{{ appt.status }}</span
              >
            </div>
            <div class="text-xs text-gray-400 mt-1">
              {{ new Date(appt.start_time).toLocaleDateString("en-GB") }}
              <span v-if="appt.staff_names"> · {{ appt.staff_names }}</span>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- ================= BOOK ================= -->
    <div v-else class="space-y-4">
      <div v-if="loadingServices" class="text-center py-10">
        <i class="pi pi-spin pi-spinner text-2xl text-gray-300"></i>
      </div>

      <div
        v-else-if="!selfBookingAvailable"
        class="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm text-center"
      >
        <i class="pi pi-info-circle text-3xl text-gray-300 mb-3"></i>
        <p class="text-sm text-gray-500">{{ t("portal.book.disabled") }}</p>
      </div>

      <template v-else>
        <!-- Step indicator -->
        <div class="flex items-center gap-2 px-1">
          <div
            v-for="s in 4"
            :key="s"
            class="h-1.5 flex-1 rounded-full"
            :class="s <= step ? 'bg-[var(--p-primary-color)]' : 'bg-gray-200'"
          ></div>
        </div>

        <!-- Step 1: Service -->
        <div v-if="step === 1" class="space-y-3">
          <h3 class="font-bold text-gray-700">{{ t("portal.book.stepService") }}</h3>
          <div
            v-if="services.length === 0"
            class="text-sm text-gray-400 text-center py-6"
          >
            {{ t("portal.book.noServices") }}
          </div>
          <div v-for="group in groupedServices" :key="group.label" class="space-y-3">
            <div
              v-if="groupedServices.length > 1"
              class="text-xs font-bold text-gray-400 uppercase tracking-wider pt-2"
            >
              {{ group.label }}
            </div>
            <button
              v-for="svc in group.items"
              :key="svc.id"
              type="button"
              class="w-full text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center justify-between hover:border-[var(--p-primary-color)] transition-colors"
              @click="selectService(svc)"
            >
              <div class="flex items-center gap-3 min-w-0">
                <div
                  class="w-2 h-8 rounded-full flex-shrink-0"
                  :style="{ backgroundColor: svc.color_code || 'var(--p-primary-300)' }"
                ></div>
                <div class="min-w-0">
                  <div class="font-semibold text-gray-900 truncate">{{ svc.name }}</div>
                  <div class="text-xs text-gray-400">
                    {{ svc.duration_minutes }} min · €{{ Number(svc.price).toFixed(2) }}
                  </div>
                </div>
              </div>
              <i class="pi pi-chevron-right text-gray-300"></i>
            </button>
          </div>
        </div>

        <!-- Step 2: Staff -->
        <div v-else-if="step === 2" class="space-y-3">
          <h3 class="font-bold text-gray-700">{{ t("portal.book.stepStaff") }}</h3>
          <div v-if="loadingStaff" class="text-center py-8">
            <i class="pi pi-spin pi-spinner text-2xl text-gray-300"></i>
          </div>
          <div
            v-else-if="staffOptions.length === 0"
            class="text-sm text-gray-400 text-center py-6"
          >
            {{ t("portal.book.noStaff") }}
          </div>
          <button
            v-for="s in staffOptions"
            :key="s.id"
            type="button"
            class="w-full text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3 hover:border-[var(--p-primary-color)] transition-colors"
            @click="selectStaff(s)"
          >
            <img
              v-if="s.photo_url"
              :src="s.photo_url"
              class="w-10 h-10 rounded-full object-cover flex-shrink-0"
            />
            <div
              v-else
              class="w-10 h-10 rounded-full bg-[var(--p-primary-100)] text-[var(--p-primary-600)] flex items-center justify-center font-bold flex-shrink-0"
            >
              {{ s.name?.[0] }}
            </div>
            <div class="min-w-0">
              <div class="font-semibold text-gray-900 truncate">{{ s.name }}</div>
              <div v-if="s.specialty" class="text-xs text-gray-400 truncate">
                {{ s.specialty }}
              </div>
            </div>
          </button>
          <Button
            :label="t('portal.book.back')"
            icon="pi pi-arrow-left"
            text
            @click="step = 1"
          />
        </div>

        <!-- Step 3: Date & time -->
        <div v-else-if="step === 3" class="space-y-3">
          <h3 class="font-bold text-gray-700">{{ t("portal.book.stepTime") }}</h3>
          <DatePicker
            v-model="selectedDate"
            inline
            :minDate="new Date()"
            class="w-full"
          />
          <div v-if="loadingSlots" class="text-center py-6">
            <i class="pi pi-spin pi-spinner text-2xl text-gray-300"></i>
          </div>
          <div
            v-else-if="slots.length === 0"
            class="text-sm text-gray-400 text-center py-4"
          >
            {{ t("portal.book.noSlots") }}
          </div>
          <div v-else class="grid grid-cols-3 gap-2">
            <button
              v-for="slot in slots"
              :key="slot"
              type="button"
              class="py-2 rounded-lg text-sm font-medium border transition-colors"
              :class="
                selectedSlot === slot
                  ? 'bg-[var(--p-primary-color)] text-white border-[var(--p-primary-color)]'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-[var(--p-primary-color)]'
              "
              @click="selectedSlot = slot"
            >
              {{
                new Date(slot).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              }}
            </button>
          </div>
          <div class="flex gap-2">
            <Button
              :label="t('portal.book.back')"
              icon="pi pi-arrow-left"
              text
              @click="step = 2"
            />
            <Button
              :label="t('portal.book.stepConfirm')"
              icon="pi pi-arrow-right"
              iconPos="right"
              class="flex-1"
              :disabled="!selectedSlot"
              @click="step = 4"
            />
          </div>
        </div>

        <!-- Step 4: Confirm -->
        <div v-else-if="step === 4" class="space-y-3">
          <h3 class="font-bold text-gray-700">{{ t("portal.book.stepConfirm") }}</h3>
          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2 text-sm">
            <div class="flex justify-between">
              <span class="text-gray-500">{{ t("portal.book.summaryService") }}</span>
              <span class="font-medium">{{ selectedService?.name }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-500">{{ t("portal.book.summaryStaff") }}</span>
              <span class="font-medium">{{ selectedStaff?.name }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-500">{{ t("portal.book.summaryWhen") }}</span>
              <span class="font-medium">{{ formattedSelectedSlot }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-500">{{ t("portal.book.summaryDuration") }}</span>
              <span class="font-medium">{{ selectedService?.duration_minutes }} min</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-500">{{ t("portal.book.summaryPrice") }}</span>
              <span class="font-medium">€{{ Number(selectedService?.price).toFixed(2) }}</span>
            </div>
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">{{
              t("portal.book.notes")
            }}</label>
            <Textarea v-model="bookingNotes" rows="3" class="w-full" autoResize />
          </div>
          <div class="flex gap-2">
            <Button
              :label="t('portal.book.back')"
              icon="pi pi-arrow-left"
              text
              @click="step = 3"
            />
            <Button
              :label="t('portal.book.confirmButton')"
              icon="pi pi-check"
              class="flex-1"
              :loading="submitting"
              @click="submitBooking"
            />
          </div>
        </div>
      </template>
    </div>

    <ConfirmDialog></ConfirmDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { groupServicesByCategory } from "../../utils/serviceGroups";
import { useToast } from "primevue/usetoast";
import { useConfirm } from "primevue/useconfirm";
import Button from "primevue/button";
import DatePicker from "primevue/datepicker";
import Textarea from "primevue/textarea";
import ConfirmDialog from "primevue/confirmdialog";
import { useAuthStore } from "../../stores/auth";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const toast = useToast();
const confirm = useConfirm();
const authStore = useAuthStore();

const activeTab = ref<"myAppointments" | "book">(
  route.query.tab === "book" ? "book" : "myAppointments",
);
watch(
  () => route.query.tab,
  (tab) => {
    if (tab === "book") activeTab.value = "book";
  },
);

// --- My Appointments ---
const loadingHistory = ref(true);
const history = ref<any[]>([]);

const upcomingAppointments = computed(() => {
  const now = Date.now();
  return history.value
    .filter((a) => new Date(a.start_time).getTime() > now)
    .sort(
      (a, b) =>
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
    );
});
const pastAppointments = computed(() => {
  const now = Date.now();
  return history.value
    .filter((a) => new Date(a.start_time).getTime() <= now)
    .sort(
      (a, b) =>
        new Date(b.start_time).getTime() - new Date(a.start_time).getTime(),
    );
});

const fetchHistory = async () => {
  loadingHistory.value = true;
  try {
    const res = await fetch(`/api/v1/clients/${authStore.clientId}/full`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    });
    if (res.ok) {
      const data = await res.json();
      history.value = data.history || [];
    }
  } catch {
  } finally {
    loadingHistory.value = false;
  }
};

const confirmCancel = (appt: any) => {
  confirm.require({
    message: t("portal.cancelConfirm.message"),
    header: t("portal.cancelConfirm.header"),
    icon: "pi pi-exclamation-triangle",
    accept: () => cancelAppointment(appt),
  });
};

const cancelAppointment = async (appt: any) => {
  try {
    const res = await fetch(`/api/v1/portal/appointments/${appt.id}/cancel`, {
      method: "POST",
      headers: { Authorization: `Bearer ${authStore.token}` },
    });
    if (!res.ok) throw new Error((await res.json()).error || "Failed to cancel");
    history.value = history.value.map((a: any) =>
      a.id === appt.id ? { ...a, status: "cancelled" } : a,
    );
    toast.add({ severity: "success", summary: "Cancelled", detail: "Appointment cancelled.", life: 3000 });
  } catch (e: any) {
    toast.add({ severity: "error", summary: "Error", detail: e.message, life: 3000 });
  }
};

const confirmAppointment = async (appt: any) => {
  try {
    const res = await fetch(`/api/v1/portal/appointments/${appt.id}/confirm`, {
      method: "POST",
      headers: { Authorization: `Bearer ${authStore.token}` },
    });
    if (!res.ok) throw new Error((await res.json()).error || "Failed to confirm");
    history.value = history.value.map((a: any) =>
      a.id === appt.id ? { ...a, status: "confirmed" } : a,
    );
    toast.add({ severity: "success", summary: "Confirmed", detail: "Appointment confirmed.", life: 3000 });
  } catch (e: any) {
    toast.add({ severity: "error", summary: "Error", detail: e.message, life: 3000 });
  }
};

const getRelativeDate = (dateStr: string) => {
  const date = new Date(dateStr);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (date.toDateString() === today.toDateString()) return t("portal.upcoming.today");
  if (date.toDateString() === tomorrow.toDateString()) return t("portal.upcoming.tomorrow");
  const diffDays = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 7) return t("portal.upcoming.inDays", { n: diffDays });
  return date.toLocaleDateString("el-GR", { weekday: "short", day: "numeric", month: "short" });
};

const getStatusBadge = (status: string) => {
  const map: any = {
    completed: "bg-green-100 text-green-700",
    confirmed: "bg-blue-100 text-blue-700",
    new: "bg-gray-100 text-gray-600",
    cancelled: "bg-red-100 text-red-600",
    "no-show": "bg-red-200 text-red-800",
    "no-response": "bg-amber-100 text-amber-700",
    arrived: "bg-orange-100 text-orange-700",
    started: "bg-yellow-100 text-yellow-700",
  };
  return map[status] || "bg-gray-100 text-gray-600";
};

// --- Book ---
const loadingServices = ref(true);
const selfBookingAvailable = ref(true);
const services = ref<any[]>([]);
const groupedServices = computed(() =>
  groupServicesByCategory(services.value, t("services.table.uncategorized")),
);
const step = ref(1);
const selectedService = ref<any>(null);
const loadingStaff = ref(false);
const staffOptions = ref<any[]>([]);
const selectedStaff = ref<any>(null);
const selectedDate = ref<Date>(new Date());
const loadingSlots = ref(false);
const slots = ref<string[]>([]);
const selectedSlot = ref<string | null>(null);
const bookingNotes = ref("");
const submitting = ref(false);

const formattedSelectedSlot = computed(() => {
  if (!selectedSlot.value) return "";
  return new Date(selectedSlot.value).toLocaleString("el-GR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
});

const fetchServices = async () => {
  loadingServices.value = true;
  try {
    const res = await fetch("/api/v1/portal/services", {
      headers: { Authorization: `Bearer ${authStore.token}` },
    });
    if (res.status === 404) {
      selfBookingAvailable.value = false;
      return;
    }
    if (res.ok) {
      services.value = await res.json();
      selfBookingAvailable.value = true;
    }
  } catch {
  } finally {
    loadingServices.value = false;
  }
};

const selectService = async (svc: any) => {
  selectedService.value = svc;
  selectedStaff.value = null;
  step.value = 2;
  loadingStaff.value = true;
  try {
    const res = await fetch(
      `/api/v1/portal/staff?service_id=${encodeURIComponent(svc.id)}`,
      { headers: { Authorization: `Bearer ${authStore.token}` } },
    );
    if (res.ok) staffOptions.value = await res.json();
  } catch {
  } finally {
    loadingStaff.value = false;
  }
};

const selectStaff = (s: any) => {
  selectedStaff.value = s;
  step.value = 3;
  fetchSlots();
};

const fetchSlots = async () => {
  if (!selectedService.value || !selectedStaff.value) return;
  loadingSlots.value = true;
  selectedSlot.value = null;
  try {
    const dateStr = toDateInputValue(selectedDate.value);
    const res = await fetch(
      `/api/v1/availability?service_id=${encodeURIComponent(selectedService.value.id)}&staff_id=${encodeURIComponent(selectedStaff.value.id)}&date=${dateStr}`,
      { headers: { Authorization: `Bearer ${authStore.token}` } },
    );
    if (res.ok) {
      const data = await res.json();
      slots.value = data.slots || [];
    } else {
      slots.value = [];
    }
  } catch {
    slots.value = [];
  } finally {
    loadingSlots.value = false;
  }
};

const toDateInputValue = (d: Date) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

watch(selectedDate, () => {
  if (step.value === 3) fetchSlots();
});

const resetBooking = () => {
  step.value = 1;
  selectedService.value = null;
  selectedStaff.value = null;
  staffOptions.value = [];
  slots.value = [];
  selectedSlot.value = null;
  bookingNotes.value = "";
  selectedDate.value = new Date();
};

const submitBooking = async () => {
  if (!selectedService.value || !selectedStaff.value || !selectedSlot.value) return;
  submitting.value = true;
  try {
    const idempotencyKey =
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;
    const res = await fetch("/api/v1/appointments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authStore.token}`,
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        booking_notes: bookingNotes.value,
        services: [
          {
            service_id: selectedService.value.id,
            staff_id: selectedStaff.value.id,
            start_time: selectedSlot.value,
          },
        ],
      }),
    });
    if (!res.ok) throw new Error((await res.json()).error || "Failed");
    toast.add({ severity: "success", summary: t("portal.book.success"), life: 3000 });
    resetBooking();
    activeTab.value = "myAppointments";
    router.replace({ path: "/portal/appointments" });
    await fetchHistory();
  } catch (e: any) {
    toast.add({
      severity: "error",
      summary: t("portal.book.failed"),
      detail: e.message,
      life: 4000,
    });
  } finally {
    submitting.value = false;
  }
};

onMounted(() => {
  fetchHistory();
  fetchServices();
});
</script>
