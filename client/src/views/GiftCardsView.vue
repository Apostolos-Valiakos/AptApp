<template>
  <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
    <!-- Page Header -->
    <div class="flex justify-between items-center mb-6">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-[var(--p-primary-50)] flex items-center justify-center">
          <i class="pi pi-ticket text-[var(--p-primary-600)]"></i>
        </div>
        <div>
          <h1 class="text-2xl font-bold text-gray-900">{{ t('giftCards.title') }}</h1>
          <p class="text-sm text-gray-500 mt-0.5">{{ t('giftCards.subtitle') }}</p>
        </div>
      </div>
      <Button
        :label="t('giftCards.addNew')"
        icon="pi pi-plus"
        @click="openNewDialog"
      />
    </div>

    <DataTable
      :value="giftCards"
      :loading="loading"
      responsiveLayout="scroll"
      class="p-datatable-sm"
      :rowHover="true"
      :paginator="true"
      :rows="15"
    >
      <template #empty>
        <div class="flex flex-col items-center justify-center py-16 text-center">
          <i class="pi pi-ticket text-4xl text-gray-300 mb-3"></i>
          <h3 class="text-base font-medium text-gray-400">{{ t('giftCards.empty.title') }}</h3>
          <p class="text-sm text-gray-400 mt-1">{{ t('giftCards.empty.subtitle') }}</p>
        </div>
      </template>

      <Column field="card_number" :header="t('giftCards.table.cardNumber')" sortable></Column>
      <Column field="customer_name" :header="t('giftCards.table.customer')" sortable></Column>

      <Column
        v-if="!settingsStore.hideCashPaid"
        :header="t('giftCards.table.initialAmount')"
        sortable
        field="initial_amount"
      >
        <template #body="slotProps">
          €{{ Number(slotProps.data.initial_amount).toFixed(2) }}
        </template>
      </Column>

      <Column
        v-if="!settingsStore.hideCashPaid"
        :header="t('giftCards.table.remainingBalance')"
        sortable
        field="remaining_balance"
      >
        <template #body="slotProps">
          €{{ Number(slotProps.data.remaining_balance).toFixed(2) }}
        </template>
      </Column>

      <Column :header="t('giftCards.table.status')">
        <template #body="slotProps">
          <Tag
            :value="t(`giftCards.status.${slotProps.data.status}`)"
            :severity="statusSeverity(slotProps.data.status)"
          />
        </template>
      </Column>

      <Column :header="t('giftCards.table.issued')" sortable field="issued_at">
        <template #body="slotProps">
          {{ formatDate(slotProps.data.issued_at) }}
        </template>
      </Column>

      <Column :header="t('giftCards.table.expires')" sortable field="expires_at">
        <template #body="slotProps">
          {{ formatDate(slotProps.data.expires_at) }}
        </template>
      </Column>

      <Column :header="t('common.actions')" headerClass="text-center">
        <template #body="slotProps">
          <div class="flex gap-2">
            <Button
              icon="pi pi-pencil"
              class="p-button-rounded p-button-text p-button-sm"
              v-tooltip.top="t('giftCards.tooltips.edit')"
              @click="editCard(slotProps.data)"
            />
            <Button
              icon="pi pi-trash"
              class="p-button-rounded p-button-text p-button-sm"
              severity="danger"
              v-tooltip.top="t('giftCards.tooltips.delete')"
              @click="confirmDeleteCard(slotProps.data)"
            />
          </div>
        </template>
      </Column>
    </DataTable>

    <!-- Create / Edit Dialog -->
    <Dialog
      v-model:visible="cardDialog"
      :header="isEdit ? t('giftCards.dialog.editCard') : t('giftCards.dialog.sellCard')"
      modal
      :style="{ width: '30rem' }"
    >
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('giftCards.dialog.cardNumber') }}</label>
          <InputText v-model="form.card_number" class="w-full" :placeholder="t('giftCards.dialog.cardNumberPlaceholder')" />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('giftCards.dialog.existingClient') }}</label>
          <AutoComplete
            v-model="selectedClient"
            :suggestions="clientSuggestions"
            optionLabel="full_name"
            :placeholder="t('giftCards.dialog.existingClientPlaceholder')"
            :loading="searchingClients"
            forceSelection
            showClear
            class="w-full"
            inputClass="w-full"
            @complete="searchClients"
            @update:modelValue="onClientPicked"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('giftCards.dialog.customerName') }}</label>
          <InputText v-model="form.customer_name" class="w-full" />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('giftCards.dialog.amount') }}</label>
          <InputNumber
            v-model="form.initial_amount"
            mode="decimal"
            :minFractionDigits="2"
            class="w-full"
            :disabled="isEdit"
          />
          <small v-if="isEdit" class="text-gray-400">{{ t('giftCards.dialog.amountLockedNote') }}</small>
        </div>

        <div v-if="!isEdit">
          <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('giftCards.dialog.paymentMethod') }}</label>
          <Dropdown
            v-model="form.purchase_payment_method"
            :options="paymentMethodOptions"
            optionLabel="label"
            optionValue="value"
            class="w-full"
          />
        </div>
      </div>

      <template #footer>
        <Button :label="t('common.cancel')" icon="pi pi-times" text @click="cardDialog = false" />
        <Button
          :label="t('giftCards.dialog.save')"
          icon="pi pi-check"
          @click="saveCard"
          :loading="saving"
          :disabled="!form.card_number || !form.customer_name || !form.initial_amount"
        />
      </template>
    </Dialog>

    <ConfirmDialog></ConfirmDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useToast } from "primevue/usetoast";
import { useConfirm } from "primevue/useconfirm";
import { useSettingsStore } from "../stores/settings";

const { t } = useI18n();
const toast = useToast();
const confirm = useConfirm();
const settingsStore = useSettingsStore();

const giftCards = ref<any[]>([]);
const loading = ref(true);
const saving = ref(false);
const cardDialog = ref(false);
const isEdit = ref(false);
const editingId = ref<string | null>(null);

const paymentMethodOptions = [
  { label: "Cash", value: "cash" },
  { label: "Card", value: "card" },
  { label: "Bank Transfer", value: "bank-transfer" },
];

const form = ref<any>({
  card_number: "",
  client_id: null,
  customer_name: "",
  initial_amount: null,
  purchase_payment_method: "cash",
});

const token = () => localStorage.getItem("token");

const fetchGiftCards = async () => {
  loading.value = true;
  try {
    const res = await fetch("/api/v1/gift-cards", {
      headers: { Authorization: `Bearer ${token()}` },
    });
    if (res.ok) giftCards.value = await res.json();
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  fetchGiftCards();
});

// --- Client autocomplete (server-side search, no upfront full-list load) ---
const selectedClient = ref<any>(null);
const clientSuggestions = ref<any[]>([]);
const searchingClients = ref(false);
let clientSearchTimeout: ReturnType<typeof setTimeout> | null = null;

const searchClients = (event: { query: string }) => {
  const q = event.query.trim();
  if (clientSearchTimeout) clearTimeout(clientSearchTimeout);
  if (!q) {
    clientSuggestions.value = [];
    return;
  }
  searchingClients.value = true;
  clientSearchTimeout = setTimeout(async () => {
    try {
      const res = await fetch(
        `/api/v1/clients?slim=true&search=${encodeURIComponent(q)}&limit=10`,
        { headers: { Authorization: `Bearer ${token()}` } },
      );
      clientSuggestions.value = res.ok ? await res.json() : [];
    } finally {
      searchingClients.value = false;
    }
  }, 300);
};

const onClientPicked = (client: any) => {
  if (client && typeof client === "object") {
    form.value.client_id = client.id;
    form.value.customer_name = client.full_name;
  } else {
    form.value.client_id = null;
  }
};

const openNewDialog = () => {
  isEdit.value = false;
  editingId.value = null;
  selectedClient.value = null;
  clientSuggestions.value = [];
  form.value = {
    card_number: "",
    client_id: null,
    customer_name: "",
    initial_amount: null,
    purchase_payment_method: "cash",
  };
  cardDialog.value = true;
};

const editCard = (card: any) => {
  isEdit.value = true;
  editingId.value = card.id;
  // Approximate object for display only — full lookup isn't needed just to show the name
  selectedClient.value = card.client_id
    ? { id: card.client_id, full_name: card.customer_name }
    : null;
  clientSuggestions.value = [];
  form.value = {
    card_number: card.card_number,
    client_id: card.client_id,
    customer_name: card.customer_name,
    initial_amount: card.initial_amount,
    purchase_payment_method: card.purchase_payment_method,
  };
  cardDialog.value = true;
};

const statusSeverity = (status: string) => {
  if (status === "active") return "success";
  if (status === "expired") return "danger";
  return "warn"; // depleted
};

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString("el-GR", { day: "2-digit", month: "2-digit", year: "numeric" });

const saveCard = async () => {
  saving.value = true;
  try {
    const url = isEdit.value ? `/api/v1/gift-cards/${editingId.value}` : "/api/v1/gift-cards";
    const method = isEdit.value ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token()}`,
      },
      body: JSON.stringify(form.value),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to save gift card");
    }
    toast.add({
      severity: "success",
      summary: t("common.success"),
      detail: isEdit.value ? t("giftCards.toast.updated") : t("giftCards.toast.created"),
      life: 3000,
    });
    cardDialog.value = false;
    await fetchGiftCards();
  } catch (e: any) {
    toast.add({ severity: "error", summary: t("common.error"), detail: e.message, life: 4000 });
  } finally {
    saving.value = false;
  }
};

const confirmDeleteCard = (card: any) => {
  confirm.require({
    message: t("giftCards.confirmDelete", { number: card.card_number }),
    header: t("common.confirmDelete"),
    icon: "pi pi-exclamation-triangle",
    acceptClass: "p-button-danger",
    accept: async () => {
      try {
        const res = await fetch(`/api/v1/gift-cards/${card.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token()}` },
        });
        if (!res.ok) throw new Error("Failed to delete");
        giftCards.value = giftCards.value.filter((c) => c.id !== card.id);
        toast.add({ severity: "success", summary: t("giftCards.toast.deleted"), life: 3000 });
      } catch {
        toast.add({ severity: "error", summary: t("giftCards.toast.deleteFailed"), life: 3000 });
      }
    },
  });
};
</script>

<style scoped>
:deep(.p-datatable .p-datatable-tbody > tr > td) {
  padding: 1rem;
  vertical-align: top;
}
</style>
