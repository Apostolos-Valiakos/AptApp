<template>
  <div class="flex flex-col h-[calc(100vh-64px)] bg-white" @click="closeMenus">
    <!-- Custom Toolbar -->
    <div
      class="flex justify-between items-center px-6 py-4 border-b border-gray-200 flex-shrink-0"
    >
      <!-- Left: Date Navigation -->
      <div class="flex items-center space-x-4">
        <div class="flex bg-gray-100 rounded-lg p-1">
          <button
            @click="calendarApi?.today()"
            class="px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-white hover:shadow-sm rounded-md transition-all"
          >
            Today
          </button>
        </div>
        <div class="flex items-center space-x-2">
          <button
            @click="calendarApi?.prev()"
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
                d="M15 19l-7-7 7-7"
              ></path>
            </svg>
          </button>
          <h2
            class="text-lg font-semibold text-gray-800 min-w-[200px] text-center select-none"
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

      <!-- Right: Actions -->
      <div class="flex items-center space-x-3">
        <!-- Zoom Controls -->
        <div class="flex items-center bg-gray-100 rounded-lg p-1 mr-2">
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

        <!-- Settings Button -->
        <button
          @click.stop="toggleSettings"
          class="p-2.5 text-gray-500 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors relative"
          title="Settings"
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
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            ></path>
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            ></path>
          </svg>

          <!-- Settings Dropdown -->
          <div
            v-if="showSettingsMenu"
            class="absolute right-0 top-12 w-56 bg-white rounded-xl shadow-xl border border-gray-100 z-50 py-2 text-left animate-fade-in"
          >
            <div class="px-4 py-2 border-b border-gray-100">
              <p
                class="text-xs font-semibold text-gray-500 uppercase tracking-wider"
              >
                Display Options
              </p>
            </div>
            <button
              @click="toggleWeekends"
              class="w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center justify-between"
            >
              <span>Show Weekends</span>
              <span v-if="calendarOptions.weekends" class="text-indigo-600"
                >✓</span
              >
            </button>
          </div>
        </button>

        <!-- View Switcher -->
        <div class="relative">
          <button
            @click.stop="toggleViewMenu"
            class="flex items-center space-x-2 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-all min-w-[100px] justify-between"
          >
            <span>{{ currentViewLabel }}</span>
            <svg
              class="w-4 h-4 text-gray-400"
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
          </button>

          <!-- View Dropdown -->
          <div
            v-if="showViewMenu"
            class="absolute right-0 top-12 w-40 bg-white rounded-xl shadow-xl border border-gray-100 z-50 py-1 overflow-hidden animate-fade-in"
          >
            <button
              v-for="view in viewOptions"
              :key="view.value"
              @click="changeView(view.value)"
              class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors flex items-center justify-between"
              :class="{
                'bg-indigo-50 text-indigo-600 font-medium':
                  currentView === view.value,
              }"
            >
              {{ view.label }}
              <span v-if="currentView === view.value">✓</span>
            </button>
          </div>
        </div>
        <ColorModelToggle />

        <!-- Add Button -->
        <button
          @click="openNewAppointment"
          class="bg-gray-900 hover:bg-black text-white px-6 py-2.5 rounded-full text-sm font-medium shadow-lg transform active:scale-95 transition-all flex items-center gap-2"
        >
          Add New
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
        <button
          @click="openSwapDialog"
          class="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg transform active:scale-95 transition-all flex items-center gap-2"
        >
          Swap
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
              d="M4 4v6h6M20 20v-6h-6"
            />
          </svg>
        </button>
      </div>
    </div>

    <!-- Calendar Grid -->
    <div class="flex-grow overflow-auto relative bg-gray-50/50">
      <FullCalendar
        v-if="calendarResources.length > 0"
        ref="fullCalendar"
        :options="calendarOptions"
        class="h-full w-full"
      />

      <!-- Empty State -->
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

    <!-- Booking Dialog -->
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

const toast = useToast();

const calendarStore = useCalendarStore();
const settings = useSettingsStore();
const dialogVisible = ref(false);
const swapDialogVisible = ref(false);
const selectedAppointment = ref<any>(null);
const fullCalendar = ref<any>(null);
const currentTitle = ref("");
const currentView = ref("resourceTimeGridDay");
const showViewMenu = ref(false);
const showSettingsMenu = ref(false);

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

    // Close dialog
    swapDialogVisible.value = false;

    calendarStore.fetchAll();

    // Show success
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

// Zoom State
const slotDurationMinutes = ref(30);

// --- View Configuration ---
const viewOptions = [
  { label: "Day", value: "resourceTimeGridDay" },
  { label: "Week", value: "resourceTimeGridWeek" },
  { label: "Month", value: "dayGridMonth" },
];

const currentViewLabel = computed(
  () => viewOptions.find((v) => v.value === currentView.value)?.label || "Day"
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

  return res
    .filter((r: any) => r.is_active)
    .map((r: any) => ({
      id: r.id.toString(),
      title: r.name,
      eventBackgroundColor: "#f3f4f6",
      imageUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(
        r.name
      )}&background=random&color=fff&rounded=true&bold=true`,
    }));
});

// FIX: Generate Separate Events for Each Service
const calendarEvents = computed(() => {
  const appointments = calendarStore.events;
  if (!Array.isArray(appointments)) return [];

  const events: any[] = [];

  appointments.forEach((appt) => {
    // Check if it's a legacy appointment or block without services
    if (!appt.services || appt.services.length === 0) {
      // Handle Blocks or Legacy Data
      // (This part might need adjustment if blocks store data elsewhere, assuming standard appt for now)
      return;
    }

    // Flatten: Create one event for each service in the appointment
    appt.services.forEach((svc: any, index: number) => {
      const bgColor = getCategoryColor(svc.service_name || "General");

      // Calculate end time specifically for this service
      const duration = svc.duration_minutes || 60;
      let endTime = null;
      if (svc.start_time) {
        endTime = new Date(
          new Date(svc.start_time).getTime() + duration * 60000
        ).toISOString();
      }

      events.push({
        // Composite ID: ApptID_ServiceIndex (e.g., 105_0, 105_1)
        id: `${appt.id}_${index}`,
        resourceId: svc.staff_id?.toString(),
        title: `${appt.first_name} - ${svc.service_name}`,
        start: svc.start_time,
        end: endTime,

        backgroundColor: bgColor,
        borderColor: "transparent",
        textColor: "#1f2937",
        classNames: ["fresha-event"],

        // CRITICAL: Store full appt data for the dialog + index for dragging
        extendedProps: {
          isServiceEvent: true,
          appointmentId: appt.id,
          serviceIndex: index,
          fullAppointment: {
            ...appt,
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

// --- Zoom Logic ---
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

// --- Toggles ---
const toggleSettings = () => {
  showSettingsMenu.value = !showSettingsMenu.value;
  showViewMenu.value = false;
};

const toggleViewMenu = () => {
  showViewMenu.value = !showViewMenu.value;
  showSettingsMenu.value = false;
};

const closeMenus = () => {
  showViewMenu.value = false;
  showSettingsMenu.value = false;
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

const toggleWeekends = () => {
  const api = calendarApi.value;
  if (api) {
    const current = api.getOption("weekends");
    api.setOption("weekends", !current);
    calendarOptions.value.weekends = !current;
  }
};

// --- Calendar Options ---
const calendarOptions = ref({
  schedulerLicenseKey: "CC-Attribution-NonCommercial-NoDerivatives",
  plugins: [
    resourceTimeGridPlugin,
    scrollGridPlugin,
    dayGridPlugin,
    interactionPlugin,
  ],
  initialView: "resourceTimeGridDay",
  allDaySlot: false,
  slotDuration: "00:30:00",
  slotLabelInterval: "01:00",
  slotMinTime: "07:00:00",
  slotMaxTime: "23:00:00",
  height: "100%",
  expandRows: true,
  dayMinWidth: 0,
  stickyHeaderDates: true,
  nowIndicator: true,
  weekends: true,
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
          <div class="font-bold text-gray-800 text-sm-2 mt-2 truncate w-full text-center px-2">${arg.resource.title}</div>
        </div>
      `,
    };
  },

  eventContent: (arg: any) => {
    const timeText = arg.timeText;
    const props = arg.event.extendedProps;
    return {
      html: `
        <div class="h-full w-full p-2 flex flex-col leading-tight overflow-hidden rounded-md hover:brightness-95 transition-all">
          <div class="text-[11px] font-bold opacity-70 mb-0.5">${timeText}</div>
          <div class="font-bold text-sm truncate text-gray-900">${props.client_name}</div>
          <div class="text-xs font-medium opacity-80 truncate mt-0.5">${props.service_name}</div>
        </div>
      `,
    };
  },

  datesSet: (arg: any) => {
    currentTitle.value = arg.view.title;
    currentView.value = arg.view.type;
  },

  eventClick: (info: any) => {
    // Open Dialog with the FULL appointment object, not just the single service
    const fullAppt = info.event.extendedProps.fullAppointment;

    if (fullAppt) {
      selectedAppointment.value = fullAppt;
      dialogVisible.value = true;
    }
  },

  // FIX: Robust Independent Drag Logic
  eventDrop: (info: any) => {
    const { appointmentId, serviceIndex, fullAppointment } =
      info.event.extendedProps;
    const newResourceId = info.newResource?.id;

    // 1. Calculate VISUAL duration from the dropped event
    // This ensures that if the event was resized just before dragging (and props are stale), we use the visual size
    const start = info.event.start.getTime();
    const end = info.event.end.getTime();
    const currentDurationMinutes = (end - start) / 60000;

    // 2. Clone Services
    const services = JSON.parse(JSON.stringify(fullAppointment.services));

    // 3. Update Service with VISUAL Start Time AND Duration
    if (services[serviceIndex]) {
      services[serviceIndex].start_time = info.event.start.toISOString();

      // Sync duration to ensure we don't revert a previous resize
      services[serviceIndex].duration_minutes = currentDurationMinutes;
      services[serviceIndex].duration_override = currentDurationMinutes;

      // If moved to a new staff column, update staff_id
      if (newResourceId) {
        services[serviceIndex].staff_id = newResourceId;
      }
    }

    // 4. Send the full payload
    updateAppointment(appointmentId, {
      ...fullAppointment,
      services: services,
    });
  },

  // FIX: Robust Independent Resize Logic
  eventResize: (info: any) => {
    const { appointmentId, serviceIndex, fullAppointment } =
      info.event.extendedProps;

    // 1. Calculate new duration based on visual element
    const start = info.event.start.getTime();
    const end = info.event.end.getTime();
    const newDuration = (end - start) / 60000;

    // 2. Clone Services
    const services = JSON.parse(JSON.stringify(fullAppointment.services));

    // 3. Update ONLY the specific service duration AND Start Time
    // (Start time is needed because resizing from the top changes the start time)
    if (services[serviceIndex]) {
      services[serviceIndex].start_time = info.event.start.toISOString();
      services[serviceIndex].duration_minutes = newDuration;
      services[serviceIndex].duration_override = newDuration;
    }

    // 4. Send payload
    updateAppointment(appointmentId, {
      ...fullAppointment,
      services: services,
    });
  },

  select: (info: any) => {
    const resourceId = info.resource ? info.resource.id : null;
    selectedAppointment.value = {
      start_time: info.startStr,
      end_time: info.endStr,
      staff_id: resourceId,
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
  { deep: true }
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
</style>
