<template>
  <div class="flex flex-col h-full border-l border-gray-200 overflow-hidden">
    <div v-if="client" class="p-8 text-center">
      <div
        class="w-20 h-20 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto text-2xl font-bold mb-4"
      >
        {{ client.first_name?.[0] || "?" }}{{ client.last_name?.[0] || "?" }}
      </div>
      <h3 class="text-xl font-bold">{{ client.full_name }}</h3>
      <p class="text-gray-500 text-sm">{{ client.email }}</p>

      <p class="text-gray-500 text-sm" :class="{ 'mb-4': !clientAgeDisplay }">
        {{ client.phone }}
      </p>

      <p v-if="clientAgeDisplay" class="text-gray-500 text-sm mb-4">
        {{ clientAgeDisplay }}
      </p>

      <div
        v-if="calculatedBalance > 0 && authStore.isOwner"
        class="inline-block bg-red-100 text-red-800 text-xs font-bold px-3 py-1 rounded-full mb-6"
      >
        Balance: €{{ calculatedBalance.toFixed(2) }}
      </div>

      <div
        class="text-left bg-white p-4 rounded-lg shadow-sm border border-gray-100"
      >
        <div v-if="client.eoppy_breakdown?.total > 0" class="mb-4">
          <h4 class="text-xs font-bold text-gray-400 uppercase mb-1">
            Ραντεβου ΕΟΠΥΥ ({{ client.eoppy_breakdown.total }})
          </h4>
          <ul class="text-sm">
            <li
              v-for="(count, name) in client.eoppy_breakdown?.services || {}"
              :key="name"
              class="flex justify-between"
            >
              <span class="text-gray-600">{{ name }}</span>
              <span class="font-semibold">{{ count }}</span>
            </li>
          </ul>
        </div>

        <div v-if="client.non_eoppy_breakdown?.total > 0">
          <h4 class="text-xs font-bold text-gray-400 uppercase mb-1">
            Ραντεβου Εκτος ΕΟΠΥΥ ({{ client.non_eoppy_breakdown.total }})
          </h4>
          <ul class="text-sm">
            <li
              v-for="(count, name) in client.non_eoppy_breakdown?.services ||
              {}"
              :key="name"
              class="flex justify-between"
            >
              <span class="text-gray-600">{{ name }}</span>
              <span class="font-semibold">{{ count }}</span>
            </li>
          </ul>
        </div>
      </div>
      <div
        class="text-left bg-white p-4 rounded-lg shadow-sm border border-gray-100"
      >
        <h4 class="text-xs font-bold text-gray-400 uppercase mb-3">
          Πρόγραμμα
        </h4>
        <ul>
          <li v-if="client.ergotherapia" class="text-gray-600">Εργοθεραπεία</li>
          <li v-if="client.physiotherapia" class="text-gray-600">
            Φυσιοθεραπεία
          </li>
          <li v-if="client.logotherapia" class="text-gray-600">Λογοθεραπεία</li>
        </ul>
      </div>
      <div
        v-if="client.custom_fields && client.custom_fields.length"
        class="text-left bg-white p-4 rounded-lg shadow-sm border border-gray-100"
      >
        <h4 class="text-xs font-bold text-gray-400 uppercase mb-3">Details</h4>
        <div
          v-for="(field, i) in client.custom_fields"
          :key="i"
          class="flex justify-between text-sm mb-2 border-b border-gray-50 pb-1 last:border-0"
        >
          <span class="text-gray-600">{{ field.title }}</span>
          <span class="font-medium text-gray-900">{{ field.value }}</span>
        </div>
      </div>
    </div>

    <div
      v-else
      class="h-full flex flex-col items-center justify-center text-gray-400"
    >
      <i class="pi pi-user text-3xl mb-2"></i>
      <p>Select a client to view details</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useAuthStore } from "../../stores/auth";
const authStore = useAuthStore();

const props = defineProps({
  client: {
    type: Object,
    default: null,
  },
  calculatedBalance: {
    type: Number,
    default: 0,
  },
});

const clientAgeDisplay = computed(() => {
  if (!props.client || !props.client.date_of_birth) return null;

  const dob = new Date(props.client.date_of_birth);
  const today = new Date();

  // Calculate total months difference
  let months = (today.getFullYear() - dob.getFullYear()) * 12;
  months -= dob.getMonth();
  months += today.getMonth();

  // Subtract a month if the actual birth day hasn't happened yet this month
  if (today.getDate() < dob.getDate()) {
    months--;
  }

  // Fallback for future dates just in case
  if (months < 0) months = 0;

  // Logic: Show months if under 1 year, otherwise show years
  if (months < 12) {
    return `${months} month${months === 1 ? "" : "s"} old`;
  } else {
    const years = Math.floor(months / 12);
    return `${years} year${years === 1 ? "" : "s"} old`;
  }
});
</script>
