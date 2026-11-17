<template>
  <div
    class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6"
  >
    <div class="flex items-center gap-2 mb-4">
      <i class="pi pi-palette text-[var(--p-primary-color)]"></i>
      <h3 class="font-bold text-gray-900 text-sm">
        {{ t("profile.branding.title") }}
      </h3>
    </div>

    <div class="mb-4">
      <label class="text-xs font-semibold text-gray-500 block mb-2">{{
        t("profile.branding.quickPresets")
      }}</label>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="color in presets"
          :key="color"
          @click="saveColor(color)"
          class="w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 focus:outline-none"
          :class="
            selectedColor === color
              ? 'border-gray-900 scale-110'
              : 'border-transparent'
          "
          :style="{ backgroundColor: color }"
        >
          <i
            v-if="selectedColor === color"
            class="pi pi-check text-white text-[10px] flex items-center justify-center h-full drop-shadow-md"
          ></i>
        </button>
      </div>
    </div>

    <div>
      <label class="text-xs font-semibold text-gray-500 block mb-2">{{
        t("profile.branding.customColor")
      }}</label>
      <div class="flex items-center gap-3">
        <div class="border rounded-lg p-1">
          <ColorPicker v-model="pickerColor" format="hex" />
        </div>
        <div class="flex-1 min-w-0">
          <div
            class="text-xs font-mono bg-gray-50 px-2 py-1 rounded border text-gray-600 text-center"
          >
            #{{ pickerColor }}
          </div>
        </div>
        <Button
          icon="pi pi-check"
          size="small"
          class="!bg-[var(--p-primary-color)] border-none w-8 h-8 !p-0"
          :disabled="!pickerColor || '#' + pickerColor === selectedColor"
          @click="saveCustomColor"
          v-tooltip="t('profile.branding.customColor')"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// The app's main colour: a preset or any colour.
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import Button from "primevue/button";
import ColorPicker from "primevue/colorpicker";
import { useThemeStore } from "../../stores/themes";

const { t } = useI18n();
const themeStore = useThemeStore();

const pickerColor = ref("8B6F4E");
const selectedColor = computed(() => themeStore.primaryColor);
onMounted(() => {
  if (themeStore.primaryColor) pickerColor.value = themeStore.primaryColor.replace("#", "");
});

const presets = [
  "#8B6F4E", // Warm Brown (default)
  "#D4A97A", // Gold Sand
  "#3b82f6", // Blue
  "#10b981", // Emerald
  "#8b5cf6", // Violet
  "#f59e0b", // Amber
];

const saveColor = (color: string) => {
  themeStore.updateTheme(color);
  pickerColor.value = color.replace("#", "");
};

const saveCustomColor = () => {
  themeStore.updateTheme("#" + pickerColor.value);
};
</script>
