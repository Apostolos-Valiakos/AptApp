<template>
  <div data-testid="staff-commission">
    <!-- The title is the staff form's bonus picker (StaffBonusSettings). -->
    <div class="mb-3">
      <span v-if="current" class="text-sm text-gray-600" data-testid="commission-current">
        {{ t("bonus.rules.today") }}: {{ describe(current) }}
      </span>
    </div>

    <div class="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.2fr)_auto_minmax(0,1fr)_auto] gap-3 items-end">
      <div class="min-w-0 col-span-2 md:col-span-1">
        <label class="block text-xs font-medium text-gray-500 mb-1">{{ t("bonus.rules.from") }}</label>
        <Calendar v-model="draft.from" dateFormat="dd/mm/yy" showIcon class="w-full" inputClass="w-full" data-testid="commission-from" />
      </div>
      <div class="flex items-center gap-2 h-[2.6rem] col-span-2 md:col-span-1">
        <ToggleSwitch v-model="draft.enabled" inputId="commission-enabled" data-testid="commission-enabled" />
        <label for="commission-enabled" class="text-sm text-gray-700">{{ t("bonus.commission.enabled") }}</label>
      </div>
      <div class="min-w-0">
        <label class="block text-xs font-medium text-gray-500 mb-1" for="commission-percent">{{ t("bonus.rules.percent") }}</label>
        <InputNumber
          v-model="draft.percent"
          inputId="commission-percent"
          :min="0"
          :max="100"
          :minFractionDigits="0"
          :maxFractionDigits="2"
          suffix="%"
          :disabled="!draft.enabled"
          class="w-full"
          inputClass="w-full"
          data-testid="commission-percent"
        />
      </div>
      <Button
        icon="pi pi-plus"
        rounded
        :aria-label="t('bonus.rules.add')"
        v-tooltip.top="t('bonus.rules.add')"
        :disabled="!canAdd"
        class="shrink-0"
        data-testid="commission-add"
        @click="addRule"
      />
    </div>

    <p class="text-xs text-gray-400 mt-3">{{ t("bonus.commission.note") }}</p>

    <RuleHistory :rules="rules" :describe="describe" :loaded="loaded" :dirty="dirty" :emptyText="t('bonus.commission.none')" testid="commission-rule" @remove="remove" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive } from "vue";
import { useI18n } from "vue-i18n";
import { useStaffRules } from "./useStaffRules";
import RuleHistory from "./RuleHistory.vue";

// When on, the staff member can be picked as a product's seller and earns this
// percentage of the profit. Saved with the staff form (its Save calls `commit`).
const props = defineProps<{ staffId?: string | null }>();
const { t, locale } = useI18n();

type Rule = { id?: string; effective_from?: string; enabled: boolean; percent: number };
const draft = reactive<{ from: Date | null; enabled: boolean; percent: number | null }>({ from: new Date(), enabled: false, percent: 10 });

const describe = (r: Rule) =>
  r.enabled
    ? t("bonus.commission.describe", { percent: r.percent.toLocaleString(locale.value === "el" ? "el-GR" : "en-GB", { maximumFractionDigits: 2 }) })
    : t("bonus.commission.off");
const canAdd = computed(() => !!draft.from && (!draft.enabled || draft.percent != null));

// A staff member who never had it starts at 10%, off.
const fill = (r: Rule) => {
  draft.enabled = r.enabled;
  draft.percent = r.enabled ? r.percent : 10;
};
const { rules, current, loaded, dirty, incomplete, load, add, remove, commit } = useStaffRules<Rule>("product-commission-rules", () => props.staffId, fill, {
  values: () => ({ enabled: draft.enabled, percent: draft.percent }),
  canAdd: () => canAdd.value,
  addRule: () => addRule(),
});
const addRule = () => add(draft.from as Date, { enabled: draft.enabled, percent: draft.percent ?? 10 });

onMounted(load);
// Today's rule in words, for the bonus picker.
const summary = computed(() => (current.value ? describe(current.value) : null));
defineExpose({ commit, dirty, incomplete, summary });
</script>
