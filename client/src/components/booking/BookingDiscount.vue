<template>
  <div class="bg-white border border-gray-200 rounded-xl p-4 mb-6">
    <div class="flex items-center justify-between mb-3">
      <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider">
        {{ t("discount.title") }}
      </h4>
      <span
        v-if="discountAmount > 0"
        class="text-sm font-bold text-emerald-600"
      >
        − €{{ discountAmount.toFixed(2) }}
      </span>
    </div>

    <div class="flex flex-wrap gap-2 mb-3">
      <button
        v-for="opt in typeOptions"
        :key="String(opt.value)"
        type="button"
        class="px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors"
        :class="
          modelValue.type === opt.value
            ? 'bg-[var(--p-primary-color)] text-white border-transparent'
            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
        "
        @click="setType(opt.value)"
      >
        {{ opt.label }}
      </button>
    </div>

    <template v-if="modelValue.type">
      <div class="mb-3">
        <InputNumber
          v-if="modelValue.type === 'fixed'"
          :modelValue="modelValue.value"
          mode="currency"
          currency="EUR"
          locale="el-GR"
          :min="0"
          class="w-full"
          @update:modelValue="(v: number | null) => patch({ value: v || 0 })"
        />
        <InputNumber
          v-else-if="modelValue.type === 'percent'"
          :modelValue="modelValue.value"
          suffix=" %"
          :min="0"
          :max="100"
          :maxFractionDigits="2"
          class="w-full"
          @update:modelValue="(v: number | null) => patch({ value: v || 0 })"
        />
        <Dropdown
          v-else
          :modelValue="modelValue.code_id"
          :options="codeOptions"
          optionLabel="label"
          optionValue="id"
          :placeholder="t('discount.selectCode')"
          :emptyMessage="t('discount.noCodes')"
          class="w-full"
          @update:modelValue="onCodeChange"
        />
      </div>

      <div>
        <label class="block text-xs text-gray-500 mb-1">{{
          t("discount.appliesTo")
        }}</label>
        <div class="flex gap-2">
          <button
            v-for="opt in scopeOptions"
            :key="opt.value"
            type="button"
            class="px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors"
            :class="
              modelValue.scope === opt.value
                ? 'bg-gray-900 text-white border-transparent'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            "
            @click="patch({ scope: opt.value })"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { DiscountState, DiscountType, DiscountScope } from "../../utils/discount";

const { t } = useI18n();

const props = defineProps<{
  modelValue: DiscountState;
  codes: any[];
  discountAmount: number;
}>();
const emit = defineEmits<{ "update:modelValue": [DiscountState] }>();

const typeOptions = computed(() => [
  { value: null as DiscountType, label: t("discount.none") },
  { value: "fixed" as DiscountType, label: t("discount.fixed") },
  { value: "percent" as DiscountType, label: t("discount.percent") },
  { value: "code" as DiscountType, label: t("discount.code") },
]);
const scopeOptions = computed(() => [
  { value: "services" as DiscountScope, label: t("discount.scopeServices") },
  { value: "total" as DiscountScope, label: t("discount.scopeTotal") },
]);

// Active codes, plus the appointment's current code if it has since been deactivated/deleted.
const codeOptions = computed(() => {
  const list = props.codes.map((c) => ({
    id: c.id,
    percentage: Number(c.percentage),
    label: `${c.name} (${Number(c.percentage)}%)`,
  }));
  const cur = props.modelValue;
  if (cur.type === "code" && cur.code_id && !list.some((c) => c.id === cur.code_id)) {
    list.push({ id: cur.code_id, percentage: cur.value, label: `${cur.code_name} (${cur.value}%)` });
  } else if (cur.type === "code" && !cur.code_id && cur.code_name) {
    list.push({ id: "__stored__", percentage: cur.value, label: `${cur.code_name} (${cur.value}%)` });
  }
  return list;
});

const patch = (p: Partial<DiscountState>) =>
  emit("update:modelValue", { ...props.modelValue, ...p });

const setType = (type: DiscountType) => {
  if (type === props.modelValue.type) return;
  emit("update:modelValue", {
    type,
    value: 0,
    scope: props.modelValue.scope,
    code_id: null,
    code_name: null,
  });
};

const onCodeChange = (id: string | null) => {
  const c = codeOptions.value.find((o) => o.id === id);
  if (!c) return;
  const stored = id === "__stored__";
  patch({
    code_id: stored ? null : id,
    value: c.percentage,
    code_name: c.label.replace(/ \(.*\)$/, ""),
  });
};
</script>
