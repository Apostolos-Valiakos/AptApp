<template>
  <!-- A package's visits as a ring: used of total (P7, no streaks). -->
  <svg :width="size" :height="size" viewBox="0 0 36 36" role="img" :aria-label="label" class="flex-shrink-0">
    <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--p-surface-200)" stroke-width="4" />
    <circle
      cx="18" cy="18" r="15.5" fill="none" stroke="var(--p-primary-color)" stroke-width="4" stroke-linecap="round"
      :stroke-dasharray="`${share * 97.4} 97.4`" transform="rotate(-90 18 18)"
    />
    <text x="18" y="21" text-anchor="middle" font-size="10" font-weight="600" fill="currentColor">{{ left }}</text>
  </svg>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(defineProps<{ used: number; total: number; label: string; size?: number }>(), { size: 44 });
const left = computed(() => Math.max(0, props.total - props.used));
const share = computed(() => (props.total > 0 ? Math.min(1, props.used / props.total) : 0));
</script>
