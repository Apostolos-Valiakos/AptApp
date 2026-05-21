<template>
  <div class="flex flex-col h-[calc(100vh-64px)] bg-white" @click="closeMenus">

    <!-- ===== TOOLBAR ===== -->
    <div class="flex flex-wrap items-center justify-between gap-3 px-4 md:px-6 py-3 border-b border-gray-100 bg-white flex-shrink-0">

      <!-- LEFT: Navigation -->
      <div class="flex items-center gap-2">
        <button
          @click="calendarApi?.prev()"
          class="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
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
        <h2 class="text-sm md:text-base font-bold text-gray-800 min-w-[120px] md:min-w-[180px] select-none">
          {{ currentTitle }}
        </h2>
      </div>

      <!-- RIGHT: Controls -->
      <div class="flex items-center gap-2 flex-wrap">

        <!-- Status Filter -->
        <div class="flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5">
          <button
            v-for="opt in statusFilterOptions"
            :key="opt.value"
            @click="statusFilter = opt.value"
            :class="statusFilter === opt.value
              ? 'bg-white shadow-sm text-gray-900 font-semibold'
              : 'text-gray-500 hover:text-gray-700'"
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
            :class="currentView === view.value
              ? 'bg-white shadow-sm text-gray-900 font-semibold'
              : 'text-gray-500 hover:text-gray-700'"
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

        <ColorModelToggle />

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
          <div class="flex items-center gap-2 bg-white rounded-full px-4 py-2 shadow-md border border-gray-100">
            <i class="pi pi-spin pi-spinner text-[var(--p-primary-color)]"></i>
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
        <div class="p-10 bg-white rounded-2xl shadow-sm text-center border border-gray-100 max-w-sm">
          <div class="w-16 h-16 bg-[var(--p-primary-50)] text-[var(--p-primary-600)] rounded-full flex items-center justify-center mx-auto mb-4">
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

    <BookingDialog
      v-model:visible="dialogVisible"
      :appointment="selectedAppointment"
      :clients="calendarStore.clients"
      :services="calendarStore.services"
      :staff="calendarStore.resources"
      :allProducts="calendarStore.products"
      @save="handleSave"
    />
    <AppointmentSwapDialog
      v-model:visible="swapDialogVisible"
      :appointments="calendarStore.events"
      :staff="calendarStore.resources"
      @swap="handleSwap"
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

const reorderDialogVisible = ref(false);
const authStore = useAuthStore();
const toast = useToast();
const calendarStore = useCalendarStore();
const settings = useSettingsStore();

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

// --- Status filter ---
const statusFilter = ref<"all" | "active" | "cancelled">("all");
const statusFilterOptions = [
  { label: "All", value: "all", icon: "" },
  { label: "Active", value: "active", icon: "pi pi-check-circle" },
  { label: "Cancelled", value: "cancelled", icon: "pi pi-times-circle" },
];

// --- View options ---
const viewOptions = [
  { label: "Day",   value: "resourceTimeGridDay" },
  { label: "Week",  value: "resourceTimeGridWeek" },
  { label: "Month", value: "dayGridMonth" },
];

const calendarApi = computed(() => fullCalendar.value?.getApi());

// --- Swap ---
const openSwapDialog = () => { swapDialogVisible.value = true; };

const handleSwap = async (swapData: { appointment1_id: number; appointment2_id: number }) => {
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
    toast.add({ severity: "success", summary: "Swap Complete", detail: "Appointments swapped successfully.", life: 2500 });
  } catch (err: any) {
    toast.add({ severity: "error", summary: "Swap Failed", detail: err.message || "Unable to swap appointments.", life: 3000 });
  }
};

const handleReorderSave = async (newOrder: any[]) => {
  await calendarStore.updateResourceOrder(newOrder);
  toast.add({ severity: "success", summary: "Success", detail: "Staff order updated", life: 3000 });
};

// --- Zoom ---
const slotDurationMinutes = ref(30);

const zoomIn = () => {
  if (slotDurationMinutes.value > 10) { slotDurationMinutes.value -= 10; updateSlotDuration(); }
};
const zoomOut = () => {
  if (slotDurationMinutes.value < 120) { slotDurationMinutes.value += 10; updateSlotDuration(); }
};
const updateSlotDuration = () => {
  const api = calendarApi.value;
  if (api) {
    const h = Math.floor(slotDurationMinutes.value / 60).toString().padStart(2, "0");
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

const closeMenus = () => {};

// --- Color helpers ---
const stringToPastelColor = (str: string) => {
  if (!str) return "#e5e7eb";
  let hash = 0;
  for (let i = 0; i < str.length; i++) { hash = str.charCodeAt(i) + ((hash << 5) - hash); }
  return `hsl(${Math.abs(hash) % 360}, 70%, 90%)`;
};

const getCategoryColor = (category: string) => {
  const map: Record<string, string> = {
    Hair: "#bae6fd", Nails: "#fde047", Massage: "#99f6e4",
    Face: "#fbcfe8", Body: "#fed7aa", Barber: "#bfdbfe", Spa: "#a5f3fc",
  };
  return map[category] || stringToPastelColor(category);
};

// --- Computed data ---
const calendarResources = computed(() => {
  const res = calendarStore.resources;
  if (!Array.isArray(res)) return [];

  let filtered = res.filter((r: any) => r.is_active);
  if (settings.resourceFilter === "me" && authStore.user?.staff_id) {
    filtered = filtered.filter((r: any) => r.id === authStore.user.staff_id);
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
    if (statusFilter.value === "active" && (status === "cancelled" || status === "no_show")) return;
    if (statusFilter.value === "cancelled" && status !== "cancelled" && status !== "no_show") return;

    appt.services.forEach((svc: any, index: number) => {
      const bgColor = getCategoryColor(svc.service_name || "General");
      const duration = svc.duration_minutes || 60;
      const endTime = svc.start_time
        ? new Date(new Date(svc.start_time).getTime() + duration * 60000).toISOString()
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
          fullAppointment: { ...appt, group_id: appt.group_id, products: appt.products || [] },
          client_name: `${appt.first_name || "Unknown"} ${appt.last_name || ""}`,
          service_name: svc.service_name || "Service",
        },
      });
    });
  });
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
    price_override: s.price_override !== undefined ? s.price_override : Number(s.price || 0),
    duration_override: s.duration_override !== undefined ? s.duration_override : s.duration_minutes,
  }));

const updateAppointment = async (id: string, updates: any) => {
  try {
    const token = localStorage.getItem("token");
    const res = await fetch(`/api/v1/appointments/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Update failed");
    }
    await calendarStore.fetchAppointments(currentStart.value, currentEnd.value);
  } catch (e: any) {
    toast.add({ severity: "error", summary: "Update Failed", detail: e.message || "Failed to update appointment", life: 3000 });
  }
};

const getDayMinWidth = () => (window.innerWidth < 768 ? 130 : 160);

// --- Calendar Options ---
const calendarOptions = ref({
  schedulerLicenseKey: "CC-Attribution-NonCommercial-NoDerivatives",
  longPressDelay: 350,
  eventLongPressDelay: 350,
  selectLongPressDelay: 350,
  eventResizableFromStart: true,
  locale: elLocale,
  plugins: [resourceTimeGridPlugin, scrollGridPlugin, dayGridPlugin, interactionPlugin, timeGridPlugin],
  titleFormat: { weekday: "long", year: "numeric", month: "short", day: "numeric" },
  resourceOrder: "sort_order",
  initialView: "resourceTimeGridDay",
  allDaySlot: false,
  slotDuration: "00:15:00",
  slotLabelInterval: "01:00",
  slotMinTime: "07:00:00",
  slotMaxTime: "23:00:00",
  height: "100%",
  expandRows: true,
  dayMinWidth: getDayMinWidth(),
  stickyHeaderDates: true,
  nowIndicator: true,
  weekends: true,
  headerToolbar: false,
  editable: true,
  selectable: true,
  selectMirror: true,
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
    const src = arg.resource.extendedProps.imageUrl;
    return {
      html: `
        <div class="flex flex-col items-center justify-center py-2 w-full h-full">
          <img src="${src}" class="w-8 h-8 rounded-full border-2 border-white shadow-sm mb-1.5 object-cover" />
          <div style="white-space:normal;word-break:break-word;" class="font-bold text-gray-800 text-[10px] md:text-xs leading-tight text-center px-1">
            ${arg.resource.title}
          </div>
        </div>
      `,
    };
  },

  eventContent: (arg: any) => {
    const timeText = arg.timeText;
    const props = arg.event.extendedProps;
    const status = props.fullAppointment?.status;

    const isCancelled = status === "cancelled" || status === "no_show";
    const isConfirmed = status === "confirmed";
    const isCompleted = status === "completed";
    const isMonthView = arg.view.type === "dayGridMonth";
    const start = arg.event.start;
    const end = arg.event.end;
    const durationMins = end && start ? (end.getTime() - start.getTime()) / 60000 : 60;
    const isShort = durationMins < 45;

    const paddingClass = isShort && !isMonthView ? "p-0.5 pl-1" : "p-2";
    const titleClass = isShort && !isMonthView ? "text-[9px] md:text-[10px] leading-tight" : "text-[10px] md:text-xs leading-tight";

    const textClass = isCancelled ? "line-through opacity-60 text-gray-500" : "text-gray-900";
    const serviceClass = isCancelled ? "opacity-40 text-gray-500" : "opacity-80";

    const statusBadge = isConfirmed
      ? `<span class="absolute top-1 right-1 text-violet-700"><i class="pi pi-check text-[9px]"></i></span>`
      : isCompleted
      ? `<span class="absolute top-1 right-1 text-green-600"><i class="pi pi-check-circle text-[9px]"></i></span>`
      : "";

    return {
      html: `
      <div class="relative w-full ${paddingClass} flex flex-col leading-tight overflow-hidden rounded-md hover:brightness-95 transition-all ${isMonthView ? "" : "h-full"}">
        ${statusBadge}
        ${!isShort && !isMonthView ? `<div class="text-[9px] md:text-[11px] font-bold opacity-60 mb-0.5 ${isCancelled ? "text-red-400" : ""}">${timeText}</div>` : ""}
        <div class="font-bold ${titleClass} pr-4 break-words whitespace-normal ${textClass}">${props.client_name}</div>
        ${!isShort || isMonthView ? `<div class="text-[9px] md:text-[11px] font-medium mt-0.5 break-words whitespace-normal ${serviceClass}">${props.service_name}</div>` : ""}
      </div>
    `,
    };
  },

  eventClick: (info: any) => {
    const fullAppt = info.event.extendedProps.fullAppointment;
    if (fullAppt) {
      selectedAppointment.value = fullAppt;
      dialogVisible.value = true;
    }
  },

  eventDrop: (info: any) => {
    const { appointmentId, serviceIndex, fullAppointment } = info.event.extendedProps;
    const newResourceId = info.newResource?.id;
    const start = info.event.start.getTime();
    const end = info.event.end.getTime();
    let services = prepareServicesForUpdate(JSON.parse(JSON.stringify(fullAppointment.services)));
    if (services[serviceIndex]) {
      services[serviceIndex].start_time = info.event.start.toISOString();
      services[serviceIndex].duration_minutes = (end - start) / 60000;
      services[serviceIndex].duration_override = (end - start) / 60000;
      if (newResourceId) services[serviceIndex].staff_id = newResourceId;
    }
    updateAppointment(appointmentId, { ...fullAppointment, services });
  },

  eventResize: (info: any) => {
    const { appointmentId, serviceIndex, fullAppointment } = info.event.extendedProps;
    const start = info.event.start.getTime();
    const end = info.event.end.getTime();
    const newDuration = (end - start) / 60000;
    let services = prepareServicesForUpdate(JSON.parse(JSON.stringify(fullAppointment.services)));
    if (services[serviceIndex]) {
      services[serviceIndex].start_time = info.event.start.toISOString();
      services[serviceIndex].duration_minutes = newDuration;
      services[serviceIndex].duration_override = newDuration;
    }
    updateAppointment(appointmentId, { ...fullAppointment, services });
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
  [calendarResources, calendarEvents],
  ([newResources, newEvents]) => {
    if (!fullCalendar.value) return;
    const api = fullCalendar.value.getApi();
    api.setOption("resources", newResources);
    api.setOption("events", newEvents);
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
        const res = await fetch("/api/v1/shop", { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const shop = await res.json();
          const api = calendarApi.value;
          if (api) {
            if (shop.slot_min_time) api.setOption("slotMinTime", shop.slot_min_time + ":00");
            if (shop.slot_max_time) api.setOption("slotMaxTime", shop.slot_max_time + ":00");
            if (typeof shop.show_weekends === "boolean") api.setOption("weekends", shop.show_weekends);
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

.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.scrollbar-hide::-webkit-scrollbar { display: none; }
.scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
</style>
