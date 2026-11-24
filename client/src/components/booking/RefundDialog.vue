<template>
  <Dialog
    v-model:visible="visibleModel"
    modal
    :header="t('refund.title')"
    :style="{ width: '26rem' }"
  >
    <div class="space-y-4">
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">{{
          t("refund.amount")
        }}</label>
        <InputNumber
          v-model="amount"
          mode="currency"
          currency="EUR"
          class="w-full"
          :min="0"
          :max="maxRefundable"
        />
        <p class="text-xs text-gray-400 mt-1">
          {{ t("refund.maxNote", { max: formatMoney(maxRefundable) }) }}
        </p>
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">{{
          t("refund.method")
        }}</label>
        <Dropdown
          v-model="method"
          :options="MONEY_METHODS"
          class="w-full"
          data-testid="refund-method"
        >
          <template #value="slotProps">
            {{ slotProps.value ? methodChoiceLabel(t, slotProps.value) : "" }}
          </template>
          <template #option="slotProps">
            {{ methodChoiceLabel(t, slotProps.option) }}
          </template>
        </Dropdown>
        <!-- What was paid each way, so the refund goes back the way it came in. -->
        <p v-if="paidWays.length" class="text-xs text-gray-500 mt-1" data-testid="refund-paid-ways">
          {{ t("refund.paidWays") }}
          {{ paidWays.map((w) => `${methodChoiceLabel(t, w.method)} ${formatMoney(w.net)}`).join(" · ") }}
        </p>
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">{{
          t("refund.reason")
        }}</label>
        <Textarea
          v-model="reason"
          rows="3"
          class="w-full"
          :placeholder="t('refund.reasonPlaceholder')"
        />
      </div>
    </div>
    <template #footer>
      <Button :label="t('common.cancel')" text @click="visibleModel = false" />
      <Button
        :label="t('refund.confirm')"
        icon="pi pi-replay"
        severity="danger"
        :loading="saving"
        :disabled="!canSubmit"
        @click="confirm"
      />
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { useNotify } from "../../composables/useNotify";
import { MONEY_METHODS, methodChoiceLabel } from "../../utils/paymentMethods";
import { api, ApiError } from "../../api/http";
import { formatMoney } from "../../utils/format";
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useToast } from "primevue/usetoast";

const { t } = useI18n();
const toast = useToast();
const notify = useNotify();

const props = defineProps<{
  appointmentId: string | null;
  maxRefundable: number;
  ensureSaved?: () => Promise<string | null>;
}>();

const emit = defineEmits<{
  refunded: [any];
}>();

const visibleModel = defineModel<boolean>("visible", { default: false });

const amount = ref<number | null>(0);
const method = ref("cash");
const reason = ref("");
const saving = ref(false);

const paidWays = ref<{ method: string; net: number }[]>([]);

// Starts on the way the latest payment was made (usually the one picked by
// mistake), else cash.
watch(
  () => visibleModel.value,
  async (v) => {
    if (!v) return;
    amount.value = Number(props.maxRefundable) || 0;
    method.value = "cash";
    reason.value = "";
    paidWays.value = [];
    if (!props.appointmentId) return;
    const info = await api.get(`/api/v1/appointments/${props.appointmentId}/payment-methods`).catch(() => null);
    if (!info || !visibleModel.value) return;
    paidWays.value = info.methods || [];
    if (info.last_method) method.value = info.last_method;
  },
);

const canSubmit = computed(
  () =>
    !!amount.value &&
    amount.value > 0 &&
    amount.value <= props.maxRefundable + 0.001 &&
    reason.value.trim().length > 0,
);


const confirm = async () => {
  let apptId = props.appointmentId;
  if (!apptId && props.ensureSaved) apptId = await props.ensureSaved();
  if (!apptId || !canSubmit.value) return;

  saving.value = true;
  try {
    const data = await api
      .post(`/api/v1/appointments/${apptId}/refund`, {
        amount: amount.value,
        payment_method: method.value,
        reason: reason.value.trim(),
      })
      .catch((e: ApiError) => {
        throw new Error(
          e.data?.error === "exceeds_amount_paid"
            ? t("refund.exceedsPaid")
            : e.data?.error || t("refund.failed"),
        );
      });
    toast.add({ severity: "success", summary: t("refund.success"), life: 2500 });
    visibleModel.value = false;
    emit("refunded", {
      new_balance: data.new_balance,
      payment_status: data.payment_status,
      amount: amount.value,
      method: method.value,
      reason: reason.value,
    });
  } catch (e: any) {
    notify.error(e.message);
  } finally {
    saving.value = false;
  }
};
</script>
