<template>
  <Dialog
    v-model:visible="visibleModel"
    modal
    :header="t('clientSearch.title')"
    :style="{ width: '28rem' }"
    :draggable="false"
  >
    <AutoComplete
      :modelValue="selected"
      :suggestions="suggestions"
      optionLabel="full_name"
      :placeholder="t('clientSearch.placeholder')"
      :loading="searching"
      forceSelection
      autofocus
      class="w-full"
      inputClass="w-full"
      @complete="search"
      @update:modelValue="onPick"
    >
      <template #option="{ option }">
        <div class="flex items-center gap-3 py-1">
          <div
            class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
            :style="{ backgroundColor: avatarColor(option.full_name) }"
          >
            {{ initials(option.full_name) }}
          </div>
          <div class="min-w-0">
            <div class="font-semibold text-gray-900 truncate">{{ option.full_name }}</div>
            <div class="text-xs text-gray-500 truncate">{{ option.phone || option.email || "" }}</div>
          </div>
        </div>
      </template>
    </AutoComplete>
    <p class="text-xs text-gray-400 mt-3">{{ t("clientSearch.hint") }}</p>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import { avatarColor, initials } from "../utils/avatar";

const { t } = useI18n();
const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ "update:visible": [boolean]; select: [any] }>();

const visibleModel = computed({
  get: () => props.visible,
  set: (v) => emit("update:visible", v),
});

const selected = ref<any>(null);
const suggestions = ref<any[]>([]);
const searching = ref(false);
let searchTimeout: ReturnType<typeof setTimeout> | null = null;

const search = (event: { query: string }) => {
  const q = event.query.trim();
  if (searchTimeout) clearTimeout(searchTimeout);
  if (!q) {
    suggestions.value = [];
    return;
  }
  searching.value = true;
  searchTimeout = setTimeout(async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `/api/v1/clients?slim=true&search=${encodeURIComponent(q)}&limit=10`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      suggestions.value = res.ok ? await res.json() : [];
    } catch {
      suggestions.value = [];
    } finally {
      searching.value = false;
    }
  }, 250);
};

const onPick = (client: any) => {
  if (!client?.id) return;
  emit("select", client);
  selected.value = null;
  suggestions.value = [];
  visibleModel.value = false;
};
</script>
