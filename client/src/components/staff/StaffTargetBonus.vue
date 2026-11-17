<template>
  <div data-testid="staff-target">
    <!-- The title is the staff form's bonus picker (StaffBonusSettings). -->
    <div class="mb-3">
      <span v-if="current" class="text-sm text-gray-600" data-testid="target-current">
        {{ t("bonus.rules.today") }}: {{ describe(current) }}
      </span>
    </div>

    <div class="flex flex-wrap md:flex-nowrap gap-3 items-end">
      <div class="min-w-0 w-full md:w-auto md:flex-1">
        <label class="block text-xs font-medium text-gray-500 mb-1">{{ t("bonus.rules.from") }}</label>
        <Calendar v-model="draft.from" dateFormat="dd/mm/yy" showIcon class="w-full" inputClass="w-full" data-testid="target-from" />
      </div>
      <div class="flex items-center gap-2 h-[2.6rem] flex-1 md:flex-none">
        <ToggleSwitch v-model="draft.enabled" inputId="target-enabled" data-testid="target-enabled" />
        <label for="target-enabled" class="text-sm text-gray-700">{{ t("bonus.target.enabled") }}</label>
      </div>
      <!-- Switched off there are no steps: its + is here. -->
      <Button
        v-if="!draft.enabled"
        icon="pi pi-plus"
        rounded
        :aria-label="t('bonus.rules.add')"
        v-tooltip.top="t('bonus.rules.add')"
        :disabled="!canAdd"
        class="shrink-0"
        data-testid="target-add"
        @click="addRule"
      />
    </div>

    <div v-if="draft.enabled" class="mt-3">
      <div class="flex gap-3 items-end">
        <div class="flex-1 min-w-0 space-y-2">
          <div v-for="(step, i) in draft.steps" :key="i" class="flex gap-3 items-end" data-testid="target-step">
            <div class="min-w-0 flex-1">
              <label class="block text-xs font-medium text-gray-500 mb-1">{{ t("bonus.target.sales") }}</label>
              <InputNumber
                v-model="step.target"
                mode="currency"
                currency="EUR"
                locale="el-GR"
                :min="0"
                :maxFractionDigits="0"
                class="w-full"
                inputClass="w-full"
                :data-testid="`target-sales-${i}`"
              />
            </div>
            <div class="min-w-0 flex-1">
              <label class="block text-xs font-medium text-gray-500 mb-1">{{ t("bonus.target.bonus") }}</label>
              <InputNumber
                v-model="step.bonus"
                mode="currency"
                currency="EUR"
                locale="el-GR"
                :min="0"
                class="w-full"
                inputClass="w-full"
                :data-testid="`target-bonus-${i}`"
              />
            </div>
            <Button
              icon="pi pi-times"
              text
              rounded
              severity="secondary"
              :disabled="draft.steps.length === 1"
              :aria-label="t('bonus.target.removeStep')"
              class="shrink-0"
              @click="draft.steps.splice(i, 1)"
            />
          </div>
          <Button
            :label="t('bonus.target.addStep')"
            icon="pi pi-plus-circle"
            text
            size="small"
            :disabled="draft.steps.length >= 10"
            data-testid="target-add-step"
            @click="draft.steps.push({ target: null, bonus: null })"
          />
        </div>
        <Button
          icon="pi pi-plus"
          rounded
          :aria-label="t('bonus.rules.add')"
          v-tooltip.top="t('bonus.rules.add')"
          :disabled="!canAdd"
          class="shrink-0 mb-10"
          data-testid="target-add"
          @click="addRule"
        />
      </div>
    </div>

    <p class="text-xs text-gray-400 mt-3">{{ t("bonus.target.note") }}</p>

    <RuleHistory :rules="rules" :describe="describe" :loaded="loaded" :dirty="dirty" :emptyText="t('bonus.target.none')" testid="target-rule" @remove="remove" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive } from "vue";
import { useI18n } from "vue-i18n";
import { formatMoney } from "../../utils/format";
import { useStaffRules } from "./useStaffRules";
import RuleHistory from "./RuleHistory.vue";

// A fixed bonus when the month's completed services reach a target; with
// several steps, the highest reached. Saved with the staff form.
const props = defineProps<{ staffId?: string | null }>();
const { t } = useI18n();

type Step = { target: number | null; bonus: number | null };
type Rule = { id?: string; effective_from?: string; enabled: boolean; steps: { target: number; bonus: number }[] };
const draft = reactive<{ from: Date | null; enabled: boolean; steps: Step[] }>({
  from: new Date(),
  enabled: true,
  steps: [{ target: 2500, bonus: 300 }],
});

const money = (n: number) => formatMoney(n).replace(/[,.]00(?=\D*$)/, "");
const describe = (r: Rule) =>
  r.enabled && r.steps?.length
    ? [...r.steps].sort((a, b) => a.target - b.target).map((s) => t("bonus.target.step", { target: money(s.target), bonus: money(s.bonus) })).join(", ")
    : t("bonus.target.off");

const canAdd = computed(() => {
  if (!draft.from) return false;
  if (!draft.enabled) return true;
  const targets = draft.steps.map((s) => s.target);
  return (
    draft.steps.length > 0 &&
    draft.steps.every((s) => s.target != null && s.target > 0 && s.bonus != null && s.bonus >= 0) &&
    new Set(targets).size === targets.length
  );
});

// The form starts from the rule in force today.
const fill = (r: Rule) => {
  if (!r?.enabled || !r.steps?.length) {
    draft.enabled = false;
    return;
  }
  draft.enabled = true;
  draft.steps = r.steps.map((s) => ({ target: s.target, bonus: s.bonus }));
};

const { rules, current, loaded, dirty, load, add, remove, commit } = useStaffRules<Rule>("target-rules", () => props.staffId, fill);
const addRule = () =>
  add(draft.from as Date, {
    enabled: draft.enabled,
    steps: draft.enabled ? draft.steps.map((s) => ({ target: s.target as number, bonus: s.bonus as number })).sort((a, b) => a.target - b.target) : [],
  });

onMounted(load);
// Today's rule in words, for the bonus picker.
const summary = computed(() => (current.value ? describe(current.value) : null));
defineExpose({ commit, dirty, summary });
</script>
