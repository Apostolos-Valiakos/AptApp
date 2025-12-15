<template>
  <div class="flex items-center space-x-3">
    <span class="text-sm text-gray-600">Color by:</span>
    <select
      v-model="mode"
      class="text-sm border rounded-md px-3 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
    >
      <option value="staff">Staff</option>
      <option value="category">Service Category</option>
    </select>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useSettingsStore } from "../stores/settings";

const settings = useSettingsStore();
const mode = computed({
  get: () => settings.colorMode,
  set: (val: "staff" | "category") => settings.setColorMode(val),
});
</script>
