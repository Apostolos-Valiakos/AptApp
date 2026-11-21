<template>
  <div>
    <ol class="flex items-center gap-1 sm:gap-2" data-testid="payment-steps">
      <li v-for="(label, index) in labels" :key="label" class="flex items-center gap-1 sm:gap-2" :class="{ 'flex-1': index < labels.length - 1 }">
        <button
          type="button"
          class="flex items-center gap-1.5 text-xs sm:text-sm font-semibold disabled:cursor-not-allowed"
          :class="index + 1 === modelValue ? 'text-[var(--p-primary-700)]' : 'text-gray-400 hover:text-gray-600 disabled:hover:text-gray-400'"
          :disabled="index + 1 === 3 && !canReachCharge"
          :aria-current="index + 1 === modelValue ? 'step' : undefined"
          @click="$emit('update:modelValue', index + 1)"
        >
          <span
            class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
            :class="index + 1 <= modelValue ? 'bg-[var(--p-primary-color)] text-white' : 'bg-gray-100 text-gray-500'"
          >
            <i v-if="index + 1 < modelValue" class="pi pi-check text-[10px]"></i>
            <template v-else>{{ index + 1 }}</template>
          </span>
          {{ label }}
        </button>
        <span v-if="index < labels.length - 1" class="flex-1 h-px min-w-2 bg-gray-200"></span>
      </li>
    </ol>
    <div v-if="modelValue === 3" class="flex items-center justify-between mt-4 px-4 py-3 rounded-xl bg-gray-900 text-white">
      <span class="text-xs uppercase tracking-wider font-bold opacity-70">{{ t("payment.stepper.toPay") }}</span>
      <span class="text-xl font-extrabold" data-testid="payment-step-total">{{ formatMoney(total) }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { formatMoney } from "../../utils/format";

const { t } = useI18n();

defineProps<{ modelValue: number; canReachCharge: boolean; total: number }>();
defineEmits<{ "update:modelValue": [number] }>();

const labels = computed(() => [t("payment.stepper.checkout"), t("payment.stepper.payment"), t("payment.stepper.charge")]);
</script>
