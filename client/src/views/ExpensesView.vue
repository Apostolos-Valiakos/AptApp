<template>
  <div class="space-y-6">
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6">
      <!-- On phones the buttons go under the title. -->
      <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-10 h-10 rounded-xl bg-[var(--p-primary-50)] flex items-center justify-center">
            <i class="pi pi-receipt text-[var(--p-primary-600)]"></i>
          </div>
          <div>
            <h1 class="text-xl sm:text-2xl font-bold text-gray-900">{{ t("expenses.title") }}</h1>
            <p class="text-sm text-gray-500 mt-0.5">{{ t(isAdmin ? "expenses.subtitle" : "expenses.subtitleFrontdesk") }}</p>
          </div>
        </div>
        <div v-if="section === 'daily' || (section === 'monthly' && reauthToken)" class="flex flex-col-reverse sm:flex-row gap-2 w-full sm:w-auto">
          <Button
            v-if="isAdmin"
            :label="t('expenses.categories.title')"
            icon="pi pi-tags"
            severity="secondary"
            outlined
            class="w-full sm:w-auto whitespace-nowrap"
            data-testid="expense-categories"
            @click="showCategories = true"
          />
          <Button :label="t('expenses.add')" icon="pi pi-plus" class="w-full sm:w-auto whitespace-nowrap" data-testid="expense-add" @click="openNew" />
        </div>
      </div>

      <SelectButton
        v-if="isAdmin"
        v-model="section"
        :options="sectionOptions"
        optionLabel="label"
        optionValue="value"
        :allowEmpty="false"
        class="mt-4 sm:mt-6 w-full sm:w-auto expense-sections"
        data-testid="expense-sections"
        @update:modelValue="onSectionChange"
      />

    </div>

    <SensitiveGate :key="section" :required="section !== 'daily'" @unlocked="onUnlocked">
    <div class="space-y-6">
    <div v-if="!otherSection" class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6">
      <div class="grid grid-cols-2 sm:flex sm:flex-row gap-3 sm:items-end">
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
        <div class="col-span-2 sm:col-span-1 flex-1 min-w-0">
          <label class="block text-xs font-medium text-gray-500 mb-1">{{ t("expenses.supplier") }}</label>
          <Dropdown v-model="filters.supplier" :options="supplierFilterOptions" optionLabel="label" optionValue="value" filter class="w-full" :placeholder="t('expenses.allSuppliers')" data-testid="expense-supplier-filter" />
        </div>
        <Button :label="t('expenses.clearFilters')" icon="pi pi-times" outlined severity="secondary" class="col-span-2 sm:col-span-1" @click="clearFilters" />
      </div>
    </div>

    <ExpenseReport v-if="section === 'report'" />
    <ExpenseSuppliers v-else-if="section === 'suppliers'" ref="suppliersPanel" @changed="loadSuppliers" @addExpense="openForSupplier" />

    <div v-else class="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 sm:p-6">
      <div class="flex justify-between items-center mb-4 flex-wrap gap-2 px-1 sm:px-0">
        <span class="text-sm text-gray-500">{{ t("expenses.count", { n: visible.length }) }}</span>
        <div class="flex items-center gap-3 flex-wrap">
          <span class="text-lg font-bold text-gray-900 tabular-nums">
            {{ t("expenses.total") }}: {{ formatMoney(visibleTotal) }}
          </span>
          <Button
            :label="t('expenses.export')"
            icon="pi pi-file-excel"
            severity="secondary"
            outlined
            size="small"
            class="whitespace-nowrap"
            :disabled="!visible.length"
            data-testid="expenses-export"
            @click="exportExcel"
          />
        </div>
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
        <Column field="expense_date" :header="section === 'monthly' ? t('expenses.month') : t('expenses.date')" sortable headerClass="hidden md:table-cell" bodyClass="hidden md:table-cell">
          <template #body="{ data }">{{ section === "monthly" ? formatMonth(data.expense_date) : formatDate(data.expense_date) }}</template>
        </Column>
        <Column field="category_name" :header="t('expenses.category')" sortable headerClass="hidden md:table-cell" bodyClass="hidden md:table-cell">
          <template #body="{ data }">{{ data.category_name || "—" }}</template>
        </Column>
        <Column field="supplier_name" :header="t('expenses.supplier')" sortable headerClass="hidden md:table-cell" bodyClass="hidden md:table-cell">
          <template #body="{ data }">{{ data.supplier_name || "—" }}</template>
        </Column>
        <Column field="description" :header="t('expenses.description')" sortable>
          <template #body="{ data }">
            <span class="whitespace-pre-line">{{ data.description }}</span>
            <!-- Phones: the other columns, under the description. -->
            <div class="md:hidden text-xs text-gray-500 mt-0.5">
              {{ section === "monthly" ? formatMonth(data.expense_date) : formatDate(data.expense_date) }}
              · {{ data.category_name || t("expenses.noCategory") }} · {{ t(`common.paymentMethod.${data.payment_method}`) }}
              <template v-if="data.supplier_name"> · {{ data.supplier_name }}</template>
            </div>
          </template>
        </Column>
        <Column field="payment_method" :header="t('expenses.method')" sortable headerClass="hidden md:table-cell" bodyClass="hidden md:table-cell">
          <template #body="{ data }">{{ t(`common.paymentMethod.${data.payment_method}`) }}</template>
        </Column>
        <Column field="amount" :header="t('expenses.amount')" sortable headerClass="text-right" bodyClass="text-right tabular-nums whitespace-nowrap font-semibold md:font-normal">
          <template #body="{ data }">{{ formatMoney(data.amount) }}</template>
        </Column>
        <Column bodyClass="!px-1 md:!px-3">
          <template #body="{ data }">
            <div v-if="data.editable" class="flex justify-end gap-0 md:gap-1">
              <Button icon="pi pi-pencil" text rounded :aria-label="t('expenses.edit')" @click="openEdit(data)" />
              <Button icon="pi pi-trash" text rounded severity="danger" :aria-label="t('expenses.delete')" @click="remove(data)" />
            </div>
          </template>
        </Column>
      </DataTable>
    </div>
    </div>
    </SensitiveGate>

    <Dialog v-model:visible="showDialog" modal :header="dialogTitle" :style="{ width: '28rem', maxWidth: '95vw' }">
      <div class="space-y-4">
        <!-- From the Suppliers tab, which is neither daily nor monthly, the expense's kind is picked here. -->
        <SelectButton
          v-if="form.pickKind"
          v-model="form.kind"
          :options="kindOptions"
          optionLabel="label"
          optionValue="value"
          :allowEmpty="false"
          class="w-full expense-kind"
          data-testid="expense-kind"
        />
        <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
          <div class="min-w-0">
            <label class="block text-sm font-medium text-gray-700 mb-1">{{ t("expenses.amount") }}</label>
            <InputNumber v-model="form.amount" mode="currency" currency="EUR" locale="el-GR" :min="0" class="w-full" inputClass="w-full" />
          </div>
          <div class="min-w-0">
            <label class="block text-sm font-medium text-gray-700 mb-1">{{ form.kind === "monthly" ? t("expenses.month") : t("expenses.date") }}</label>
            <Calendar v-if="form.kind === 'monthly'" v-model="form.date" view="month" dateFormat="mm/yy" class="w-full" inputClass="w-full" data-testid="expense-month" />
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
          <label class="block text-sm font-medium text-gray-700 mb-1">{{ t("expenses.supplier") }}</label>
          <Dropdown
            v-model="form.supplier"
            :options="formSuppliers"
            optionLabel="name"
            optionValue="id"
            filter
            showClear
            class="w-full"
            :placeholder="t('expenses.noSupplier')"
            :emptyMessage="t('expenses.suppliers.none')"
            data-testid="expense-supplier"
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
import { useNotify } from "../composables/useNotify";
import { formatDate as dateText } from "../utils/format";
import { useAdminActions } from "../composables/useResource";
import { formatMoney } from "../utils/format";
import { exportXlsx } from "../utils/exportXlsx";
import { ref, reactive, computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useConfirm } from "primevue/useconfirm";
import { toLocalDateStr } from "../utils/staffAvailability";
import { useSettingsStore } from "../stores/settings";
import { useAuthStore } from "../stores/auth";
import { reauthToken } from "../utils/reauth";
import SensitiveGate from "../components/SensitiveGate.vue";
import ExpenseReport from "../components/expenses/ExpenseReport.vue";
import ExpenseCategoriesDialog from "../components/expenses/ExpenseCategoriesDialog.vue";
import ExpenseSuppliers from "../components/expenses/ExpenseSuppliers.vue";

const { t, locale } = useI18n();
const settingsStore = useSettingsStore();
// Frontdesk has only the daily expenses; admins also the monthly ones, the
// suppliers and the report.
const isAdmin = computed(() => useAuthStore().isAnalyticsAllowed);
const section = ref<"daily" | "monthly" | "suppliers" | "report">("daily");
const sectionOptions = computed(() => [
  { value: "daily", label: t("expenses.kinds.daily") },
  { value: "monthly", label: t("expenses.kinds.monthly") },
  { value: "suppliers", label: t("expenses.suppliers.title") },
  { value: "report", label: t("expenses.report.title") },
]);
// Suppliers and the report have their own filters and lists.
const otherSection = computed(() => section.value === "suppliers" || section.value === "report");
const categories = ref<any[]>([]);
const suppliers = ref<any[]>([]);
const showCategories = ref(false);
const notify = useNotify();
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
const filters = reactive<{ from: Date | null; to: Date | null; method: string | null; category: string | null; supplier: string | null }>({
  from: monthStart(),
  to: monthEnd(),
  method: null,
  category: null,
  supplier: null,
});
const NO_CATEGORY = "none";
const categoryFilterOptions = computed(() => [
  { value: null, label: t("expenses.allCategories") },
  { value: NO_CATEGORY, label: t("expenses.noCategory") },
  ...categories.value.map((c) => ({ value: c.id, label: c.name })),
]);
const NO_SUPPLIER = "none";
// Removed suppliers still on the listed expenses can be filtered on too.
const supplierFilterOptions = computed(() => {
  const named = new Map<string, string>(suppliers.value.map((s) => [s.id, s.name]));
  for (const e of expenses.value) if (e.supplier_id && !named.has(e.supplier_id)) named.set(e.supplier_id, e.supplier_name);
  return [
    { value: null, label: t("expenses.allSuppliers") },
    { value: NO_SUPPLIER, label: t("expenses.noSupplier") },
    ...[...named].map(([value, label]) => ({ value, label })),
  ];
});
const form = reactive<{
  id: string | null;
  amount: number | null;
  date: Date | null;
  description: string;
  method: string;
  category: string | null;
  categoryName: string | null;
  supplier: string | null;
  supplierName: string | null;
  kind: "daily" | "monthly";
  pickKind: boolean;
}>({
  id: null,
  amount: null,
  date: new Date(),
  description: "",
  method: "cash",
  category: null,
  categoryName: null,
  supplier: null,
  supplierName: null,
  kind: "daily",
  pickKind: false,
});
const kindOptions = computed(() => [
  { value: "daily", label: t("expenses.kinds.daily") },
  { value: "monthly", label: t("expenses.kinds.monthly") },
]);
const suppliersPanel = ref<InstanceType<typeof ExpenseSuppliers> | null>(null);
const dialogTitle = computed(() => {
  if (form.id) return t("expenses.edit");
  return form.kind === "monthly" ? t("expenses.addMonthly") : t("expenses.add");
});
// An expense keeps showing a category that has since been removed from the list.
const formCategories = computed(() =>
  form.category && !categories.value.some((c) => c.id === form.category)
    ? [...categories.value, { id: form.category, name: form.categoryName }]
    : categories.value,
);
// Likewise a supplier that has since been removed.
const formSuppliers = computed(() =>
  form.supplier && !suppliers.value.some((s) => s.id === form.supplier)
    ? [...suppliers.value, { id: form.supplier, name: form.supplierName }]
    : suppliers.value,
);

// Ctrl+1 / Ctrl+8 hide cash / card amounts app-wide, same as Analytics.
const visible = computed(() =>
  expenses.value.filter(
    (e) =>
      (!filters.method || e.payment_method === filters.method) &&
      (!filters.category || (filters.category === NO_CATEGORY ? !e.category_id : e.category_id === filters.category)) &&
      (!filters.supplier || (filters.supplier === NO_SUPPLIER ? !e.supplier_id : e.supplier_id === filters.supplier)) &&
      !(settingsStore.hideCashPaid && e.payment_method === "cash") &&
      !(settingsStore.hideCardPaid && e.payment_method === "card"),
  ),
);
const visibleTotal = computed(() => visible.value.reduce((sum, e) => sum + Number(e.amount), 0));

// The list as shown (its filters, Ctrl+1 / Ctrl+8 included), newest first.
const exportExcel = () => {
  const monthly = section.value === "monthly";
  const rows = [...visible.value]
    .sort((a, b) => (a.expense_date < b.expense_date ? 1 : a.expense_date > b.expense_date ? -1 : 0))
    .map((e) => ({
      [monthly ? t("expenses.month") : t("expenses.date")]: monthly ? formatMonth(e.expense_date) : formatDate(e.expense_date),
      [t("expenses.category")]: e.category_name || t("expenses.noCategory"),
      [t("expenses.supplier")]: e.supplier_name || "",
      [t("expenses.description")]: e.description,
      [t("expenses.method")]: t(`common.paymentMethod.${e.payment_method}`),
      [t("expenses.amount")]: Number(e.amount),
    }));
  const span = [filters.from, filters.to].map((d) => (d ? toLocalDateStr(d) : "")).filter(Boolean).join("_");
  return exportXlsx(`expenses_${section.value}${span ? `_${span}` : ""}.xlsx`, [{ name: t("expenses.sheet"), rows, fitColumns: true }]);
};
const canSave = computed(() => !!form.amount && form.amount > 0 && !!form.date && form.description.trim().length > 0);

const formatDate = (iso: string) => dateText(iso, locale.value);

const formatMonth = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(locale.value === "el" ? "el-GR" : "en-GB", { month: "long", year: "numeric" });

const { call: api } = useAdminActions(() => t("expenses.failed"), () => load());

const load = async () => {
  loading.value = true;
  try {
    const params = new URLSearchParams();
    if (filters.from) params.append("from", toLocalDateStr(filters.from));
    if (filters.to) params.append("to", toLocalDateStr(filters.to));
    params.append("kind", section.value === "monthly" ? "monthly" : "daily");
    expenses.value = await api(`/api/v1/expenses?${params}`);
  } catch (e: any) {
    notify.error(e.message);
  } finally {
    loading.value = false;
  }
};

const clearFilters = () => {
  filters.from = null;
  filters.to = null;
  filters.method = null;
  filters.category = null;
  filters.supplier = null;
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
const loadSuppliers = async () => {
  try {
    suppliers.value = await api("/api/v1/suppliers");
  } catch {
    suppliers.value = [];
  }
};

// Monthly expenses open on the whole year, daily ones on this month.
const onSectionChange = () => {
  if (otherSection.value) return;
  const year = new Date().getFullYear();
  filters.from = section.value === "monthly" ? new Date(year, 0, 1) : monthStart();
  filters.to = section.value === "monthly" ? new Date(year, 11, 31) : monthEnd();
  expenses.value = [];
  if (section.value === "daily") load();
};
// Monthly and Reports open only after the password is retyped.
const onUnlocked = () => {
  if (section.value === "monthly") load();
};

const blankForm = () => ({
  id: null,
  amount: null,
  date: new Date(),
  description: "",
  method: "cash",
  category: null,
  categoryName: null,
  supplier: null,
  supplierName: null,
  kind: section.value === "monthly" ? ("monthly" as const) : ("daily" as const),
  pickKind: false,
});
const openNew = () => {
  Object.assign(form, blankForm());
  showDialog.value = true;
};
// From a supplier's row: the supplier is filled in, and the kind is picked in the dialog.
const openForSupplier = (s: { id: string; name: string }) => {
  Object.assign(form, blankForm(), { supplier: s.id, supplierName: s.name, kind: "daily", pickKind: true });
  showDialog.value = true;
};
const openEdit = (e: any) => {
  Object.assign(form, {
    kind: e.kind === "monthly" ? "monthly" : "daily",
    pickKind: false,
    id: e.id,
    amount: Number(e.amount),
    date: new Date(`${e.expense_date}T00:00:00`),
    description: e.description,
    method: e.payment_method,
    category: e.category_id || null,
    categoryName: e.category_name || null,
    supplier: e.supplier_id || null,
    supplierName: e.supplier_name || null,
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
      supplier_id: form.supplier,
      kind: form.kind,
    };
    if (form.id) await api(`/api/v1/expenses/${form.id}`, "PUT", body);
    else await api("/api/v1/expenses", "POST", body);
    showDialog.value = false;
    notify.success(t("expenses.saved"));
    // On the Suppliers tab its totals and orders change, not the expense list.
    if (section.value === "suppliers") await suppliersPanel.value?.load();
    else await load();
  } catch (e: any) {
    notify.error(e.message);
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
        notify.error(err.message);
      }
    },
  });

onMounted(() => Promise.all([load(), loadCategories(), loadSuppliers()]));
</script>

<style>
/* The dialog's Daily / Monthly choice fills its width. */
.expense-kind.p-selectbutton { display: flex; }
.expense-kind.p-selectbutton .p-togglebutton { flex: 1 1 0; }
/* Phones: the sections share the width equally. */
@media (max-width: 639px) {
  .expense-sections.p-selectbutton { display: flex; }
  .expense-sections.p-selectbutton .p-togglebutton { flex: 1 1 0; min-width: 0; padding-inline: 0.25rem; font-size: 0.8rem; }
}
</style>
