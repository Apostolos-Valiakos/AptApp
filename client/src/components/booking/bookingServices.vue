<template>
  <div class="space-y-4">
    <div class="flex justify-between items-end">
      <label
        class="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2"
      >
        <i class="pi pi-list text-[var(--p-primary-400)]"></i>
        {{ t("bookingServices.label") }}
      </label>
      <span
        class="text-[11px] rounded-full px-2.5 py-0.5 font-bold"
        style="background-color: var(--p-primary-color); color: white"
      >
        {{
          modelValue.length === 1
            ? t("bookingServices.countSingle", { n: modelValue.length })
            : t("bookingServices.countPlural", { n: modelValue.length })
        }}
      </span>
    </div>

    <div
      v-for="(service, index) in modelValue"
      :key="index"
      class="relative p-6 bg-white border border-transparent rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(255,147,212,0.12)] hover:border-[var(--p-primary-200)] transition-all duration-300 group"
    >
      <div
        class="absolute left-0 top-6 bottom-6 w-1 bg-[var(--p-primary-300)] rounded-r-full opacity-0 group-hover:opacity-100 transition-opacity"
      ></div>
      <button
        v-if="modelValue.length > 1"
        @click="removeService(index)"
        class="absolute -right-2 -top-2 bg-white p-1 rounded-full shadow border border-gray-200 text-gray-400 hover:text-red-600 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity z-10"
      >
        <i class="pi pi-trash text-xs"></i>
      </button>

      <div class="flex flex-col sm:flex-row gap-4 mb-5">
        <div class="flex-grow">
          <label class="text-xs text-gray-500 block mb-1">{{
            t("bookingServices.service")
          }}</label>
          <button
            type="button"
            class="h-[54px] w-full flex items-center justify-between gap-2 px-3 text-sm border border-gray-300 rounded-md bg-white hover:border-gray-400 transition-colors"
            @click="openPicker(index)"
          >
            <span :class="displayName(service) ? 'text-gray-900' : 'text-gray-400'">
              {{ displayName(service) || t('bookingServices.selectService') }}
            </span>
            <i class="pi pi-chevron-down text-gray-400 text-xs"></i>
          </button>
        </div>

        <div class="w-full sm:w-1/3">
          <label class="text-xs text-gray-500 block mb-1">
            {{ t("bookingServices.staff") }}
            <span v-if="requireStaff" class="text-red-500">*</span>
          </label>
          <Dropdown
            v-model="service.staff_id"
            :options="getFilteredStaff(service)"
            optionLabel="name"
            optionValue="id"
            class="w-full p-inputtext-sm"
            :class="{ 'p-invalid': isStaffMissing(service) }"
            :placeholder="requireStaff ? t('bookingServices.selectStaff') : t('bookingServices.anyStaff')"
          />
          <p v-if="isStaffMissing(service)" class="text-xs text-red-500 mt-1">
            {{ t("bookingServices.staffRequired") }}
          </p>
        </div>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div class="col-span-2 min-w-0">
          <div class="grid grid-cols-2 gap-2">
            <div class="min-w-0">
              <label class="text-xs text-gray-500 block mb-1">{{
                t("bookingServices.date")
              }}</label>
              <Calendar
                :modelValue="service.start_time"
                dateFormat="dd/mm/yy"
                class="w-full p-inputtext-sm"
                @update:modelValue="(d: Date) => onDateChange(service, d)"
              />
            </div>
            <div class="min-w-0">
              <label class="text-xs text-gray-500 block mb-1">{{
                t("bookingServices.startTime")
              }}</label>
              <TimeDropdown
                :modelValue="formatTime(service.start_time)"
                :minTime="shopMinTime"
                :maxTime="shopMaxTime"
                @update:modelValue="(t: string) => onTimeChange(service, t)"
              />
            </div>
          </div>
        </div>

        <div class="col-span-1 min-w-0">
          <label class="text-xs text-gray-500 block mb-1">{{
            t("bookingServices.duration")
          }}</label>
          <InputNumber
            v-model="service.duration_override"
            suffix=" min"
            class="w-full p-inputtext-sm"
            inputClass="w-full"
            @update:modelValue="recalcTimes"
          />
        </div>
        <div class="col-span-1 min-w-0" v-if="isShopAdmin">
          <label class="text-xs text-gray-500 block mb-1">{{
            t("bookingServices.price")
          }}</label>
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
      class="group w-full py-3.5 border-2 border-dashed border-gray-200 rounded-2xl flex items-center justify-center gap-2 text-gray-400 font-semibold hover:border-[var(--p-primary-300)] hover:text-[var(--p-primary-600)] hover:bg-[var(--p-primary-50)] transition-all duration-200"
    >
      <i
        class="pi pi-plus-circle text-lg transition-transform group-hover:rotate-90 duration-200"
      ></i>
      <span>{{ t("bookingServices.addService") }}</span>
    </button>

    <ServicePickerDialog
      v-model:visible="pickerVisible"
      :services="services"
      :staff="staff"
      :currentStaffId="pickerIndex !== null ? modelValue[pickerIndex]?.staff_id : null"
      @picked="onServicePicked"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import { useAuthStore } from "../../stores/auth";
import { isStaffAvailable } from "../../utils/staffAvailability";
import ServicePickerDialog from "./ServicePickerDialog.vue";
import TimeDropdown from "./TimeDropdown.vue";
const { t } = useI18n();
const authStore = useAuthStore();
const isShopAdmin = authStore.isShopAdmin;

const props = defineProps({
  modelValue: { type: Array as () => any[], required: true },
  services: { type: Array as () => any[], default: () => [] },
  staff: { type: Array as () => any[], default: () => [] },
  baseStartTime: { type: Date, default: () => new Date() },
  defaultStaffId: { type: [Number, String], default: null },
  timeOff: { type: Array as () => any[], default: () => [] },
  workingHours: { type: Array as () => any[], default: () => [] },
  requireStaff: { type: Boolean, default: true },
  shopMinTime: { type: String, default: "00:00" },
  shopMaxTime: { type: String, default: "23:45" },
});

const emit = defineEmits(["update:modelValue"]);

const isStaffUnavailable = (staffId: any, serviceStart: any, durationMinutes: number) => {
  if (!serviceStart) return false;
  const start = new Date(serviceStart);
  const end = new Date(start.getTime() + (durationMinutes || 60) * 60000);
  return !isStaffAvailable({
    staffList: props.staff,
    workingHours: props.workingHours,
    timeOff: props.timeOff,
    staffId,
    start,
    end,
  }).available;
};

const isStaffMissing = (service: any) =>
  props.requireStaff && !!service.service_id && !service.staff_id;

// Date and time are edited as two separate widgets (a plain date picker +
// the 15-min TimeDropdown) but both write back into the same underlying
// start_time Date — everything else (recalcTimes, combo splitting, save)
// keeps working off that single field unchanged.
const formatTime = (d: Date) => {
  const date = new Date(d);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

const onDateChange = (service: any, newDate: Date) => {
  const merged = new Date(service.start_time);
  merged.setFullYear(newDate.getFullYear(), newDate.getMonth(), newDate.getDate());
  service.start_time = merged;
  recalcTimes();
};

const onTimeChange = (service: any, time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  const merged = new Date(service.start_time);
  merged.setHours(hours, minutes, 0, 0);
  service.start_time = merged;
  recalcTimes();
};

const getFilteredStaff = (service: any) => {
  const serviceId = service.service_id;
  let list = !serviceId
    ? props.staff
    : props.staff.filter(
        (s: any) =>
          !s.service_ids ||
          s.service_ids.length === 0 ||
          s.service_ids.includes(serviceId),
      );

  if (service.start_time) {
    list = list.filter(
      (s: any) => !isStaffUnavailable(s.id, service.start_time, service.duration_override),
    );
  }
  return list;
};

const addService = () => {
  const list = [...props.modelValue];
  let nextStart = new Date(props.baseStartTime);

  if (list.length > 0) {
    const last = list[list.length - 1];
    nextStart = new Date(
      new Date(last.start_time).getTime() +
        (last.duration_override || 60) * 60000,
    );
  }

  list.push({
    service_id: null,
    staff_id: props.defaultStaffId,
    start_time: nextStart,
    duration_override: 60,
    price_override: 0,
  });

  emit("update:modelValue", list);
};

const removeService = (index: number) => {
  const list = [...props.modelValue];
  list.splice(index, 1);
  recalcTimes(list);
};

// `pickedOverride` comes from ServicePickerDialog when a variation (rather
// than the service's own flat price) was chosen — its price/duration wins
// over the base service's, everything else (combo splitting, etc.) is
// unaffected since that's keyed off the service itself, not the variation.
const updateServiceDetails = (
  index: number,
  pickedOverride?: { duration_minutes: number; price: number },
) => {
  const list = [...props.modelValue];
  const svc = list[index];
  const found = props.services.find((s: any) => s.id === svc.service_id);

  // Rows immediately after this one that were auto-generated from its
  // previous combo components — drop them before recomputing, so switching
  // the service (combo -> plain, or to a different combo) never stacks
  // stale blocks. They're re-inserted fresh below if still applicable.
  let removeCount = 0;
  while (list[index + 1 + removeCount]?._autoGenFor) {
    removeCount++;
  }
  list.splice(index + 1, removeCount);

  if (found) {
    svc.price_override = Number(pickedOverride ? pickedOverride.price : found.price);
    svc.duration_override = pickedOverride
      ? pickedOverride.duration_minutes
      : found.duration_minutes || 60;

    const components = found.combo_components || [];
    if (components.length > 0) {
      // The combo keeps its own listed price/duration; each component is
      // carved out of it rather than added on top, so the original total
      // stays what was priced/listed for the combo.
      const componentMinutes = components.reduce(
        (sum: number, c: any) => sum + (c.duration_minutes || 0),
        0,
      );
      const componentPrice = components.reduce(
        (sum: number, c: any) => sum + Number(c.price || 0),
        0,
      );
      svc.duration_override = Math.max(5, svc.duration_override - componentMinutes);
      svc.price_override = Math.max(0, svc.price_override - componentPrice);

      const newBlocks = components.map((c: any) => {
        return {
          service_id: c.id,
          staff_id: c.default_staff_id || null,
          start_time: svc.start_time,
          duration_override: c.duration_minutes || 30,
          price_override: Number(c.price || 0),
          _autoGenFor: svc.service_id,
        };
      });
      list.splice(index + 1, 0, ...newBlocks);
    }
  }
  recalcTimes(list);
};

// --- Service picker modal (replaces the old inline dropdown) ---
const pickerIndex = ref<number | null>(null);
const pickerVisible = computed({
  get: () => pickerIndex.value !== null,
  set: (v: boolean) => {
    if (!v) pickerIndex.value = null;
  },
});

const openPicker = (index: number) => {
  pickerIndex.value = index;
};

const displayName = (service: any) => {
  if (service._label) return service._label;
  const found = props.services.find((s: any) => s.id === service.service_id);
  return found?.name || "";
};

const onServicePicked = (picked: {
  service_id: string;
  name: string;
  duration_minutes: number;
  price: number;
}) => {
  if (pickerIndex.value === null) return;
  const svc = props.modelValue[pickerIndex.value];
  svc.service_id = picked.service_id;
  svc._label = picked.name;
  updateServiceDetails(pickerIndex.value, {
    duration_minutes: picked.duration_minutes,
    price: picked.price,
  });
};

const recalcTimes = (existingList?: any[]) => {
  const list = existingList || [...props.modelValue];

  if (list.length <= 1) {
    if (existingList) emit("update:modelValue", list);
    return;
  }

  let currentStart = new Date(list[0].start_time);

  for (let i = 0; i < list.length; i++) {
    list[i].start_time = new Date(currentStart);
    currentStart = new Date(
      currentStart.getTime() + (list[i].duration_override || 60) * 60000,
    );
  }

  emit("update:modelValue", list);
};
</script>
