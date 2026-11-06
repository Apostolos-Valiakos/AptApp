<template>
  <div>
    <button
      type="button"
      class="h-[54px] w-full flex items-center justify-between gap-2 px-3 text-sm border rounded-md bg-white hover:border-gray-400 transition-colors"
      :class="isOpen ? 'border-[var(--p-primary-color)] ring-1 ring-[var(--p-primary-color)]' : 'border-gray-300'"
      @click="toggle"
    >
      <span :class="modelValue ? 'text-gray-900' : 'text-gray-400'">
        {{ modelValue || placeholder }}
      </span>
      <i class="pi pi-chevron-down text-gray-400 text-xs"></i>
    </button>
    <Popover ref="popoverRef" @show="onShow" @hide="isOpen = false">
      <div ref="listRef" class="max-h-72 overflow-y-auto w-32 -m-3">
        <button
          v-for="time in times"
          :key="time"
          type="button"
          class="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-sm text-left hover:bg-gray-50 transition-colors"
          :class="time === modelValue ? 'text-[var(--p-primary-color)] font-semibold' : 'text-gray-700'"
          @click="select(time)"
        >
          {{ time }}
          <i v-if="time === modelValue" class="pi pi-check text-[var(--p-primary-color)] text-xs"></i>
        </button>
      </div>
    </Popover>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from "vue";
import Popover from "primevue/popover";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    minTime?: string;
    maxTime?: string;
    step?: number;
    placeholder?: string;
  }>(),
  {
    minTime: "00:00",
    maxTime: "23:55",
    step: 5,
  },
);

const emit = defineEmits<{ "update:modelValue": [string] }>();

const popoverRef = ref<any>(null);
const listRef = ref<HTMLElement | null>(null);
const isOpen = ref(false);

const toMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

// The selected time itself might fall outside [minTime, maxTime] (e.g. shop
// hours changed after this appointment was booked late) — always include it
// so editing an existing booking never silently hides its own value.
const times = computed(() => {
  const result: string[] = [];
  const start = toMinutes(props.minTime);
  const end = toMinutes(props.maxTime);
  for (let m = start; m <= end; m += props.step) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    result.push(`${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
  }
  if (props.modelValue && !result.includes(props.modelValue)) {
    result.push(props.modelValue);
    result.sort();
  }
  return result;
});

const toggle = (event: Event) => {
  popoverRef.value?.toggle(event);
};

const onShow = () => {
  isOpen.value = true;
  nextTick(() => scrollToSelected());
};

const scrollToSelected = () => {
  if (!listRef.value) return;
  const idx = times.value.indexOf(props.modelValue);
  const el = listRef.value.children[idx] as HTMLElement | undefined;
  el?.scrollIntoView({ block: "center" });
};

const select = (time: string) => {
  emit("update:modelValue", time);
  popoverRef.value?.hide();
};
</script>
