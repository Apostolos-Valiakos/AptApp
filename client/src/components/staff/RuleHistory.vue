<template>
  <div v-if="rules.length" class="mt-3">
    <div class="text-xs font-medium text-gray-500 mb-1">{{ t("bonus.rules.history") }}</div>
    <div
      v-for="r in rules"
      :key="r.key"
      class="flex items-center gap-2 py-1 border-t border-gray-100 first:border-0 text-sm"
      :data-testid="testid"
      :data-pending="r.pending ? 'true' : undefined"
    >
      <span class="w-28 flex-shrink-0 text-gray-500 tabular-nums">{{ t("bonus.rules.fromDate", { date: formatDate(r.effective_from, locale) }) }}</span>
      <span class="flex-1 min-w-0 text-gray-800">
        {{ describe(r) }}
        <Tag v-if="r.pending" :value="t('bonus.rules.unsaved')" severity="warn" class="ml-1 !text-[10px] !py-0" />
      </span>
      <Button icon="pi pi-trash" text rounded severity="danger" size="small" :aria-label="t('bonus.rules.remove')" @click="emit('remove', r)" />
    </div>
  </div>
  <p v-else-if="loaded" class="text-xs text-gray-400 mt-3">{{ emptyText }}</p>
  <p v-if="dirty" class="text-xs text-amber-700 mt-2" :data-testid="`${testid}-unsaved`">{{ t("bonus.rules.unsavedNote") }}</p>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { formatDate } from "../../utils/format";

// The rules a staff member has, newest first, with the ones added in the
// dialog marked until the staff form is saved.
defineProps<{ rules: any[]; describe: (rule: any) => string; loaded: boolean; dirty: boolean; emptyText: string; testid: string }>();
const emit = defineEmits<{ remove: [rule: any] }>();
const { t, locale } = useI18n();
</script>
