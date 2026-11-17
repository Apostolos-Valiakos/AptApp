<template>
  <div data-testid="staff-reviews">
    <!-- The title is the staff form's bonus picker (StaffBonusSettings). -->
    <div class="mb-3">
      <span v-if="current" class="text-sm text-gray-600" data-testid="reviews-current">
        {{ t("bonus.rules.today") }}: {{ describe(current) }}
      </span>
    </div>

    <div class="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.2fr)_auto_minmax(0,1fr)_auto] gap-3 items-end">
      <div class="min-w-0 col-span-2 md:col-span-1">
        <label class="block text-xs font-medium text-gray-500 mb-1">{{ t("bonus.rules.from") }}</label>
        <Calendar v-model="draft.from" dateFormat="dd/mm/yy" showIcon class="w-full" inputClass="w-full" data-testid="reviews-from" />
      </div>
      <div class="flex items-center gap-2 h-[2.6rem] col-span-2 md:col-span-1">
        <ToggleSwitch v-model="draft.enabled" inputId="reviews-enabled" data-testid="reviews-enabled" />
        <label for="reviews-enabled" class="text-sm text-gray-700">{{ t("bonus.reviews.enabled") }}</label>
      </div>
      <div class="min-w-0">
        <label class="block text-xs font-medium text-gray-500 mb-1" for="reviews-amount">{{ t("bonus.reviews.perReview") }}</label>
        <InputNumber
          v-model="draft.amount"
          inputId="reviews-amount"
          mode="currency"
          currency="EUR"
          locale="el-GR"
          :min="0"
          :max="1000"
          :disabled="!draft.enabled"
          class="w-full"
          inputClass="w-full"
          data-testid="reviews-amount"
        />
      </div>
      <Button
        icon="pi pi-plus"
        rounded
        :aria-label="t('bonus.rules.add')"
        v-tooltip.top="t('bonus.rules.add')"
        :disabled="!canAdd"
        class="shrink-0"
        data-testid="reviews-add"
        @click="addRule"
      />
    </div>

    <p class="text-xs text-gray-400 mt-3">{{ t("bonus.reviews.note") }}</p>

    <RuleHistory :rules="rules" :describe="describe" :loaded="loaded" :dirty="dirty" :emptyText="t('bonus.reviews.none')" testid="reviews-rule" @remove="remove" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive } from "vue";
import { useI18n } from "vue-i18n";
import { formatMoney } from "../../utils/format";
import { useStaffRules } from "./useStaffRules";
import RuleHistory from "./RuleHistory.vue";

// For front desk: paid for each review the shop gained in a month (the counts
// are typed in on the Bonus page). Saved with the staff form.
const props = defineProps<{ staffId?: string | null }>();
const { t } = useI18n();

type Rule = { id?: string; effective_from?: string; enabled: boolean; amount_per_review: number };
const draft = reactive<{ from: Date | null; enabled: boolean; amount: number | null }>({ from: new Date(), enabled: false, amount: 3 });

const describe = (r: Rule) => (r.enabled ? t("bonus.reviews.describe", { amount: formatMoney(r.amount_per_review) }) : t("bonus.reviews.off"));
const canAdd = computed(() => !!draft.from && (!draft.enabled || (draft.amount != null && draft.amount >= 0)));

// Someone who never had it starts at €3 a review, off.
const fill = (r: Rule) => {
  draft.enabled = !!r?.enabled;
  draft.amount = r?.enabled ? r.amount_per_review : 3;
};
const { rules, current, loaded, dirty, load, add, remove, commit } = useStaffRules<Rule>("review-rules", () => props.staffId, fill);
const addRule = () => add(draft.from as Date, { enabled: draft.enabled, amount_per_review: draft.amount ?? 3 });

onMounted(load);
// Today's rule in words, for the bonus picker.
const summary = computed(() => (current.value ? describe(current.value) : null));
defineExpose({ commit, dirty, summary });
</script>
