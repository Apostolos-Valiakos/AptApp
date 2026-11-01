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
            <p class="text-sm text-gray-500 mt-0.5">{{ t(isAdmin ? "expenses.subtitle" : "expenses.subtitleFrontdesk") }}</p>
          </div>
        </div>
        <div v-if="section !== 'report'" class="flex gap-2 flex-wrap">
          <Button
            v-if="isAdmin"
            :label="t('expenses.categories.title')"
            icon="pi pi-tags"
            severity="secondary"
            outlined
            data-testid="expense-categories"
            @click="showCategories = true"
          />
          <Button :label="t('expenses.add')" icon="pi pi-plus" data-testid="expense-add" @click="openNew" />
        </div>
      </div>

      <SelectButton
        v-if="isAdmin"
        v-model="section"
        :options="sectionOptions"
        optionLabel="label"
        optionValue="value"
        :allowEmpty="false"
        class="mt-6"
        data-testid="expense-sections"
        @update:modelValue="onSectionChange"
      />

      <div v-if="section !== 'report'" class="flex flex-col sm:flex-row gap-3 mt-6 sm:items-end">
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
          <Dropdown v-model="filters.method" :options="methodFilterOptions" optionLabel="label" optionValue="value" class="w-full" :placeholder="t('expenses.allMethods')" />
        </div>
        <div class="flex-1 min-w-0">
          <label class="block text-xs font-medium text-gray-500 mb-1">{{ t("expenses.category") }}</label>
          <Dropdown v-model="filters.category" :options="categoryFilterOptions" optionLabel="label" optionValue="value" class="w-full" :placeholder="t('expenses.allCategories')" />
        </div>
        <Button :label="t('expenses.clearFilters')" icon="pi pi-times" outlined severity="secondary" @click="clearFilters" />
      </div>
    </div>

    <ExpenseReport v-if="section === 'report'" />

    <div v-else class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div class="flex justify-between items-baseline mb-4 flex-wrap gap-2">
        <span class="text-sm text-gray-500">{{ t("expenses.count", { n: visible.length }) }}</span>
        <span class="text-lg font-bold text-gray-900 tabular-nums">
          {{ t("expenses.total") }}: {{ formatMoney(visibleTotal) }}
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
        <Column field="expense_date" :header="section === 'monthly' ? t('expenses.month') : t('expenses.date')" sortable>
          <template #body="{ data }">{{ section === "monthly" ? formatMonth(data.expense_date) : formatDate(data.expense_date) }}</template>
        </Column>
        <Column field="category_name" :header="t('expenses.category')" sortable>
          <template #body="{ data }">{{ data.category_name || "—" }}</template>
        </Column>
        <Column field="description" :header="t('expenses.description')" sortable>
          <template #body="{ data }"><span class="whitespace-pre-line">{{ data.description }}</span></template>
        </Column>
        <Column field="payment_method" :header="t('expenses.method')" sortable>
          <template #body="{ data }">{{ t(`common.paymentMethod.${data.payment_method}`) }}</template>
        </Column>
        <Column field="amount" :header="t('expenses.amount')" sortable headerClass="text-right" bodyClass="text-right tabular-nums">
          <template #body="{ data }">{{ formatMoney(data.amount) }}</template>
        </Column>
        <Column>
          <template #body="{ data }">
            <div v-if="data.editable" class="flex justify-end gap-1">
              <Button icon="pi pi-pencil" text rounded :aria-label="t('expenses.edit')" @click="openEdit(data)" />
              <Button icon="pi pi-trash" text rounded severity="danger" :aria-label="t('expenses.delete')" @click="remove(data)" />
            </div>
          </template>
        </Column>
      </DataTable>
    </div>

    <Dialog v-model:visible="showDialog" modal :header="dialogTitle" :style="{ width: '28rem', maxWidth: '95vw' }">
      <div class="space-y-4">
        <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
          <div class="min-w-0">
            <label class="block text-sm font-medium text-gray-700 mb-1">{{ t("expenses.amount") }}</label>
            <InputNumber v-model="form.amount" mode="currency" currency="EUR" locale="el-GR" :min="0" class="w-full" inputClass="w-full" />
          </div>
          <div class="min-w-0">
            <label class="block text-sm font-medium text-gray-700 mb-1">{{ section === "monthly" ? t("expenses.month") : t("expenses.date") }}</label>
            <Calendar v-if="section === 'monthly'" v-model="form.date" view="month" dateFormat="mm/yy" class="w-full" inputClass="w-full" data-testid="expense-month" />
            <Calendar v-else v-model="form.date" dateFormat="dd/mm/yy" class="w-full" inputClass="w-full" :disabled="!isAdmin && !!form.id" />
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{{ t("expenses.description") }}</label>
          <Textarea v-model="form.description" rows="3" maxlength="500" class="w-full" :placeholder="t('expenses.descriptionPlaceholder')" data-testid="expense-description" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{{ t("expenses.category") }}</label>
          <Dropdown
            v-model="form.category"
            :options="formCategories"
            optionLabel="name"
            optionValue="id"
            showClear
            class="w-full"
            :placeholder="t('expenses.noCategory')"
            :emptyMessage="t('expenses.categories.none')"
            data-testid="expense-category"
          />
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

    <ExpenseCategoriesDialog v-if="isAdmin" v-model:visible="showCategories" :categories="categories" @changed="onCategoriesChanged" />

    <ConfirmDialog />
  </div>
</template>

<script setup lang="ts">
import { api as http, withMessage } from "../api/http";
import { formatMoney } from "../utils/format";
import { ref, reactive, computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useToast } from "primevue/usetoast";
import { useConfirm } from "primevue/useconfirm";
import { toLocalDateStr } from "../utils/staffAvailability";
import { useSettingsStore } from "../stores/settings";
import { useAuthStore } from "../stores/auth";
import ExpenseReport from "../components/expenses/ExpenseReport.vue";
import ExpenseCategoriesDialog from "../components/expenses/ExpenseCategoriesDialog.vue";

const { t, locale } = useI18n();
const settingsStore = useSettingsStore();
// Frontdesk has only the daily expenses; admins also the monthly ones and the report.
const isAdmin = computed(() => useAuthStore().isAnalyticsAllowed);
const section = ref<"daily" | "monthly" | "report">("daily");
const sectionOptions = computed(() => [
  { value: "daily", label: t("expenses.kinds.daily") },
  { value: "monthly", label: t("expenses.kinds.monthly") },
  { value: "report", label: t("expenses.report.title") },
]);
const categories = ref<any[]>([]);
const showCategories = ref(false);
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
const filters = reactive<{ from: Date | null; to: Date | null; method: string | null; category: string | null }>({
  from: monthStart(),
  to: monthEnd(),
  method: null,
  category: null,
});
const NO_CATEGORY = "none";
const categoryFilterOptions = computed(() => [
  { value: null, label: t("expenses.allCategories") },
  { value: NO_CATEGORY, label: t("expenses.noCategory") },
  ...categories.value.map((c) => ({ value: c.id, label: c.name })),
]);
const form = reactive<{
  id: string | null;
  amount: number | null;
  date: Date | null;
  description: string;
  method: string;
  category: string | null;
  categoryName: string | null;
}>({
  id: null,
  amount: null,
  date: new Date(),
  description: "",
  method: "cash",
  category: null,
  categoryName: null,
});
const dialogTitle = computed(() => {
  if (form.id) return t("expenses.edit");
  return section.value === "monthly" ? t("expenses.addMonthly") : t("expenses.add");
});
// An expense keeps showing a category that has since been removed from the list.
const formCategories = computed(() =>
  form.category && !categories.value.some((c) => c.id === form.category)
    ? [...categories.value, { id: form.category, name: form.categoryName }]
    : categories.value,
);

// Ctrl+1 / Ctrl+8 hide cash / card amounts app-wide, same as Analytics.
const visible = computed(() =>
  expenses.value.filter(
    (e) =>
      (!filters.method || e.payment_method === filters.method) &&
      (!filters.category || (filters.category === NO_CATEGORY ? !e.category_id : e.category_id === filters.category)) &&
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

const formatMonth = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(locale.value === "el" ? "el-GR" : "en-GB", { month: "long", year: "numeric" });

const api = (url: string, method = "GET", body?: any) =>
  http.request(method, url, body || undefined).then((data) => data ?? {}).catch(withMessage(t("expenses.failed")));

const load = async () => {
  loading.value = true;
  try {
    const params = new URLSearchParams();
    if (filters.from) params.append("from", toLocalDateStr(filters.from));
    if (filters.to) params.append("to", toLocalDateStr(filters.to));
    params.append("kind", section.value === "monthly" ? "monthly" : "daily");
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
  filters.category = null;
  load();
};

const loadCategories = async () => {
  try {
    categories.value = await api("/api/v1/expense-categories");
  } catch {
    categories.value = [];
  }
};
const onCategoriesChanged = () => Promise.all([loadCategories(), load()]);

// Monthly expenses open on the whole year, daily ones on this month.
const onSectionChange = () => {
  if (section.value === "report") return;
  const year = new Date().getFullYear();
  filters.from = section.value === "monthly" ? new Date(year, 0, 1) : monthStart();
  filters.to = section.value === "monthly" ? new Date(year, 11, 31) : monthEnd();
  expenses.value = [];
  load();
};

const openNew = () => {
  Object.assign(form, { id: null, amount: null, date: new Date(), description: "", method: "cash", category: null, categoryName: null });
  showDialog.value = true;
};
const openEdit = (e: any) => {
  Object.assign(form, {
    id: e.id,
    amount: Number(e.amount),
    date: new Date(`${e.expense_date}T00:00:00`),
    description: e.description,
    method: e.payment_method,
    category: e.category_id || null,
    categoryName: e.category_name || null,
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
      category_id: form.category,
      kind: section.value === "monthly" ? "monthly" : "daily",
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
    message: t("expenses.deleteConfirm", { description: e.description, amount: formatMoney(e.amount) }),
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

onMounted(() => Promise.all([load(), loadCategories()]));
</script>
