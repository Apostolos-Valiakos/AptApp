<template>
  <div data-testid="staff-bonus">
    <!-- The title is the staff form's bonus picker (StaffBonusSettings). -->
    <div class="mb-3">
      <span v-if="current" class="text-sm text-gray-600" data-testid="bonus-current">
        {{ t("bonus.rules.today") }}: {{ describe(current) }}
      </span>
    </div>

    <div class="flex flex-wrap md:flex-nowrap gap-3 items-end">
      <div class="min-w-0 w-full md:w-auto md:flex-1">
        <label class="block text-xs font-medium text-gray-500 mb-1">{{ t("bonus.rules.from") }}</label>
        <Calendar v-model="draft.from" dateFormat="dd/mm/yy" showIcon class="w-full" inputClass="w-full" data-testid="bonus-from" />
      </div>
      <div class="flex items-center gap-2 h-[2.6rem] flex-1 md:flex-none">
        <ToggleSwitch v-model="draft.enabled" inputId="bonus-enabled" data-testid="bonus-enabled" />
        <label for="bonus-enabled" class="text-sm text-gray-700">{{ t("bonus.rules.enabled") }}</label>
      </div>
      <!-- "No bonus from this date" has no amounts: its + is here. -->
      <Button
        v-if="!draft.enabled"
        icon="pi pi-plus"
        rounded
        :aria-label="t('bonus.rules.add')"
        v-tooltip.top="t('bonus.rules.add')"
        :disabled="!canAdd"
        class="shrink-0"
        data-testid="bonus-add"
        @click="addRule"
      />
    </div>

    <div v-if="draft.enabled" class="mt-3 space-y-3">
      <SelectButton
        v-model="draft.kind"
        :options="kindOptions"
        optionLabel="label"
        optionValue="value"
        :allowEmpty="false"
        class="w-full bonus-kind"
        data-testid="bonus-kind"
      />
      <div class="flex gap-3 items-end">
        <div class="min-w-0 flex-1">
          <label class="block text-xs font-medium text-gray-500 mb-1" for="bonus-hours">{{ t("bonus.rules.afterHours") }}</label>
          <InputNumber
            v-model="draft.hours"
            inputId="bonus-hours"
            :min="0"
            :max="24"
            :step="0.5"
            :minFractionDigits="0"
            :maxFractionDigits="2"
            :suffix="` ${t('bonus.hoursShort')}`"
            class="w-full"
            inputClass="w-full"
            data-testid="bonus-hours"
          />
        </div>
        <div v-if="draft.kind === 'percent'" class="min-w-0 flex-1">
          <label class="block text-xs font-medium text-gray-500 mb-1" for="bonus-percent">{{ t("bonus.rules.percent") }}</label>
          <InputNumber
            v-model="draft.percent"
            inputId="bonus-percent"
            :min="0"
            :max="100"
            :minFractionDigits="0"
            :maxFractionDigits="2"
            suffix="%"
            class="w-full"
            inputClass="w-full"
            data-testid="bonus-percent"
          />
        </div>
        <div v-else class="min-w-0 flex-1">
          <label class="block text-xs font-medium text-gray-500 mb-1" for="bonus-amount">{{ t("bonus.rules.perHour") }}</label>
          <InputNumber
            v-model="draft.amount"
            inputId="bonus-amount"
            mode="currency"
            currency="EUR"
            locale="el-GR"
            :min="0"
            :max="1000"
            class="w-full"
            inputClass="w-full"
            data-testid="bonus-amount"
          />
        </div>
        <Button
          icon="pi pi-plus"
          rounded
          :aria-label="t('bonus.rules.add')"
          v-tooltip.top="t('bonus.rules.add')"
          :disabled="!canAdd"
          class="shrink-0"
          data-testid="bonus-add"
          @click="addRule"
        />
      </div>
      <!-- Percent only: laser by the hour, a deduction from each other
           service's price, and a fixed amount for a short last service. -->
      <div v-if="draft.kind === 'percent'" class="grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="bonus-extras">
        <div class="min-w-0">
          <label class="block text-xs font-medium text-gray-500 mb-1" for="bonus-laser">{{ t("bonus.rules.laser") }}</label>
          <InputNumber
            v-model="draft.laser"
            inputId="bonus-laser"
            mode="currency"
            currency="EUR"
            locale="el-GR"
            :min="0"
            :max="1000"
            :placeholder="t('bonus.rules.laserPlaceholder')"
            class="w-full"
            inputClass="w-full"
            data-testid="bonus-laser"
          />
        </div>
        <div class="min-w-0">
          <label class="block text-xs font-medium text-gray-500 mb-1" for="bonus-deduction">{{ t("bonus.rules.deduction") }}</label>
          <InputNumber
            v-model="draft.deduction"
            inputId="bonus-deduction"
            mode="currency"
            currency="EUR"
            locale="el-GR"
            :min="0"
            :max="1000"
            placeholder="0,00 €"
            class="w-full"
            inputClass="w-full"
            data-testid="bonus-deduction"
          />
        </div>
        <div class="min-w-0">
          <label class="block text-xs font-medium text-gray-500 mb-1" for="bonus-last">{{ t("bonus.rules.lastFixed") }}</label>
          <InputNumber
            v-model="draft.last"
            inputId="bonus-last"
            mode="currency"
            currency="EUR"
            locale="el-GR"
            :min="0"
            :max="1000"
            :placeholder="t('bonus.rules.lastPlaceholder')"
            class="w-full"
            inputClass="w-full"
            data-testid="bonus-last"
          />
        </div>
      </div>
      <p class="text-xs text-gray-400">{{ t(draft.kind === "percent" ? "bonus.rules.percentNote" : "bonus.rules.perHourNote") }}</p>
      <p v-if="draft.kind === 'percent'" class="text-xs text-gray-400">{{ t("bonus.rules.extrasNote") }}</p>
    </div>

    <p class="text-xs text-gray-400 mt-3">{{ t("bonus.rules.note") }}</p>

    <RuleHistory :rules="rules" :describe="describe" :loaded="loaded" :dirty="dirty" :emptyText="t('bonus.rules.usingDefault')" testid="bonus-rule" @remove="remove" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive } from "vue";
import { useI18n } from "vue-i18n";
import { useStaffRules } from "./useStaffRules";
import RuleHistory from "./RuleHistory.vue";

// Rules added here are saved with the staff form (its Save calls `commit`).
const props = defineProps<{ staffId?: string | null }>();
const { t, locale } = useI18n();

type Rule = {
  id?: string;
  effective_from?: string;
  enabled: boolean;
  kind: "percent" | "per_hour";
  threshold_minutes: number;
  percent: number;
  amount_per_hour: number;
  laser_amount_per_hour?: number | null;
  deduction_per_service?: number;
  last_service_fixed?: number | null;
};
type Draft = {
  from: Date | null;
  enabled: boolean;
  kind: "percent" | "per_hour";
  hours: number | null;
  percent: number | null;
  amount: number | null;
  laser: number | null;
  deduction: number | null;
  last: number | null;
};
// A new staff member starts like the shop's default rule (domain/bonus.js).
const draft = reactive<Draft>({
  from: new Date(),
  enabled: true,
  kind: "percent",
  hours: 5,
  percent: 10,
  amount: null,
  laser: null,
  deduction: null,
  last: 2.2,
});
const kindOptions = computed(() => [
  { value: "percent", label: t("bonus.rules.kinds.percent") },
  { value: "per_hour", label: t("bonus.rules.kinds.per_hour") },
]);

const number = (n: number) => n.toLocaleString(locale.value === "el" ? "el-GR" : "en-GB", { maximumFractionDigits: 2 });
const cents = (n: number) => n.toLocaleString(locale.value === "el" ? "el-GR" : "en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const describe = (r: Rule) => {
  if (!r.enabled) return t("bonus.rules.off");
  const hours = number(r.threshold_minutes / 60);
  if (r.kind === "per_hour") return t("bonus.rules.describePerHour", { hours, amount: number(r.amount_per_hour) });
  const parts = [t("bonus.rules.describe", { hours, percent: number(r.percent) })];
  if (r.deduction_per_service) parts.push(t("bonus.rules.describeDeduction", { amount: number(r.deduction_per_service) }));
  if (r.laser_amount_per_hour != null) parts.push(t("bonus.rules.describeLaser", { amount: number(r.laser_amount_per_hour) }));
  if (r.last_service_fixed != null) parts.push(t("bonus.rules.describeLast", { amount: cents(r.last_service_fixed) }));
  return parts.join(", ");
};

const canAdd = computed(
  () =>
    !!draft.from &&
    (!draft.enabled || (draft.hours != null && (draft.kind === "percent" ? draft.percent != null : !!draft.amount && draft.amount > 0))),
);

// The form starts from the rule in force today, so a change is one field.
const fill = (r: Rule) => {
  draft.enabled = r.enabled;
  draft.kind = r.kind || "percent";
  draft.hours = r.threshold_minutes / 60;
  draft.percent = r.percent;
  draft.amount = r.amount_per_hour || null;
  draft.laser = r.laser_amount_per_hour ?? null;
  draft.deduction = r.deduction_per_service || null;
  draft.last = r.last_service_fixed ?? null;
};

const { rules, current, loaded, dirty, incomplete, load, add, remove, commit } = useStaffRules<Rule>("bonus-rules", () => props.staffId, fill, {
  values: () => ({
    enabled: draft.enabled,
    kind: draft.kind,
    hours: draft.hours,
    percent: draft.percent,
    amount: draft.amount,
    laser: draft.laser,
    deduction: draft.deduction,
    last: draft.last,
  }),
  canAdd: () => canAdd.value,
  addRule: () => addRule(),
});

// The kind not chosen keeps its value, ready if the rule is switched back.
const addRule = () =>
  add(draft.from as Date, {
    enabled: draft.enabled,
    kind: draft.kind,
    threshold_minutes: Math.round((draft.hours ?? 5) * 60),
    percent: draft.percent ?? 10,
    amount_per_hour: draft.amount ?? 0,
    laser_amount_per_hour: draft.laser,
    deduction_per_service: draft.deduction ?? 0,
    last_service_fixed: draft.last,
  });

onMounted(load);
// Today's rule in words, for the bonus picker.
const summary = computed(() => (current.value ? describe(current.value) : null));
defineExpose({ commit, dirty, incomplete, summary });
</script>

<style>
.bonus-kind.p-selectbutton { display: flex; }
.bonus-kind.p-selectbutton .p-togglebutton { flex: 1 1 0; }
</style>
