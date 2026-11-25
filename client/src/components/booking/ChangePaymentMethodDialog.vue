<template>
  <!-- A payment recorded the wrong way, moved to the right one in one step:
       the server refunds it the wrong way and pays it the right way together. -->
  <Dialog v-model:visible="visibleModel" modal :header="t('changeMethod.title')" :style="{ width: '26rem', maxWidth: '95vw' }">
    <div v-if="loading" class="text-center py-6"><i class="pi pi-spin pi-spinner text-gray-400"></i></div>
    <p v-else-if="!ways.length" class="text-sm text-gray-500">{{ t("changeMethod.nothing") }}</p>
    <div v-else class="space-y-4">
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">{{ t("changeMethod.from") }}</label>
        <Dropdown v-model="from" :options="ways" optionValue="method" class="w-full" data-testid="change-method-from">
          <template #value="{ value }">{{ value ? wayLabel(value) : "" }}</template>
          <template #option="{ option }">{{ wayLabel(option.method) }}</template>
        </Dropdown>
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">{{ t("changeMethod.to") }}</label>
        <Dropdown v-model="to" :options="targets" class="w-full" data-testid="change-method-to">
          <template #value="{ value }">{{ value ? methodChoiceLabel(t, value) : "" }}</template>
          <template #option="{ option }">{{ methodChoiceLabel(t, option) }}</template>
        </Dropdown>
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">{{ t("changeMethod.amount") }}</label>
        <InputNumber v-model="amount" mode="currency" currency="EUR" locale="el-GR" :min="0" :max="maxAmount" class="w-full" inputClass="w-full" data-testid="change-method-amount" />
        <p class="text-xs text-gray-400 mt-1">{{ t("changeMethod.maxNote", { max: formatMoney(maxAmount) }) }}</p>
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">{{ t("changeMethod.note") }}</label>
        <InputText v-model="note" class="w-full" :placeholder="t('changeMethod.notePlaceholder')" />
      </div>
      <p class="text-xs text-gray-500">{{ t("changeMethod.explain") }}</p>
    </div>
    <template #footer>
      <Button :label="t('common.cancel')" text @click="visibleModel = false" />
      <Button
        :label="t('changeMethod.confirm')"
        icon="pi pi-arrow-right-arrow-left"
        :loading="saving"
        :disabled="!canSubmit"
        data-testid="change-method-confirm"
        @click="confirm"
      />
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { api, ApiError } from "../../api/http";
import { useNotify } from "../../composables/useNotify";
import { formatMoney } from "../../utils/format";
import { MONEY_METHODS, methodChoiceLabel } from "../../utils/paymentMethods";

const props = defineProps<{ appointmentId: string | null }>();
const emit = defineEmits<{ changed: [any] }>();
const visibleModel = defineModel<boolean>("visible", { default: false });
const { t } = useI18n();
const notify = useNotify();

const ways = ref<{ method: string; net: number }[]>([]);
const from = ref<string | null>(null);
const to = ref<string | null>(null);
const amount = ref<number | null>(null);
const note = ref("");
const loading = ref(false);
const saving = ref(false);

const netOf = (method: string | null) => ways.value.find((w) => w.method === method)?.net || 0;
const wayLabel = (method: string) => `${methodChoiceLabel(t, method)} · ${formatMoney(netOf(method))}`;
const maxAmount = computed(() => netOf(from.value));
const targets = computed(() => MONEY_METHODS.filter((m) => m !== from.value));
const canSubmit = computed(
  () => !!from.value && !!to.value && from.value !== to.value && !!amount.value && amount.value > 0 && amount.value <= maxAmount.value + 0.001,
);

// Opens on the latest payment's way (usually the wrong one), its whole amount,
// moved to cash or, from cash, to card.
watch(visibleModel, async (open) => {
  if (!open || !props.appointmentId) return;
  loading.value = true;
  ways.value = [];
  note.value = "";
  try {
    const info = await api.get(`/api/v1/appointments/${props.appointmentId}/payment-methods`);
    ways.value = info.methods || [];
    from.value = info.last_method || ways.value[0]?.method || null;
  } catch (e: any) {
    notify.error(e.message);
  } finally {
    loading.value = false;
  }
});
watch(from, (f) => {
  amount.value = netOf(f) || null;
  if (!to.value || to.value === f) to.value = f === "cash" ? "card" : "cash";
});

const confirm = async () => {
  if (!canSubmit.value || !props.appointmentId) return;
  saving.value = true;
  try {
    const data = await api
      .post(`/api/v1/appointments/${props.appointmentId}/change-payment-method`, {
        from_method: from.value,
        to_method: to.value,
        amount: amount.value,
        note: note.value.trim() || undefined,
      })
      .catch((e: ApiError) => {
        throw new Error(e.data?.error === "exceeds_paid_with_method" ? t("changeMethod.exceeds") : e.data?.error || t("changeMethod.failed"));
      });
    notify.success(t("changeMethod.success"));
    visibleModel.value = false;
    emit("changed", data);
  } catch (e: any) {
    notify.error(e.message);
  } finally {
    saving.value = false;
  }
};
</script>
