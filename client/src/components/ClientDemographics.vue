<template>
  <div class="flex flex-col lg:flex-row gap-8 p-2">
    <div
      class="w-full lg:w-1/3 bg-gray-50 p-5 rounded-xl border border-gray-200"
    >
      <h3 class="font-bold text-gray-700 mb-4">Edit Age Ranges</h3>
      <p class="text-xs text-gray-500 mb-4">
        Customize the brackets to see how many clients visited during this
        period fall into each age group.
      </p>

      <div
        v-for="(range, idx) in ageRanges"
        :key="idx"
        class="flex items-center gap-2 mb-3"
      >
        <input
          type="number"
          v-model.number="range.min"
          class="w-16 p-2 border border-gray-300 rounded text-center text-sm focus:border-indigo-500 outline-none"
          min="0"
        />
        <span class="text-gray-400 font-bold">-</span>
        <input
          type="number"
          v-model.number="range.max"
          class="w-16 p-2 border border-gray-300 rounded text-center text-sm focus:border-indigo-500 outline-none"
          :min="range.min"
        />
        <Button
          icon="pi pi-trash"
          class="p-button-text p-button-danger p-button-sm ml-auto"
          @click="removeRange(idx)"
        />
      </div>

      <Button
        label="Add Range"
        icon="pi pi-plus"
        class="p-button-outlined p-button-sm mt-2 w-full"
        @click="addRange"
      />
    </div>

    <div class="w-full lg:w-2/3">
      <h3 class="font-bold text-gray-700 mb-6">Age Distribution Chart</h3>

      <div class="space-y-5">
        <div
          v-for="item in ageDistribution"
          :key="item.label"
          class="flex items-center gap-4 group"
        >
          <div class="w-24 text-right text-sm font-bold text-gray-600 shrink-0">
            {{ item.label }}
          </div>

          <div
            class="flex-grow h-7 bg-gray-100 rounded-lg overflow-hidden flex items-center relative"
          >
            <div
              class="h-full bg-indigo-500 transition-all duration-700 ease-out rounded-lg relative"
              :class="{ '!bg-gray-400': item.isUnknown }"
              :style="{ width: item.barWidth + '%' }"
            ></div>
          </div>

          <div class="w-20 text-sm text-gray-700 shrink-0 text-right font-bold">
            {{ item.count }}
            <span class="text-xs font-normal text-gray-400 block -mt-1"
              >({{ item.percentage.toFixed(0) }}%)</span
            >
          </div>
        </div>

        <div
          v-if="ageDistribution.length === 0"
          class="text-center py-8 text-gray-400"
        >
          No clients found in this date range.
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import Button from "primevue/button";

const props = defineProps({
  clients: {
    type: Array as () => any[],
    default: () => [],
  },
});

// Default Age Ranges
const ageRanges = ref([
  { min: 0, max: 2 },
  { min: 3, max: 5 },
  { min: 6, max: 11 },
  { min: 12, max: 17 },
  { min: 18, max: 99 },
]);

const addRange = () => {
  ageRanges.value.push({ min: 0, max: 99 });
};

const removeRange = (idx: number) => {
  ageRanges.value.splice(idx, 1);
};

// Safely calculate age from DOB string
const calculateAge = (dobString: string | null) => {
  if (!dobString) return null;
  const dob = new Date(dobString);
  const current = new Date();

  let age = current.getFullYear() - dob.getFullYear();
  const m = current.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && current.getDate() < dob.getDate())) {
    age--;
  }
  return Math.max(0, age);
};

// Compute the distribution for the custom Bar Chart
const ageDistribution = computed(() => {
  const total = props.clients.length;
  if (total === 0) return [];

  const distribution = ageRanges.value.map((range) => {
    const count = props.clients.filter((c) => {
      const age = calculateAge(c.date_of_birth);
      return age !== null && age >= range.min && age <= range.max;
    }).length;

    return {
      label: `${range.min}-${range.max} years`,
      count,
      percentage: total > 0 ? (count / total) * 100 : 0,
      isUnknown: false,
    };
  });

  // Count clients missing DOB
  const unknownCount = props.clients.filter(
    (c) => calculateAge(c.date_of_birth) === null,
  ).length;
  if (unknownCount > 0) {
    distribution.push({
      label: "Unknown",
      count: unknownCount,
      percentage: (unknownCount / total) * 100,
      isUnknown: true,
    });
  }

  // To make the chart look visually balanced, base the 100% width off the largest cohort
  const maxCount = Math.max(...distribution.map((d) => d.count), 1);

  return distribution.map((d) => ({
    ...d,
    barWidth: maxCount > 0 ? (d.count / maxCount) * 100 : 0,
  }));
});
</script>
