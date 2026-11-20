<template>
  <div class="space-y-6" data-testid="bonus-report">
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-[var(--p-primary-50)] flex items-center justify-center flex-shrink-0">
          <i class="pi pi-star text-[var(--p-primary-600)]"></i>
        </div>
        <div class="min-w-0">
          <h1 class="text-xl sm:text-2xl font-bold text-gray-900">{{ t("bonus.title") }}</h1>
          <p class="text-sm text-gray-500 mt-0.5">{{ t("bonus.subtitle") }}</p>
        </div>
      </div>

      <div class="grid grid-cols-2 sm:flex sm:flex-row gap-3 sm:items-end mt-4 sm:mt-6">
        <div class="flex-1 min-w-0">
          <label class="block text-xs font-medium text-gray-500 mb-1">{{ t("bonus.from") }}</label>
          <Calendar v-model="from" dateFormat="dd/mm/yy" showIcon class="w-full" inputClass="w-full" data-testid="bonus-report-from" @update:modelValue="load" />
        </div>
        <div class="flex-1 min-w-0">
          <label class="block text-xs font-medium text-gray-500 mb-1">{{ t("bonus.to") }}</label>
          <Calendar v-model="to" dateFormat="dd/mm/yy" showIcon class="w-full" inputClass="w-full" data-testid="bonus-report-to" @update:modelValue="load" />
        </div>
        <Button
          :label="t('bonus.export')"
          icon="pi pi-file-excel"
          severity="secondary"
          outlined
          class="col-span-2 sm:col-span-1 whitespace-nowrap"
          :disabled="!report?.staff.length"
          data-testid="bonus-export"
          @click="exportExcel"
        />
      </div>
      <p class="text-xs text-gray-400 mt-3">{{ t("bonus.rule") }}</p>
    </div>

    <!-- The shop's review counts per month, for the review bonus. -->
    <div v-if="reviewMonths.length" class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6" data-testid="bonus-reviews">
      <div class="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 class="text-sm font-bold text-gray-800">{{ t("bonus.reviews.countsTitle") }}</h2>
        <span class="text-xs text-gray-400">{{ t("bonus.reviews.countsNote") }}</span>
      </div>
      <div v-for="m in reviewMonths" :key="m.month" class="grid grid-cols-2 sm:grid-cols-[10rem_minmax(0,1fr)_minmax(0,1fr)_8rem] gap-3 items-end mt-3" :data-testid="`bonus-reviews-${m.month}`">
        <div class="col-span-2 sm:col-span-1 text-sm font-medium text-gray-700 sm:pb-2.5 capitalize">{{ monthText(m.month) }}</div>
        <div class="min-w-0">
          <label class="block text-xs font-medium text-gray-500 mb-1">{{ t("bonus.reviews.start") }}</label>
          <InputNumber v-model="m.start_count" :min="0" :useGrouping="false" class="w-full" inputClass="w-full" :data-testid="`reviews-start-${m.month}`" />
        </div>
        <div class="min-w-0">
          <label class="block text-xs font-medium text-gray-500 mb-1">{{ t("bonus.reviews.end") }}</label>
          <InputNumber v-model="m.end_count" :min="0" :useGrouping="false" class="w-full" inputClass="w-full" :data-testid="`reviews-end-${m.month}`" />
        </div>
        <div class="col-span-2 sm:col-span-1 text-sm sm:pb-2.5" :class="gained(m) == null ? 'text-gray-400' : 'text-gray-800'" :data-testid="`reviews-gained-${m.month}`">
          <template v-if="badCounts(m)"><span class="text-red-600">{{ t("bonus.reviews.endBelowStart") }}</span></template>
          <template v-else-if="gained(m) == null">—</template>
          <template v-else>{{ t("bonus.reviews.gained", { n: gained(m) }, gained(m) as number) }}</template>
        </div>
      </div>
      <div class="flex justify-end mt-4">
        <Button
          :label="t('common.save')"
          icon="pi pi-check"
          size="small"
          :loading="savingReviews"
          :disabled="!reviewsChanged || reviewMonths.some(badCounts)"
          data-testid="bonus-reviews-save"
          @click="saveReviews"
        />
      </div>
    </div>

    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 sm:p-6">
      <div class="flex justify-between items-baseline mb-4 flex-wrap gap-2 px-1 sm:px-0">
        <span class="text-sm text-gray-500">{{ t("bonus.count", { n: rows.length }) }}</span>
        <span class="text-lg font-bold text-gray-900 tabular-nums" data-testid="bonus-total">
          {{ t("bonus.total") }}: {{ formatMoney(report?.total || 0) }}
        </span>
      </div>

      <DataTable v-model:expandedRows="expanded" :value="rows" dataKey="staff_id" :loading="loading" class="p-datatable-sm" responsiveLayout="scroll" data-testid="bonus-table">
        <template #empty><div class="text-center py-12 text-gray-400">{{ t("bonus.empty") }}</div></template>
        <Column expander style="width: 3rem" />
        <Column field="staff_name" :header="t('bonus.staff')">
          <template #body="{ data }">
            <span class="font-medium text-gray-900">{{ data.staff_name }}</span>
            <div class="md:hidden text-xs text-gray-500 mt-0.5">
              {{ t("bonus.days", { n: data.days_worked }, data.days_worked) }} · {{ hours(data.minutes) }} · {{ t("bonus.extraShort") }} {{ hours(data.extra_minutes) }}
            </div>
          </template>
        </Column>
        <Column field="days_worked" :header="t('bonus.daysHeader')" headerClass="hidden md:table-cell text-right" bodyClass="hidden md:table-cell text-right tabular-nums" />
        <Column field="minutes" :header="t('bonus.hours')" headerClass="hidden md:table-cell text-right" bodyClass="hidden md:table-cell text-right tabular-nums">
          <template #body="{ data }">{{ hours(data.minutes) }}</template>
        </Column>
        <Column field="extra_minutes" :header="t('bonus.extraHours')" headerClass="hidden md:table-cell text-right" bodyClass="hidden md:table-cell text-right tabular-nums">
          <template #body="{ data }">{{ hours(data.extra_minutes) }}</template>
        </Column>
        <Column field="hours_bonus" :header="t('bonus.hoursBonus')" headerClass="hidden md:table-cell text-right" bodyClass="hidden md:table-cell text-right tabular-nums whitespace-nowrap">
          <template #body="{ data }">{{ formatMoney(data.hours_bonus) }}</template>
        </Column>
        <Column field="products_bonus" :header="t('bonus.productsBonus')" headerClass="hidden md:table-cell text-right" bodyClass="hidden md:table-cell text-right tabular-nums whitespace-nowrap">
          <template #body="{ data }">{{ formatMoney(data.products_bonus) }}</template>
        </Column>
        <Column field="target_bonus" :header="t('bonus.targetBonus')" headerClass="hidden md:table-cell text-right" bodyClass="hidden md:table-cell text-right tabular-nums whitespace-nowrap">
          <template #body="{ data }">{{ formatMoney(data.target_bonus) }}</template>
        </Column>
        <Column field="reviews_bonus" :header="t('bonus.reviewsBonus')" headerClass="hidden md:table-cell text-right" bodyClass="hidden md:table-cell text-right tabular-nums whitespace-nowrap">
          <template #body="{ data }">{{ formatMoney(data.reviews_bonus) }}</template>
        </Column>
        <Column field="bonus" :header="t('bonus.bonus')" headerClass="text-right" bodyClass="text-right tabular-nums whitespace-nowrap font-semibold">
          <template #body="{ data }">{{ formatMoney(data.bonus) }}</template>
        </Column>

        <template #expansion="{ data }">
          <div class="py-2 sm:px-2 space-y-3" :data-testid="`bonus-days-${data.staff_id}`">
            <div v-for="d in data.days" :key="d.date" class="border-b border-gray-100 last:border-0 pb-2" data-testid="bonus-day">
              <div class="flex items-baseline justify-between gap-2 flex-wrap">
                <span class="text-sm font-medium text-gray-800">{{ formatDate(d.date) }}</span>
                <span class="text-sm tabular-nums" :class="d.bonus > 0 ? 'font-semibold text-gray-900' : 'text-gray-400'">{{ formatMoney(d.bonus) }}</span>
              </div>
              <div class="text-xs text-gray-500">
                {{ hours(d.minutes) }} · {{ t("bonus.extraShort") }} {{ hours(d.extra_minutes) }} ·
                {{ t("bonus.ruleShort", { hours: hours(d.threshold_minutes), percent: d.kind === "per_hour" ? t("bonus.perHourShort", { amount: number(d.amount_per_hour) }) : `${number(d.percent)}%` }) }}
              </div>
              <table v-if="d.services.length" class="w-full text-xs mt-1.5">
                <tbody>
                  <tr v-for="s in d.services" :key="s.id" class="text-gray-600">
                    <td class="py-0.5 pr-2 whitespace-nowrap tabular-nums align-top">{{ clockTime(s.start_time) }}</td>
                    <td class="py-0.5 pr-2 align-top">
                      {{ s.service_name }}<span v-if="s.client_name" class="text-gray-400"> · {{ s.client_name }}</span>
                      <Tag v-if="s.is_redemption" :value="t('bonus.redemption')" severity="info" class="ml-1 !text-[10px] !py-0" data-testid="bonus-redemption" />
                      <div class="text-gray-400">
                        {{ t(s.is_redemption ? "bonus.servicePartRedemption" : "bonus.servicePart", { part: minutesText(s.extra_minutes), of: minutesText(s.minutes), price: formatMoney(s.price) }) }}
                      </div>
                    </td>
                    <td class="py-0.5 text-right tabular-nums whitespace-nowrap align-top">{{ formatMoney(s.bonus) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-if="data.targets?.length" :data-testid="`bonus-targets-${data.staff_id}`">
              <div class="text-sm font-medium text-gray-800 mb-1">{{ t("bonus.target.title") }}</div>
              <div v-for="m in data.targets" :key="m.month" class="flex items-baseline justify-between gap-2 text-xs text-gray-600 py-0.5" data-testid="bonus-target-month">
                <span>
                  <span class="capitalize">{{ monthText(m.month) }}</span>:
                  {{ t("bonus.target.sold", { sales: formatMoney(m.sales) }) }}
                  <template v-if="m.reached"> · {{ t("bonus.target.reached", { target: formatMoney(m.reached.target) }) }}</template>
                  <template v-if="m.next"> · {{ t("bonus.target.next", { target: formatMoney(m.next.target), bonus: formatMoney(m.next.bonus), missing: formatMoney(m.next.target - m.sales) }) }}</template>
                </span>
                <span class="tabular-nums whitespace-nowrap" :class="m.bonus > 0 ? 'font-semibold text-gray-900' : 'text-gray-400'">{{ formatMoney(m.bonus) }}</span>
              </div>
            </div>
            <div v-if="data.reviews?.length" :data-testid="`bonus-review-months-${data.staff_id}`">
              <div class="text-sm font-medium text-gray-800 mb-1">{{ t("bonus.reviews.title") }}</div>
              <div v-for="m in data.reviews" :key="m.month" class="flex items-baseline justify-between gap-2 text-xs text-gray-600 py-0.5" data-testid="bonus-review-month">
                <span>
                  <span class="capitalize">{{ monthText(m.month) }}</span>:
                  <template v-if="m.reviews == null">{{ t("bonus.reviews.missing") }}</template>
                  <template v-else>{{ t("bonus.reviews.line", { start: m.start_count, end: m.end_count, n: m.reviews, amount: formatMoney(m.amount_per_review) }) }}</template>
                </span>
                <span class="tabular-nums whitespace-nowrap" :class="m.bonus > 0 ? 'font-semibold text-gray-900' : 'text-gray-400'">{{ formatMoney(m.bonus) }}</span>
              </div>
            </div>
            <div v-if="data.products.length" :data-testid="`bonus-products-${data.staff_id}`">
              <div class="text-sm font-medium text-gray-800 mb-1">{{ t("bonus.productsTitle") }}</div>
              <table class="w-full text-xs">
                <tbody>
                  <tr v-for="p in data.products" :key="p.id" class="text-gray-600">
                    <td class="py-0.5 pr-2 whitespace-nowrap align-top">{{ formatShortDate(p.day) }}</td>
                    <td class="py-0.5 pr-2 align-top">
                      {{ t("bonus.productLine", { quantity: p.quantity, product: p.product_name || "—", price: formatMoney(p.total_price), percent: number(p.percent) }) }}
                      <div v-if="p.cost != null" class="text-gray-400" data-testid="bonus-product-profit">
                        {{ t("bonus.productProfit", { cost: formatMoney(p.cost), profit: formatMoney(p.base) }) }}
                      </div>
                      <span v-if="p.client_name" class="text-gray-400"> · {{ p.client_name }}</span>
                    </td>
                    <td class="py-0.5 text-right tabular-nums whitespace-nowrap align-top">{{ formatMoney(p.bonus) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </template>
      </DataTable>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { api } from "../api/http";
import { useNotify } from "../composables/useNotify";
import { clockTime, formatDate as dateText, formatMoney } from "../utils/format";
import { exportXlsx } from "../utils/exportXlsx";
import { toLocalDateStr } from "../utils/staffAvailability";

const { t, locale } = useI18n();
const notify = useNotify();

// Opens on this month.
const now = new Date();
const from = ref<Date | null>(new Date(now.getFullYear(), now.getMonth(), 1));
const to = ref<Date | null>(new Date(now.getFullYear(), now.getMonth() + 1, 0));
const report = ref<any>(null);
const loading = ref(false);
const expanded = ref<Record<string, boolean>>({});
const rows = computed(() => report.value?.staff || []);

const formatDate = (iso: string) => dateText(iso, locale.value, "weekdayDayMonth");
const formatShortDate = (iso: string) => dateText(iso, locale.value, "dayMonth");
const monthText = (month: string) => dateText(`${month}-01`, locale.value, "monthYear");
const number = (n: number) => n.toLocaleString(locale.value === "el" ? "el-GR" : "en-GB", { maximumFractionDigits: 2 });
const hours = (minutes: number) => `${number(minutes / 60)} ${t("bonus.hoursShort")}`;
const minutesText = (minutes: number) => `${number(minutes)}′`;

let latest = 0;
const load = async () => {
  if (!from.value || !to.value) return;
  const request = ++latest;
  loading.value = true;
  try {
    const params = new URLSearchParams({ from: toLocalDateStr(from.value), to: toLocalDateStr(to.value) });
    const data = await api.get(`/api/v1/reports/bonus?${params}`);
    if (request === latest) {
      report.value = data;
      reviewMonths.value = (data.review_months || []).map((m: ReviewMonth) => ({ ...m }));
    }
  } catch {
    if (request === latest) notify.error(t("bonus.failed"));
  } finally {
    if (request === latest) loading.value = false;
  }
};

// The review count fields: a copy of the report's, saved together.
type ReviewMonth = { month: string; start_count: number | null; end_count: number | null };
const reviewMonths = ref<ReviewMonth[]>([]);
const savingReviews = ref(false);
const savedCounts = (month: string) => (report.value?.review_months || []).find((m: ReviewMonth) => m.month === month);
const changedMonths = computed(() =>
  reviewMonths.value.filter((m) => {
    const before = savedCounts(m.month);
    return !before || before.start_count !== m.start_count || before.end_count !== m.end_count;
  }),
);
const reviewsChanged = computed(() => changedMonths.value.length > 0);
const badCounts = (m: ReviewMonth) => m.start_count != null && m.end_count != null && m.end_count < m.start_count;
const gained = (m: ReviewMonth) => (m.start_count != null && m.end_count != null ? Math.max(0, m.end_count - m.start_count) : null);
const saveReviews = async () => {
  savingReviews.value = true;
  try {
    for (const m of changedMonths.value) {
      await api.put(`/api/v1/reports/bonus/reviews/${m.month}`, { start_count: m.start_count, end_count: m.end_count });
    }
    notify.success(t("bonus.reviews.saved"));
    await load();
  } catch {
    notify.error(t("bonus.failed"));
  } finally {
    savingReviews.value = false;
  }
};

// Excel sheet names: at most 31 characters, none of : \ / ? * [ ], and no two alike.
const sheetNames = (names: string[]) => {
  const used = new Set<string>();
  return names.map((raw) => {
    const base = raw.replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31) || "—";
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base.slice(0, 31 - String(n).length - 1)} ${n}`;
    used.add(name.toLowerCase());
    return name;
  });
};

// One staff member's sheet: each day (and, under a percent rule, the services
// that earned on it), each product sold, each month's target and review
// bonus, then the total, so the sheet can be handed to them as it is.
const staffSheetRows = (r: any) => {
  const k = (key: string) => t(`bonus.staffSheet.${key}`);
  const row = (o: Record<string, unknown>) => ({
    [k("kind")]: "", [t("bonus.date")]: "", [k("time")]: "", [k("item")]: "", [k("client")]: "",
    [k("minutes")]: "", [k("extraMinutes")]: "", [k("value")]: "", [t("bonus.bonus")]: "", ...o,
  });
  const rows: Record<string, unknown>[] = [];
  for (const d of r.days) {
    rows.push(row({
      [k("kind")]: k("day"),
      [t("bonus.date")]: d.date,
      [k("item")]: t("bonus.staffSheet.dayLine", {
        minutes: number(d.minutes),
        hours: number(d.threshold_minutes / 60),
        rule: d.kind === "per_hour" ? t("bonus.perHourShort", { amount: number(d.amount_per_hour) }) : `${number(d.percent)}%`,
      }),
      [k("minutes")]: d.minutes,
      [k("extraMinutes")]: d.extra_minutes,
      [t("bonus.bonus")]: d.bonus,
    }));
    for (const sv of d.services) {
      rows.push(row({
        [k("kind")]: sv.is_redemption ? `${k("service")} (${t("bonus.redemption")})` : k("service"),
        [t("bonus.date")]: d.date,
        [k("time")]: clockTime(sv.start_time),
        [k("item")]: sv.service_name,
        [k("client")]: sv.client_name || "",
        [k("minutes")]: sv.minutes,
        [k("extraMinutes")]: sv.extra_minutes,
        [k("value")]: sv.price,
        [t("bonus.bonus")]: sv.bonus,
      }));
    }
  }
  for (const p of r.products) {
    rows.push(row({
      [k("kind")]: k("product"),
      [t("bonus.date")]: p.day,
      [k("item")]: [
        t("bonus.staffSheet.productLine", { quantity: p.quantity, product: p.product_name || "—" }),
        p.cost != null ? t("bonus.staffSheet.productCost", { cost: formatMoney(p.cost), profit: formatMoney(p.base), percent: number(p.percent) }) : `${number(p.percent)}%`,
      ].join(" · "),
      [k("client")]: p.client_name || "",
      [k("value")]: p.total_price,
      [t("bonus.bonus")]: p.bonus,
    }));
  }
  for (const m of r.targets || []) {
    rows.push(row({
      [k("kind")]: k("target"),
      [t("bonus.date")]: m.month,
      [k("item")]: t("bonus.staffSheet.targetLine", {
        sales: formatMoney(m.sales),
        reached: m.reached ? t("bonus.staffSheet.targetReached", { target: formatMoney(m.reached.target) }) : "",
      }),
      [k("value")]: m.sales,
      [t("bonus.bonus")]: m.bonus,
    }));
  }
  for (const m of r.reviews || []) {
    rows.push(row({
      [k("kind")]: k("reviews"),
      [t("bonus.date")]: m.month,
      [k("item")]: m.reviews == null
        ? k("reviewsMissing")
        : t("bonus.staffSheet.reviewsLine", { start: m.start_count, end: m.end_count, n: m.reviews, amount: formatMoney(m.amount_per_review) }),
      [t("bonus.bonus")]: m.bonus,
    }));
  }
  rows.push(row({ [k("kind")]: k("total"), [t("bonus.bonus")]: r.bonus }));
  return rows;
};

const exportExcel = () => {
  const names = sheetNames([t("bonus.sheetStaff"), ...rows.value.map((r: any) => r.staff_name)]);
  return exportXlsx(`bonus_${report.value.from}_${report.value.to}.xlsx`, [
    {
      name: names[0],
      fitColumns: true,
      rows: rows.value.map((r: any) => ({
        [t("bonus.staff")]: r.staff_name,
        [t("bonus.daysHeader")]: r.days_worked,
        [t("bonus.hours")]: Math.round((r.minutes / 60) * 100) / 100,
        [t("bonus.extraHours")]: Math.round((r.extra_minutes / 60) * 100) / 100,
        [t("bonus.hoursBonus")]: r.hours_bonus,
        [t("bonus.productsBonus")]: r.products_bonus,
        [t("bonus.targetBonus")]: r.target_bonus,
        [t("bonus.reviewsBonus")]: r.reviews_bonus,
        [t("bonus.bonus")]: r.bonus,
      })),
    },
    ...rows.value.map((r: any, i: number) => ({ name: names[i + 1], fitColumns: true, rows: staffSheetRows(r) })),
  ]);
};

onMounted(load);
</script>
