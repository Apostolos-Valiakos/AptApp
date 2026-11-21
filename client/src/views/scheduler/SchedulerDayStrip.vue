<template>
  <!-- ===== PHONE DAY STRIP (swipe for the previous/next week) ===== -->
  <div
    v-if="isPhone"
    class="grid grid-cols-7 border-b border-gray-100 bg-white flex-shrink-0 py-1.5 select-none"
    @touchstart.passive="onStripTouchStart"
    @touchend="onStripTouchEnd"
  >
    <button
      v-for="d in weekStrip"
      :key="d.key"
      type="button"
      :disabled="d.disabled"
      @click="goToDay(d.date)"
      class="flex flex-col items-center gap-1 py-1 disabled:opacity-30"
    >
      <span
        class="text-[11px] font-medium"
        :class="d.weekend ? 'text-gray-400' : 'text-gray-600'"
        >{{ d.letter }}</span
      >
      <span
        class="w-9 h-9 rounded-full flex items-center justify-center text-base font-semibold"
        :class="
          d.selected
            ? 'bg-[var(--p-primary-color)] text-white'
            : d.today
              ? 'text-[var(--p-primary-700)] ring-1 ring-[var(--p-primary-300)]'
              : d.weekend
                ? 'text-gray-400'
                : 'text-gray-900'
        "
        >{{ d.day }}</span
      >
    </button>
  </div>

</template>

<script setup lang="ts">
// Phones: the week's days under the toolbar; swipe for the previous or next week.
import { useScheduler } from "./context";

const {
  isPhone, weekStrip, goToDay, onStripTouchStart, onStripTouchEnd,
} = useScheduler();
</script>
