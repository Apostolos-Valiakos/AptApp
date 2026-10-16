<template>
  <div class="space-y-6">
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div class="flex justify-between items-center flex-wrap gap-3">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-[var(--p-primary-50)] flex items-center justify-center">
            <i class="pi pi-receipt text-[var(--p-primary-600)]"></i>
          </div>
          <div>
            <h1 class="text-2xl font-bold text-gray-900">{{ t("expenses.title") }}</h1>
            <p class="text-sm text-gray-500 mt-0.5">{{ t("expenses.subtitle") }}</p>
          </div>
        </div>
        <Button :label="t('expenses.add')" icon="pi pi-plus" @click="openNew" />
      </div>

      <div class="flex flex-col sm:flex-row gap-3 mt-6 sm:items-end">
        <div class="flex-1 min-w-0">
          <label class="block text-xs font-medium text-gray-500 mb-1">{{ t("expenses.from") }}</label>
          <Calendar v-model="filters.from" dateFormat="dd/mm/yy" showIcon class="w-full" inputClass="w-full" @update:modelValue="load" />
        </div>
        <div class="flex-1 min-w-0">
          <label class="block text-xs font-medium text-gray-500 mb-1">{{ t("expenses.to") }}</label>
          <Calendar v-model="filters.to" dateFormat="dd/mm/yy" showIcon class="w-full" inputClass="w-full" @update:modelValue="load" />
        </div>
        <div class="flex-1 min-w-0">
          <label class="block text-xs font-medium text-gray-500 mb-1">{{ t("expenses.method") }}</label>
          <Dropdown v-model="filters.method" :options="methodFilterOptions" optionLabel="label" optionValue="value" class="w-full" />
        </div>
        <Button :label="t('expenses.clearFilters')" icon="pi pi-times" outlined severity="secondary" @click="clearFilters" />
      </div>
    </div>

    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div class="flex justify-between items-baseline mb-4 flex-wrap gap-2">
        <span class="text-sm text-gray-500">{{ t("expenses.count", { n: visible.length }) }}</span>
        <span class="text-lg font-bold text-gray-900 tabular-nums">
          {{ t("expenses.total") }}: €{{ visibleTotal.toFixed(2) }}
        </span>
      </div>

      <DataTable
        :value="visible"
        :loading="loading"
        class="p-datatable-sm"
        :rowHover="true"
        responsiveLayout="scroll"
        sortField="expense_date"
        :sortOrder="-1"
        removableSort
      >
        <template #empty>
          <div class="text-center py-12 text-gray-400">{{ t("expenses.empty") }}</div>
        </template>
        <Column field="expense_date" :header="t('expenses.date')" sortable>
          <template #body="{ data }">{{ formatDate(data.expense_date) }}</template>
        </Column>
        <Column field="description" :header="t('expenses.description')" sortable>
          <template #body="{ data }"><span class="whitespace-pre-line">{{ data.description }}</span></template>
        </Column>
        <Column field="payment_method" :header="t('expenses.method')" sortable>
          <template #body="{ data }">{{ t(`common.paymentMethod.${data.payment_method}`) }}</template>
        </Column>
        <Column field="amount" :header="t('expenses.amount')" sortable headerClass="text-right" bodyClass="text-right tabular-nums">
          <template #body="{ data }">€{{ Number(data.amount).toFixed(2) }}</template>
        </Column>
        <Column>
          <template #body="{ data }">
            <div class="flex justify-end gap-1">
              <Button icon="pi pi-pencil" text rounded :aria-label="t('expenses.edit')" @click="openEdit(data)" />
              <Button icon="pi pi-trash" text rounded severity="danger" :aria-label="t('expenses.delete')" @click="remove(data)" />
            </div>
          </template>
        </Column>
      </DataTable>
    </div>

    <Dialog v-model:visible="showDialog" modal :header="form.id ? t('expenses.edit') : t('expenses.add')" :style="{ width: '28rem', maxWidth: '95vw' }">
      <div class="space-y-4">
        <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
          <div class="min-w-0">
            <label class="block text-sm font-medium text-gray-700 mb-1">{{ t("expenses.amount") }}</label>
            <InputNumber v-model="form.amount" mode="currency" currency="EUR" locale="el-GR" :min="0" class="w-full" inputClass="w-full" />
          </div>
          <div class="min-w-0">
            <label class="block text-sm font-medium text-gray-700 mb-1">{{ t("expenses.date") }}</label>
            <Calendar v-model="form.date" dateFormat="dd/mm/yy" class="w-full" inputClass="w-full" />
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{{ t("expenses.description") }}</label>
          <Textarea v-model="form.description" rows="3" maxlength="500" class="w-full" :placeholder="t('expenses.descriptionPlaceholder')" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{{ t("expenses.method") }}</label>
          <Dropdown v-model="form.method" :options="methodOptions" optionLabel="label" optionValue="value" class="w-full" />
        </div>
      </div>
      <template #footer>
        <Button :label="t('common.cancel')" text @click="showDialog = false" />
        <Button :label="t('common.save')" icon="pi pi-check" :loading="saving" :disabled="!canSave" @click="save" />
      </template>
    </Dialog>

    <ConfirmDialog />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useToast } from "primevue/usetoast";
import { useConfirm } from "primevue/useconfirm";
import { toLocalDateStr } from "../utils/staffAvailability";
import { useSettingsStore } from "../stores/settings";

const { t, locale } = useI18n();
const settingsStore = useSettingsStore();
const toast = useToast();
const confirm = useConfirm();

const METHODS = ["cash", "card", "bank-transfer"];
const methodOptions = computed(() => METHODS.map((m) => ({ value: m, label: t(`common.paymentMethod.${m}`) })));
const methodFilterOptions = computed(() => [{ value: null, label: t("expenses.allMethods") }, ...methodOptions.value]);

const monthStart = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
};
const monthEnd = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
};

const expenses = ref<any[]>([]);
const loading = ref(false);
const saving = ref(false);
const showDialog = ref(false);
const filters = reactive<{ from: Date | null; to: Date | null; method: string | null }>({
  from: monthStart(),
  to: monthEnd(),
  method: null,
});
const form = reactive<{ id: string | null; amount: number | null; date: Date | null; description: string; method: string }>({
  id: null,
  amount: null,
  date: new Date(),
  description: "",
  method: "cash",
});

// Ctrl+1 / Ctrl+8 hide cash / card amounts app-wide, same as Analytics.
const visible = computed(() =>
  expenses.value.filter(
    (e) =>
      (!filters.method || e.payment_method === filters.method) &&
      !(settingsStore.hideCashPaid && e.payment_method === "cash") &&
      !(settingsStore.hideCardPaid && e.payment_method === "card"),
  ),
);
const visibleTotal = computed(() => visible.value.reduce((sum, e) => sum + Number(e.amount), 0));
const canSave = computed(() => !!form.amount && form.amount > 0 && !!form.date && form.description.trim().length > 0);

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(locale.value === "el" ? "el-GR" : "en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

const api = async (url: string, method = "GET", body?: any) => {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || t("expenses.failed"));
  return data;
};

const load = async () => {
  loading.value = true;
  try {
    const params = new URLSearchParams();
    if (filters.from) params.append("from", toLocalDateStr(filters.from));
    if (filters.to) params.append("to", toLocalDateStr(filters.to));
    expenses.value = await api(`/api/v1/expenses?${params}`);
  } catch (e: any) {
    toast.add({ severity: "error", summary: t("common.error"), detail: e.message, life: 3500 });
  } finally {
    loading.value = false;
  }
};

const clearFilters = () => {
  filters.from = null;
  filters.to = null;
  filters.method = null;
  load();
};

const openNew = () => {
  Object.assign(form, { id: null, amount: null, date: new Date(), description: "", method: "cash" });
  showDialog.value = true;
};
const openEdit = (e: any) => {
  Object.assign(form, {
    id: e.id,
    amount: Number(e.amount),
    date: new Date(`${e.expense_date}T00:00:00`),
    description: e.description,
    method: e.payment_method,
  });
  showDialog.value = true;
};

const save = async () => {
  saving.value = true;
  try {
    const body = {
      amount: form.amount,
      expense_date: toLocalDateStr(form.date as Date),
      description: form.description.trim(),
      payment_method: form.method,
    };
    if (form.id) await api(`/api/v1/expenses/${form.id}`, "PUT", body);
    else await api("/api/v1/expenses", "POST", body);
    showDialog.value = false;
    toast.add({ severity: "success", summary: t("common.success"), detail: t("expenses.saved"), life: 2500 });
    await load();
  } catch (e: any) {
    toast.add({ severity: "error", summary: t("common.error"), detail: e.message, life: 3500 });
  } finally {
    saving.value = false;
  }
};

const remove = (e: any) =>
  confirm.require({
    header: t("expenses.delete"),
    message: t("expenses.deleteConfirm", { description: e.description, amount: Number(e.amount).toFixed(2) }),
    icon: "pi pi-exclamation-triangle",
    acceptClass: "p-button-danger",
    accept: async () => {
      try {
        await api(`/api/v1/expenses/${e.id}`, "DELETE");
        await load();
      } catch (err: any) {
        toast.add({ severity: "error", summary: t("common.error"), detail: err.message, life: 3500 });
      }
    },
  });

onMounted(load);
</script>
