import { defineStore } from "pinia";
import { ref } from "vue";

export const useSettingsStore = defineStore("settings", () => {
  const colorMode = ref<"staff" | "category">(
    (localStorage.getItem("colorMode") as any) || "staff"
  );

  const setColorMode = (mode: "staff" | "category") => {
    colorMode.value = mode;
    localStorage.setItem("colorMode", mode);
  };

  return { colorMode, setColorMode };
});
