<template>
  <Dialog
    :visible="visible"
    modal
    :header="kind ? t(`analytics.details.${kind}.title`) : ''"
    :style="{ width: '56rem', maxWidth: '95vw' }"
    :closeOnEscape="closeOnEscape"
    data-testid="details-dialog"
    @update:visible="(v: boolean) => emit('update:visible', v)"
  >
    <p class="text-xs text-gray-500 mb-3">{{ kind ? t(`analytics.details.${kind}.note`) : "" }}</p>
    <div class="flex items-center justify-between gap-3 mb-3 flex-wrap">
      <div class="flex items-center gap-2 flex-wrap">
        <InputText v-model="search" size="small" :placeholder="t('analytics.details.search')" data-testid="details-search" />
        <Button
          icon="pi pi-file-excel"
          :label="t('analytics.details.export')"
          severity="secondary"
          outlined
          size="small"
          :disabled="!shown.length"
          data-testid="details-export"
          @click="exportExcel"
        />
      </div>
      <span class="font-bold text-gray-900" data-testid="details-total">{{ headline }}</span>
    </div>
    <DataTable
      :value="shown"
      :loading="loading"
      dataKey="key"
      class="p-datatable-sm"
      responsiveLayout="scroll"
      :paginator="true"
      :alwaysShowPaginator="false"
      :rows="15"
      rowHover
      :rowClass="(r: any) => (r.client_id ? 'cursor-pointer' : '')"
      data-testid="details-table"
      @row-click="(e: any) => e.data.client_id && emit('open-client', e.data.client_id)"
    >
      <template #empty><span class="text-sm text-gray-400">{{ t("analytics.details.none") }}</span></template>
      <Column v-for="col in columns" :key="col.field" :field="col.field" :header="t(`analytics.details.col.${col.field}`)" sortable :sortField="col.sortField">
        <template #body="{ data }">
          <template v-if="col.field === 'client'">
            <div class="font-medium uppercase">{{ data.client || "—" }}</div>
            <div v-if="data.phone" class="text-xs text-gray-400">{{ data.phone }}</div>
          </template>
          <span v-else-if="col.type === 'money'" class="tabular-nums whitespace-nowrap" :class="Number(data[col.field]) < 0 ? 'text-red-600' : ''">
            {{ formatMoney(data[col.field]) }}
          </span>
          <span v-else class="whitespace-pre-line">{{ display(data, col) }}</span>
        </template>
      </Column>
    </DataTable>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useToast } from "primevue/usetoast";
import { api } from "../api/http";
import { formatMoney } from "../utils/format";

// The list behind one Analytics tile, for the dates and filters the tile was
// loaded with (`query`), from GET /reports/finances/details.
export type DetailKind = "sales" | "payments" | "today" | "debts" | "expenses" | "net" | "cancellations" | "retention";
type Col = { field: string; type?: "money" | "date" | "datetime" | "method" | "type" | "status" | "line" | "returning"; sortField?: string };

const props = defineProps<{ visible: boolean; kind: DetailKind | null; query: string; closeOnEscape?: boolean }>();
const emit = defineEmits<{ "update:visible": [boolean]; "open-client": [string] }>();
const { t, te, locale } = useI18n();
const toast = useToast();

const money = (field: string): Col => ({ field, type: "money" });
const COLUMNS: Record<DetailKind, Col[]> = {
  sales: [{ field: "date", type: "datetime" }, { field: "client" }, { field: "services" }, money("value")],
  debts: [{ field: "date", type: "datetime" }, { field: "client" }, { field: "services" }, money("value"), money("paid"), money("owed")],
  payments: [{ field: "date", type: "datetime" }, { field: "client" }, { field: "method", type: "method" }, { field: "type", type: "type" }, money("amount")],
  today: [{ field: "date", type: "datetime" }, { field: "client" }, { field: "method", type: "method" }, { field: "type", type: "type" }, money("amount")],
  expenses: [{ field: "date", type: "date" }, { field: "description" }, { field: "category" }, { field: "method", type: "method" }, money("amount")],
  net: [{ field: "date", type: "datetime" }, { field: "line", type: "line" }, { field: "description" }, { field: "method", type: "method" }, money("amount")],
  cancellations: [{ field: "date", type: "datetime" }, { field: "client" }, { field: "services" }, { field: "status", type: "status" }],
  retention: [{ field: "client" }, { field: "returning", type: "returning" }, { field: "bookings" }],
};
const columns = computed(() => (props.kind ? COLUMNS[props.kind] : []));

const rows = ref<any[]>([]);
const total = ref<number | null>(null);
const summary = ref<any>(null);
const loading = ref(false);
const search = ref("");

const dateLocale = computed(() => (locale.value === "el" ? "el-GR" : "en-GB"));
const STATUS_KEYS: Record<string, string> = { "no-show": "noShow", "no-response": "noResponse" };
const display = (row: any, col: Col): string => {
  const v = row[col.field];
  switch (col.type) {
    case "datetime":
      return v ? new Date(v).toLocaleString(dateLocale.value, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "—";
    case "date":
      return v ? new Date(String(v).slice(0, 10) + "T00:00:00").toLocaleDateString(dateLocale.value, { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
    case "method":
      return v ? (te(`common.paymentMethod.${v}`) ? t(`common.paymentMethod.${v}`) : v) : "—";
    case "type":
      if (te(`dailyReport.types.${v}`)) return t(`dailyReport.types.${v}`);
      return t(Number(row.amount) < 0 ? "dailyReport.types.refund" : "dailyReport.types.payment");
    case "status":
      return t(`common.status.${STATUS_KEYS[v] || v}`);
    case "line":
      return t(`analytics.details.line.${v}`);
    case "returning":
      return t(v ? "analytics.details.returningClient" : "analytics.details.newClient");
    default:
      return v === null || v === undefined || v === "" ? "—" : String(v);
  }
};

// Greek names are often typed without accents or in capitals.
const plain = (v: string) => v.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/ς/g, "σ");
const shown = computed(() => {
  const words = plain(search.value).split(/\s+/).filter(Boolean);
  if (!words.length) return rows.value;
  return rows.value.filter((r) => {
    const text = plain(columns.value.map((c) => display(r, c)).concat(r.client || "", r.phone || "").join(" "));
    return words.every((w) => text.includes(w));
  });
});

const moneyField = computed(() => columns.value.filter((c) => c.type === "money").pop()?.field || null);
const headline = computed(() => {
  if (summary.value && props.kind === "cancellations") {
    return t("analytics.details.cancellationsSummary", summary.value);
  }
  if (summary.value && props.kind === "retention") {
    return t("analytics.details.retentionSummary", summary.value);
  }
  const field = moneyField.value;
  const value = search.value.trim() && field ? shown.value.reduce((n, r) => n + Number(r[field] || 0), 0) : total.value;
  return `${t("analytics.details.total")}: ${formatMoney(value || 0)}`;
});

let latest = 0;
const load = async () => {
  if (!props.kind) return;
  const request = ++latest;
  loading.value = true;
  rows.value = [];
  summary.value = null;
  total.value = null;
  try {
    const sep = props.query ? "&" : "?";
    const data = await api.get(`/api/v1/reports/finances/details${props.query}${sep}kind=${props.kind}`);
    if (request !== latest) return;
    rows.value = data.rows.map((r: any, i: number) => ({ ...r, key: `${i}-${r.id || r.appointment_id || r.client_id}` }));
    total.value = data.total ?? null;
    summary.value = data.summary ?? null;
  } catch (e: any) {
    if (request === latest) toast.add({ severity: "error", summary: t("common.error"), detail: e.message, life: 3500 });
  } finally {
    if (request === latest) loading.value = false;
  }
};
watch(
  () => [props.visible, props.kind, props.query],
  () => {
    if (!props.visible) return;
    search.value = "";
    load();
  },
);
defineExpose({ reload: load });

// The file holds every row the search leaves, not just the page shown.
const exportExcel = async () => {
  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.json_to_sheet(
    shown.value.map((r) =>
      Object.fromEntries(
        columns.value.map((c) => [t(`analytics.details.col.${c.field}`), c.type === "money" ? Number(r[c.field] || 0) : display(r, c)]),
      ),
    ),
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, t(`analytics.details.${props.kind}.title`).slice(0, 31));
  const dates = new URLSearchParams(props.query.replace(/^\?/, ""));
  const day = (v: string | null) => (v ? new Date(v).toLocaleDateString("en-CA") : "");
  XLSX.writeFile(wb, `${props.kind}_${day(dates.get("from")) || "all"}_${day(dates.get("to")) || "all"}.xlsx`);
};
</script>
