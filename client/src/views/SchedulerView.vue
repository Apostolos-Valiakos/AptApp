<template>
  <div class="flex flex-col h-[calc(100vh-48px)] bg-white" @click="closeMenus">
    <!-- ===== TOOLBAR ===== -->
    <div
      class="relative flex flex-wrap items-center justify-between gap-3 px-4 md:px-6 border-b border-gray-100 bg-white flex-shrink-0"
      :class="isPhone ? 'py-2' : 'py-3'"
    >
      <!-- PHONE: month title, search, menu -->
      <div v-if="isPhone" class="flex items-center justify-between w-full gap-2">
        <div class="relative">
          <button
            @click.stop="toggleDatePicker"
            class="flex items-center gap-1.5 text-lg font-bold text-gray-900 select-none"
          >
            {{ mobileMonthTitle }}
            <i v-if="!calendarDocked" class="pi pi-chevron-down text-xs text-gray-400"></i>
          </button>
          <div
            v-if="showDatePicker"
            @click.stop
            class="absolute top-full left-0 mt-2 z-50 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden"
          >
            <div class="flex justify-end px-2 pt-2">
              <button
                @click="dockCalendar(true)"
                class="w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:text-[var(--p-primary-600)] hover:bg-[var(--p-primary-50)]"
                v-tooltip.bottom="t('scheduler.dockCalendar')"
                :aria-label="t('scheduler.dockCalendar')"
                data-testid="dock-calendar"
              >
                <i class="pi pi-thumbtack text-sm"></i>
              </button>
            </div>
            <DatePicker
              inline
              v-model="pickerDate"
              dateFormat="dd/mm/yy"
              :minDate="isStaffRole ? todayDate : undefined"
              @date-select="onDatePicked"
            />
          </div>
        </div>
        <div class="flex items-center gap-1">
          <button
            @click="calendarApi?.today()"
            class="px-2.5 py-1.5 text-xs font-bold text-[var(--p-primary-700)] bg-[var(--p-primary-50)] rounded-lg"
          >
            {{ t("scheduler.mobile.today") }}
          </button>
          <button
            @click="clientSearchVisible = true"
            class="w-10 h-10 flex items-center justify-center rounded-lg text-[var(--p-primary-600)]"
            :aria-label="t('clientSearch.button')"
          >
            <i class="pi pi-search text-lg"></i>
          </button>
          <button
            @click.stop="mobileMenuOpen = !mobileMenuOpen; showDatePicker = false"
            class="w-10 h-10 flex items-center justify-center rounded-lg text-gray-600"
            :class="mobileMenuOpen ? 'bg-gray-100' : ''"
            :aria-label="t('scheduler.mobile.menu')"
          >
            <i class="pi pi-ellipsis-v text-lg"></i>
          </button>
        </div>
      </div>

      <!-- LEFT: Navigation -->
      <div v-if="!isPhone" class="flex items-center gap-2">
        <button
          @click="canGoPrev && calendarApi?.prev()"
          :disabled="!canGoPrev"
          class="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          title="Previous"
        >
          <i class="pi pi-chevron-left text-sm"></i>
        </button>
        <button
          @click="calendarApi?.today()"
          class="px-3 py-1.5 text-xs font-bold text-[var(--p-primary-700)] bg-[var(--p-primary-50)] hover:bg-[var(--p-primary-100)] rounded-lg transition-colors"
        >
          Today
        </button>
        <button
          @click="calendarApi?.next()"
          class="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
          title="Next"
        >
          <i class="pi pi-chevron-right text-sm"></i>
        </button>
        <div class="relative">
          <button
            @click.stop="toggleDatePicker"
            class="flex items-center gap-1 text-sm md:text-base font-bold text-gray-800 min-w-[120px] md:min-w-[180px] select-none hover:text-[var(--p-primary-700)] transition-colors"
          >
            {{ currentTitle }}
            <i v-if="!calendarDocked" class="pi pi-chevron-down text-[10px] text-gray-400"></i>
          </button>
          <div
            v-if="showDatePicker"
            @click.stop
            class="absolute top-full left-0 mt-2 z-50 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden"
          >
            <div class="flex justify-end px-2 pt-2">
              <button
                @click="dockCalendar(true)"
                class="w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:text-[var(--p-primary-600)] hover:bg-[var(--p-primary-50)]"
                v-tooltip.bottom="t('scheduler.dockCalendar')"
                :aria-label="t('scheduler.dockCalendar')"
                data-testid="dock-calendar"
              >
                <i class="pi pi-thumbtack text-sm"></i>
              </button>
            </div>
            <DatePicker
              inline
              v-model="pickerDate"
              dateFormat="dd/mm/yy"
              :minDate="isStaffRole ? todayDate : undefined"
              @date-select="onDatePicked"
            />
          </div>
        </div>
      </div>

      <!-- RIGHT: Controls (on phones: the ⋮ menu panel) -->
      <div
        v-show="!isPhone || mobileMenuOpen"
        @click.stop
        class="flex items-center gap-2 flex-wrap"
        :class="isPhone ? 'absolute right-2 top-full mt-1 z-50 w-[min(20rem,calc(100vw-1rem))] bg-white rounded-xl shadow-lg border border-gray-100 p-3 flex-col !items-stretch' : ''"
      >
        <!-- Status Filter -->
        <div class="flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5">
          <button
            v-for="opt in statusFilterOptions"
            :key="opt.value"
            @click="statusFilter = opt.value"
            :class="
              statusFilter === opt.value
                ? 'bg-white shadow-sm text-gray-900 font-semibold'
                : 'text-gray-500 hover:text-gray-700'
            "
            class="px-2.5 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap"
          >
            <i v-if="opt.icon" :class="opt.icon + ' mr-1 text-[10px]'"></i>
            {{ opt.label }}
          </button>
        </div>

        <!-- View Toggle -->
        <div class="flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5">
          <button
            v-for="view in viewOptions"
            :key="view.value"
            @click="changeView(view.value)"
            :class="
              currentView === view.value
                ? 'bg-white shadow-sm text-gray-900 font-semibold'
                : 'text-gray-500 hover:text-gray-700'
            "
            class="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
          >
            {{ view.label }}
          </button>
        </div>

        <!-- Zoom -->
        <div class="items-center bg-gray-100 rounded-lg p-0.5" :class="isPhone ? 'flex self-start' : 'hidden sm:flex'">
          <button
            @click="zoomOut"
            class="p-1.5 rounded-md text-gray-500 hover:bg-white hover:shadow-sm hover:text-gray-800 transition-all"
            title="Zoom Out"
          >
            <i class="pi pi-minus text-xs"></i>
          </button>
          <span class="text-xs font-medium text-gray-400 px-1.5">Zoom</span>
          <button
            @click="zoomIn"
            class="p-1.5 rounded-md text-gray-500 hover:bg-white hover:shadow-sm hover:text-gray-800 transition-all"
            title="Zoom In"
          >
            <i class="pi pi-plus text-xs"></i>
          </button>
        </div>

        <ColorModelToggle v-if="settings.isStaff" />

        <!-- Client search -->
        <button
          v-if="!isPhone"
          @click="clientSearchVisible = true"
          class="flex items-center gap-1.5 bg-[var(--p-primary-color)] hover:brightness-105 text-white px-3 md:px-4 py-2 rounded-lg text-xs font-bold shadow-sm active:scale-95 transition-all flex-shrink-0"
        >
          <i class="pi pi-search text-xs"></i>
          <span class="hidden sm:inline">{{ t("clientSearch.button") }}</span>
        </button>

        <!-- Secondary: Swap + Reorder -->
        <div class="flex items-center gap-1">
          <button
            @click="openSwapDialog"
            class="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors flex-shrink-0"
            title="Swap Appointments"
          >
            <i class="pi pi-arrow-right-arrow-left text-sm"></i>
          </button>
          <button
            @click="reorderDialogVisible = true"
            class="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors flex-shrink-0"
            title="Reorder Staff"
          >
            <i class="pi pi-sort-alt text-sm"></i>
          </button>
          <button
            @click="toggleFitStaff"
            :class="
              fitStaff
                ? 'bg-[var(--p-primary-50)] border-[var(--p-primary-200)] text-[var(--p-primary-600)]'
                : 'border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-800'
            "
            class="p-2 rounded-lg border transition-colors flex-shrink-0"
            :title="fitStaff ? 'Scroll mode' : 'Fit all staff in view'"
          >
            <i
              :class="fitStaff ? 'pi pi-arrows-h' : 'pi pi-expand'"
              class="text-sm"
            ></i>
          </button>
        </div>
      </div>
    </div>

    <!-- ===== PHONE DAY STRIP (swipe for the previous/next week) ===== -->
    <div
      v-if="isPhone"
      class="grid grid-cols-7 border-b border-gray-100 bg-white flex-shrink-0 py-1.5 select-none"
      @touchstart.passive="onStripTouchStart"
      @touchend="onStripTouchEnd"
    >
      <button
        v-for="d in weekStrip"
        :key="d.key"
        type="button"
        :disabled="d.disabled"
        @click="goToDay(d.date)"
        class="flex flex-col items-center gap-1 py-1 disabled:opacity-30"
      >
        <span class="text-[11px] font-medium" :class="d.weekend ? 'text-gray-400' : 'text-gray-600'">{{ d.letter }}</span>
        <span
          class="w-9 h-9 rounded-full flex items-center justify-center text-base font-semibold"
          :class="
            d.selected
              ? 'bg-[var(--p-primary-color)] text-white'
              : d.today
                ? 'text-[var(--p-primary-700)] ring-1 ring-[var(--p-primary-300)]'
                : d.weekend
                  ? 'text-gray-400'
                  : 'text-gray-900'
          "
        >{{ d.day }}</span>
      </button>
    </div>

    <div class="flex-grow flex min-h-0">
    <!-- ===== DOCKED DATE CALENDAR (pinned from the date popup) ===== -->
    <aside
      v-if="calendarDocked"
      class="docked-date-picker flex-shrink-0 w-[272px] border-r border-gray-100 bg-white overflow-y-auto overflow-x-hidden"
      data-testid="docked-calendar"
    >
      <div class="flex justify-end px-2 pt-2">
        <button
          @click="dockCalendar(false)"
          class="w-7 h-7 rounded-md flex items-center justify-center text-[var(--p-primary-600)] bg-[var(--p-primary-50)] hover:bg-[var(--p-primary-100)]"
          v-tooltip.bottom="t('scheduler.undockCalendar')"
          :aria-label="t('scheduler.undockCalendar')"
          data-testid="undock-calendar"
        >
          <i class="pi pi-thumbtack text-sm rotate-45"></i>
        </button>
      </div>
      <DatePicker
        inline
        v-model="dockedDate"
        dateFormat="dd/mm/yy"
        :minDate="isStaffRole ? todayDate : undefined"
        @date-select="onDatePicked"
      />
    </aside>

    <!-- ===== CALENDAR AREA ===== -->
    <div class="flex-1 min-w-0 overflow-auto relative">
      <!-- Loading overlay -->
      <transition name="fade">
        <div
          v-if="isFetching"
          class="absolute inset-0 z-10 bg-white/60 backdrop-blur-[1px] flex items-center justify-center pointer-events-none"
        >
          <div
            class="flex items-center gap-2 bg-white rounded-full px-4 py-2 shadow-md border border-gray-100"
          >
            <i class="pi pi-spin pi-spinner text-[var(--p-primary-color)]"></i>
            <span class="text-xs font-medium text-gray-500">Loading…</span>
          </div>
        </div>
      </transition>

      <FullCalendar
        v-if="calendarResources.length > 0"
        ref="fullCalendar"
        :options="calendarOptions"
        :style="{ '--slot-row-height': `${slotRowHeight}px` }"
        class="h-full w-full"
      />

      <!-- Empty state -->
      <div
        v-else
        class="h-full flex flex-col items-center justify-center bg-gray-50/50"
      >
        <div
          class="p-10 bg-white rounded-2xl shadow-sm text-center border border-gray-100 max-w-sm"
        >
          <div
            class="w-16 h-16 bg-[var(--p-primary-50)] text-[var(--p-primary-600)] rounded-full flex items-center justify-center mx-auto mb-4"
          >
            <i class="pi pi-users text-2xl"></i>
          </div>
          <h3 class="text-lg font-bold text-gray-900 mb-2">No Team Members</h3>
          <p class="text-sm text-gray-500 mb-6">
            Add staff members to start scheduling appointments.
          </p>
          <a
            href="/app/staff"
            class="inline-flex items-center gap-2 bg-[var(--p-primary-color)] text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:brightness-105 transition-all"
          >
            <i class="pi pi-plus text-xs"></i>
            Add Staff
          </a>
        </div>
      </div>
    </div>
    </div>

    <BookingDialog
      v-model:visible="dialogVisible"
      :appointment="selectedAppointment"
      :services="calendarStore.services"
      :staff="calendarStore.resources"
      :allProducts="calendarStore.products"
      :timeOff="calendarStore.timeOff"
      :workingHours="calendarStore.workingHours"
      :shopMinTime="shopSlotMinTime"
      :shopMaxTime="shopSlotMaxTime"
      @save="handleSave"
      @refresh="handleRefresh"
    />
    <AppointmentSwapDialog
      v-model:visible="swapDialogVisible"
      :appointments="calendarStore.events"
      :staff="calendarStore.resources"
      @swap="handleSwap"
    />

    <AppointmentHoverCard
      v-if="hoveredAppointment && hoverAnchorRect"
      :appointment="hoveredAppointment"
      :anchor-rect="hoverAnchorRect"
    />

    <ClientSearchDialog
      v-model:visible="clientSearchVisible"
      @select="onClientSelected"
    />
    <ClientQuickProfileDialog
      v-model:visible="quickProfileVisible"
      :clientId="quickProfileClientId"
      @book="onBookForClient"
      @openFull="onOpenFullProfile"
      @changed="handleSave"
    />
    <ClientProfileDialog
      v-model:visible="fullProfileVisible"
      :clientId="quickProfileClientId"
      :initialTab="fullProfileTab"
    />
  </div>

  <StaffReorderDialog
    v-model:visible="reorderDialogVisible"
    :staff-list="calendarStore.resources"
    @save="handleReorderSave"
  />
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed, nextTick } from "vue";
import FullCalendar from "@fullcalendar/vue3";
import resourceTimeGridPlugin from "@fullcalendar/resource-timegrid";
import scrollGridPlugin from "@fullcalendar/scrollgrid";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import timeGridPlugin from "@fullcalendar/timegrid";
import { useCalendarStore } from "../stores/calendar";
import { useSettingsStore } from "../stores/settings";
import BookingDialog from "../components/BookingDialog.vue";
import AppointmentSwapDialog from "../components/AppointmentSwapDialog.vue";
import ClientSearchDialog from "../components/ClientSearchDialog.vue";
import ClientQuickProfileDialog from "../components/ClientQuickProfileDialog.vue";
import ClientProfileDialog from "../components/ClientProfileDialog.vue";
import { useToast } from "primevue/usetoast";
import { useConfirm } from "primevue/useconfirm";
import { useI18n } from "vue-i18n";
import {
  snapshotServices,
  describeServiceChanges,
} from "../utils/appointmentChanges";
import ColorModelToggle from "../components/ColorModelToggle.vue";
import { resolveServiceColor } from "../utils/serviceColors";
import { useAuthStore } from "../stores/auth";
import elLocale from "@fullcalendar/core/locales/el";
import StaffReorderDialog from "../components/StaffReorderDialog.vue";
import AppointmentHoverCard from "../components/AppointmentHoverCard.vue";
import {
  isStaffAvailable,
  toLocalDateStr,
  getWorkingRangesForDate,
  mondayOf,
  describeWorkingDay,
  overtimeConfirmMessage,
} from "../utils/staffAvailability";
import { displayServiceName } from "../utils/serviceVariations";
import { api as http, ApiError } from "../api/http"; // (`api` in this file is FullCalendar's)
import { fetchOrQueue } from "../offline/queue";
import { knownOverlapIds } from "../offline/overlaps";
import { isTempId } from "../offline/tempIds";

const reorderDialogVisible = ref(false);
const authStore = useAuthStore();
const toast = useToast();
const confirm = useConfirm();
const { t, locale } = useI18n();

// Uses the ConfirmDialog mounted inside BookingDialog. Resolves true on accept.
const hideHoverCard = () => {
  if (hoverShowTimer) clearTimeout(hoverShowTimer);
  hoveredAppointment.value = null;
  hoverAnchorRect.value = null;
  clearLinkedHighlight();
};

type OvertimeEntry = { name: string; hours: string | null };
const confirmMove = (
  before: any[],
  after: any[],
  overtime: OvertimeEntry[] = [],
): Promise<boolean> => {
  const lines = describeServiceChanges(
    snapshotServices(before),
    snapshotServices(after),
    {
      services: calendarStore.services,
      staff: calendarStore.resources,
      t,
      locale: locale.value,
    },
  );
  if (lines.length === 0) return Promise.resolve(true);
  hideHoverCard();
  moveConfirmOpen = true;
  return new Promise((resolve) => {
    const done = (v: boolean) => {
      moveConfirmOpen = false;
      resolve(v);
    };
    const changes = `${t("booking.changeConfirm.intro")}\n\n${lines.map((l) => `• ${l}`).join("\n")}`;
    confirm.require({
      header: overtime.length ? t("booking.overtime.header") : t("booking.changeConfirm.header"),
      // With overtime, the overtime question replaces the generic one.
      message: overtime.length
        ? `${changes}\n\n${overtimeConfirmMessage(overtime, t)}`
        : `${changes}\n\n${t("booking.changeConfirm.question")}`,
      icon: overtime.length ? "pi pi-clock" : "pi pi-question-circle",
      acceptLabel: overtime.length ? t("booking.overtime.accept") : t("booking.changeConfirm.apply"),
      rejectLabel: t("booking.changeConfirm.cancel"),
      accept: () => done(true),
      reject: () => done(false),
      onHide: () => done(false),
    });
  });
};
const calendarStore = useCalendarStore();
const settings = useSettingsStore();

// Plain "staff" (not frontdesk/admin/super_admin) can only ever browse today
// and forward — mirrors the same restriction enforced server-side in
// GET /api/v1/appointments, so navigation UI can't even attempt to go back.
const isStaffRole = computed(() => authStore.user?.role === "staff");
const todayDateStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// UI State
const dialogVisible = ref(false);
const clientSearchVisible = ref(false);
const quickProfileVisible = ref(false);
const quickProfileClientId = ref<string | null>(null);
const fullProfileVisible = ref(false);
const fullProfileTab = ref("Info");
const swapDialogVisible = ref(false);
const selectedAppointment = ref<any>(null);
const fullCalendar = ref<any>(null);
const currentTitle = ref("");
const currentView = ref("resourceTimeGridDay");
const currentStart = ref("");
const currentEnd = ref("");
const isFetching = ref(false);
// Mirrors the shop's slotMinTime/slotMaxTime, set directly on the FullCalendar
// API instance today (see onMounted below) but not otherwise stored reactively
// — needed here to compute off-hours gaps within the visible window.
const shopSlotMinTime = ref("07:00:00");
const shopSlotMaxTime = ref("23:00:00");
const showDatePicker = ref(false);
const pickerDate = ref<Date | null>(null);
// The date calendar can be pinned next to the schedule instead of opening as
// a popup; each device remembers the choice.
const DOCKED_KEY = "scheduler.calendarDocked";
const readDocked = () => {
  try {
    return localStorage.getItem(DOCKED_KEY) === "1";
  } catch {
    return false;
  }
};
const calendarDocked = ref(readDocked());
/** The docked calendar's selection: follows the day the schedule shows. */
const dockedDate = ref<Date | null>(new Date());
const todayDate = computed(() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
});

// --- Appointment hover card ---
const hoveredAppointment = ref<any>(null);
// The hover card must never show while dragging/resizing or while the
// "confirm changes" dialog is open (it would sit on top of the dialog).
let dragInProgress = false;
let moveConfirmOpen = false;
const hoverAnchorRect = ref<{
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
} | null>(null);
let hoverShowTimer: ReturnType<typeof setTimeout> | null = null;

const canGoPrev = computed(() => {
  if (!isStaffRole.value || !currentStart.value) return true;
  const viewStart = new Date(currentStart.value);
  viewStart.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return viewStart > today;
});

// --- Fit staff toggle ---
const fitStaff = ref(localStorage.getItem("fitStaff") === "true");

const toggleFitStaff = () => {
  fitStaff.value = !fitStaff.value;
  localStorage.setItem("fitStaff", String(fitStaff.value));
  const api = fullCalendar.value?.getApi();
  if (api) {
    api.setOption("dayMinWidth", fitStaff.value ? 0 : getDayMinWidth());
  }
};
// Ctrl+1 "hide cash/gift-card revenue" is handled globally in Layout.vue;
// this view just reads the shared state.

// --- Status filter ---
const statusFilter = ref<"all" | "active" | "cancelled">("all");
const statusFilterOptions: { label: string; value: "all" | "active" | "cancelled"; icon: string }[] = [
  { label: "All", value: "all", icon: "" },
  { label: "Active", value: "active", icon: "pi pi-check-circle" },
  { label: "Cancelled", value: "cancelled", icon: "pi pi-times-circle" },
];

// --- View options ---
const viewOptions = [
  { label: "Day", value: "resourceTimeGridDay" },
  { label: "Week", value: "resourceTimeGridWeek" },
  { label: "Month", value: "dayGridMonth" },
];

const calendarApi = computed(() => fullCalendar.value?.getApi());

// --- Swap ---
const openSwapDialog = () => {
  swapDialogVisible.value = true;
};

const handleSwap = async (swapData: {
  appointment1_id: number;
  appointment2_id: number;
}) => {
  try {
    // (This request used to go without the login token, so the server
    // always refused it.)
    const data = await http.post("/api/v1/appointments/swap", swapData).catch((e: ApiError) => {
      throw new Error(e.data?.error || "Swap failed");
    });
    if (!data.success) throw new Error(t("scheduler.toasts.swapFailedError"));

    swapDialogVisible.value = false;
    await calendarStore.fetchAppointments(currentStart.value, currentEnd.value);
    toast.add({
      severity: "success",
      summary: t("scheduler.toasts.swapComplete"),
      detail: t("scheduler.toasts.swapCompleteDetail"),
      life: 2500,
    });
  } catch (err: any) {
    toast.add({
      severity: "error",
      summary: t("scheduler.toasts.swapFailed"),
      detail: err.message || t("scheduler.toasts.swapFailedDetail"),
      life: 3000,
    });
  }
};

const handleReorderSave = async (newOrder: any[]) => {
  await calendarStore.updateResourceOrder(newOrder);
  toast.add({
    severity: "success",
    summary: t("common.success"),
    detail: t("scheduler.toasts.staffOrderUpdated"),
    life: 3000,
  });
};

// --- Zoom ---
// The grid always has 15-minute rows (4 lines per hour, see calendarOptions'
// slotDuration); zooming only changes how tall a row is, via the
// --slot-row-height CSS variable on the calendar. Clicks therefore land on
// quarter hours at every zoom, while drag and resize snap to 5 minutes.
const SLOT_MINUTES = 15;
const ZOOM_ROW_HEIGHTS = [81, 54, 40, 27, 20, 13, 9];
const zoomLevel = ref(ZOOM_ROW_HEIGHTS.indexOf(27));
const slotRowHeight = computed(() => ZOOM_ROW_HEIGHTS[zoomLevel.value]);

const zoomIn = () => {
  if (zoomLevel.value > 0) zoomLevel.value--;
};
const zoomOut = () => {
  if (zoomLevel.value < ZOOM_ROW_HEIGHTS.length - 1) zoomLevel.value++;
};
// FullCalendar measures row heights to place events, so re-measure once the
// new height is in the DOM.
// FullCalendar only re-measures rows when its options change; updateSize()
// keeps the old positions, leaving events and clicks off by the zoom change.
// Re-setting the same 15 minutes in the other of two equivalent forms counts
// as a change and makes it re-measure.
let slotDurationToggle = false;
watch(slotRowHeight, async () => {
  await nextTick();
  slotDurationToggle = !slotDurationToggle;
  calendarApi.value?.setOption(
    "slotDuration",
    slotDurationToggle ? { minutes: SLOT_MINUTES } : "00:15:00",
  );
});

// FullCalendar has one snap setting for everything: 15 minutes suits clicks
// on the empty grid, 5 minutes suits moving an appointment. Every drag or
// resize starts on an appointment, so switch to 5 while the pointer is over
// one, and back to 15 when it leaves; never mid-drag.
let snapMinutes = SLOT_MINUTES;
const setSnapMinutes = (mins: number) => {
  if (dragInProgress || mins === snapMinutes) return;
  snapMinutes = mins;
  calendarApi.value?.setOption("snapDuration", { minutes: mins });
};

// Safety net for select: a click on an empty slot should start at the row
// the user sees, e.g. 10:15 for any click in the 10:15 row. Rows are counted
// from slotMinTime, matching the grid.
const roundRangeToSlots = (start: Date, end: Date) => {
  const slot = SLOT_MINUTES;
  const [h, m] = shopSlotMinTime.value.split(":").map(Number);
  const gridStart = (h || 0) * 60 + (m || 0);
  const minutesOf = (d: Date) => d.getHours() * 60 + d.getMinutes() - gridStart;
  const at = (d: Date, mins: number) => {
    const r = new Date(d);
    r.setHours(0, gridStart + mins, 0, 0);
    return r;
  };
  const s = at(start, Math.floor(minutesOf(start) / slot) * slot);
  const endMins = minutesOf(end) + (end.getDate() !== start.getDate() ? 24 * 60 : 0);
  const e = at(start, Math.max(Math.ceil(endMins / slot) * slot, minutesOf(s) + slot));
  return { start: s, end: e };
};
const formatSlotIso = (d: Date) => calendarApi.value?.formatIso(d) ?? d.toISOString();

const changeView = (viewName: string) => {
  const api = calendarApi.value;
  if (api) {
    api.changeView(viewName);
    currentView.value = viewName;
    currentTitle.value = api.view.title;
  }
};

const closeMenus = () => {
  showDatePicker.value = false;
  mobileMenuOpen.value = false;
};

// --- Phone layout: compact top bar, day strip, narrow staff columns ---
const PHONE_MAX_WIDTH = 768;
const isPhone = ref(window.innerWidth < PHONE_MAX_WIDTH);
const mobileMenuOpen = ref(false);

const viewDate = computed(() => {
  if (!currentStart.value) return new Date();
  const d = new Date(currentStart.value);
  d.setHours(0, 0, 0, 0);
  return d;
});

const sameDay = (a: Date, b: Date) => toLocalDateStr(a) === toLocalDateStr(b);
const dateLocale = computed(() => (locale.value === "el" ? "el-GR" : "en-GB"));

// Browsers give the Greek month in the genitive ("Οκτωβρίου") when formatted
// alone; a heading needs the nominative.
const GREEK_MONTHS = [
  "Ιανουάριος", "Φεβρουάριος", "Μάρτιος", "Απρίλιος", "Μάιος", "Ιούνιος",
  "Ιούλιος", "Αύγουστος", "Σεπτέμβριος", "Οκτώβριος", "Νοέμβριος", "Δεκέμβριος",
];
const mobileMonthTitle = computed(() => {
  const d = viewDate.value;
  const month =
    locale.value === "el"
      ? GREEK_MONTHS[d.getMonth()]
      : d.toLocaleDateString("en-GB", { month: "long" });
  return d.getFullYear() === new Date().getFullYear() ? month : `${month} ${d.getFullYear()}`;
});

const weekStrip = computed(() => {
  const monday = mondayOf(viewDate.value);
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    return {
      date,
      key: toLocalDateStr(date),
      letter: date.toLocaleDateString(dateLocale.value, { weekday: "narrow" }),
      day: date.getDate(),
      weekend: date.getDay() === 0 || date.getDay() === 6,
      selected: currentView.value !== "dayGridMonth" && sameDay(date, viewDate.value),
      today: sameDay(date, new Date()),
      disabled: isStaffRole.value && date < todayDate.value,
    };
  });
});

const goToDay = (date: Date) => {
  const api = calendarApi.value;
  if (!api) return;
  const target = isStaffRole.value && date < todayDate.value ? todayDate.value : date;
  api.changeView("resourceTimeGridDay", target);
  currentView.value = "resourceTimeGridDay";
};

const shiftWeek = (weeks: number) => {
  const d = new Date(viewDate.value);
  d.setDate(d.getDate() + weeks * 7);
  goToDay(d);
};

let stripTouch: { x: number; y: number } | null = null;
const onStripTouchStart = (e: TouchEvent) => {
  stripTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
};
const onStripTouchEnd = (e: TouchEvent) => {
  if (!stripTouch) return;
  const dx = e.changedTouches[0].clientX - stripTouch.x;
  const dy = e.changedTouches[0].clientY - stripTouch.y;
  stripTouch = null;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) shiftWeek(dx < 0 ? 1 : -1);
};

// --- Date picker popover ---
const dockCalendar = async (docked: boolean) => {
  calendarDocked.value = docked;
  showDatePicker.value = false;
  try {
    localStorage.setItem(DOCKED_KEY, docked ? "1" : "0");
  } catch {}
  // The schedule's width changed: FullCalendar has to re-measure.
  await nextTick();
  calendarApi.value?.updateSize();
};

const toggleDatePicker = () => {
  if (calendarDocked.value) return; // already on screen
  if (!showDatePicker.value)
    pickerDate.value = calendarApi.value?.getDate() ?? new Date();
  showDatePicker.value = !showDatePicker.value;
};

const onDatePicked = (date: Date) => {
  const api = calendarApi.value;
  if (api) {
    // Don't read api.view.title synchronously here — when the date range
    // actually changes, FullCalendar hasn't recomputed it yet. Let the
    // existing datesSet callback update the title once it actually renders.
    api.changeView("resourceTimeGridDay", date);
    currentView.value = "resourceTimeGridDay";
  }
  showDatePicker.value = false;
};

// Still used by the unrelated staff-role navigation restriction below
// (canGoPrev/validRange) — not by the working-hours display logic anymore,
// now that schedule versions carry their own effective_from and can be
// resolved correctly for any date, past included.
const isPastDay = (dateStr: string) => dateStr.slice(0, 10) < todayDateStr();

// --- Computed data ---
const isNotWorkingOnDay = (r: any) => {
  if (!r.working_hours_enabled || !currentStart.value) return false;
  const ranges = getWorkingRangesForDate(
    calendarStore.workingHours,
    r.id,
    currentStart.value,
  );
  return ranges !== null && ranges.length === 0;
};

// Staff with a live (not cancelled / no-show) appointment on the displayed
// day, so a day-off staff member still gets a greyed column when they're
// needed to see that booking.
const staffWithAppointmentsOnDay = computed(() => {
  const ids = new Set<string>();
  if (!currentStart.value) return ids;
  const dateStr = toLocalDateStr(currentStart.value);
  for (const appt of calendarStore.events || []) {
    if (appt.status === "cancelled" || appt.status === "no-show") continue;
    for (const svc of appt.services || []) {
      if (svc.staff_id && toLocalDateStr(svc.start_time) === dateStr) {
        ids.add(String(svc.staff_id));
      }
    }
  }
  return ids;
});

const calendarResources = computed(() => {
  const res = calendarStore.resources;
  if (!Array.isArray(res)) return [];

  let filtered = res.filter((r: any) => r.is_active);
  if (settings.resourceFilter === "me" && authStore.user?.staff_id) {
    filtered = filtered.filter((r: any) => r.id === authStore.user.staff_id);
  }

  // Day view only — staff who opted into a working-hours pattern but don't
  // work the currently-displayed day disappear as a resource entirely. This
  // now resolves the schedule VERSION that was/is actually active on the
  // displayed date, so it's correct whether that date is in the past,
  // present, or a staged future change. Unconfigured staff (working_hours_enabled
  // falsy) always pass through, exactly like today, and Week/Month views are
  // untouched by design since FullCalendar's resource views use one fixed
  // column set for the whole visible range — there's no way to show
  // different staff per day there.
  if (currentView.value === "resourceTimeGridDay" && currentStart.value) {
    filtered = filtered.filter(
      (r: any) =>
        !isNotWorkingOnDay(r) ||
        staffWithAppointmentsOnDay.value.has(String(r.id)),
    );
  }

  return filtered.map((r: any) => ({
    id: r.id.toString(),
    title: r.name,
    eventBackgroundColor: "#f3f4f6",
    notWorking: currentView.value === "resourceTimeGridDay" && isNotWorkingOnDay(r),
  }));
});

const calendarEvents = computed(() => {
  const appointments = calendarStore.events;
  if (!Array.isArray(appointments)) return [];

  const events: any[] = [];
  appointments.forEach((appt) => {
    if (!appt.services || appt.services.length === 0) return;

    // Apply status filter
    const status = appt.status || "new";
    if (
      statusFilter.value === "active" &&
      (status === "cancelled" || status === "no_show")
    )
      return;
    if (
      statusFilter.value === "cancelled" &&
      status !== "cancelled" &&
      status !== "no_show"
    )
      return;
    const isCashEquivalent =
      appt.payment_method === "cash" ||
      (appt.payment_method === "gift-card" &&
        appt.gift_card_source_method === "cash");
    if (
      settings.hideCashPaid &&
      appt.payment_status === "paid" &&
      isCashEquivalent
    )
      return;
    if (
      settings.hideCardPaid &&
      appt.payment_status === "paid" &&
      appt.payment_method === "card"
    )
      return;

    appt.services.forEach((svc: any, index: number) => {
      const bgColor = resolveServiceColor(svc.service_color, svc.category_color);
      const duration = svc.duration_minutes || 60;
      const endTime = svc.start_time
        ? new Date(
            new Date(svc.start_time).getTime() + duration * 60000,
          ).toISOString()
        : null;
      // Which variation this row was is persisted server-side
      // (appointment_services.variation_name → svc.variation_name here),
      // independent of price/duration, so it survives later edits to either
      // (e.g. extending the duration) — see utils/serviceVariations.ts.
      // svc.variation_name is only absent for appointments saved before that
      // column existed, for which this falls back once to reverse-matching
      // price/duration against the service's current variation list (same
      // legacy-only limitation as BookingDialog's EDIT MODE load). Category
      // color stays keyed on the plain base name above; only the DISPLAYED
      // name (box title + the service line under the client name) gets the
      // "Service — Variation" treatment.
      const catalogService = calendarStore.services.find(
        (s: any) => s.id === svc.service_id,
      );
      const displayedServiceName =
        (svc.variation_name && svc.service_name
          ? `${svc.service_name} — ${svc.variation_name}`
          : null) ||
        displayServiceName(catalogService, svc.price, svc.duration_minutes) ||
        svc.service_name ||
        "Service";

      events.push({
        id: `${appt.id}_${index}`,
        resourceId: svc.staff_id?.toString(),
        title: `${appt.first_name} - ${displayedServiceName}`,
        start: svc.start_time,
        end: endTime,
        backgroundColor: bgColor,
        borderColor: "transparent",
        textColor: "#1f2937",
        // Changes waiting to sync (offline) are outlined: dashed while pending,
        // red when the server refused them (see the sync banner).
        classNames: [
          "fresha-event",
          ...(appt._offline === "conflict" ? ["fc-offline-conflict"] : appt._offline ? ["fc-offline-pending"] : []),
        ],
        extendedProps: {
          isServiceEvent: true,
          offlineState: appt._offline || null,
          appointmentId: appt.id,
          group_id: appt.group_id,
          serviceIndex: index,
          fullAppointment: {
            ...appt,
            group_id: appt.group_id,
            products: appt.products || [],
          },
          client_name:
            `${appt.last_name || ""} ${appt.first_name || "Unknown"}`.trim(),
          // Just the surname, for the compact combined-line layout on very
          // short appointments — leaves more room for the service name
          // before truncating than the full "Surname Firstname" would.
          client_surname: appt.last_name || appt.first_name || "Unknown",
          service_name: displayedServiceName,
          serviceArchived: !!svc.service_archived,
          // Same client + same service + same start time = one booking split
          // across several staff members (shown as separate boxes, one per
          // staff column); hovering any of them highlights the others.
          linkKey: `${appt.client_id || `${appt.last_name}|${appt.first_name}`}|${svc.service_id || svc.service_name}|${svc.start_time}`,
          // Same client, same calendar day, ANY staff/service/time — a
          // broader, separate grouping from linkKey above (e.g. two
          // different appointments with different staff later the same
          // day). Only active appointments group this way (not cancelled/
          // no-show — note the hyphenated "no-show", the DB's actual
          // stored value); no walk-in-name fallback like linkKey has, since
          // grouping two different same-named walk-ins would be a false
          // positive — simply absent when there's no real client_id.
          dayClientKey:
            appt.client_id &&
            appt.status !== "cancelled" &&
            appt.status !== "no-show"
              ? `${appt.client_id}|${toLocalDateStr(svc.start_time)}`
              : undefined,
        },
      });
    });
  });

  // Auto-recolor overlapping appointments within the same staff/resource
  // column — e.g. two bookings sharing a resource like ΣΑΟΥΝΑ/ΧΑΜΜΑΜ often
  // land on the exact same category color (most categories share the default),
  // making the narrow side-by-side slivers FullCalendar
  // renders for them look like one solid block rather than two distinct
  // appointments. The earliest-starting event in any overlapping group keeps
  // its normal service color; each event that overlaps an already-placed one
  // gets bumped to the next accent color not already in use among the
  // events it's actually overlapping (a sweep over each resource's events
  // sorted by start time, tracking which are still "active").
  const OVERLAP_ACCENT_COLORS = [
    "#fde68a", // amber-200
    "#fbcfe8", // pink-200
    "#bfdbfe", // blue-200
    "#c7d2fe", // indigo-200
    "#bbf7d0", // green-200
    "#fecaca", // red-200
  ];
  const eventsByResource: Record<string, any[]> = {};
  events.forEach((e) => {
    if (!e.resourceId || !e.start || !e.end) return;
    (eventsByResource[e.resourceId] ||= []).push(e);
  });
  Object.values(eventsByResource).forEach((group) => {
    group.sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
    );
    const active: any[] = [];
    group.forEach((e) => {
      const startMs = new Date(e.start).getTime();
      for (let i = active.length - 1; i >= 0; i--) {
        if (new Date(active[i].end).getTime() <= startMs) active.splice(i, 1);
      }
      if (active.length > 0) {
        const usedColors = new Set(active.map((a) => a.backgroundColor));
        const accent =
          OVERLAP_ACCENT_COLORS.find((c) => !usedColors.has(c)) ||
          OVERLAP_ACCENT_COLORS[active.length % OVERLAP_ACCENT_COLORS.length];
        e.backgroundColor = accent;
      }
      active.push(e);
    });
  });

  return events;
});

// Multi-day leave only — still a non-interactive background tint, since a
// leave period isn't a single clickable slot the way a break block is.
const timeOffBackgroundEvents = computed(() => {
  const entries = calendarStore.timeOff;
  if (!Array.isArray(entries)) return [];

  return entries
    .filter((entry: any) => entry.type === "leave")
    .map((entry: any) => {
      const startDateStr = toLocalDateStr(entry.start_date);
      const endDateExclusive = (dateStr: any) => {
        const d = new Date(`${toLocalDateStr(dateStr)}T00:00:00`);
        d.setDate(d.getDate() + 1);
        return toLocalDateStr(d);
      };
      const endDateStr = toLocalDateStr(entry.end_date);
      const days =
        Math.round(
          (new Date(`${endDateStr}T00:00:00`).getTime() -
            new Date(`${startDateStr}T00:00:00`).getTime()) /
            86400000,
        ) + 1;
      const durationLabel = days === 1 ? "1 ημέρα" : `${days} ημέρες`;

      return {
        id: `timeoff_${entry.id}`,
        resourceId: entry.staff_id?.toString(),
        display: "background",
        backgroundColor: "rgba(239, 68, 68, 0.15)",
        start: startDateStr,
        end: endDateExclusive(entry.end_date),
        title: `Άδεια (${durationLabel})`,
        extendedProps: {
          isTimeOff: true,
          timeOffType: "leave",
          reason: entry.reason,
          durationLabel,
          typeLabel: "Άδεια",
        },
      };
    });
});

// Single-day "break" entries (both the Staff page's own time-off dialog and
// the scheduler's "Αποκλεισμός Ωραρίου" button save through this same type)
// render as a normal, clickable, gray foreground event — not a background
// tint — so staff can click one to unblock it or change its duration the
// same way they'd edit any appointment. See eventClick below.
const breakBlockEvents = computed(() => {
  const entries = calendarStore.timeOff;
  if (!Array.isArray(entries)) return [];

  return entries
    .filter((entry: any) => entry.type === "break")
    .map((entry: any) => {
      const startDateStr = toLocalDateStr(entry.start_date);
      const [sh, sm] = (entry.start_time || "0:0").split(":").map(Number);
      const [eh, em] = (entry.end_time || "0:0").split(":").map(Number);
      const minutes = eh * 60 + em - (sh * 60 + sm);

      return {
        id: `timeoff_${entry.id}`,
        resourceId: entry.staff_id?.toString(),
        title: `Αποκλεισμός (${minutes} λεπτά)`,
        start: `${startDateStr}T${entry.start_time}`,
        end: `${startDateStr}T${entry.end_time}`,
        backgroundColor: "#9ca3af",
        borderColor: "transparent",
        textColor: "#1f2937",
        // Edited only via the dialog (click → toggle/duration → Save), never
        // by dragging/resizing on the grid — eventDrop/eventResize below
        // assume a real appointment's fullAppointment/serviceIndex shape and
        // would fail for a time-off block.
        editable: false,
        startEditable: false,
        durationEditable: false,
        classNames: ["fresha-event", "fc-timeoff-block"],
        extendedProps: {
          isTimeOffBlock: true,
          timeOffId: entry.id,
          staffId: entry.staff_id,
          reason: entry.reason,
        },
      };
    });
});

// Day view only, mirrors timeOffBackgroundEvents — shades the complement of
// a staff member's working ranges (including the split-shift gap) within the
// shop's visible slot window, using whichever schedule version was/is
// actually active on the displayed date. Staff who haven't opted into
// working hours — or for whom no version can be resolved as of this date —
// get no shading at all, exactly as they get no resource-hiding above.
const workingHoursBackgroundEvents = computed(() => {
  if (currentView.value !== "resourceTimeGridDay" || !currentStart.value)
    return [];

  const dateStr = toLocalDateStr(currentStart.value);
  const dayStart = shopSlotMinTime.value;
  const dayEnd = shopSlotMaxTime.value;
  const events: any[] = [];

  for (const staffMember of calendarStore.resources) {
    if (!staffMember.working_hours_enabled) continue;
    const ranges = getWorkingRangesForDate(
      calendarStore.workingHours,
      staffMember.id,
      currentStart.value,
    );
    if (ranges === null) continue; // no version resolvable for this date — no shading

    let cursor = dayStart;
    const gaps: [string, string][] = [];
    for (const r of ranges) {
      if (r.start > cursor) gaps.push([cursor, r.start]);
      if (r.end > cursor) cursor = r.end;
    }
    if (dayEnd > cursor) gaps.push([cursor, dayEnd]);

    gaps.forEach(([s, e], idx) => {
      events.push({
        id: `offhours_${staffMember.id}_${idx}`,
        resourceId: staffMember.id.toString(),
        display: "background",
        classNames: ["fc-off-hours-bg"],
        start: `${dateStr}T${s}`,
        end: `${dateStr}T${e}`,
        extendedProps: { isOffHours: true },
      });
    });
  }
  return events;
});

// --- Actions ---
const handleSave = async () => {
  dialogVisible.value = false;
  await handleRefresh();
};

const handleRefresh = () =>
  Promise.all([
    calendarStore.fetchAppointments(currentStart.value, currentEnd.value),
    calendarStore.refreshTimeOff(),
  ]);

const onClientSelected = (client: any) => {
  quickProfileClientId.value = client.id;
  quickProfileVisible.value = true;
};

const onBookForClient = (client: any) => {
  selectedAppointment.value = {
    client_id: client.client_id,
    ...client,
    start_time: new Date(),
  };
  dialogVisible.value = true;
};

const onOpenFullProfile = ({
  clientId,
  tab,
}: {
  clientId: string;
  tab: string;
}) => {
  quickProfileClientId.value = clientId;
  fullProfileTab.value = tab;
  fullProfileVisible.value = true;
};

const prepareServicesForUpdate = (services: any[]) =>
  services.map((s) => ({
    ...s,
    price_override:
      s.price_override !== undefined ? s.price_override : Number(s.price || 0),
    duration_override:
      s.duration_override !== undefined
        ? s.duration_override
        : s.duration_minutes,
  }));

// Returns whether the update succeeded, so eventDrop/eventResize can revert
// the optimistic drag on rejection (previously swallowed silently, leaving
// the event visually stuck in the rejected spot — now common once staff
// working-hours/time-off enforcement can reject a drag).
const updateAppointment = async (
  id: string,
  updates: any,
): Promise<boolean> => {
  try {
    // Offline the move is queued and shown right away (see offline/queue.ts);
    // base_version lets the server refuse it if the appointment changed
    // meanwhile instead of overwriting that change.
    const body = {
      ...updates,
      ...(updates.version != null && !isTempId(String(id)) ? { base_version: updates.version } : {}),
    };
    delete body.version;
    delete body._offline;
    const result = await fetchOrQueue(`/api/v1/appointments/${id}`, "PUT", body, {
      kind: "appointment",
      label: `${updates.first_name || ""} ${updates.last_name || ""}`.trim() || t("booking.editDialog.title"),
      offlineExtras: { offline_known_overlaps: knownOverlapIds(calendarStore.events, updates.services || [], id) },
    });
    if (result.queued) {
      toast.add({
        severity: "warn",
        summary: t("booking.toast.savedOffline"),
        detail: t("booking.toast.savedOfflineDetail"),
        life: 4000,
      });
      return true;
    }
    const res = result.response;
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (err.error === "stale_appointment" || err.error === "appointment_missing") {
        // Changed (or deleted) on another device meanwhile: show the current state.
        await calendarStore.fetchAppointments(currentStart.value, currentEnd.value);
        throw new Error(t(`offline.conflict.${err.error}`));
      }
      throw new Error(err.error || t("scheduler.toasts.updateFailedError"));
    }
    await calendarStore.fetchAppointments(currentStart.value, currentEnd.value);
    return true;
  } catch (e: any) {
    toast.add({
      severity: "error",
      summary: t("scheduler.toasts.updateFailed"),
      detail: e.message || t("scheduler.toasts.updateFailedDetail"),
      life: 3000,
    });
    return false;
  }
};

// Shared gate for selectAllow/eventAllow — rejects a drag-select or an
// existing appointment's drag/resize if it would land during a staff
// member's time-off or outside their configured working hours. This is a
// UX convenience only (prevents the gesture from ever completing); the
// server-side assertStaffAvailable guard is the actual authority.
const staffAvailability = (staffId: any, start: Date, end: Date) =>
  isStaffAvailable({
    staffList: calendarStore.resources,
    workingHours: calendarStore.workingHours,
    timeOff: calendarStore.timeOff,
    staffId,
    start,
    end,
  });

// Admin, super admin and frontdesk may book outside a staff member's working
// hours (incl. a scheduled day off) as overtime, after a confirmation; leave
// and breaks stay blocked for everyone.
const canBookOvertime = computed(() => authStore.isShopAdmin);

const isRangeAllowedForResource = (start: Date, end: Date, resource: any) => {
  if (!resource) return true;
  const result = staffAvailability(resource.id, start, end);
  return result.available || (result.reason === "outside_hours" && canBookOvertime.value);
};

// The overtime entry for a staff member and time range, or null when the
// range is within their working hours.
const overtimeEntryFor = (staffId: any, start: Date, end: Date): OvertimeEntry | null => {
  if (!staffId) return null;
  if (staffAvailability(staffId, start, end).reason !== "outside_hours") return null;
  return {
    name: calendarStore.resources.find((r: any) => String(r.id) === String(staffId))?.name || "",
    hours: describeWorkingDay(calendarStore.workingHours, calendarStore.resources, staffId, start),
  };
};

const confirmOvertimeSlot = (entry: OvertimeEntry): Promise<boolean> =>
  new Promise((resolve) => {
    confirm.require({
      header: t("booking.overtime.header"),
      message: overtimeConfirmMessage([entry], t),
      icon: "pi pi-clock",
      acceptLabel: t("booking.overtime.accept"),
      rejectLabel: t("common.cancel"),
      accept: () => resolve(true),
      reject: () => resolve(false),
      onHide: () => resolve(false),
    });
  });

// Phones fit about 6-7 narrow staff columns (time gutter ~44px) and scroll
// sideways for the rest; larger screens keep the roomier width.
const getDayMinWidth = () =>
  window.innerWidth < 768 ? Math.max(46, Math.floor((window.innerWidth - 44) / 6.5)) : 160;

// eventContent/resourceLabelContent below build raw HTML strings from
// client/staff/service names, which are user-editable text, not code — always
// escape before interpolating into either HTML content or an attribute value.
const escapeHtml = (value: unknown): string =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] as string,
  );

// Two independent hover-grouping keys, each toggling its own CSS class:
// linkKey (same client+service+exact start time, split across staff — a
// subtle darken) and dayClientKey (same client, same calendar day, any
// staff/service/time — a themed colored highlight). Dictionary-driven since
// both comparisons are structurally identical; an event can match both
// simultaneously with no conflict (two classes on one element).
const HOVER_LINK_CONFIGS = [
  { attr: "linkKey", dataAttr: "linkKey", cssClass: "fc-linked-hover" },
  {
    attr: "dayClientKey",
    dataAttr: "dayClientKey",
    cssClass: "fc-day-client-hover",
  },
] as const;

const highlightLinkedEvents = (
  extendedProps: Record<string, any> | undefined,
  hoveredEl: HTMLElement,
) => {
  if (!extendedProps) return;
  for (const { attr, cssClass } of HOVER_LINK_CONFIGS) {
    const key = extendedProps[attr];
    if (!key) continue;
    document
      .querySelectorAll<HTMLElement>(`[data-${attr === "linkKey" ? "link-key" : "day-client-key"}]`)
      .forEach((el) => {
        if (el !== hoveredEl && (el.dataset as any)[attr] === key) {
          el.classList.add(cssClass);
        }
      });
  }
};
const clearLinkedHighlight = () => {
  for (const { cssClass } of HOVER_LINK_CONFIGS) {
    document
      .querySelectorAll(`.${cssClass}`)
      .forEach((el) => el.classList.remove(cssClass));
  }
};

// --- Calendar Options ---
// Ctrl (or ⌘) + drag moves all of an appointment's cards together. While
// dragging with it held, the other cards of that appointment are outlined.
// FullCalendar won't start a drag when Ctrl is held on pressing (it keeps
// Ctrl-click for the Mac context menu), so a Ctrl + press on a card is
// remembered here and handed on without Ctrl (see onCardMouseDown).
let moveTogetherArmed = false;
const isMoveTogether = (e: MouseEvent | undefined) => moveTogetherArmed || !!(e?.ctrlKey || e?.metaKey);
let moveTogetherId: string | null = null;
const markMoveTogether = (on: boolean) => {
  if (!moveTogetherId) return;
  document
    .querySelectorAll(`.fc-event[data-appointment-id="${CSS.escape(moveTogetherId)}"]`)
    .forEach((el) => el.classList.toggle("fc-move-together", on));
};
const onMoveTogetherKey = (e: KeyboardEvent) => markMoveTogether(isMoveTogether(e as unknown as MouseEvent));
const startMoveTogetherHint = (appointmentId: string | undefined) => {
  moveTogetherId = appointmentId ? String(appointmentId) : null;
  markMoveTogether(moveTogetherArmed);
  window.addEventListener("keydown", onMoveTogetherKey);
  window.addEventListener("keyup", onMoveTogetherKey);
};
const stopMoveTogetherHint = () => {
  markMoveTogether(false);
  moveTogetherId = null;
  // Cleared after eventDrop has read it (it runs right after this).
  setTimeout(() => (moveTogetherArmed = false));
  window.removeEventListener("keydown", onMoveTogetherKey);
  window.removeEventListener("keyup", onMoveTogetherKey);
};

const calendarOptions = ref({
  schedulerLicenseKey: "CC-Attribution-NonCommercial-NoDerivatives",
  longPressDelay: 350,
  eventLongPressDelay: 350,
  selectLongPressDelay: 350,
  eventResizableFromStart: true,
  locale: elLocale,
  plugins: [
    resourceTimeGridPlugin,
    scrollGridPlugin,
    dayGridPlugin,
    interactionPlugin,
    timeGridPlugin,
  ],
  titleFormat: {
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "numeric",
  } as const,
  resourceOrder: "sort_order",
  initialView: "resourceTimeGridDay",
  validRange: isStaffRole.value ? { start: todayDateStr() } : undefined,
  allDaySlot: false,
  // Compact 24h time on appointment boxes (e.g. "14:00 - 15:30" instead of
  // "10:00 π.μ. - 11:00 π.μ.") — roughly half the characters, same info
  // within a single day view where AM/PM is redundant.
  eventTimeFormat: {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  } as const,
  // Fixed: zoom changes row height, not this (see ZOOM_ROW_HEIGHTS).
  slotDuration: "00:15:00",
  // Clicks and selections on the empty grid snap to the 15-minute rows;
  // hovering an appointment switches this to 5 minutes so dragging and
  // resizing move in 5-minute steps (see setSnapMinutes).
  snapDuration: "00:15:00",
  slotLabelInterval: "01:00",
  slotMinTime: "07:00:00",
  slotMaxTime: "23:00:00",
  // Big bold hour number + small "00", Fresha/Treatwell-style. The half-hour
  // row shares the hour row's bold divider (see slotLaneClassNames below);
  // only the quarter marks (:15/:45) get the lighter one — no label on any
  // of these, just a visual break.
  slotLabelContent: (arg: any) => ({
    html: `
      <div class="flex items-baseline justify-end gap-0.5 pr-1 leading-none">
        <span class="text-lg md:text-xl font-extrabold text-gray-700">${arg.date.getHours()}</span>
        <span class="text-[9px] md:text-[10px] font-semibold text-gray-400">00</span>
      </div>
    `,
  }),
  slotLaneClassNames: (arg: any) => {
    const mins = arg.date?.getMinutes();
    // Half-hour gets the same 2px weight as the hour line but a lighter
    // shade (fc-slot-half-hour-bold), so the two stay visually distinct
    // while both clearly outrank the quarter marks' 1px divider.
    if (mins === 0) return ["fc-slot-hour"];
    if (mins === 30) return ["fc-slot-half-hour-bold"];
    if (mins === 15 || mins === 45) return ["fc-slot-half-hour"];
    return [];
  },
  height: "100%",
  // Rows keep the zoom height exactly (see ZOOM_ROW_HEIGHTS). Stretching them
  // to fill the screen would not stretch the separate time-axis column, so
  // the hour numbers would drift off their lines when zoomed out.
  expandRows: false,
  dayMinWidth:
    localStorage.getItem("fitStaff") === "true" ? 0 : getDayMinWidth(),
  stickyHeaderDates: true,
  nowIndicator: true,
  weekends: true,
  headerToolbar: false as const,
  editable: true,
  selectable: true,
  selectMirror: true,
  selectAllow: (info: any) =>
    isRangeAllowedForResource(info.start, info.end, info.resource),
  eventAllow: (dropInfo: any, draggedEvent: any) =>
    isRangeAllowedForResource(
      dropInfo.start,
      dropInfo.end,
      dropInfo.resource || draggedEvent?.getResources?.()[0],
    ),
  resources: [],
  events: [],

  datesSet: async (arg: any) => {
    currentTitle.value = arg.view.title;
    dockedDate.value = arg.view.calendar.getDate();
    currentView.value = arg.view.type;
    currentStart.value = arg.startStr;
    currentEnd.value = arg.endStr;
    if (calendarStore.fetchAppointments) {
      isFetching.value = true;
      try {
        await calendarStore.fetchAppointments(arg.startStr, arg.endStr);
      } finally {
        isFetching.value = false;
      }
    }
  },

  windowResize: () => {
    isPhone.value = window.innerWidth < PHONE_MAX_WIDTH;
    if (fullCalendar.value) {
      fullCalendar.value
        .getApi()
        .setOption("dayMinWidth", fitStaff.value ? 0 : getDayMinWidth());
    }
  },

  // Phone: the current time as a small pill on the time axis.
  nowIndicatorContent: (arg: any) => {
    if (!arg.isAxis || !isPhone.value) return "";
    const d = arg.date as Date;
    const hhmm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    return { html: `<span class="fc-now-pill">${hhmm}</span>` };
  },

  resourceLabelContent: (arg: any) => {
    const title = escapeHtml(arg.resource.title);
    const notWorking = !!arg.resource.extendedProps.notWorking;
    if (isPhone.value) {
      const initial = escapeHtml(Array.from(String(arg.resource.title || "?").trim())[0] || "?");
      return {
        html: `
        <div class="flex items-center justify-center py-1.5 w-full" title="${title}">
          <span class="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white ${notWorking ? "bg-gray-300" : "bg-[var(--p-primary-color)]"}">${initial}</span>
        </div>
      `,
      };
    }
    return {
      html: `
        <div class="flex flex-col items-center justify-center py-1 w-full h-full ${notWorking ? "opacity-60" : ""}">
          <div style="white-space:normal;word-break:break-word;" class="font-bold ${notWorking ? "text-gray-400" : "text-gray-800"} text-[10px] md:text-[11px] leading-tight text-center px-0.5">
            ${title}
          </div>
          ${notWorking ? `<div class="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">${escapeHtml(t("staff.workingHours.dayOff"))}</div>` : ""}
        </div>
      `,
    };
  },

  eventContent: (arg: any) => {
    const props = arg.event.extendedProps;

    if (props.isTimeOff) {
      return {
        html: `
        <div class="relative w-full h-full p-1.5 flex flex-col leading-tight overflow-hidden">
          <div class="text-[10px] md:text-[12px] font-bold text-gray-600 whitespace-normal">${escapeHtml(props.typeLabel)}</div>
          <div class="text-[10px] md:text-[11px] text-gray-500 whitespace-normal">${escapeHtml(props.durationLabel)}</div>
          ${props.reason ? `<div class="text-[10px] md:text-[11px] text-gray-400 italic whitespace-normal">${escapeHtml(props.reason)}</div>` : ""}
        </div>
      `,
      };
    }

    // Off-hours shading (working-hours gaps) is a plain textured background
    // with no label — just the diagonal-stripe CSS class, nothing to render.
    if (props.isOffHours) {
      return { html: "" };
    }

    // A "break" time-off block — clickable like a real appointment (see
    // eventClick/isTimeOffBlock), but with no client/service to show.
    if (props.isTimeOffBlock) {
      return {
        html: `
        <div class="relative w-full h-full p-1.5 flex flex-col leading-tight overflow-hidden">
          <div class="text-[10px] md:text-[12px] font-bold text-gray-700 flex items-center gap-1"><i class="pi pi-ban text-[9px]"></i> ${escapeHtml(arg.event.title)}</div>
          ${props.reason ? `<div class="text-[10px] md:text-[11px] text-gray-500 italic whitespace-normal">${escapeHtml(props.reason)}</div>` : ""}
        </div>
      `,
      };
    }

    const timeText = arg.timeText;
    const status = props.fullAppointment?.status;

    const isCancelled = status === "cancelled" || status === "no_show";
    const isCashPaid =
      props.fullAppointment?.payment_status === "paid" &&
      props.fullAppointment?.payment_method === "cash";
    const isConfirmed = status === "confirmed";
    const isCompleted = status === "completed";
    const isMonthView = arg.view.type === "dayGridMonth";
    const start = arg.event.start;
    const end = arg.event.end;
    const durationMins =
      end && start ? (end.getTime() - start.getTime()) / 60000 : 60;
    // Only genuinely tight (<20 min) boxes drop to the compact, single-line
    // "name — service" layout — everything 20 min and up keeps the full
    // two-line name/service layout.
    const isShort = durationMins <= 20;
    // A half-hour-or-shorter appointment never shows its time range (the
    // box's position/height already says when it is) — matches the
    // reference calendar's own behavior, independent of the tighter
    // single-line cutoff above.
    const hideTime = durationMins <= 30;

    const paddingClass =
      isShort && !isMonthView
        ? "p-1 pl-1.5"
        : isMonthView
          ? "p-2"
          : // Tighter than the old flat p-2 — with 3 lines now allowed to wrap
            // (time/name/service), every px of padding is px the text doesn't
            // get, and this tier (20+ min, day/week view) is exactly the one
            // tightest on room relative to what it now needs to fit.
            "px-2 py-1";
    // Hierarchy comes from weight/color, not size — name and service/time
    // stay close in font size (Fresha-style); the name reads first purely
    // because it's bold + near-black against muted-gray secondary lines.
    const titleClass =
      isShort && !isMonthView
        ? "text-[10px] md:text-[11px] leading-tight"
        : "text-[11px] md:text-[12px] leading-tight";

    const textClass = isCancelled
      ? "line-through opacity-60 text-gray-500"
      : isCashPaid
        ? "line-through text-orange-700"
        : "text-gray-900";
    const serviceClass = isCancelled
      ? "opacity-40 text-gray-500"
      : isCashPaid
        ? "opacity-70 text-orange-600"
        : "text-gray-600";
    const timeClass = isCancelled
      ? "text-red-400"
      : isCashPaid
        ? "text-orange-500"
        : "text-gray-500";

    const statusBadge = isConfirmed
      ? `<span class="absolute top-1 right-1 text-violet-700"><i class="pi pi-check text-[9px]"></i></span>`
      : isCompleted
        ? `<span class="absolute top-1 right-1 text-green-600"><i class="pi pi-check-circle text-[9px]"></i></span>`
        : "";

    const archivedBadge = props.serviceArchived
      ? `<span class="absolute top-1 right-6 text-gray-500" title="${escapeHtml(t("services.archivedTooltip"))}"><i class="pi pi-box text-[9px]"></i></span>`
      : "";

    // While dragging or resizing, FullCalendar renders a "mirror" copy at the
    // new position; label it with the exact new time, since a 5-minute step
    // is only a few pixels when zoomed out.
    if (arg.isMirror && !isMonthView && start && end) {
      const hhmm = (d: Date) =>
        `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      return {
        html: `<div class="fc-drag-time-pill">${hhmm(start)} – ${hhmm(end)}</div>`,
      };
    }

    if (isPhone.value && !isMonthView) {
      const start = arg.event.start as Date | null;
      const startText = start
        ? `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`
        : "";
      return {
        html: `
        <div lang="el" class="relative w-full h-full px-1 py-0.5 flex flex-col leading-tight overflow-hidden uppercase">
          ${durationMins > 30 ? `<div class="text-[9px] font-semibold truncate ${timeClass}">${startText}</div>` : ""}
          <div class="text-[10px] font-bold truncate ${textClass}">${escapeHtml(props.client_name)}</div>
          ${durationMins > 15 ? `<div class="text-[9px] truncate ${serviceClass}">${escapeHtml(props.service_name)}</div>` : ""}
        </div>
      `,
      };
    }

    return {
      html: `
      <div lang="el" class="relative w-full ${paddingClass} flex flex-col leading-tight overflow-hidden uppercase hover:brightness-95 transition-all ${isMonthView ? "" : "h-full"}">
        ${statusBadge}
        ${archivedBadge}
        ${!hideTime && !isMonthView ? `<div class="text-[10px] md:text-[12px] font-semibold mb-0.5 truncate ${timeClass}">${timeText}</div>` : ""}
        ${
          isShort && !isMonthView
            ? `<div class="font-bold ${titleClass} pr-2 truncate ${textClass}" title="${escapeHtml(props.client_name)} — ${escapeHtml(props.service_name)}">${escapeHtml(props.client_surname)}<span class="font-normal ${serviceClass}"> — ${escapeHtml(props.service_name)}</span></div>`
            : isMonthView
              ? `<div class="font-bold ${titleClass} pr-4 truncate ${textClass}" title="${escapeHtml(props.client_name)}">${escapeHtml(props.client_name)}</div>
        <div class="text-[10px] md:text-[12px] font-medium mt-0.5 truncate ${serviceClass}" title="${escapeHtml(props.service_name)}">${escapeHtml(props.service_name)}</div>`
              : // Enough vertical room at 20+ min for the full name and service
                // to just wrap onto another line rather than truncate — nothing
                // gets cut off mid-word (whitespace-normal only, no break-words),
                // matching the earlier "keep words intact" preference.
                `<div class="font-bold ${titleClass} pr-4 whitespace-normal ${textClass}" title="${escapeHtml(props.client_name)}">${escapeHtml(props.client_name)}</div>
        <div class="text-[10px] md:text-[12px] font-medium mt-0.5 whitespace-normal ${serviceClass}" title="${escapeHtml(props.service_name)}">${escapeHtml(props.service_name)}</div>`
        }
      </div>
    `,
    };
  },

  // Hover card — triggered from anywhere on the box (FullCalendar fires this
  // for the whole event element, not a sub-element), skipping time-off/
  // off-hours background events (only real service events carry isServiceEvent).
  eventDidMount: (info: any) => {
    const key = info.event.extendedProps?.linkKey;
    if (key) info.el.dataset.linkKey = key;
    const dayKey = info.event.extendedProps?.dayClientKey;
    if (dayKey) info.el.dataset.dayClientKey = dayKey;
    const apptId = info.event.extendedProps?.appointmentId;
    if (apptId) info.el.dataset.appointmentId = apptId; // used by the browser tests
  },

  eventDragStart: (info: any) => {
    dragInProgress = true;
    hideHoverCard();
    startMoveTogetherHint(info.event.extendedProps?.appointmentId);
  },
  eventDragStop: () => {
    dragInProgress = false;
    hideHoverCard();
    stopMoveTogetherHint();
    setTimeout(() => setSnapMinutes(SLOT_MINUTES));
  },
  eventResizeStart: () => {
    dragInProgress = true;
    hideHoverCard();
  },
  eventResizeStop: () => {
    dragInProgress = false;
    hideHoverCard();
    setTimeout(() => setSnapMinutes(SLOT_MINUTES));
  },

  eventMouseEnter: (info: any) => {
    if (info.event.display !== "background") setSnapMinutes(5);
    if (!info.event.extendedProps?.isServiceEvent) return;
    if (dragInProgress || moveConfirmOpen) return;
    highlightLinkedEvents(info.event.extendedProps, info.el);
    if (hoverShowTimer) clearTimeout(hoverShowTimer);
    hoverShowTimer = setTimeout(() => {
      if (dragInProgress || moveConfirmOpen) return;
      const rect = info.el.getBoundingClientRect();
      hoverAnchorRect.value = {
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
      hoveredAppointment.value = {
        ...info.event.extendedProps.fullAppointment,
        client_name: info.event.extendedProps.client_name,
        service_name: info.event.extendedProps.service_name,
        start: info.event.start,
        end: info.event.end,
      };
    }, 250);
  },

  eventMouseLeave: () => {
    setSnapMinutes(SLOT_MINUTES);
    clearLinkedHighlight();
    hideHoverCard();
  },

  eventClick: (info: any) => {
    const fullAppt = info.event.extendedProps.fullAppointment;
    if (fullAppt) {
      selectedAppointment.value = fullAppt;
      dialogVisible.value = true;
      return;
    }
    if (info.event.extendedProps.isTimeOffBlock) {
      const p = info.event.extendedProps;
      selectedAppointment.value = {
        time_off_id: p.timeOffId,
        staff_id: p.staffId,
        start_time: info.event.start,
        end_time: info.event.end,
        reason: p.reason,
      };
      dialogVisible.value = true;
    }
  },

  eventDrop: async (info: any) => {
    const { appointmentId, serviceIndex, fullAppointment } =
      info.event.extendedProps;
    const newResourceId = info.newResource?.id;
    const start = info.event.start.getTime();
    const end = info.event.end.getTime();
    let services = prepareServicesForUpdate(
      JSON.parse(JSON.stringify(fullAppointment.services)),
    );
    // Ctrl (⌘ on a Mac) held when dropping: every card of this appointment
    // moves by the same time, and all to the column it was dropped in.
    const moveAll = isMoveTogether(info.jsEvent) && services.length > 1;
    if (moveAll) {
      const shift = start - info.oldEvent.start.getTime();
      services = services.map((s: any) => ({
        ...s,
        start_time: new Date(new Date(s.start_time).getTime() + shift).toISOString(),
        ...(newResourceId ? { staff_id: newResourceId } : {}),
      }));
    } else if (services[serviceIndex]) {
      services[serviceIndex].start_time = info.event.start.toISOString();
      services[serviceIndex].duration_minutes = (end - start) / 60000;
      services[serviceIndex].duration_override = (end - start) / 60000;
      if (newResourceId) services[serviceIndex].staff_id = newResourceId;
    }
    const overtime = (moveAll ? services : [services[serviceIndex]])
      .map((s: any) => {
        if (!s) return null;
        const from = new Date(s.start_time);
        const to = new Date(from.getTime() + (Number(s.duration_override) || 60) * 60000);
        return overtimeEntryFor(s.staff_id, from, to);
      })
      .filter((o: OvertimeEntry | null, i: number, all: (OvertimeEntry | null)[]): o is OvertimeEntry =>
        !!o && all.findIndex((x) => x?.name === o.name) === i);
    if (!(await confirmMove(fullAppointment.services, services, overtime))) {
      info.revert();
      return;
    }
    const ok = await updateAppointment(appointmentId, {
      ...fullAppointment,
      services,
      allow_overtime: overtime.length > 0,
    });
    if (!ok) info.revert();
  },

  eventResize: async (info: any) => {
    const { appointmentId, serviceIndex, fullAppointment } =
      info.event.extendedProps;
    const start = info.event.start.getTime();
    const end = info.event.end.getTime();
    const newDuration = (end - start) / 60000;
    let services = prepareServicesForUpdate(
      JSON.parse(JSON.stringify(fullAppointment.services)),
    );
    if (services[serviceIndex]) {
      services[serviceIndex].start_time = info.event.start.toISOString();
      services[serviceIndex].duration_minutes = newDuration;
      services[serviceIndex].duration_override = newDuration;
    }
    const overtime = overtimeEntryFor(
      services[serviceIndex]?.staff_id,
      info.event.start,
      info.event.end,
    );
    if (!(await confirmMove(fullAppointment.services, services, overtime ? [overtime] : []))) {
      info.revert();
      return;
    }
    const ok = await updateAppointment(appointmentId, {
      ...fullAppointment,
      services,
      allow_overtime: !!overtime,
    });
    if (!ok) info.revert();
  },

  select: async (info: any) => {
    // Clear the selection right away; FullCalendar ignores a click that
    // repeats the current selection, so re-clicking a slot after closing the
    // dialog would otherwise do nothing.
    info.view.calendar.unselect();
    const { start, end } = roundRangeToSlots(info.start, info.end);
    const staffId = info.resource ? info.resource.id : null;
    // Outside the staff member's hours: ask first; the booking dialog then
    // doesn't ask again for the same staff member.
    const overtime = overtimeEntryFor(staffId, start, end);
    if (overtime && !(await confirmOvertimeSlot(overtime))) return;
    selectedAppointment.value = {
      start_time: formatSlotIso(start),
      end_time: formatSlotIso(end),
      staff_id: staffId,
      staff_name: info.resource ? info.resource.title : "",
      overtime_confirmed_staff_id: overtime ? staffId : null,
    };
    dialogVisible.value = true;
  },
});

watch(
  [
    calendarResources,
    calendarEvents,
    timeOffBackgroundEvents,
    breakBlockEvents,
    workingHoursBackgroundEvents,
  ],
  ([
    newResources,
    newEvents,
    newTimeOffEvents,
    newBreakBlockEvents,
    newWorkingHoursEvents,
  ]) => {
    if (!fullCalendar.value) return;
    const api = fullCalendar.value.getApi();
    api.setOption("resources", newResources);
    api.setOption("events", [
      ...newEvents,
      ...newTimeOffEvents,
      ...newBreakBlockEvents,
      ...newWorkingHoursEvents,
    ]);
  },
  { deep: true },
);

// Live updates: bookings changed on another screen (see "appointments:changed"
// in server.js). Reloads the visible range after a short pause, so a burst of
// changes is one reload; not mid-drag, and not while the tab is hidden (then
// on return).
const LIVE_RELOAD_DELAY_MS = 700;
let liveReloadTimer: ReturnType<typeof setTimeout> | null = null;
let liveReloadPending = false;
const liveReload = () => {
  if (liveReloadTimer) clearTimeout(liveReloadTimer);
  liveReloadTimer = setTimeout(() => {
    liveReloadTimer = null;
    if (dragInProgress || document.hidden) {
      liveReloadPending = true;
      if (dragInProgress) liveReload(); // try again once the drag is over
      return;
    }
    liveReloadPending = false;
    calendarStore.refreshVisibleRange();
  }, LIVE_RELOAD_DELAY_MS);
};
const onVisibleAgain = () => {
  if (!document.hidden && liveReloadPending) liveReload();
};
// Ctrl + press on a card (before FullCalendar sees it): note it, and pass the
// same press on without Ctrl so the drag starts.
const onCardMouseDown = (e: MouseEvent) => {
  if (!e.ctrlKey || e.button !== 0 || !(e.target as HTMLElement)?.closest?.(".fc-event")) return;
  moveTogetherArmed = true;
  e.stopImmediatePropagation();
  e.preventDefault();
  e.target!.dispatchEvent(
    new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 0,
      buttons: 1,
      clientX: e.clientX,
      clientY: e.clientY,
      screenX: e.screenX,
      screenY: e.screenY,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      metaKey: e.metaKey,
      ctrlKey: false,
    }),
  );
};
// A Ctrl + press that didn't become a drag (just a click) mustn't count later.
const disarmMoveTogether = () => {
  if (!dragInProgress) setTimeout(() => (moveTogetherArmed = false), 0);
};
onMounted(() => {
  document.addEventListener("mousedown", onCardMouseDown, true);
  document.addEventListener("mouseup", disarmMoveTogether, true);
});
onUnmounted(() => {
  document.removeEventListener("mousedown", onCardMouseDown, true);
  document.removeEventListener("mouseup", disarmMoveTogether, true);
});
onMounted(() => {
  window.addEventListener("appointments-changed", liveReload);
  document.addEventListener("visibilitychange", onVisibleAgain);
});
onUnmounted(() => {
  window.removeEventListener("appointments-changed", liveReload);
  document.removeEventListener("visibilitychange", onVisibleAgain);
  if (liveReloadTimer) clearTimeout(liveReloadTimer);
});

onMounted(async () => {
  await calendarStore.fetchBaseResources();
  nextTick(async () => {
    if (fullCalendar.value) {
      currentTitle.value = fullCalendar.value.getApi().view.title;
    }
    const token = localStorage.getItem("token");
    if (token) {
      try {
        const shop = await http.get("/api/v1/shop").catch(() => null);
        if (shop) {
          if (shop.slot_min_time)
            shopSlotMinTime.value = shop.slot_min_time + ":00";
          if (shop.slot_max_time)
            shopSlotMaxTime.value = shop.slot_max_time + ":00";
          const api = calendarApi.value;
          if (api) {
            if (shop.slot_min_time)
              api.setOption("slotMinTime", shopSlotMinTime.value);
            if (shop.slot_max_time)
              api.setOption("slotMaxTime", shopSlotMaxTime.value);
            if (typeof shop.show_weekends === "boolean")
              api.setOption("weekends", shop.show_weekends);
          }
        }
      } catch {}
    }
  });
});
</script>

<style>
/* Ctrl + drag: the appointment's other cards, which move along. */
.fc-v-event.fc-move-together {
  outline: 2px dashed var(--p-primary-color);
  outline-offset: 1px;
}

/* Docked date calendar: fills its column, no frame, no sideways scroll. */
.docked-date-picker .p-datepicker,
.docked-date-picker .p-datepicker-panel {
  width: 100%;
  min-width: 0;
  border: 0;
  box-shadow: none;
}
.docked-date-picker .p-datepicker-panel {
  padding: 0 0.5rem 0.75rem;
}
.docked-date-picker .p-datepicker-day-view {
  width: 100%;
  table-layout: fixed;
}
.docked-date-picker .p-datepicker-day-cell {
  padding: 0.125rem;
}
.docked-date-picker .p-datepicker-day {
  width: 2rem;
  height: 2rem;
}
.fc {
  --fc-border-color: #f3f4f6;
  --fc-now-indicator-color: #ef4444;
  --fc-today-bg-color: transparent;
}

/* Staff working-hours off-hours shading (Day view) — a texture rather than a
   third flat color, so it stays distinguishable from the red "leave" and
   gray "break" time-off tints, including for colorblind users. !important is
   needed because FullCalendar's own .fc-bg-event rule sets the `background`
   shorthand (color + image together), which otherwise wins the cascade by
   source order and silently resets background-image back to none. */
.fc-off-hours-bg {
  background-image: none !important;
  background-color: rgba(100, 116, 139, 0.16) !important;
  opacity: 1 !important;
}

.fc .fc-toolbar {
  display: none;
}

.fc-col-header-cell {
  background-color: #ffffff;
  border-bottom: 1px solid #e5e7eb !important;
  padding-bottom: 8px;
}

.fc-timegrid-axis {
  border-right: 1px solid #e5e7eb;
}

/* Centre each hour number on its hour line instead of below it: anchor the
   label to the top of its slot (where the line is) and lift it by half its
   own height. */
.fc .fc-timegrid-slot-label {
  vertical-align: top;
  overflow: visible;
}
.fc .fc-timegrid-slot-label-frame {
  height: 0;
  overflow: visible;
}
.fc .fc-timegrid-slot-label-cushion {
  transform: translateY(-50%);
}
/* The first hour's line is the top edge of the grid; lifting its label would
   hide half of it under the staff header. */
.fc tr:first-child > .fc-timegrid-slot-label .fc-timegrid-slot-label-cushion {
  transform: none;
}

/* Zoom: every row is 15 minutes; the zoom buttons set this height. The label
   frame above has no height, so the hour number never forces a row taller. */
.fc .fc-timegrid-slot {
  height: var(--slot-row-height, 27px);
  /* An empty cell still keeps a text line's height, which would stop small
     rows at ~17px; the hour label sets its own font sizes. */
  font-size: 0;
  line-height: 0;
}

/* Reference-style time axis: quarter-hour rows get almost no line at all,
   the half-hour row gets a light-but-visible divider, and the hour row
   (where the big bold hour number sits) gets a clearly darker line — three
   distinct weights instead of one flat "minor" shade for everything. */
.fc-timegrid-slot {
  border-top: 1px solid #f8fafc !important;
}
.fc-timegrid-slot-minor {
  border-color: #f8fafc !important;
}
.fc-slot-half-hour {
  border-top: 1px solid #e7e8eb !important;
}
/* Same 2px weight as the true hour line, one shade lighter — distinct at a
   glance from :00 while still clearly bolder than the 1px quarter marks
   above. Sits roughly halfway between fc-slot-hour's #cbd5e1 and
   fc-slot-half-hour's #e7e8eb; nudge this value alone to tune how close it
   reads to one or the other. */
.fc-slot-half-hour-bold {
  border-top: 2px solid #dde3e9 !important;
}
/* The hour gridline marks the START of the hour (e.g. exactly 10:00), which
   is the TOP edge of the row carrying the "10:00" label — not its bottom
   edge, which would mark 10:15 instead. */
.fc-slot-hour {
  border-top: 2px solid #cbd5e1 !important;
}

.fc-v-event {
  border: 1px solid rgba(100, 116, 139, 0.3);
  background-color: transparent;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  border-radius: 0;
}
.fc-v-event .fc-event-main {
  padding: 0;
  color: inherit;
}
/* Offline: changes waiting to sync (dashed) and refused ones (red). */
.fc-v-event.fc-offline-pending {
  outline: 2px dashed #b45309;
  outline-offset: -2px;
}
.fc-v-event.fc-offline-pending .fc-event-main::after {
  content: "\e944"; /* pi-cloud-upload */
  font-family: "primeicons";
  position: absolute;
  right: 3px;
  bottom: 2px;
  font-size: 10px;
  color: #b45309;
}
.fc-v-event.fc-offline-conflict {
  outline: 2px solid #dc2626;
  outline-offset: -2px;
}
/* Matches the hovered box's own hover:brightness-95 on its inner content. */
.fc-linked-hover .fc-event-main > div {
  filter: brightness(0.95);
}
/* Same client, same calendar day, any staff — a colored highlight (not just
   a brightness tweak) so it reads as a distinct grouping from the
   same-moment .fc-linked-hover above. Inset so it composes with
   .fc-v-event's own border/box-shadow instead of drawing a second,
   concentric rectangle the way an outline would. Can coexist with
   fc-linked-hover on the same box. */
.fc-day-client-hover {
  box-shadow: 0 0 0 2px var(--p-primary-color) inset !important;
}

/* Minimum visual height floor: a 5-10 min appointment renders at only a
   handful of pixels at this app's normal zoom — nowhere near enough for a
   legible line of text no matter how the content inside is formatted. This
   floor is purely visual (FullCalendar still positions the box at the
   correct start time; only its rendered height is bumped up), so a very
   short appointment can appear to touch whatever's booked immediately after
   it even though nothing actually conflicts — an accepted trade-off in
   favor of always being able to read who/what at a glance. Targets both the
   positioned harness (which carries the real inline height) and the event
   box itself, since either can be the actual sizing constraint depending on
   FullCalendar's internal DOM for a given view. */
.fc-timegrid-event-harness,
.fc-v-event {
  min-height: 20px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

/* Phone: current time as a pill on the time axis (see nowIndicatorContent) */
.fc-now-pill {
  position: absolute;
  left: 2px;
  top: 0;
  transform: translateY(-50%);
  background: #111827;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  padding: 3px 5px;
  border-radius: 9999px;
  white-space: nowrap;
}
.fc .fc-timegrid-now-indicator-arrow:has(.fc-now-pill) {
  border-color: transparent !important;
}

/* Drag/resize preview: exact new time, sitting just above the box so a short
   (or zoomed-out) appointment doesn't clip it (see eventContent isMirror) */
.fc .fc-event-mirror,
.fc .fc-event-mirror .fc-event-main {
  overflow: visible !important;
  z-index: 50 !important;
}
.fc-drag-time-pill {
  position: absolute;
  left: 2px;
  bottom: calc(100% + 2px);
  background: #111827;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  padding: 4px 6px;
  border-radius: 9999px;
  white-space: nowrap;
  pointer-events: none;
}
</style>
