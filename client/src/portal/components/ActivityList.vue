<template>
  <!-- The client's notifications, newest first; unread ones stand out. -->
  <div v-if="loading" class="text-center py-8">
    <i class="pi pi-spin pi-spinner text-2xl text-gray-300"></i>
  </div>
  <div v-else-if="items.length === 0" class="flex flex-col items-center justify-center py-10 text-center">
    <i class="pi pi-bell-slash text-3xl text-gray-300 mb-3"></i>
    <p class="text-sm text-gray-400">{{ t("portal.notificationHistory.empty") }}</p>
  </div>
  <div v-else class="space-y-1 max-h-[60vh] overflow-y-auto -mx-2">
    <button
      v-for="n in items"
      :key="n.id"
      type="button"
      class="w-full text-left px-3 py-3 rounded-xl flex items-start gap-3 transition-colors"
      :class="n.read_at ? 'hover:bg-[var(--p-surface-100)]' : 'bg-[var(--p-primary-50)] hover:bg-[var(--p-primary-100)]'"
      @click="emit('open', n)"
    >
      <i :class="n.type === 'reminder' ? 'pi pi-calendar' : 'pi pi-megaphone'" class="text-[var(--p-primary-600)] mt-0.5 flex-shrink-0"></i>
      <div class="min-w-0 flex-1">
        <p class="text-sm font-semibold truncate">{{ n.title }}</p>
        <p class="text-xs opacity-70 mt-0.5">{{ n.body }}</p>
        <p class="text-[11px] opacity-60 mt-1">{{ formatDate(n.created_at, locale, "shortTime") }}</p>
      </div>
      <span v-if="!n.read_at" class="w-2 h-2 rounded-full bg-[var(--p-primary-color)] mt-1.5 flex-shrink-0"></span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { formatDate } from "../../utils/format";

defineProps<{ items: any[]; loading: boolean }>();
const emit = defineEmits<{ open: [any] }>();
const { t, locale } = useI18n();
</script>
