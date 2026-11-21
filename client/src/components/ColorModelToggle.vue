<template>
  <div class="flex items-center gap-4">
    <div class="flex items-center gap-2">
      <label for="resource-filter" class="text-sm text-gray-600">{{ t("scheduler.view.label") }}:</label>
      <!-- Staff see their own column ("My schedule"), the only choice offered. -->
      <Select
        v-model="resourceFilter"
        inputId="resource-filter"
        :options="options"
        optionLabel="label"
        optionValue="value"
        optionDisabled="disabled"
        size="small"
        data-testid="resource-filter"
      />
    </div>
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

// Check if the logged-in user is actually a staff member
const hasStaffProfile = computed(() => {
  return !!authStore.user?.staff_id;
});

const options = computed(() => [{ value: "me", label: t("scheduler.mySchedule"), disabled: !hasStaffProfile.value }]);

// Getter/Setter for Resource Filter
const resourceFilter = computed({
  get: () => settings.resourceFilter,
  set: (val: "all" | "me") => settings.setResourceFilter(val),
});
</script>
