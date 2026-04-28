<template>
  <div class="flex flex-col h-[calc(100vh-64px)] bg-white" @click="closeMenus">
    <div
      class="flex flex-col md:flex-row justify-between items-center px-4 md:px-6 py-4 border-b border-gray-200 flex-shrink-0 gap-4"
    >
      <div class="flex items-center justify-between w-full md:w-auto space-x-2">
        <div class="flex bg-[var(--p-primary-100)] rounded-lg p-1">
          <button
            @click="calendarApi?.today()"
            class="px-4 py-1.5 text-sm font-medium text-[var(--p-primary-700)] hover:bg-white hover:shadow-sm rounded-md transition-all"
          >
            Today
          </button>
        </div>
        <div class="flex items-center space-x-2">
          <button
            @click="calendarApi?.prev()"
            class="p-1.5 hover:bg-[var(--p-primary-100)] rounded-full text-gray-500 transition-colors"
          >
            <svg
              class="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 19l-7-7 7-7"
              ></path>
            </svg>
          </button>
          <h2
            class="text-sm md:text-lg font-semibold text-gray-800 min-w-[140px] md:min-w-[200px] text-center select-none"
          >
            {{ currentTitle }}
          </h2>
          <button
            @click="calendarApi?.next()"
            class="p-1.5 hover:bg-gray-100 rounded-full text-gray-500 transition-colors"
          >
            <svg
              class="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9 5l7 7-7 7"
              ></path>
            </svg>
          </button>
        </div>
      </div>

      <div
        class="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 scrollbar-hide"
      >
        <div
          class="hidden sm:flex items-center bg-gray-100 rounded-lg p-1 mr-2"
        >
          <button
            @click="zoomOut"
            class="p-1.5 text-gray-600 hover:bg-white hover:shadow-sm rounded-md transition-all"
            title="Zoom Out"
          >
            <svg
              class="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M20 12H4"
              ></path>
            </svg>
          </button>
          <span class="text-xs font-medium text-gray-500 px-2">Zoom</span>
          <button
            @click="zoomIn"
            class="p-1.5 text-gray-600 hover:bg-white hover:shadow-sm rounded-md transition-all"
            title="Zoom In"
          >
            <svg
              class="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 4v16m8-8H4"
              ></path>
            </svg>
          </button>
        </div>

        <div class="relative">
          <select
            :value="currentView"
            @change="(e) => changeView((e.target as HTMLSelectElement).value)"
            class="appearance-none pl-4 pr-10 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all min-w-[100px] cursor-pointer"
          >
            <option
              v-for="view in viewOptions"
              :key="view.value"
              :value="view.value"
            >
              {{ view.label }}
            </option>
          </select>
          <div
            class="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none"
          >
            <svg
              class="w-4 h-4 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M19 9l-7 7-7-7"
              ></path>
            </svg>
          </div>
        </div>

        <ColorModelToggle />

        <button
          @click="openNewAppointment"
          class="bg-[var(--p-primary-color)] hover:bg-white text-white hover:text-[var(--p-primary-color)] border border-[var(--p-primary-color)] px-4 md:px-6 py-2.5 rounded-full text-sm font-medium shadow-lg transform active:scale-95 transition-all flex items-center gap-2 flex-shrink-0"
        >
          <span class="hidden sm:inline">Add New</span>
          <span class="sm:hidden"><i class="pi pi-plus"></i></span>
        </button>
        <button
          @click="openSwapDialog"
          class="bg-white hover:bg-[var(--p-primary-color)] text-[var(--p-primary-color)] hover:text-white border border-[var(--p-primary-color)] px-4 md:px-6 py-2.5 rounded-full text-sm font-medium shadow-lg transform active:scale-95 transition-all flex items-center gap-2 flex-shrink-0"
        >
          <span class="hidden sm:inline">Swap</span>
          <span class="sm:hidden">
            <i class="pi pi-arrow-right-arrow-left"> </i>
          </span>
        </button>
        <button
          @click="reorderDialogVisible = true"
          class="bg-[var(--p-primary-color)] hover:bg-white text-white hover:text-[var(--p-primary-color)] border border-[var(--p-primary-color)] px-4 md:px-6 py-2.5 rounded-full text-sm font-medium shadow-lg transform active:scale-95 transition-all flex items-center gap-2 flex-shrink-0"
          title="Reorder Staff"
        >
          <i class="pi pi-sort-alt"></i>
          <span class="hidden sm:inline">Reorder Staff</span>
        </button>
      </div>
    </div>

    <div class="flex-grow overflow-auto relative bg-gray-50/50">
      <FullCalendar
        v-if="calendarResources.length > 0"
        ref="fullCalendar"
        :options="calendarOptions"
        class="h-full w-full"
      />

      <div
        v-else
        class="h-full flex flex-col items-center justify-center bg-gray-50"
      >
        <div
          class="p-8 bg-white rounded-2xl shadow-sm text-center border border-gray-100"
        >
          <div
            class="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4"
          >
            <svg
              class="w-8 h-8"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
              ></path>
            </svg>
          </div>
          <h3 class="text-xl font-bold text-gray-900 mb-2">No Team Members</h3>
          <p class="text-gray-500 max-w-sm mb-6">
            Add staff members to your database to start scheduling appointments.
          </p>
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
// showViewMenu is no longer needed with native select
const showViewMenu = ref(false);

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
      body: JSON.stringify({
        appointment1_id: swapData.appointment1_id,
        appointment2_id: swapData.appointment2_id,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Swap failed");
    }

    const data = await res.json();
    if (!data.success) throw new Error("Swap failed");

    swapDialogVisible.value = false;
    calendarStore.fetchAll();

    toast.add({
      severity: "success",
      summary: "Swap Complete",
      detail: "Appointments swapped successfully.",
      life: 2500,
    });
  } catch (err: any) {
    console.error("SWAP ERROR", err);
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
// Zoom State
const slotDurationMinutes = ref(30);

// --- View Configuration ---
const viewOptions = [
  { label: "Day", value: "resourceTimeGridDay" },
  { label: "Week", value: "resourceTimeGridWeek" },
  { label: "Month", value: "dayGridMonth" },
];

const currentViewLabel = computed(
  () => viewOptions.find((v) => v.value === currentView.value)?.label || "Day",
);

const calendarApi = computed(() => fullCalendar.value?.getApi());

// --- Color Generation ---
const stringToPastelColor = (str: string) => {
  if (!str) return "#e5e7eb";
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 70%, 90%)`;
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

// --- Computed Data ---
const calendarResources = computed(() => {
  const res = calendarStore.resources;
  if (!Array.isArray(res)) return [];

  // 1. Filter Active Staff
  let filtered = res.filter((r: any) => r.is_active);

  // 2. Apply "My Schedule" Filter
  if (settings.resourceFilter === "me" && authStore.user?.staff_id) {
    filtered = filtered.filter((r: any) => r.id === authStore.user.staff_id);
  }

  return filtered.map((r: any) => ({
    id: r.id.toString(),
    title: r.name,
    eventBackgroundColor: "#f3f4f6",
    imageUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(
      r.name,
    )}&background=random&color=fff&rounded=true&bold=true`,
  }));
});

const calendarEvents = computed(() => {
  const appointments = calendarStore.events;
  if (!Array.isArray(appointments)) return [];

  const events: any[] = [];

  appointments.forEach((appt) => {
    if (!appt.services || appt.services.length === 0) {
      return;
    }

    appt.services.forEach((svc: any, index: number) => {
      const bgColor = getCategoryColor(svc.service_name || "General");
      const duration = svc.duration_minutes || 60;
      let endTime = null;
      if (svc.start_time) {
        endTime = new Date(
          new Date(svc.start_time).getTime() + duration * 60000,
        ).toISOString();
      }

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
          client_name: `${appt.first_name || "Unknown"} ${
            appt.last_name || ""
          }`,
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

const handleSave = () => {
  dialogVisible.value = false;
  calendarStore.fetchAll();
};

const updateAppointment = async (id: string, updates: any) => {
  try {
    const token = localStorage.getItem("token");
    await fetch(`/api/v1/appointments/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(updates),
    });
    calendarStore.fetchAll();
  } catch (e) {
    console.error("Update failed", e);
    alert("Failed to update appointment");
  }
};

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
    const minutes = slotDurationMinutes.value;
    const h = Math.floor(minutes / 60)
      .toString()
      .padStart(2, "0");
    const m = (minutes % 60).toString().padStart(2, "0");
    api.setOption("slotDuration", `${h}:${m}:00`);
  }
};

// No longer needed
const toggleViewMenu = () => {
  showViewMenu.value = !showViewMenu.value;
};

const closeMenus = () => {
  showViewMenu.value = false;
};

const changeView = (viewName: string) => {
  const api = calendarApi.value;
  if (api) {
    api.changeView(viewName);
    currentView.value = viewName;
    currentTitle.value = api.view.title;
  }
  closeMenus();
};

const prepareServicesForUpdate = (services: any[]) => {
  return services.map((s) => ({
    ...s,
    price_override:
      s.price_override !== undefined ? s.price_override : Number(s.price || 0),
    duration_override:
      s.duration_override !== undefined
        ? s.duration_override
        : s.duration_minutes,
  }));
};
const getDayMinWidth = () => {
  // If mobile (less than 768px), use 60px (tight columns)
  // If desktop, use 160px (wide columns for names)
  return window.innerWidth < 768 ? 130 : 160;
};
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
  ],
  titleFormat: {
    weekday: "long", // Adds "Mon"
    year: "numeric",
    month: "short",
    day: "numeric",
  },
  resourceOrder: "sort_order",
  initialView: "resourceTimeGridDay",
  allDaySlot: false,
  slotDuration: "00:15:00",
  slotLabelInterval: "01:00",
  slotMinTime: "07:00:00",
  slotMaxTime: "23:00:00",
  height: "100%",
  expandRows: true,
  // dayMinWidth: 150,
  dayMinWidth: getDayMinWidth(),

  // 2. Add this listener to handle screen resizing/rotation
  windowResize: (arg: any) => {
    if (fullCalendar.value) {
      const api = fullCalendar.value.getApi();
      api.setOption("dayMinWidth", getDayMinWidth());
    }
  },
  stickyHeaderDates: true,
  nowIndicator: true,
  weekends: true, // Default enabled, can be toggled by prop if needed
  headerToolbar: {
    left: "prev,next today",
    center: "title",
    right: "dayGridMonth,timeGridWeek,timeGridDay",
  },
  editable: true,
  selectable: true,
  selectMirror: true,
  resources: [],
  events: [],

  resourceLabelContent: (arg: any) => {
    const src = arg.resource.extendedProps.imageUrl;
    return {
      html: `
        <div class="flex flex-col items-center justify-center py-2 group cursor-pointer hover:bg-gray-50 transition-colors w-full h-full">
          <div class="relative">
            <img src="${src}" class="w-8 h-8 rounded-full border-2 border-white shadow-sm mb-2 object-cover group-hover:scale-105 transition-transform" />
          </div>
          <div style="white-space: normal;" class="font-bold text-gray-800 text-[10px] md:text-sm mt-1 leading-tight w-full text-center px-1 break-words">
            ${arg.resource.title}
          </div>
        </div>
      `,
    };
  },

  eventContent: (arg: any) => {
    const timeText = arg.timeText;
    const props = arg.event.extendedProps;
    const apptStatus = props.fullAppointment?.status;

    const isCancelled = apptStatus === "cancelled";
    const isConfirmed = apptStatus === "confirmed";

    const isMonthView = arg.view.type === "dayGridMonth";
    const start = arg.event.start;
    const end = arg.event.end;
    const durationMins =
      end && start ? (end.getTime() - start.getTime()) / 60000 : 60;
    const isShort = durationMins < 45;

    const paddingClass = isShort && !isMonthView ? "p-0.5 pl-1" : "p-2";
    const titleClass =
      isShort && !isMonthView
        ? "text-[9px] md:text-[10px] leading-tight"
        : "text-[10px] md:text-xs leading-tight";

    const statusTextClasses = isCancelled
      ? "line-through text-red-600"
      : "text-gray-900";
    const serviceTextClasses = isCancelled ? "text-red-500" : "opacity-80";

    const showTime = !isShort && !isMonthView;
    const showService = !isShort || isMonthView;

    const doubleCheckHtml = isConfirmed
      ? `
    <div class="absolute top-1 right-1 flex items-center" style="color: #6b21a8;">
      <i class="pi pi-check text-[10px]"></i>
    </div>
  `
      : "";

    return {
      html: `
      <div class="relative w-full ${paddingClass} flex flex-col leading-tight overflow-hidden rounded-md hover:brightness-95 transition-all ${
        isMonthView ? "" : "h-full"
      }">
        ${doubleCheckHtml}
        ${
          showTime
            ? `<div class="text-[9px] md:text-[12px] font-bold opacity-70 mb-0.5 ${isCancelled ? "text-red-400" : ""}">${timeText}</div>`
            : ""
        }
        <div class="font-bold ${titleClass} pr-4 break-words whitespace-normal ${statusTextClasses}">
          ${props.client_name}
        </div>
        ${
          showService
            ? `<div class="text-[9px] md:text-[12px] font-medium opacity-90 mt-0.5 break-words whitespace-normal ${serviceTextClasses}">
                ${props.service_name}
               </div>`
            : ""
        }
      </div>
    `,
    };
  },

  datesSet: (arg: any) => {
    currentTitle.value = arg.view.title;
    currentView.value = arg.view.type;
  },

  eventClick: (info: any) => {
    const fullAppt = info.event.extendedProps.fullAppointment;
    if (fullAppt) {
      selectedAppointment.value = fullAppt;
      dialogVisible.value = true;
    }
  },

  eventDrop: (info: any) => {
    const { appointmentId, serviceIndex, fullAppointment } =
      info.event.extendedProps;
    const newResourceId = info.newResource?.id;
    const start = info.event.start.getTime();
    const end = info.event.end.getTime();
    const currentDurationMinutes = (end - start) / 60000;
    let services = JSON.parse(JSON.stringify(fullAppointment.services));
    services = prepareServicesForUpdate(services);
    if (services[serviceIndex]) {
      services[serviceIndex].start_time = info.event.start.toISOString();
      services[serviceIndex].duration_minutes = currentDurationMinutes;
      services[serviceIndex].duration_override = currentDurationMinutes;
      if (newResourceId) {
        services[serviceIndex].staff_id = newResourceId;
      }
    }
    updateAppointment(appointmentId, {
      ...fullAppointment,
      services: services,
    });
  },

  eventResize: (info: any) => {
    const { appointmentId, serviceIndex, fullAppointment } =
      info.event.extendedProps;
    const start = info.event.start.getTime();
    const end = info.event.end.getTime();
    const newDuration = (end - start) / 60000;
    let services = JSON.parse(JSON.stringify(fullAppointment.services));
    services = prepareServicesForUpdate(services);
    if (services[serviceIndex]) {
      services[serviceIndex].start_time = info.event.start.toISOString();
      services[serviceIndex].duration_minutes = newDuration;
      services[serviceIndex].duration_override = newDuration;
    }
    updateAppointment(appointmentId, {
      ...fullAppointment,
      services: services,
    });
  },

  select: (info: any) => {
    const resourceId = info.resource ? info.resource.id : null;
    const resourceName = info.resource ? info.resource.title : "";

    selectedAppointment.value = {
      start_time: info.startStr,
      end_time: info.endStr,
      staff_id: resourceId,
      staff_name: resourceName,
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
  await calendarStore.fetchAll();
  nextTick(() => {
    if (fullCalendar.value) {
      currentTitle.value = fullCalendar.value.getApi().view.title;
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
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  border-radius: 6px;
}
.fc-v-event .fc-event-main {
  padding: 0;
  color: inherit;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.animate-fade-in {
  animation: fadeIn 0.15s ease-out;
}

/* Hide scrollbar for chrome/safari/opera */
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
/* Hide scrollbar for IE, Edge and Firefox */
.scrollbar-hide {
  -ms-overflow-style: none; /* IE and Edge */
  scrollbar-width: none; /* Firefox */
}
</style>
