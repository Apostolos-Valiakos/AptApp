import { defineStore } from "pinia";
import { ref, watch } from "vue";

export const useSettingsStore = defineStore("settings", () => {
  // 1. Initialize from LocalStorage (default to 'all' if nothing saved)
  const savedFilter = localStorage.getItem("scheduler_resource_filter");
  const resourceFilter = ref<"all" | "me">(
    (savedFilter as "all" | "me") || "all"
  );

  const setResourceFilter = (mode: "all" | "me") => {
    resourceFilter.value = mode;
  };

  // 2. Watch for changes and save to LocalStorage automatically
  watch(resourceFilter, (newVal) => {
    localStorage.setItem("scheduler_resource_filter", newVal);
  });

  return {
    resourceFilter,
    setResourceFilter,
  };
});
