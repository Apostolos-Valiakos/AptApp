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
          {{ t("refund.maxNote", { max: Number(maxRefundable).toFixed(2) }) }}
        </p>
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">{{
          t("refund.method")
        }}</label>
        <Dropdown
          v-model="method"
          :options="['cash', 'card', 'bank-transfer']"
          class="w-full"
        >
          <template #value="slotProps">
            {{ slotProps.value ? t(`common.paymentMethod.${slotProps.value}`) : "" }}
          </template>
          <template #option="slotProps">
            {{ t(`common.paymentMethod.${slotProps.option}`) }}
          </template>
        </Dropdown>
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
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useToast } from "primevue/usetoast";

const { t } = useI18n();
const toast = useToast();

const props = defineProps<{
  visible: boolean;
  appointmentId: string | null;
  maxRefundable: number;
  ensureSaved?: () => Promise<string | null>;
}>();

const emit = defineEmits<{
  "update:visible": [boolean];
  refunded: [any];
}>();

const visibleModel = computed({
  get: () => props.visible,
  set: (v) => emit("update:visible", v),
});

const amount = ref<number | null>(0);
const method = ref("cash");
const reason = ref("");
const saving = ref(false);

watch(
  () => props.visible,
  (v) => {
    if (!v) return;
    amount.value = Number(props.maxRefundable) || 0;
    method.value = "cash";
    reason.value = "";
  },
);

const canSubmit = computed(
  () =>
    !!amount.value &&
    amount.value > 0 &&
    amount.value <= props.maxRefundable + 0.001 &&
    reason.value.trim().length > 0,
);

const headers = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

const confirm = async () => {
  let apptId = props.appointmentId;
  if (!apptId && props.ensureSaved) apptId = await props.ensureSaved();
  if (!apptId || !canSubmit.value) return;

  saving.value = true;
  try {
    const res = await fetch(`/api/v1/appointments/${apptId}/refund`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        amount: amount.value,
        payment_method: method.value,
        reason: reason.value.trim(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        data.error === "exceeds_amount_paid"
          ? t("refund.exceedsPaid")
          : data.error || t("refund.failed"),
      );
    }
    toast.add({ severity: "success", summary: t("refund.success"), life: 2500 });
    visibleModel.value = false;
    emit("refunded", {
      new_balance: data.new_balance,
      amount: amount.value,
      method: method.value,
      reason: reason.value,
    });
  } catch (e: any) {
    toast.add({
      severity: "error",
      summary: t("common.error"),
      detail: e.message,
      life: 3500,
    });
  } finally {
    saving.value = false;
  }
};
</script>
