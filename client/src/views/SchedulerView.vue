<template>
  <div class="flex flex-col h-[calc(100vh-64px)] bg-white" @click="closeMenus">
    <!-- ===== TOOLBAR ===== -->
    <div
      class="flex flex-wrap items-center justify-between gap-3 px-4 md:px-6 py-3 border-b border-gray-100 bg-white flex-shrink-0"
    >
      <!-- LEFT: Navigation -->
      <div class="flex items-center gap-2">
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
            <i class="pi pi-chevron-down text-[10px] text-gray-400"></i>
          </button>
          <div
            v-if="showDatePicker"
            @click.stop
            class="absolute top-full left-0 mt-2 z-50 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden"
          >
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

      <!-- RIGHT: Controls -->
      <div class="flex items-center gap-2 flex-wrap">
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
        <div class="hidden sm:flex items-center bg-gray-100 rounded-lg p-0.5">
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

        <!-- Add New -->
        <button
          @click="openNewAppointment"
          class="flex items-center gap-1.5 bg-[var(--p-primary-color)] hover:brightness-105 text-white px-3 md:px-4 py-2 rounded-lg text-xs font-bold shadow-sm active:scale-95 transition-all flex-shrink-0"
        >
          <i class="pi pi-plus text-xs"></i>
          <span class="hidden sm:inline">New</span>
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

    <!-- ===== CALENDAR AREA ===== -->
    <div class="flex-grow overflow-auto relative">
      <!-- Loading overlay -->
      <transition name="fade">
        <div
          v-if="isFetching"
          class="absolute inset-0 z-10 bg-white/60 backdrop-blur-[1px] flex items-center justify-center pointer-events-none"
        >
          <div
            class="flex items-center gap-2 bg-white rounded-full px-4 py-2 shadow-md border border-gray-100"
          >
            <i
              class="pi pi-spin pi-spinner text-[var(--p-primary-color)]"
            ></i>
            <span class="text-xs font-medium text-gray-500">Loading…</span>
          </div>
        </div>
      </transition>

      <FullCalendar
        v-if="calendarResources.length > 0"
        ref="fullCalendar"
        :options="calendarOptions"
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
          <h3 class="text-lg font-bold text-gray-900 mb-2">
            No Team Members
          </h3>
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

    <BookingDialog
      v-model:visible="dialogVisible"
      :appointment="selectedAppointment"
      :services="calendarStore.services"
      :staff="calendarStore.resources"
      :allProducts="calendarStore.products"
      :timeOff="calendarStore.timeOff"
      :workingHours="calendarStore.workingHours"
      @save="handleSave"
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
  </div>

  <StaffReorderDialog
    v-model:visible="reorderDialogVisible"
    :staff-list="calendarStore.resources"
    @save="handleReorderSave"
  />
</template>

<script setup lang="ts">
import { ref, onMounted, watch, computed, nextTick } from "vue";
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
import { useToast } from "primevue/usetoast";
import ColorModelToggle from "../components/ColorModelToggle.vue";
import { useAuthStore } from "../stores/auth";
import elLocale from "@fullcalendar/core/locales/el";
import StaffReorderDialog from "../components/StaffReorderDialog.vue";
import AppointmentHoverCard from "../components/AppointmentHoverCard.vue";
import {
  isStaffAvailable,
  toLocalDateStr,
  getWorkingRangesForDate,
} from "../utils/staffAvailability";

const reorderDialogVisible = ref(false);
const authStore = useAuthStore();
const toast = useToast();
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
const todayDate = computed(() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
});

// --- Appointment hover card ---
const hoveredAppointment = ref<any>(null);
const hoverAnchorRect = ref<{ top: number; left: number; right: number; bottom: number; width: number; height: number } | null>(null);
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
const statusFilterOptions = [
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
    const res = await fetch("/api/v1/appointments/swap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(swapData),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Swap failed");
    }
    const data = await res.json();
    if (!data.success) throw new Error("Swap failed");

    swapDialogVisible.value = false;
    await calendarStore.fetchAppointments(currentStart.value, currentEnd.value);
    toast.add({
      severity: "success",
      summary: "Swap Complete",
      detail: "Appointments swapped successfully.",
      life: 2500,
    });
  } catch (err: any) {
    toast.add({
      severity: "error",
      summary: "Swap Failed",
      detail: err.message || "Unable to swap appointments.",
      life: 3000,
    });
  }
};

const handleReorderSave = async (newOrder: any[]) => {
  await calendarStore.updateResourceOrder(newOrder);
  toast.add({
    severity: "success",
    summary: "Success",
    detail: "Staff order updated",
    life: 3000,
  });
};

// --- Zoom ---
// Matches calendarOptions' initial slotDuration ("00:15:00") below, so the
// displayed zoom state and the actual grid start in sync.
const slotDurationMinutes = ref(15);

const zoomIn = () => {
  if (slotDurationMinutes.value > 10) {
    slotDurationMinutes.value -= 10;
    updateSlotDuration();
  }
};
const zoomOut = () => {
  if (slotDurationMinutes.value < 120) {
    slotDurationMinutes.value += 10;
    updateSlotDuration();
  }
};
const updateSlotDuration = () => {
  const api = calendarApi.value;
  if (api) {
    const h = Math.floor(slotDurationMinutes.value / 60)
      .toString()
      .padStart(2, "0");
    const m = (slotDurationMinutes.value % 60).toString().padStart(2, "0");
    api.setOption("slotDuration", `${h}:${m}:00`);
  }
};

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
};

// --- Date picker popover ---
const toggleDatePicker = () => {
  if (!showDatePicker.value) pickerDate.value = calendarApi.value?.getDate() ?? new Date();
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

// --- Color helpers ---
const stringToPastelColor = (str: string) => {
  if (!str) return "#e5e7eb";
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${Math.abs(hash) % 360}, 70%, 90%)`;
};

const getCategoryColor = (category: string) => {
  const map: Record<string, string> = {
    Hair: "#bae6fd",
    Nails: "#fde047",
    Massage: "#99f6e4",
    Face: "#fbcfe8",
    Body: "#fed7aa",
    Barber: "#bfdbfe",
    Spa: "#a5f3fc",
  };
  return map[category] || stringToPastelColor(category);
};

// Still used by the unrelated staff-role navigation restriction below
// (canGoPrev/validRange) — not by the working-hours display logic anymore,
// now that schedule versions carry their own effective_from and can be
// resolved correctly for any date, past included.
const isPastDay = (dateStr: string) => dateStr.slice(0, 10) < todayDateStr();

// --- Computed data ---
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
    filtered = filtered.filter((r: any) => {
      if (!r.working_hours_enabled) return true;
      const ranges = getWorkingRangesForDate(
        calendarStore.workingHours,
        r.id,
        currentStart.value,
      );
      return ranges === null || ranges.length > 0;
    });
  }

  return filtered.map((r: any) => ({
    id: r.id.toString(),
    title: r.name,
    eventBackgroundColor: "#f3f4f6",
    imageUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(r.name)}&background=random&color=fff&rounded=true&bold=true`,
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
      const bgColor = getCategoryColor(svc.service_name || "General");
      const duration = svc.duration_minutes || 60;
      const endTime = svc.start_time
        ? new Date(
            new Date(svc.start_time).getTime() + duration * 60000,
          ).toISOString()
        : null;

      events.push({
        id: `${appt.id}_${index}`,
        resourceId: svc.staff_id?.toString(),
        title: `${appt.first_name} - ${svc.service_name}`,
        start: svc.start_time,
        end: endTime,
        backgroundColor: bgColor,
        borderColor: "transparent",
        textColor: "#1f2937",
        classNames: ["fresha-event"],
        extendedProps: {
          isServiceEvent: true,
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
          service_name: svc.service_name || "Service",
        },
      });
    });
  });
  return events;
});

const timeOffBackgroundEvents = computed(() => {
  const entries = calendarStore.timeOff;
  if (!Array.isArray(entries)) return [];

  return entries.map((entry: any) => {
    const isLeave = entry.type === "leave";
    const startDateStr = toLocalDateStr(entry.start_date);

    const endDateExclusive = (dateStr: any) => {
      const d = new Date(`${toLocalDateStr(dateStr)}T00:00:00`);
      d.setDate(d.getDate() + 1);
      return toLocalDateStr(d);
    };

    let durationLabel = "";
    if (isLeave) {
      const endDateStr = toLocalDateStr(entry.end_date);
      const days =
        Math.round(
          (new Date(`${endDateStr}T00:00:00`).getTime() -
            new Date(`${startDateStr}T00:00:00`).getTime()) /
            86400000,
        ) + 1;
      durationLabel = days === 1 ? "1 ημέρα" : `${days} ημέρες`;
    } else {
      const [sh, sm] = (entry.start_time || "0:0").split(":").map(Number);
      const [eh, em] = (entry.end_time || "0:0").split(":").map(Number);
      const minutes = eh * 60 + em - (sh * 60 + sm);
      durationLabel = `${minutes} λεπτά`;
    }

    const typeLabel = isLeave ? "Άδεια" : "Διάλειμμα";

    return {
      id: `timeoff_${entry.id}`,
      resourceId: entry.staff_id?.toString(),
      display: "background",
      backgroundColor: isLeave
        ? "rgba(239, 68, 68, 0.15)"
        : "rgba(107, 114, 128, 0.2)",
      start: isLeave ? startDateStr : `${startDateStr}T${entry.start_time}`,
      end: isLeave
        ? endDateExclusive(entry.end_date)
        : `${startDateStr}T${entry.end_time}`,
      title: `${typeLabel} (${durationLabel})`,
      extendedProps: {
        isTimeOff: true,
        timeOffType: entry.type,
        reason: entry.reason,
        durationLabel,
        typeLabel,
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
const openNewAppointment = () => {
  selectedAppointment.value = null;
  dialogVisible.value = true;
};

const handleSave = async () => {
  dialogVisible.value = false;
  await calendarStore.fetchAppointments(currentStart.value, currentEnd.value);
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
    const token = localStorage.getItem("token");
    const res = await fetch(`/api/v1/appointments/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Update failed");
    }
    await calendarStore.fetchAppointments(currentStart.value, currentEnd.value);
    return true;
  } catch (e: any) {
    toast.add({
      severity: "error",
      summary: "Update Failed",
      detail: e.message || "Failed to update appointment",
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
const isRangeAllowedForResource = (start: Date, end: Date, resource: any) => {
  if (!resource) return true;
  return isStaffAvailable({
    staffList: calendarStore.resources,
    workingHours: calendarStore.workingHours,
    timeOff: calendarStore.timeOff,
    staffId: resource.id,
    start,
    end,
  }).available;
};

const getDayMinWidth = () => (window.innerWidth < 768 ? 130 : 160);

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

// --- Calendar Options ---
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
  eventTimeFormat: { hour: "2-digit", minute: "2-digit", hour12: false } as const,
  slotDuration: "00:15:00",
  slotLabelInterval: "01:00",
  slotMinTime: "07:00:00",
  slotMaxTime: "23:00:00",
  height: "100%",
  expandRows: true,
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
    if (fullCalendar.value) {
      fullCalendar.value.getApi().setOption("dayMinWidth", getDayMinWidth());
    }
  },

  resourceLabelContent: (arg: any) => {
    const src = escapeHtml(arg.resource.extendedProps.imageUrl);
    const title = escapeHtml(arg.resource.title);
    return {
      html: `
        <div class="flex flex-col items-center justify-center py-2 w-full h-full">
          <img src="${src}" alt="${title}" class="w-8 h-8 rounded-full border-2 border-white shadow-sm mb-1.5 object-cover" />
          <div style="white-space:normal;word-break:break-word;" class="font-bold text-gray-800 text-[11px] md:text-[13px] leading-tight text-center px-1">
            ${title}
          </div>
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
    // Only genuinely tight (<20 min) boxes drop to the compact, time/service-less
    // layout — everything 20 min and up gets the full time+name+service layout,
    // since the default zoom now gives them enough height to show it.
    const isShort = durationMins < 20;

    const paddingClass = isShort && !isMonthView ? "p-1 pl-1.5" : "p-2";
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

    return {
      html: `
      <div class="relative w-full ${paddingClass} flex flex-col leading-tight overflow-hidden rounded-md hover:brightness-95 transition-all ${isMonthView ? "" : "h-full"}">
        ${statusBadge}
        ${!isShort && !isMonthView ? `<div class="text-[10px] md:text-[12px] font-semibold mb-0.5 truncate ${timeClass}">${timeText}</div>` : ""}
        <div class="font-bold ${titleClass} pr-4 truncate ${textClass}" title="${escapeHtml(props.client_name)}">${escapeHtml(props.client_name)}</div>
        ${!isShort || isMonthView ? `<div class="text-[10px] md:text-[12px] font-medium mt-0.5 truncate ${serviceClass}" title="${escapeHtml(props.service_name)}">${escapeHtml(props.service_name)}</div>` : ""}
      </div>
    `,
    };
  },

  // Hover card — triggered from anywhere on the box (FullCalendar fires this
  // for the whole event element, not a sub-element), skipping time-off/
  // off-hours background events (only real service events carry isServiceEvent).
  eventMouseEnter: (info: any) => {
    if (!info.event.extendedProps?.isServiceEvent) return;
    if (hoverShowTimer) clearTimeout(hoverShowTimer);
    hoverShowTimer = setTimeout(() => {
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
    if (hoverShowTimer) clearTimeout(hoverShowTimer);
    hoveredAppointment.value = null;
    hoverAnchorRect.value = null;
  },

  eventClick: (info: any) => {
    const fullAppt = info.event.extendedProps.fullAppointment;
    if (fullAppt) {
      selectedAppointment.value = fullAppt;
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
    if (services[serviceIndex]) {
      services[serviceIndex].start_time = info.event.start.toISOString();
      services[serviceIndex].duration_minutes = (end - start) / 60000;
      services[serviceIndex].duration_override = (end - start) / 60000;
      if (newResourceId) services[serviceIndex].staff_id = newResourceId;
    }
    const ok = await updateAppointment(appointmentId, {
      ...fullAppointment,
      services,
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
    const ok = await updateAppointment(appointmentId, {
      ...fullAppointment,
      services,
    });
    if (!ok) info.revert();
  },

  select: (info: any) => {
    selectedAppointment.value = {
      start_time: info.startStr,
      end_time: info.endStr,
      staff_id: info.resource ? info.resource.id : null,
      staff_name: info.resource ? info.resource.title : "",
    };
    dialogVisible.value = true;
  },
});

watch(
  [
    calendarResources,
    calendarEvents,
    timeOffBackgroundEvents,
    workingHoursBackgroundEvents,
  ],
  ([newResources, newEvents, newTimeOffEvents, newWorkingHoursEvents]) => {
    if (!fullCalendar.value) return;
    const api = fullCalendar.value.getApi();
    api.setOption("resources", newResources);
    api.setOption("events", [
      ...newEvents,
      ...newTimeOffEvents,
      ...newWorkingHoursEvents,
    ]);
  },
  { deep: true },
);

onMounted(async () => {
  await calendarStore.fetchBaseResources();
  nextTick(async () => {
    if (fullCalendar.value) {
      currentTitle.value = fullCalendar.value.getApi().view.title;
    }
    const token = localStorage.getItem("token");
    if (token) {
      try {
        const res = await fetch("/api/v1/shop", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const shop = await res.json();
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
  background-image: repeating-linear-gradient(
    45deg,
    rgba(100, 116, 139, 0.16) 0 6px,
    transparent 6px 12px
  ) !important;
  background-color: transparent !important;
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
  border-right: 1px solid #f3f4f6;
}
.fc-timegrid-slot-label-cushion {
  color: #9ca3af;
  font-size: 11px;
  font-weight: 600;
}

.fc-timegrid-slot {
  border-bottom: 1px solid #f9fafb !important;
}
.fc-timegrid-slot-minor {
  border-color: #f3f4f6 !important;
}

.fc-v-event {
  border: none;
  background-color: transparent;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  border-radius: 6px;
}
.fc-v-event .fc-event-main {
  padding: 0;
  color: inherit;
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
</style>
