<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">{{ t("dailyReport.title") }}</h1>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <!-- The day shown: previous/next, back to today, or the full calendar -->
        <button
          type="button"
          class="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
          :title="t('dailyReport.previousDay')"
          :aria-label="t('dailyReport.previousDay')"
          data-testid="daily-prev"
          @click="shiftDay(-1)"
        >
          <i class="pi pi-chevron-left text-sm"></i>
        </button>
        <button
          type="button"
          class="px-3 py-1.5 text-xs font-bold text-[var(--p-primary-700)] bg-[var(--p-primary-50)] hover:bg-[var(--p-primary-100)] rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          :disabled="isToday"
          data-testid="daily-today"
          @click="goToDay(new Date())"
        >
          {{ t("scheduler.nav.today") }}
        </button>
        <button
          type="button"
          class="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          :disabled="isToday"
          :title="t('dailyReport.nextDay')"
          :aria-label="t('dailyReport.nextDay')"
          data-testid="daily-next"
          @click="shiftDay(1)"
        >
          <i class="pi pi-chevron-right text-sm"></i>
        </button>
        <div class="relative">
          <button
            type="button"
            class="flex items-center gap-1 text-sm md:text-base font-bold text-gray-800 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
            data-testid="daily-date"
            @click.stop="showPicker = !showPicker"
          >
            {{ dayLabel }}
            <i class="pi pi-chevron-down text-[10px] text-gray-400"></i>
          </button>
          <div
            v-if="showPicker"
            class="fixed left-1/2 -translate-x-1/2 top-32 sm:absolute sm:left-auto sm:translate-x-0 sm:top-full sm:right-0 sm:mt-2 z-50 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden"
            data-testid="daily-calendar"
            @click.stop
          >
            <DatePicker
              inline
              :modelValue="selectedDay"
              dateFormat="dd/mm/yy"
              :maxDate="new Date()"
              @update:modelValue="(d: any) => d && goToDay(d)"
            />
          </div>
        </div>
        <Button icon="pi pi-refresh" :label="t('dailyReport.refresh')" :loading="loading" @click="load" />
      </div>
    </div>

    <div v-if="data" class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div class="bg-gradient-to-br from-gray-900 to-gray-800 text-white rounded-2xl p-6 sm:col-span-1">
        <div class="text-xs uppercase tracking-wider opacity-70 font-bold">{{ t("dailyReport.collected") }}</div>
        <div class="text-4xl font-extrabold mt-1">{{ formatMoney(data.total_collected) }}</div>
      </div>
      <div class="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
        <div class="text-xs uppercase tracking-wider text-gray-400 font-bold mb-2">{{ t("dailyReport.byMethod") }}</div>
        <div v-if="!data.by_method.length" class="text-sm text-gray-400">—</div>
        <div v-for="m in data.by_method" :key="m.method" class="flex justify-between text-sm py-0.5">
          <span class="text-gray-600 capitalize">{{ methodLabel(m.method) }}</span>
          <span class="font-semibold">{{ formatMoney(m.amount) }}</span>
        </div>
      </div>
      <div class="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
        <div class="text-xs uppercase tracking-wider text-gray-400 font-bold mb-2">{{ t("dailyReport.appointments") }}</div>
        <div class="text-3xl font-extrabold text-gray-900">{{ data.appointment_count }}</div>
        <div class="flex flex-wrap gap-1 mt-2">
          <span
            v-for="(n, status) in data.by_status"
            :key="status"
            class="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-700"
          >
            {{ statusLabel(String(status)) }}: {{ n }}
          </span>
        </div>
      </div>
    </div>

    <div v-if="data" class="bg-white border border-gray-100 rounded-2xl shadow-sm p-6">
      <div class="flex items-center justify-between flex-wrap gap-3 mb-3">
        <h2 class="font-bold text-gray-800">{{ t("dailyReport.paymentsToday") }}</h2>
        <div class="flex items-center gap-2 flex-wrap">
          <InputText
            v-model="search"
            size="small"
            :placeholder="t('dailyReport.searchPayments')"
            data-testid="daily-search"
          />
          <Button
            icon="pi pi-file-excel"
            :label="t('dailyReport.exportExcel')"
            severity="secondary"
            size="small"
            :disabled="!shownPayments.length"
            data-testid="daily-export"
            @click="exportExcel"
          />
        </div>
      </div>
      <DataTable
        v-model:first="firstRow"
        v-model:sortField="sortField"
        v-model:sortOrder="sortOrder"
        :value="shownPayments"
        dataKey="id"
        size="small"
        paginator
        :alwaysShowPaginator="false"
        :rows="10"
        :rowsPerPageOptions="[10, 25, 50]"
        responsiveLayout="scroll"
        data-testid="daily-payments"
      >
        <template #empty>
          <span class="text-sm text-gray-400">{{ t(payments.length ? "dailyReport.noSearchResults" : "dailyReport.noPayments") }}</span>
        </template>
        <Column field="created_at" :header="t('dailyReport.time')" sortable>
          <template #body="{ data: p }"><span class="whitespace-nowrap">{{ p.time }}</span></template>
        </Column>
        <Column field="client" :header="t('dailyReport.client')" sortable />
        <Column field="method" :header="t('dailyReport.method')" sortable />
        <Column field="type" :header="t('dailyReport.type')" sortable />
        <Column field="amount" :header="t('dailyReport.amount')" sortable bodyClass="font-semibold">
          <template #body="{ data: p }">{{ formatMoney(p.amount) }}</template>
        </Column>
      </DataTable>
    </div>
  </div>
</template>

<script setup lang="ts">
import { api, withMessage } from "../api/http";
import { formatMoney } from "../utils/format";
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useToast } from "primevue/usetoast";
import { useSettingsStore } from "../stores/settings";
import { toLocalDateStr } from "../utils/staffAvailability";

const { t, te, locale } = useI18n();
const toast = useToast();
const settingsStore = useSettingsStore();
const data = ref<any>(null);
const loading = ref(false);

// The day shown: today when the page opens; today and earlier can be picked.
const selectedDay = ref(new Date());
const showPicker = ref(false);
const isToday = computed(() => toLocalDateStr(selectedDay.value) >= toLocalDateStr(new Date()));
const dayLabel = computed(() =>
  selectedDay.value.toLocaleDateString(locale.value, { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
);
const goToDay = (day: Date) => {
  showPicker.value = false;
  selectedDay.value = new Date(day);
  load();
};
const shiftDay = (days: number) => {
  const next = new Date(selectedDay.value);
  next.setDate(next.getDate() + days);
  if (toLocalDateStr(next) <= toLocalDateStr(new Date())) goToDay(next);
};
const closePicker = () => (showPicker.value = false);
const fmtTime = (d: string) =>
  new Date(d).toLocaleTimeString(locale.value, { hour: "2-digit", minute: "2-digit" });

const STATUS_KEYS: Record<string, string> = { "no-show": "noShow", "no-response": "noResponse" };
const statusLabel = (s: string) => t(`common.status.${STATUS_KEYS[s] || s}`);

const methodLabel = (m: string | null) => {
  if (!m) return "—";
  return te(`common.paymentMethod.${m}`) ? t(`common.paymentMethod.${m}`) : m;
};
const typeLabel = (p: any) => {
  if (te(`dailyReport.types.${p.transaction_type}`)) return t(`dailyReport.types.${p.transaction_type}`);
  return t(Number(p.amount) < 0 ? "dailyReport.types.refund" : "dailyReport.types.payment");
};

// The payments table: search, sort and paging all happen on the day's rows.
const search = ref("");
const firstRow = ref(0);
const sortField = ref("created_at");
const sortOrder = ref(-1);
const payments = computed(() =>
  (data.value?.payments || []).map((p: any) => ({
    id: p.id,
    created_at: p.created_at,
    time: fmtTime(p.created_at),
    client: [p.first_name, p.last_name].filter(Boolean).join(" ") || "—",
    method: methodLabel(p.payment_method),
    type: typeLabel(p),
    amount: Number(p.amount),
  })),
);
// Greek names are often typed without accents or in capitals.
const plain = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/ς/g, "σ");
const shownPayments = computed(() => {
  const words = plain(search.value).split(/\s+/).filter(Boolean);
  if (!words.length) return payments.value;
  return payments.value.filter((p: any) => {
    const text = plain([p.time, p.client, p.method, p.type, p.amount, formatMoney(p.amount)].join(" "));
    return words.every((w) => text.includes(w));
  });
});
watch([search, data], () => (firstRow.value = 0));

// The file holds every row the search leaves, in the table's order, not just the page.
const exportExcel = async () => {
  const field = sortField.value as "created_at" | "client" | "method" | "type" | "amount";
  const rows = [...shownPayments.value].sort((a: any, b: any) => {
    const order = field === "amount" ? a.amount - b.amount : String(a[field]).localeCompare(String(b[field]), locale.value);
    return order * sortOrder.value;
  });
  const day = toLocalDateStr(selectedDay.value);
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(
    rows.map((p: any) => ({
      [t("dailyReport.date")]: day.split("-").reverse().join("/"),
      [t("dailyReport.time")]: p.time,
      [t("dailyReport.client")]: p.client,
      [t("dailyReport.method")]: p.method,
      [t("dailyReport.type")]: p.type,
      [t("dailyReport.amount")]: p.amount,
    })),
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, t("dailyReport.sheetName"));
  XLSX.writeFile(wb, `daily_payments_${day}.xlsx`);
};

// Quick clicks through the days: only the latest day's answer is shown.
let latestLoad = 0;
const load = async () => {
  const thisLoad = ++latestLoad;
  loading.value = true;
  try {
    const params = new URLSearchParams({ date: toLocalDateStr(selectedDay.value) });
    if (settingsStore.hideCashPaid) params.append("excludeCash", "true");
    if (settingsStore.hideCardPaid) params.append("excludeCard", "true");
    const answer = await api.get(`/api/v1/reports/daily?${params}`).catch(withMessage("Failed"));
    if (thisLoad === latestLoad) data.value = answer;
  } catch (e: any) {
    if (thisLoad === latestLoad) toast.add({ severity: "error", summary: t("common.error"), detail: e.message, life: 3500 });
  } finally {
    if (thisLoad === latestLoad) loading.value = false;
  }
};

onMounted(() => {
  load();
  document.addEventListener("click", closePicker);
});
onUnmounted(() => document.removeEventListener("click", closePicker));
watch(() => [settingsStore.hideCashPaid, settingsStore.hideCardPaid], load);
</script>
