<template>
  <div>
    <div v-if="!selectedCard">
      <InputText
        v-model="search"
        :placeholder="t('payment.giftCard.searchPlaceholder')"
        class="w-full"
        @input="searchCards"
      />
      <div
        v-if="results.length"
        class="mt-2 border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden"
      >
        <button
          v-for="card in results"
          :key="card.id"
          type="button"
          class="w-full text-left px-4 py-2.5 hover:bg-gray-50 transition-colors flex justify-between items-center"
          @click="pick(card)"
        >
          <div>
            <div class="text-sm font-semibold text-gray-900">{{ card.customer_name }}</div>
            <div class="text-xs text-gray-400">{{ card.card_number }} · {{ t('payment.giftCard.expires') }} {{ formatDate(card.expires_at) }}</div>
          </div>
          <div class="text-sm font-bold text-green-600">€{{ Number(card.remaining_balance).toFixed(2) }}</div>
        </button>
      </div>
      <p v-else-if="search.trim().length > 0 && searched" class="text-xs text-gray-400 mt-2">
        {{ t('payment.giftCard.noResults') }}
      </p>
    </div>

    <div v-else class="flex justify-between items-center p-3 border border-gray-200 rounded-xl bg-gray-50">
      <div>
        <div class="text-sm font-semibold text-gray-900">{{ selectedCard.customer_name }}</div>
        <div class="text-xs text-gray-400">{{ selectedCard.card_number }}</div>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-sm font-bold text-green-600">€{{ Number(selectedCard.remaining_balance).toFixed(2) }}</span>
        <button type="button" class="text-gray-400 hover:text-red-500" @click="clear">
          <i class="pi pi-times"></i>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
const { t } = useI18n();

const props = defineProps({
  modelValue: { type: String, default: null }, // selected gift_card_id
});

const emit = defineEmits(["update:modelValue", "update:card"]);

const search = ref("");
const results = ref<any[]>([]);
const selectedCard = ref<any>(null);
const searched = ref(false);
let searchTimeout: ReturnType<typeof setTimeout> | null = null;

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString("el-GR", { day: "2-digit", month: "2-digit", year: "numeric" });

const searchCards = () => {
  if (searchTimeout) clearTimeout(searchTimeout);
  const q = search.value.trim();
  if (!q) {
    results.value = [];
    searched.value = false;
    return;
  }
  searchTimeout = setTimeout(async () => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`/api/v1/gift-cards/search?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      results.value = res.ok ? await res.json() : [];
    } catch {
      results.value = [];
    } finally {
      searched.value = true;
    }
  }, 300);
};

const pick = (card: any) => {
  selectedCard.value = card;
  results.value = [];
  emit("update:modelValue", card.id);
  emit("update:card", card);
};

const clear = () => {
  selectedCard.value = null;
  search.value = "";
  results.value = [];
  searched.value = false;
  emit("update:modelValue", null);
  emit("update:card", null);
};

// Parent may reset modelValue to null externally (e.g. switching method away
// from gift-card, or after a successful payment) — mirror that locally.
watch(
  () => props.modelValue,
  (val) => {
    if (!val) clear();
  },
);

defineExpose({ clear });
</script>
