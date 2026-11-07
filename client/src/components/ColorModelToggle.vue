<template>
  <!-- Staff: their own column or everyone's (remembered on this device). -->
  <div class="inline-flex p-0.5 bg-gray-100 rounded-lg" role="group" data-testid="staff-view-toggle">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap disabled:opacity-40"
      :class="resourceFilter === option.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'"
      :aria-pressed="resourceFilter === option.value"
      :disabled="option.value === 'me' && !hasStaffProfile"
      :data-testid="`staff-view-${option.value}`"
      @click="resourceFilter = option.value"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useSettingsStore } from "../stores/settings";
import { useAuthStore } from "../stores/auth";

const { t } = useI18n();

const settings = useSettingsStore();
const authStore = useAuthStore();

// Only a login linked to a staff member has a column of its own.
const hasStaffProfile = computed(() => !!authStore.user?.staff_id);

const options = computed(() => [
  { value: "me" as const, label: t("scheduler.mySchedule") },
  { value: "all" as const, label: t("scheduler.allStaff") },
]);

const resourceFilter = computed({
  get: () => settings.resourceFilter,
  set: (val: "all" | "me") => settings.setResourceFilter(val),
});
</script>
