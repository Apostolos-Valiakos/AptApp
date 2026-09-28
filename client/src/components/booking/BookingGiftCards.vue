<template>
  <div v-if="canSell" class="bg-white border border-gray-200 rounded-xl p-4 mb-6">
    <div class="flex items-center justify-between mb-3">
      <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider">
        {{ t("giftCards.quickSell.cardTitle") }}
      </h4>
      <Button
        size="small"
        text
        icon="pi pi-plus"
        :label="t('giftCards.quickSell.sell')"
        @click="showSell = true"
      />
    </div>

    <p v-if="!pendingGiftCards.length" class="text-sm text-gray-400">
      {{ t("giftCards.quickSell.none") }}
    </p>

    <div
      v-for="(g, idx) in pendingGiftCards"
      :key="idx"
      class="flex items-center justify-between gap-2 text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2 last:mb-0"
    >
      <div class="min-w-0">
        <div class="font-semibold text-amber-900 truncate">{{ g.card_number }}</div>
        <div class="text-xs text-amber-700 truncate">{{ g.customer_name }}</div>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        <span class="font-bold text-amber-900">€{{ Number(g.initial_amount).toFixed(2) }}</span>
        <button type="button" class="text-amber-500 hover:text-amber-700" @click="removePending(idx)">
          <i class="pi pi-times"></i>
        </button>
      </div>
    </div>

    <SellGiftCardDialog
      v-model:visible="showSell"
      :defaultCustomerName="defaultCustomerName"
      @picked="onPicked"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import { useAuthStore } from "../../stores/auth";
import SellGiftCardDialog from "./SellGiftCardDialog.vue";

const { t } = useI18n();
const authStore = useAuthStore();

const props = defineProps<{
  clientId: string | null;
  defaultCustomerName?: string | null;
  pendingGiftCards: { card_number: string; customer_name: string; initial_amount: number }[];
}>();
const emit = defineEmits<{
  "update:pendingGiftCards": [{ card_number: string; customer_name: string; initial_amount: number }[]];
}>();

const role = computed(() => authStore.user?.role);
const canSell = computed(() => !!props.clientId && ["admin", "super_admin", "frontdesk"].includes(role.value));

const showSell = ref(false);

const onPicked = (card: any) => {
  emit("update:pendingGiftCards", [...props.pendingGiftCards, card]);
};
const removePending = (idx: number) => {
  const list = [...props.pendingGiftCards];
  list.splice(idx, 1);
  emit("update:pendingGiftCards", list);
};
</script>
