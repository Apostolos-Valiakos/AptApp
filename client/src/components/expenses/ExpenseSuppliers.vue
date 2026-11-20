<template>
  <div class="space-y-6" data-testid="expense-suppliers">
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6">
      <div class="grid grid-cols-2 sm:flex sm:flex-row gap-3 sm:items-end">
        <div class="flex-1 min-w-0">
          <label class="block text-xs font-medium text-gray-500 mb-1">{{ t("expenses.from") }}</label>
          <Calendar v-model="from" dateFormat="dd/mm/yy" showIcon class="w-full" inputClass="w-full" @update:modelValue="load" />
        </div>
        <div class="flex-1 min-w-0">
          <label class="block text-xs font-medium text-gray-500 mb-1">{{ t("expenses.to") }}</label>
          <Calendar v-model="to" dateFormat="dd/mm/yy" showIcon class="w-full" inputClass="w-full" @update:modelValue="load" />
        </div>
        <div class="col-span-2 flex-1 min-w-0">
          <label class="block text-xs font-medium text-gray-500 mb-1" for="supplier-search">{{ t("expenses.suppliers.search") }}</label>
          <InputText id="supplier-search" v-model="search" class="w-full" data-testid="supplier-search" />
        </div>
        <Button :label="t('expenses.suppliers.add')" icon="pi pi-plus" class="col-span-2 sm:col-span-1 whitespace-nowrap" data-testid="supplier-add" @click="openNew" />
      </div>
    </div>

    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 sm:p-6">
      <div class="flex justify-between items-center mb-4 flex-wrap gap-2 px-1 sm:px-0">
        <span class="text-sm text-gray-500">{{ t("expenses.suppliers.count", { n: shown.length }) }}</span>
        <div class="flex items-center gap-3 flex-wrap">
          <span class="text-lg font-bold text-gray-900 tabular-nums" data-testid="suppliers-total">
            {{ t("expenses.suppliers.paidTotal") }}: {{ formatMoney(shownTotal) }}
          </span>
          <Button
            :label="t('expenses.export')"
            icon="pi pi-file-excel"
            severity="secondary"
            outlined
            size="small"
            class="whitespace-nowrap"
            :disabled="!shown.length"
            :loading="exporting"
            data-testid="suppliers-export"
            @click="exportExcel"
          />
        </div>
      </div>

      <DataTable
        v-model:expandedRows="expanded"
        :value="shown"
        dataKey="id"
        :loading="loading"
        class="p-datatable-sm"
        responsiveLayout="scroll"
        data-testid="suppliers-table"
        @rowExpand="onRowExpand"
      >
        <template #empty>
          <div class="text-center py-12 text-gray-400">{{ t(suppliers.length ? "expenses.suppliers.noMatch" : "expenses.suppliers.none") }}</div>
        </template>
        <Column expander style="width: 3rem" />
        <Column field="name" :header="t('expenses.suppliers.name')">
          <template #body="{ data }">
            <span class="font-medium text-gray-900">{{ data.name }}</span>
            <Tag v-if="!data.is_active" :value="t('expenses.suppliers.removed')" severity="secondary" class="ml-2" />
            <div v-if="data.phone || data.vat_number" class="text-xs text-gray-500 mt-0.5">
              <span v-if="data.phone">{{ data.phone }}</span>
              <span v-if="data.phone && data.vat_number"> · </span>
              <span v-if="data.vat_number">{{ t("expenses.suppliers.vatShort") }} {{ data.vat_number }}</span>
            </div>
            <div class="md:hidden text-xs text-gray-500 mt-0.5">
              {{ t("expenses.suppliers.orders", { n: data.orders }, data.orders) }}<template v-if="data.last_paid"> · {{ formatDate(data.last_paid) }}</template>
            </div>
          </template>
        </Column>
        <Column field="orders" :header="t('expenses.suppliers.ordersHeader')" headerClass="hidden md:table-cell text-right" bodyClass="hidden md:table-cell text-right tabular-nums" />
        <Column field="last_paid" :header="t('expenses.suppliers.lastPaid')" headerClass="hidden md:table-cell" bodyClass="hidden md:table-cell">
          <template #body="{ data }">{{ data.last_paid ? formatDate(data.last_paid) : "—" }}</template>
        </Column>
        <Column field="total" :header="t('expenses.suppliers.paid')" headerClass="text-right" bodyClass="text-right tabular-nums whitespace-nowrap font-semibold">
          <template #body="{ data }">{{ formatMoney(data.total) }}</template>
        </Column>
        <Column bodyClass="!px-1 md:!px-3">
          <template #body="{ data }">
            <div v-if="data.is_active" class="flex justify-end gap-0 md:gap-1">
              <Button
                icon="pi pi-plus"
                text
                rounded
                v-tooltip.top="t('expenses.add')"
                :aria-label="t('expenses.add')"
                :data-testid="`supplier-add-expense-${data.id}`"
                @click="emit('addExpense', data)"
              />
              <Button icon="pi pi-pencil" text rounded :aria-label="t('expenses.suppliers.edit')" @click="openEdit(data)" />
              <Button icon="pi pi-trash" text rounded severity="danger" :aria-label="t('expenses.suppliers.remove')" @click="remove(data)" />
            </div>
          </template>
        </Column>

        <template #expansion="{ data }">
          <div class="py-2 sm:px-2" :data-testid="`supplier-orders-${data.id}`">
            <p v-if="data.notes" class="text-sm text-gray-600 whitespace-pre-line mb-3">{{ data.notes }}</p>
            <div v-if="!orders[data.id]" class="text-sm text-gray-400 py-2">…</div>
            <p v-else-if="!orders[data.id].length" class="text-sm text-gray-400 py-2">{{ t("expenses.suppliers.noOrders") }}</p>
            <table v-else class="w-full text-sm">
              <thead>
                <tr class="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th class="py-1.5 pr-3 font-medium">{{ t("expenses.date") }}</th>
                  <th class="py-1.5 pr-3 font-medium">{{ t("expenses.description") }}</th>
                  <th class="py-1.5 pr-3 font-medium hidden md:table-cell">{{ t("expenses.method") }}</th>
                  <th class="py-1.5 font-medium text-right">{{ t("expenses.amount") }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="o in orders[data.id]" :key="o.id" class="border-b border-gray-50 last:border-0">
                  <td class="py-1.5 pr-3 whitespace-nowrap align-top">{{ o.kind === "monthly" ? formatMonth(o.expense_date) : formatDate(o.expense_date) }}</td>
                  <td class="py-1.5 pr-3 align-top">
                    <span class="whitespace-pre-line">{{ o.description }}</span>
                    <div class="text-xs text-gray-500">
                      {{ t(`expenses.kinds.${o.kind}`) }}<template v-if="o.category_name"> · {{ o.category_name }}</template>
                      <span class="md:hidden"> · {{ t(`common.paymentMethod.${o.payment_method}`) }}</span>
                    </div>
                  </td>
                  <td class="py-1.5 pr-3 align-top hidden md:table-cell">{{ t(`common.paymentMethod.${o.payment_method}`) }}</td>
                  <td class="py-1.5 text-right tabular-nums whitespace-nowrap align-top">{{ formatMoney(o.amount) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </DataTable>
      <p class="text-xs text-gray-400 mt-3">{{ t("expenses.suppliers.note") }}</p>
    </div>

    <SupplierDialog v-model:visible="showDialog" :supplier="editing" @saved="onChanged" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useConfirm } from "primevue/useconfirm";
import { api } from "../../api/http";
import { useNotify } from "../../composables/useNotify";
import { formatDate as dateText, formatMoney } from "../../utils/format";
import { foldText } from "../../utils/text";
import { askConfirm } from "../../utils/confirm";
import { exportXlsx } from "../../utils/exportXlsx";
import { toLocalDateStr } from "../../utils/staffAvailability";
import { useSettingsStore } from "../../stores/settings";
import SupplierDialog from "./SupplierDialog.vue";

// changed: the supplier list changed (added, edited, removed), so the expense
// dialog's picker reloads. addExpense: the screen's expense dialog opens for
// that supplier, and calls load() once it's saved.
const emit = defineEmits<{ changed: []; addExpense: [supplier: any] }>();
const { t, locale } = useI18n();
const notify = useNotify();
const confirm = useConfirm();
const settingsStore = useSettingsStore();

// Opens on this year, like the monthly expenses.
const year = new Date().getFullYear();
const from = ref<Date | null>(new Date(year, 0, 1));
const to = ref<Date | null>(new Date(year, 11, 31));
const search = ref("");
const suppliers = ref<any[]>([]);
const loading = ref(false);
const expanded = ref<Record<string, boolean>>({});
// Each supplier's expenses in the dates, fetched when its row is opened.
const orders = ref<Record<string, any[]>>({});
const showDialog = ref(false);
const editing = ref<any | null>(null);

const shown = computed(() => {
  const q = foldText(search.value.trim());
  if (!q) return suppliers.value;
  return suppliers.value.filter((s) => [s.name, s.phone, s.vat_number].some((v) => foldText(v).includes(q)));
});
const shownTotal = computed(() => shown.value.reduce((sum, s) => sum + Number(s.total), 0));

const formatDate = (iso: string) => dateText(iso, locale.value);
const formatMonth = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(locale.value === "el" ? "el-GR" : "en-GB", { month: "long", year: "numeric" });

const query = () => {
  const params = new URLSearchParams();
  if (from.value) params.append("from", toLocalDateStr(from.value));
  if (to.value) params.append("to", toLocalDateStr(to.value));
  if (settingsStore.hideCashPaid) params.append("excludeCash", "true");
  if (settingsStore.hideCardPaid) params.append("excludeCard", "true");
  return params.toString();
};

let latest = 0;
const load = async () => {
  const request = ++latest;
  loading.value = true;
  // Opened rows fetch their expenses again for the new dates.
  orders.value = {};
  try {
    const data = await api.get(`/api/v1/suppliers/summary?${query()}`);
    if (request !== latest) return;
    suppliers.value = data;
    await Promise.all(Object.keys(expanded.value).map(loadOrders));
  } catch {
    if (request === latest) notify.error(t("expenses.failed"));
  } finally {
    if (request === latest) loading.value = false;
  }
};
const loadOrders = async (id: string) => {
  try {
    const data = await api.get(`/api/v1/suppliers/${id}/expenses?${query()}`);
    orders.value = { ...orders.value, [id]: data };
  } catch {
    notify.error(t("expenses.failed"));
  }
};

const onRowExpand = (e: { data: { id: string } }) => loadOrders(e.data.id);

// The suppliers shown (the search applies) with their totals, and every
// payment to them in the dates (Ctrl+1 / Ctrl+8 apply, as on screen).
const exporting = ref(false);
const exportExcel = async () => {
  exporting.value = true;
  try {
    const list = shown.value;
    const withOrders = list.filter((s) => Number(s.orders) > 0);
    const payments = await Promise.all(withOrders.map((s) => api.get(`/api/v1/suppliers/${s.id}/expenses?${query()}`) as Promise<any[]>));
    const supplierRows = list.map((s) => ({
      [t("expenses.suppliers.name")]: s.name,
      [t("expenses.suppliers.phone")]: s.phone || "",
      [t("expenses.suppliers.vat")]: s.vat_number || "",
      [t("expenses.suppliers.ordersHeader")]: Number(s.orders) || 0,
      [t("expenses.suppliers.lastPaid")]: s.last_paid ? formatDate(s.last_paid) : "",
      [t("expenses.suppliers.paid")]: Number(s.total) || 0,
      [t("expenses.suppliers.removed")]: s.is_active ? "" : "✓",
    }));
    const paymentRows = withOrders.flatMap((s, i) =>
      payments[i].map((o) => ({
        [t("expenses.suppliers.name")]: s.name,
        [t("expenses.date")]: o.kind === "monthly" ? formatMonth(o.expense_date) : formatDate(o.expense_date),
        [t("expenses.suppliers.kind")]: t(`expenses.kinds.${o.kind}`),
        [t("expenses.category")]: o.category_name || "",
        [t("expenses.description")]: o.description,
        [t("expenses.method")]: t(`common.paymentMethod.${o.payment_method}`),
        [t("expenses.amount")]: Number(o.amount),
      })),
    );
    const span = [from.value, to.value].map((d) => (d ? toLocalDateStr(d) : "")).filter(Boolean).join("_");
    await exportXlsx(`suppliers${span ? `_${span}` : ""}.xlsx`, [
      { name: t("expenses.suppliers.sheetSuppliers"), rows: supplierRows, fitColumns: true },
      { name: t("expenses.suppliers.sheetOrders"), rows: paymentRows, fitColumns: true },
    ]);
  } catch {
    notify.error(t("expenses.failed"));
  } finally {
    exporting.value = false;
  }
};

const openNew = () => {
  editing.value = null;
  showDialog.value = true;
};
const openEdit = (s: any) => {
  editing.value = s;
  showDialog.value = true;
};
const onChanged = async () => {
  emit("changed");
  await load();
};
const remove = async (s: any) => {
  const ok = await askConfirm(confirm, {
    header: t("expenses.suppliers.remove"),
    message: t("expenses.suppliers.removeConfirm", { name: s.name }),
    icon: "pi pi-exclamation-triangle",
    acceptClass: "p-button-danger",
  });
  if (!ok) return;
  try {
    await api.del(`/api/v1/suppliers/${s.id}`);
    await onChanged();
  } catch {
    notify.error(t("expenses.failed"));
  }
};

defineExpose({ load });
onMounted(load);
watch(() => [settingsStore.hideCashPaid, settingsStore.hideCardPaid], load);
</script>
