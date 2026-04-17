<template>
  <div class="flex flex-col lg:flex-row gap-8 p-2">
    <div
      class="w-full lg:w-1/3 bg-gray-50 p-5 rounded-xl border border-gray-200"
    >
      <h3 class="font-bold text-gray-700 mb-4">Edit Age Ranges</h3>
      <div
        v-for="(range, idx) in ageRanges"
        :key="idx"
        class="flex items-center gap-2 mb-3"
      >
        <input
          type="number"
          v-model.number="range.min"
          class="w-16 p-2 border rounded text-center text-sm"
        />
        <span>-</span>
        <input
          type="number"
          v-model.number="range.max"
          class="w-16 p-2 border rounded text-center text-sm"
        />
        <Button
          icon="pi pi-trash"
          class="p-button-text p-button-danger p-button-sm ml-auto"
          @click="ageRanges.splice(idx, 1)"
        />
      </div>
      <Button
        label="Add Range"
        icon="pi pi-plus"
        class="p-button-text p-button-sm mt-2"
        @click="ageRanges.push({ min: 0, max: 100 })"
      />
    </div>

    <div class="flex-grow">
      <h3 class="font-bold text-gray-700 mb-6 flex items-center gap-2">
        <i class="pi pi-users text-indigo-500"></i>
        Client Distribution (Click to view list)
      </h3>
      <div class="space-y-6">
        <div
          v-for="(range, idx) in ageDistribution"
          :key="idx"
          @click="onRangeClick(range)"
          class="group cursor-pointer p-2 rounded-lg hover:bg-white hover:shadow-sm transition-all border border-transparent hover:border-gray-100"
        >
          <div class="flex justify-between mb-2">
            <span
              class="text-sm font-semibold text-gray-600 group-hover:text-indigo-600"
              >{{ range.label }}</span
            >
            <span
              class="text-xs font-bold px-2 py-1 bg-gray-100 rounded text-gray-500"
              >{{ range.count }} clients</span
            >
          </div>
          <div class="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
            <div
              :class="range.isUnknown ? 'bg-gray-400' : 'bg-indigo-500'"
              class="h-full rounded-full transition-all duration-500"
              :style="{ width: range.percentage + '%' }"
            ></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";

const props = defineProps({
  clients: { type: Array, default: () => [] },
});

const emit = defineEmits(["view-group"]);

const ageRanges = ref([
  { min: 0, max: 2 },
  { min: 3, max: 5 },
  { min: 6, max: 11 },
  { min: 12, max: 17 },
  { min: 18, max: 99 },
]);

const calculateAge = (dobString: string | null) => {
  if (!dobString) return null;
  const dob = new Date(dobString);
  const current = new Date();
  let age = current.getFullYear() - dob.getFullYear();
  const m = current.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && current.getDate() < dob.getDate())) age--;
  return Math.max(0, age);
};

const ageDistribution = computed(() => {
  const total = props.clients.length;
  if (total === 0) return [];

  const distribution = ageRanges.value.map((range) => {
    const count = props.clients.filter((c: any) => {
      const age = calculateAge(c.date_of_birth);
      return age !== null && age >= range.min && age <= range.max;
    }).length;

    return {
      label: `${range.min}-${range.max} years`,
      count,
      percentage: total > 0 ? (count / total) * 100 : 0,
      isUnknown: false,
      min: range.min, // Crucial for filtering on click
      max: range.max,
    };
  });

  const unknownCount = props.clients.filter(
    (c: any) => calculateAge(c.date_of_birth) === null,
  ).length;
  if (unknownCount > 0) {
    distribution.push({
      label: "Unknown Age",
      count: unknownCount,
      percentage: (unknownCount / total) * 100,
      isUnknown: true,
      min: null,
      max: null,
    });
  }
  return distribution;
});

// THIS FUNCTION MUST BE DEFINED INSIDE <script setup>
const onRangeClick = (rangeData: any) => {
  const filteredList = props.clients.filter((c: any) => {
    const age = calculateAge(c.date_of_birth);
    if (rangeData.isUnknown) return age === null;
    return age !== null && age >= rangeData.min && age <= rangeData.max;
  });

  emit("view-group", {
    label: rangeData.label,
    clients: filteredList,
  });
};
</script>
