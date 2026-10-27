<template>
  <Dialog
    v-model:visible="visibleModel"
    modal
    :header="t('priceChange.title')"
    :style="{ width: '26rem' }"
  >
    <div class="space-y-4">
      <div class="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
        {{ t("priceChange.currentTotal") }}:
        <b>{{ formatMoney(currentTotal) }}</b>
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">{{
          t("priceChange.newTotal")
        }}</label>
        <InputNumber
          v-model="newTotal"
          mode="currency"
          currency="EUR"
          class="w-full"
          :min="0"
        />
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">{{
          t("priceChange.reason")
        }}</label>
        <Textarea
          v-model="reason"
          rows="3"
          class="w-full"
          :placeholder="t('priceChange.reasonPlaceholder')"
        />
      </div>
    </div>
    <template #footer>
      <Button :label="t('common.cancel')" text @click="visibleModel = false" />
      <Button
        :label="t('priceChange.confirm')"
        icon="pi pi-check"
        :loading="saving"
        :disabled="!canSubmit"
        @click="confirm"
      />
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { api, ApiError } from "../../api/http";
import { formatMoney } from "../../utils/format";
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useToast } from "primevue/usetoast";

const { t } = useI18n();
const toast = useToast();

const props = defineProps<{
  visible: boolean;
  appointmentId: string | null;
  currentTotal: number;
  ensureSaved?: () => Promise<string | null>;
}>();

const emit = defineEmits<{
  "update:visible": [boolean];
  changed: [any];
}>();

const visibleModel = computed({
  get: () => props.visible,
  set: (v) => emit("update:visible", v),
});

const newTotal = ref<number | null>(0);
const reason = ref("");
const saving = ref(false);

watch(
  () => props.visible,
  (v) => {
    if (!v) return;
    newTotal.value = Number(props.currentTotal) || 0;
    reason.value = "";
  },
);

const canSubmit = computed(
  () =>
    newTotal.value !== null &&
    newTotal.value >= 0 &&
    reason.value.trim().length > 0,
);


const confirm = async () => {
  let apptId = props.appointmentId;
  if (!apptId && props.ensureSaved) apptId = await props.ensureSaved();
  if (!apptId || !canSubmit.value) return;

  saving.value = true;
  try {
    const data = await api
      .post(`/api/v1/appointments/${apptId}/price-change`, {
        new_total: newTotal.value,
        reason: reason.value.trim(),
      })
      .catch((e: ApiError) => {
        throw new Error(e.data?.error || t("priceChange.failed"));
      });
    toast.add({
      severity: "success",
      summary: t("priceChange.success"),
      life: 2500,
    });
    visibleModel.value = false;
    emit("changed", data);
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
