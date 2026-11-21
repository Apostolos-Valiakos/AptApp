<template>
  <!-- Clients who already have the phone typed for a new client: using one
       of them avoids a duplicate; creating a new one stays the form's own
       (secondary) button. -->
  <div
    v-if="matches.length"
    class="border-l-4 border-l-amber-400 bg-amber-50 rounded-r-lg px-3 py-2 space-y-2"
    data-testid="phone-matches"
  >
    <p class="text-sm font-semibold text-amber-900">{{ t("clients.phoneMatch.title") }}</p>
    <div v-for="c in matches" :key="c.id" class="flex items-center justify-between gap-3" data-testid="phone-match">
      <div class="min-w-0">
        <div class="text-sm font-semibold text-gray-900 truncate">{{ c.full_name || `${c.first_name || ""} ${c.last_name || ""}` }}</div>
        <div class="text-xs text-gray-500 truncate">{{ c.phone }}<span v-if="c.email"> · {{ c.email }}</span></div>
      </div>
      <Button
        :label="t('clients.phoneMatch.use')"
        size="small"
        class="flex-shrink-0"
        data-testid="phone-match-use"
        @click="emit('use', c)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";

defineProps<{ matches: any[] }>();
const emit = defineEmits<{ use: [client: any] }>();
const { t } = useI18n();
</script>
