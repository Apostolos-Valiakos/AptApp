<template>
  <Dialog
    v-model:visible="visible"
    modal
    header="Swap Appointments"
    :style="{ width: '750px' }"
  >
    <div class="space-y-6 mt-2">
      <!-- Search + Filters -->
      <div class="flex gap-3 items-end flex-wrap">
        <div class="flex-1">
          <label class="text-sm font-medium">Search</label>
          <InputText
            v-model="filters.search"
            placeholder="Name or phone..."
            class="w-full"
          />
        </div>

        <div class="flex-1">
          <label class="text-sm font-medium">Date</label>
          <Calendar v-model="filters.date" placeholder="Select date" showIcon />
        </div>

        <div class="flex-1">
          <label class="text-sm font-medium">Staff</label>
          <Dropdown
            v-model="filters.staff"
            :options="normalizedStaff"
            optionLabel="name"
            optionValue="id"
            placeholder="All"
            class="w-full"
            showClear
          />
        </div>
      </div>

      <!-- FIRST APPOINTMENT -->
      <h3 class="font-semibold text-gray-800 mt-6 mb-2">
        Select First Appointment
      </h3>

      <div
        class="max-h-64 overflow-auto border rounded-xl p-2 bg-gray-50 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100"
      >
        <div
          v-for="appt in filteredAppointments"
          :key="appt.id"
          class="p-4 bg-white rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition cursor-pointer border border-gray-200 mb-2"
          @click="selectA(appt)"
        >
          <div class="flex justify-between items-center mb-2">
            <div class="font-semibold text-indigo-700 flex items-center gap-1">
              <i class="pi pi-clock text-gray-400"></i>
              {{ formatDate(appt.start_time) }}
            </div>

            <!-- Staff colors -->
            <div class="flex items-center gap-1">
              <div
                v-for="sid in appt.staff_ids ?? []"
                :key="sid"
                class="w-3 h-3 rounded-full border border-gray-300"
                :style="{ background: staffColor(sid) }"
              ></div>
            </div>
          </div>

          <div class="text-sm text-gray-700 flex items-center gap-1">
            <i class="pi pi-user text-gray-500 text-xs"></i>
            Client: {{ appt.first_name }} {{ appt.last_name }}
          </div>

          <!-- Staff + Services -->
          <div class="text-sm text-gray-700 mt-2">
            <!-- Staff -->
            <div class="flex items-center gap-2 mb-1">
              <span class="font-medium text-gray-900">Staff:</span>
              <span
                class="px-2 py-0.5 rounded-xl text-white text-xs shadow"
                :style="{ background: staffColor(appt.staff_id) }"
              >
                {{ appt.services?.[0]?.staff_name || "No staff" }}
              </span>
            </div>

            <!-- Services -->
            <div>
              <span class="font-medium text-gray-900">Services:</span>
              <div class="flex flex-wrap gap-2 mt-1">
                <span
                  v-for="srv in appt.services"
                  :key="srv.service_id"
                  class="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-xl text-xs border border-gray-200"
                >
                  {{ srv.service_name }} — {{ srv.duration_minutes }} mins
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Selected A -->
      <div
        v-if="selectedA"
        class="p-3 rounded-xl bg-green-100 border border-green-300 shadow-sm text-sm"
      >
        <strong class="text-green-800">Selected A:</strong>
        <span class="text-green-900">
          {{ selectedA.first_name }} {{ selectedA.last_name }} —
          {{ formatDate(selectedA.start_time) }}
        </span>
      </div>

      <!-- SECOND APPOINTMENT -->
      <h3 class="font-semibold text-gray-800 mt-6 mb-2">
        Select Second Appointment
      </h3>

      <div
        class="max-h-64 overflow-auto border rounded-xl p-2 bg-gray-50 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100"
      >
        <div
          v-for="appt in filteredAppointments"
          :key="appt.id"
          class="p-4 bg-white rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition cursor-pointer border border-gray-200 mb-2"
          @click="selectB(appt)"
        >
          <div class="flex justify-between items-center mb-2">
            <div class="font-semibold text-indigo-700 flex items-center gap-1">
              <i class="pi pi-clock text-gray-400"></i>
              {{ formatDate(appt.start_time) }}
            </div>

            <div class="flex items-center gap-1">
              <div
                v-for="sid in appt.staff_ids ?? []"
                :key="sid"
                class="w-3 h-3 rounded-full border border-gray-300"
                :style="{ background: staffColor(sid) }"
              ></div>
            </div>
          </div>

          <div class="text-sm text-gray-700 flex items-center gap-1">
            <i class="pi pi-user text-gray-500 text-xs"></i>
            Client: {{ appt.first_name }} {{ appt.last_name }}
          </div>

          <!-- Staff + Services -->
          <div class="text-sm text-gray-700 mt-2">
            <!-- Staff -->
            <div class="flex items-center gap-2 mb-1">
              <span class="font-medium text-gray-900">Staff:</span>
              <span
                class="px-2 py-0.5 rounded-xl text-white text-xs shadow"
                :style="{ background: staffColor(appt.staff_id) }"
              >
                {{ appt.services?.[0]?.staff_name || "No staff" }}
              </span>
            </div>

            <!-- Services -->
            <div>
              <span class="font-medium text-gray-900">Services:</span>
              <div class="flex flex-wrap gap-2 mt-1">
                <span
                  v-for="srv in appt.services"
                  :key="srv.service_id"
                  class="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-xl text-xs border border-gray-200"
                >
                  {{ srv.service_name }} — {{ srv.duration_minutes }} mins
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Selected B -->
      <div
        v-if="selectedB"
        class="p-3 rounded-xl bg-blue-100 border border-blue-300 shadow-sm text-sm"
      >
        <strong class="text-blue-800">Selected B:</strong>
        <span class="text-blue-900">
          {{ selectedB.first_name }} {{ selectedB.last_name }} —
          {{ formatDate(selectedB.start_time) }}
        </span>
      </div>

      <!-- Swap Button -->
      <Button
        label="Swap Appointments"
        class="w-full mt-4 !bg-indigo-600 !hover:bg-indigo-700 !text-white !py-3 !text-base rounded-xl"
        :disabled="!selectedA || !selectedB"
        @click="confirmSwap"
      />
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import Button from "primevue/button";

interface Appointment {
  id: string;
  first_name: string;
  last_name: string;
  client_phone: string;
  start_time: string | null;
  staff_ids?: number[];
  services?: Array<{
    service_id: string;
    service_name: string;
    duration_minutes: number;
    staff_id?: string;
    staff_name?: string;
  }>;
  staff_id?: string;
}

interface Staff {
  id: number;
  name: string;
  color?: string;
}

const reset = () => {
  filters.value = {
    search: "",
    date: null,
    staff: null,
  };
  selectedA.value = null;
  selectedB.value = null;
};

const props = defineProps({
  visible: Boolean,
  appointments: { type: Array as () => Appointment[], default: () => [] },
  staff: { type: Array as () => Staff[], default: () => [] },
});

const emit = defineEmits(["update:visible", "swap"]);

const visible = computed({
  get: () => props.visible,
  set: (v) => emit("update:visible", v),
});

// Normalize
const normalizedAppointments = computed(() =>
  Array.isArray(props.appointments) ? props.appointments : []
);

const normalizedStaff = computed(() =>
  Array.isArray(props.staff) ? props.staff : []
);

// Filters
const filters = ref({
  search: "",
  date: null as Date | null,
  staff: null as string | null,
});

const filteredAppointments = computed(() => {
  return normalizedAppointments.value.filter((a) => {
    const s = filters.value.search.toLowerCase();

    const matchSearch =
      !s ||
      a.first_name.toLowerCase().includes(s) ||
      a.last_name.toLowerCase().includes(s) ||
      a.client_phone.toLowerCase().includes(s);

    const matchDate =
      !filters.value.date ||
      (a.start_time &&
        new Date(a.start_time).toDateString() ===
          new Date(filters.value.date).toDateString());

    const matchStaff =
      !filters.value.staff ||
      (a.staff_id && a.staff_id.includes(filters.value.staff));

    return matchSearch && matchDate && matchStaff;
  });
});

// Selections
const selectedA = ref<Appointment | null>(null);
const selectedB = ref<Appointment | null>(null);

const selectA = (appt: Appointment) => (selectedA.value = appt);
const selectB = (appt: Appointment) => (selectedB.value = appt);

// Emit swap
const confirmSwap = () => {
  if (!selectedA.value || !selectedB.value) return;

  emit("swap", {
    appointment1_id: selectedA.value.id,
    appointment2_id: selectedB.value.id,
  });

  visible.value = false;
};

const staffColor = (staffId: number | undefined) => {
  const s = normalizedStaff.value.find((st) => st.id === staffId);
  return s?.color || "#888";
};

const formatDate = (dt: string | null) => {
  if (!dt) return "No time";

  const d = new Date(dt);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");

  return `${day}/${month}/${year} - ${hours}:${minutes}`;
};
watch(visible, (newVal) => {
  if (!newVal) {
    // Dialog was closed
    reset();
  }
});
</script>

<style scoped></style>
