import { defineStore } from "pinia";
import { ref } from "vue";

export const useSettingsStore = defineStore("settings", () => {
  // We only keep the resource filter now
  const resourceFilter = ref<"all" | "me">("all");

  const setResourceFilter = (mode: "all" | "me") => {
    resourceFilter.value = mode;
  };

  return {
    resourceFilter,
    setResourceFilter,
  };
});
