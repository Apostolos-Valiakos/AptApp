<template>
  <div class="space-y-3">
    <label class="text-xs font-bold text-gray-500 uppercase tracking-wider">
      Services
    </label>

    <div
      v-for="(service, index) in modelValue"
      :key="index"
      class="relative p-4 border border-gray-200 rounded-lg hover:border-indigo-300 transition-colors bg-gray-50 group"
    >
      <button
        v-if="modelValue.length > 1"
        @click="removeService(index)"
        class="absolute -right-2 -top-2 bg-white p-1 rounded-full shadow border border-gray-200 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity z-10"
      >
        <i class="pi pi-times text-xs"></i>
      </button>

      <div class="flex gap-3 mb-3">
        <div class="flex-grow">
          <label class="text-xs text-gray-500 block mb-1">Service</label>
          <Dropdown
            v-model="service.service_id"
            :options="services"
            optionLabel="name"
            optionValue="id"
            placeholder="Select Service"
            class="w-full p-inputtext-sm"
            @change="() => updateServiceDetails(index)"
          />
        </div>

        <div class="w-1/3">
          <label class="text-xs text-gray-500 block mb-1">Staff</label>
          <Dropdown
            v-model="service.staff_id"
            :options="getFilteredStaff(service.service_id)"
            optionLabel="name"
            optionValue="id"
            class="w-full p-inputtext-sm"
            placeholder="Any Staff"
          />
        </div>
      </div>

      <div class="grid grid-cols-4 gap-4">
        <div class="col-span-2 min-w-0">
          <label class="text-xs text-gray-500 block mb-1">Time</label>
          <Calendar
            v-model="service.start_time"
            showTime
            hourFormat="24"
            class="w-full p-inputtext-sm"
            @hide="recalcTimes"
          />
        </div>

        <div class="col-span-1 min-w-0">
          <label class="text-xs text-gray-500 block mb-1">Duration</label>
          <InputNumber
            v-model="service.duration_override"
            suffix=" min"
            class="w-full p-inputtext-sm"
            inputClass="w-full"
            @update:modelValue="recalcTimes"
          />
        </div>

        <div class="col-span-1 min-w-0">
          <label class="text-xs text-gray-500 block mb-1">Price</label>
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
      class="text-indigo-600 text-sm font-semibold hover:underline flex items-center gap-1 mt-2"
    >
      <i class="pi pi-plus-circle"></i> Add another service
    </button>
  </div>
</template>

<script setup lang="ts">
const props = defineProps({
  modelValue: { type: Array as () => any[], required: true },
  services: { type: Array as () => any[], default: () => [] },
  staff: { type: Array as () => any[], default: () => [] },
  baseStartTime: { type: Date, default: () => new Date() },
});

const emit = defineEmits(["update:modelValue"]);

const getFilteredStaff = (serviceId: any) => {
  if (!serviceId) return props.staff;
  return props.staff.filter(
    (s: any) =>
      !s.service_ids ||
      s.service_ids.length === 0 ||
      s.service_ids.includes(serviceId)
  );
};

const addService = () => {
  const list = [...props.modelValue];
  let nextStart = new Date(props.baseStartTime);

  if (list.length > 0) {
    const last = list[list.length - 1];
    nextStart = new Date(
      new Date(last.start_time).getTime() +
        (last.duration_override || 60) * 60000
    );
  }

  list.push({
    service_id: null,
    staff_id: null,
    start_time: nextStart,
    duration_override: 60,
    price_override: 0,
  });

  emit("update:modelValue", list);
};

const removeService = (index: number) => {
  const list = [...props.modelValue];
  list.splice(index, 1);
  recalcTimes(list); // Pass the mutated list to recalc
};

const updateServiceDetails = (index: number) => {
  const list = [...props.modelValue];
  const svc = list[index];
  const found = props.services.find((s: any) => s.id === svc.service_id);

  if (found) {
    svc.price_override = Number(found.price);
    svc.duration_override = found.duration_minutes || 60;
  }
  recalcTimes(list);
};

const recalcTimes = (existingList?: any[]) => {
  // Use provided list or clone from props
  const list = existingList || [...props.modelValue];

  if (list.length <= 1) {
    // If we passed a list (deletion/update), emit it
    if (existingList) emit("update:modelValue", list);
    return;
  }

  let currentStart = new Date(list[0].start_time);

  for (let i = 0; i < list.length; i++) {
    // Ensure start time is a Date object
    list[i].start_time = new Date(currentStart);

    // Calculate next start
    currentStart = new Date(
      currentStart.getTime() + (list[i].duration_override || 60) * 60000
    );
  }

  emit("update:modelValue", list);
};
</script>
