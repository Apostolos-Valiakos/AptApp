<template>
  <Dialog
    v-model:visible="visibleModel"
    modal
    :header="t('giftCards.quickSell.title')"
    :style="{ width: '26rem' }"
  >
    <div class="space-y-4">
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">{{
          t("giftCards.dialog.cardNumber")
        }}</label>
        <InputText
          v-model="cardNumber"
          class="w-full"
          :placeholder="t('giftCards.dialog.cardNumberPlaceholder')"
        />
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">{{
          t("giftCards.dialog.customerName")
        }}</label>
        <InputText v-model="customerName" class="w-full" />
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">{{
          t("giftCards.dialog.amount")
        }}</label>
        <InputNumber
          v-model="initialAmount"
          mode="currency"
          currency="EUR"
          locale="el-GR"
          :min="0.01"
          class="w-full"
        />
      </div>
    </div>
    <template #footer>
      <Button
        :label="t('packages.sell.cancel')"
        text
        @click="visibleModel = false"
      />
      <Button
        :label="t('giftCards.quickSell.add')"
        icon="pi pi-check"
        :disabled="!cardNumber.trim() || !customerName.trim() || !initialAmount"
        @click="confirm"
      />
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
const props = defineProps<{ visible: boolean; defaultCustomerName?: string | null }>();
const emit = defineEmits<{
  "update:visible": [boolean];
  picked: [{ card_number: string; customer_name: string; initial_amount: number }];
}>();

const visibleModel = computed({
  get: () => props.visible,
  set: (v) => emit("update:visible", v),
});

const cardNumber = ref("");
const customerName = ref("");
const initialAmount = ref<number | null>(null);

watch(
  () => props.visible,
  (v) => {
    if (!v) return;
    cardNumber.value = "";
    customerName.value = props.defaultCustomerName || "";
    initialAmount.value = null;
  },
);

const confirm = () => {
  if (!cardNumber.value.trim() || !customerName.value.trim() || !initialAmount.value) return;
  emit("picked", {
    card_number: cardNumber.value.trim(),
    customer_name: customerName.value.trim(),
    initial_amount: Number(initialAmount.value),
  });
  visibleModel.value = false;
};
</script>
