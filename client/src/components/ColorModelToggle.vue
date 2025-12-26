<template>
  <div class="flex items-center gap-4">
    <div class="flex items-center space-x-2">
      <span class="text-sm text-gray-600">View:</span>
      <select
        v-model="resourceFilter"
        class="text-sm border rounded-md px-3 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        <option value="all">All Staff</option>
        <option value="me" :disabled="!hasStaffProfile">My Schedule</option>
      </select>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useSettingsStore } from "../stores/settings";
import { useAuthStore } from "../stores/auth";

const settings = useSettingsStore();
const authStore = useAuthStore();

// Check if the logged-in user is actually a staff member
const hasStaffProfile = computed(() => {
  return !!authStore.user?.staff_id;
});

// Getter/Setter for Resource Filter
const resourceFilter = computed({
  get: () => settings.resourceFilter,
  set: (val: "all" | "me") => settings.setResourceFilter(val),
});
</script>
