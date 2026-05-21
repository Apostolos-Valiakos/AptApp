<template>
  <div class="flex flex-col h-full border-l border-gray-200 overflow-hidden">
    <div v-if="client" class="p-8 text-center">
      <!-- Avatar -->
      <div
        class="w-20 h-20 bg-[var(--p-primary-100)] text-[var(--p-primary-600)] rounded-full flex items-center justify-center mx-auto text-2xl font-bold mb-4"
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

      <!-- Balance badge -->
      <div
        v-if="calculatedBalance > 0 && authStore.isOwner"
        class="inline-flex items-center bg-red-100 text-red-800 text-xs font-bold px-3 py-1 rounded-full mb-6"
      >
        <i class="pi pi-exclamation-circle mr-1"></i>
        {{ t('bookingSidebar.balance') }}: €{{ calculatedBalance.toFixed(2) }}
      </div>

      <!-- ΕΟΠΠΥ breakdown card -->
      <div
        v-if="client.eoppy_breakdown?.total > 0 || client.non_eoppy_breakdown?.total > 0"
        class="text-left bg-white p-4 rounded-xl shadow-sm border border-gray-100 mt-3"
      >
        <div v-if="client.eoppy_breakdown?.total > 0" class="mb-4">
          <h4 class="text-xs font-bold text-gray-400 uppercase mb-2 border-l-2 border-[var(--p-primary-300)] pl-2">
            {{ t('bookingSidebar.eoppyAppts', { n: client.eoppy_breakdown.total }) }}
          </h4>
          <ul class="text-sm">
            <li
              v-for="(count, name) in client.eoppy_breakdown?.services || {}"
              :key="name"
              class="flex justify-between py-0.5"
            >
              <span class="text-gray-600">{{ name }}</span>
              <span class="font-semibold">{{ count }}</span>
            </li>
          </ul>
        </div>

        <div v-if="client.non_eoppy_breakdown?.total > 0">
          <h4 class="text-xs font-bold text-gray-400 uppercase mb-2 border-l-2 border-[var(--p-primary-300)] pl-2">
            {{ t('bookingSidebar.nonEoppyAppts', { n: client.non_eoppy_breakdown.total }) }}
          </h4>
          <ul class="text-sm">
            <li
              v-for="(count, name) in client.non_eoppy_breakdown?.services ||
              {}"
              :key="name"
              class="flex justify-between py-0.5"
            >
              <span class="text-gray-600">{{ name }}</span>
              <span class="font-semibold">{{ count }}</span>
            </li>
          </ul>
        </div>
      </div>

      <!-- Programs card -->
      <div
        class="text-left bg-white p-4 rounded-xl shadow-sm border border-gray-100 mt-3"
      >
        <h4 class="text-xs font-bold text-gray-400 uppercase mb-3 border-l-2 border-[var(--p-primary-300)] pl-2">
          {{ t('bookingSidebar.program') }}
        </h4>
        <ul class="text-sm space-y-1">
          <li v-if="client.ergotherapia" class="text-gray-600">Εργοθεραπεία</li>
          <li v-if="client.physiotherapia" class="text-gray-600">
            Φυσιοθεραπεία
          </li>
          <li v-if="client.logotherapia" class="text-gray-600">Λογοθεραπεία</li>
        </ul>
      </div>

      <!-- Custom fields card -->
      <div
        v-if="client.custom_fields && client.custom_fields.length"
        class="text-left bg-white p-4 rounded-xl shadow-sm border border-gray-100 mt-3"
      >
        <h4 class="text-xs font-bold text-gray-400 uppercase mb-3 border-l-2 border-[var(--p-primary-300)] pl-2">
          {{ t('bookingSidebar.details') }}
        </h4>
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

    <!-- Empty state -->
    <div
      v-else
      class="h-full flex flex-col items-center justify-center text-gray-300 p-8 text-center"
    >
      <div class="w-20 h-20 rounded-full bg-gray-50 flex items-center justify-center mb-4">
        <i class="pi pi-user text-4xl text-gray-200"></i>
      </div>
      <h3 class="text-sm font-medium text-gray-400">{{ t('bookingSidebar.noClient') }}</h3>
      <p class="text-xs text-gray-300 mt-1">{{ t('bookingSidebar.noClientSub') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useAuthStore } from "../../stores/auth";
const { t } = useI18n();
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
