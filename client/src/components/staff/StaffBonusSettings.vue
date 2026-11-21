<template>
  <div class="border-t border-gray-100 pt-5" data-testid="staff-bonus-settings">
    <label class="block text-sm font-bold text-gray-800 mb-2" for="bonus-section">{{ t("bonus.settings.title") }}</label>
    <Select
      v-model="section"
      :options="options"
      optionLabel="label"
      optionValue="value"
      inputId="bonus-section"
      scrollHeight="20rem"
      class="w-full"
      data-testid="bonus-section"
    >
      <template #value="{ value }">
        <span v-if="value" class="flex items-center gap-2 min-w-0">
          <span class="truncate">{{ labelOf(value) }}</span>
          <Tag v-if="info(value)?.dirty" :value="t('bonus.rules.unsaved')" severity="warn" class="!text-[10px] !py-0 shrink-0" />
        </span>
      </template>
      <template #option="{ option }">
        <div class="flex items-center justify-between gap-3 w-full min-w-0" :data-testid="`bonus-section-${option.value}`">
          <div class="min-w-0">
            <div class="font-medium">{{ option.label }}</div>
            <div v-if="info(option.value)?.summary" class="text-xs text-gray-500 truncate">{{ info(option.value)?.summary }}</div>
          </div>
          <Tag v-if="info(option.value)?.dirty" :value="t('bonus.rules.unsaved')" severity="warn" class="!text-[10px] !py-0 shrink-0" />
        </div>
      </template>
    </Select>

    <!-- All four stay mounted (v-show): rules added in one aren't lost when
         another is picked, and Save sends every section's changes. -->
    <div class="mt-4">
      <StaffBonusRules v-show="section === 'hours'" ref="hours" :staffId="staffId" />
      <StaffProductCommission v-show="section === 'commission'" ref="commission" :staffId="staffId" />
      <StaffTargetBonus v-show="section === 'target'" ref="target" :staffId="staffId" />
      <StaffReviewBonus v-show="section === 'reviews'" ref="reviews" :staffId="staffId" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import StaffBonusRules from "./StaffBonusRules.vue";
import StaffProductCommission from "./StaffProductCommission.vue";
import StaffTargetBonus from "./StaffTargetBonus.vue";
import StaffReviewBonus from "./StaffReviewBonus.vue";

// A staff member's bonuses, one kind at a time, picked from a list. The
// staff form's Save calls `commit` after saving the staff member.
defineProps<{ staffId?: string | null }>();
const { t } = useI18n();

type Section = "hours" | "commission" | "target" | "reviews";
const section = ref<Section>("hours");
const options = computed(() => [
  { value: "hours", label: t("bonus.settings.hours") },
  { value: "commission", label: t("bonus.commission.title") },
  { value: "target", label: t("bonus.target.title") },
  { value: "reviews", label: t("bonus.reviews.title") },
]);
const labelOf = (value: Section) => options.value.find((o) => o.value === value)?.label;

const hours = ref<InstanceType<typeof StaffBonusRules> | null>(null);
const commission = ref<InstanceType<typeof StaffProductCommission> | null>(null);
const target = ref<InstanceType<typeof StaffTargetBonus> | null>(null);
const reviews = ref<InstanceType<typeof StaffReviewBonus> | null>(null);
const sections = computed<Record<Section, { dirty: boolean; incomplete: boolean; summary: string | null } | null>>(() => ({
  hours: hours.value,
  commission: commission.value,
  target: target.value,
  reviews: reviews.value,
}));

const info = (value: Section) => sections.value[value];

// A section with a change that can't be saved as it is: shown, so it can be
// finished. Answers whether there was one.
const showIncomplete = () => {
  const found = (Object.keys(sections.value) as Section[]).find((key) => sections.value[key]?.incomplete);
  if (found) section.value = found;
  return !!found;
};

const commit = async (staffId: string) => {
  for (const s of [hours.value, commission.value, target.value, reviews.value]) {
    if (s) await s.commit(staffId);
  }
};
defineExpose({ commit, showIncomplete });
</script>
