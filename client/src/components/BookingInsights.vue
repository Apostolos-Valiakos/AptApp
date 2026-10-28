<template>
  <div class="space-y-6">
    <div v-if="!loading && (!insights || insights.averages?.bookings === 0)" class="text-center text-gray-400 py-12">
      {{ t("analytics.insights.empty") }}
    </div>

    <template v-else>
      <!-- Headlines -->
      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div v-for="tile in tiles" :key="tile.key" class="bg-gray-50 rounded-xl border border-gray-100 p-4">
          <div class="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">
            <i :class="['pi', tile.icon]"></i>{{ tile.label }}
          </div>
          <Skeleton v-if="loading" height="1.75rem" width="70%" />
          <template v-else>
            <div class="text-xl font-bold text-gray-900 truncate" :title="tile.value">{{ tile.value }}</div>
            <div class="text-xs text-gray-500 mt-1">{{ tile.note }}</div>
          </template>
        </div>
      </div>

      <div v-if="!loading" class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Bookings per weekday -->
        <section class="bg-white rounded-xl border border-gray-100 p-3 sm:p-5">
          <h3 class="font-bold text-gray-800">{{ t("analytics.insights.weekdaysTitle") }}</h3>
          <p class="text-xs text-gray-400 mb-4">{{ t("analytics.insights.weekdaysNote") }}</p>
          <div class="space-y-2.5">
            <div
              v-for="d in weekdayRows"
              :key="d.weekday"
              class="grid grid-cols-[5rem_1fr_2.5rem] sm:grid-cols-[6.5rem_1fr_4.5rem] items-center gap-2 sm:gap-3 text-sm"
              :title="t('analytics.insights.weekdayTooltip', { bookings: d.bookings, days: d.days })"
            >
              <span :class="d.isTop ? 'font-bold text-gray-900' : 'text-gray-600'">{{ d.name }}</span>
              <div class="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div class="h-full rounded-full bg-[var(--p-primary-color)]" :style="{ width: d.percent + '%' }"></div>
              </div>
              <span class="text-right text-gray-700 tabular-nums">{{ formatNumber(d.average) }}</span>
            </div>
          </div>
        </section>

        <!-- Most booked services -->
        <section class="bg-white rounded-xl border border-gray-100 p-3 sm:p-5">
          <h3 class="font-bold text-gray-800">{{ t("analytics.insights.servicesTitle") }}</h3>
          <p class="text-xs text-gray-400 mb-4">{{ t("analytics.insights.servicesNote") }}</p>
          <div class="space-y-3">
            <div v-for="s in serviceRows" :key="s.service_name" class="text-sm">
              <div class="flex flex-col sm:flex-row sm:justify-between gap-0.5 sm:gap-3 mb-1">
                <span class="font-medium text-gray-800 truncate">{{ s.service_name }}</span>
                <span class="text-gray-500 whitespace-nowrap tabular-nums">
                  {{ t("analytics.insights.bookingsCount", { n: s.bookings }) }} · {{ formatMoney(s.value) }}
                </span>
              </div>
              <div class="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div class="h-full rounded-full bg-[var(--p-primary-color)]" :style="{ width: s.percent + '%' }"></div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <!-- Busiest hours: weekday × hour -->
      <section v-if="!loading && hours.length" class="bg-white rounded-xl border border-gray-100 p-3 sm:p-5">
        <div class="flex flex-wrap items-end justify-between gap-3 mb-4">
          <div>
            <h3 class="font-bold text-gray-800">{{ t("analytics.insights.hoursTitle") }}</h3>
            <p class="text-xs text-gray-400">{{ t("analytics.insights.hoursNote") }}</p>
          </div>
          <div class="flex items-center gap-2 text-xs text-gray-500">
            {{ t("analytics.insights.fewer") }}
            <span class="w-24 h-2.5 rounded-full heat-scale"></span>
            {{ t("analytics.insights.more") }}
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="border-separate" style="border-spacing: 2px">
            <thead>
              <tr>
                <th></th>
                <th v-for="h in hours" :key="h" class="text-[10px] font-semibold text-gray-400 px-0.5">{{ h }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="d in weekdayNames" :key="d.weekday">
                <th class="text-xs font-medium text-gray-600 text-left pr-2 whitespace-nowrap">{{ d.short }}</th>
                <td
                  v-for="h in hours"
                  :key="h"
                  class="w-9 h-7 min-w-[2.25rem] rounded text-center text-[10px] font-semibold tabular-nums"
                  :style="cellStyle(heat(d.weekday, h))"
                  :title="t('analytics.insights.hourTooltip', { day: d.name, from: pad(h), to: pad(h + 1), n: heat(d.weekday, h) })"
                >
                  {{ heat(d.weekday, h) || "" }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Top clients -->
      <div v-if="!loading" class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section v-for="list in clientLists" :key="list.key" class="bg-white rounded-xl border border-gray-100 p-3 sm:p-5">
          <h3 class="font-bold text-gray-800 mb-3">{{ list.title }}</h3>
          <div v-if="list.rows.length === 0" class="text-sm text-gray-400">{{ t("analytics.insights.none") }}</div>
          <div v-else class="overflow-x-auto">
          <table class="w-full text-xs sm:text-sm">
            <thead>
              <tr class="text-xs text-gray-400 text-left">
                <th class="font-semibold pb-2">#</th>
                <th class="font-semibold pb-2">{{ t("analytics.insights.client") }}</th>
                <th class="font-semibold pb-2 text-right">{{ t("analytics.insights.visits") }}</th>
                <th class="font-semibold pb-2 text-right">{{ t("analytics.insights.value") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(c, i) in list.rows" :key="c.id" class="border-t border-gray-50">
                <td class="py-1.5 text-gray-400 tabular-nums">{{ i + 1 }}</td>
                <td class="py-1.5">
                  <div class="font-medium text-gray-800 uppercase">{{ c.name }}</div>
                  <div v-if="c.phone" class="text-xs text-gray-400">{{ c.phone }}</div>
                </td>
                <td class="py-1.5 text-right tabular-nums" :class="list.key === 'visits' ? 'font-bold' : 'text-gray-600'">{{ c.visits }}</td>
                <td class="py-1.5 pl-3 text-right tabular-nums whitespace-nowrap" :class="list.key === 'value' ? 'font-bold' : 'text-gray-600'">{{ formatMoney(c.value) }}</td>
              </tr>
            </tbody>
          </table>
          </div>
        </section>
      </div>
    </template>

    <!-- Regulars not seen lately (all history, whatever the period) -->
    <section v-if="!loading && insights" class="bg-white rounded-xl border border-gray-100 p-3 sm:p-5">
      <h3 class="font-bold text-gray-800">{{ t("analytics.insights.lapsedTitle") }}</h3>
      <p class="text-xs text-gray-400 mb-3">{{ t("analytics.insights.lapsedNote") }}</p>
      <div v-if="lapsed.length === 0" class="text-sm text-gray-400">{{ t("analytics.insights.none") }}</div>
      <DataTable v-else :value="lapsed" paginator :rows="10" stripedRows class="p-datatable-sm" responsiveLayout="scroll">
        <Column field="name" :header="t('analytics.insights.client')">
          <template #body="{ data }"><span class="font-medium uppercase">{{ data.name }}</span></template>
        </Column>
        <Column field="phone" :header="t('common.phone')" />
        <Column field="visits" :header="t('analytics.insights.visits')" sortable class="text-right" />
        <Column field="last_visit" :header="t('analytics.insights.lastVisit')" sortable>
          <template #body="{ data }">{{ formatDay(data.last_visit, dateLocale) }}</template>
        </Column>
        <Column field="days_since" :header="t('analytics.insights.daysSince')" sortable class="text-right" />
      </DataTable>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import Skeleton from "primevue/skeleton";
import { formatDay, formatMoney } from "../utils/format";

const props = defineProps<{ insights: any | null; loading: boolean }>();

const { t, locale } = useI18n();
const dateLocale = computed(() => (locale.value === "el" ? "el-GR" : "en-GB"));
const pad = (h: number) => `${String(h).padStart(2, "0")}:00`;
const formatNumber = (n: number) => new Intl.NumberFormat(dateLocale.value, { maximumFractionDigits: 1 }).format(n);

// Weekday 1 = Monday … 7 = Sunday (ISO, as the server sends them).
const weekdayNames = computed(() =>
  [1, 2, 3, 4, 5, 6, 7].map((weekday) => {
    const date = new Date(Date.UTC(2024, 0, weekday)); // 1 Jan 2024 was a Monday
    const name = (style: "long" | "short") =>
      new Intl.DateTimeFormat(dateLocale.value, { weekday: style, timeZone: "UTC" }).format(date);
    return { weekday, name: name("long"), short: name("short") };
  }),
);

// Ranked by bookings per open day, not the total: a month can have five
// Saturdays and four Fridays.
const weekdayRows = computed(() => {
  const rows = weekdayNames.value.map((d) => {
    const row = props.insights?.weekdays?.find((w: any) => w.weekday === d.weekday);
    const bookings = row?.bookings || 0;
    const days = row?.days || 0;
    return { ...d, bookings, days, average: days ? bookings / days : 0 };
  });
  const top = Math.max(0, ...rows.map((r) => r.average));
  return rows.map((r) => ({ ...r, percent: top ? (r.average / top) * 100 : 0, isTop: top > 0 && r.average === top }));
});

const serviceRows = computed(() => {
  const rows = props.insights?.top_services || [];
  const top = Math.max(0, ...rows.map((s: any) => s.bookings));
  return rows.map((s: any) => ({ ...s, percent: top ? (s.bookings / top) * 100 : 0 }));
});

const tiles = computed(() => {
  const busiestDay = [...weekdayRows.value].sort((a, b) => b.average - a.average)[0];
  const date = props.insights?.busiest_date;
  const service = props.insights?.top_services?.[0];
  const avg = props.insights?.averages || {};
  return [
    {
      key: "weekday",
      icon: "pi-calendar",
      label: t("analytics.insights.busiestWeekday"),
      value: busiestDay?.average ? busiestDay.name : "—",
      note: busiestDay?.average ? t("analytics.insights.perDay", { n: formatNumber(busiestDay.average) }) : "",
    },
    {
      key: "date",
      icon: "pi-star",
      label: t("analytics.insights.busiestDate"),
      value: date ? formatDay(date.date, dateLocale.value, { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "—",
      note: date ? t("analytics.insights.bookingsCount", { n: date.bookings }) : "",
    },
    {
      key: "service",
      icon: "pi-heart",
      label: t("analytics.insights.topService"),
      value: service?.service_name || "—",
      note: service ? `${t("analytics.insights.bookingsCount", { n: service.bookings })} · ${formatMoney(service.value)}` : "",
    },
    {
      key: "average",
      icon: "pi-shopping-bag",
      label: t("analytics.insights.averageBooking"),
      value: avg.bookings ? formatMoney(avg.avg_value) : "—",
      note: avg.bookings
        ? t("analytics.insights.averageNote", {
            services: formatNumber(avg.avg_services || 0),
            days: formatNumber(avg.avg_lead_days || 0),
            sameDay: avg.same_day_pct ?? 0,
          })
        : "",
    },
  ];
});

// Busiest hours: only the hours that ever had a booking, so the grid stays
// within the shop's real opening hours.
const heatByCell = computed(() => {
  const map = new Map<string, number>();
  for (const c of props.insights?.heatmap || []) map.set(`${c.weekday}|${c.hour}`, c.bookings);
  return map;
});
const heat = (weekday: number, hour: number) => heatByCell.value.get(`${weekday}|${hour}`) || 0;
const hours = computed<number[]>(() => {
  const all = (props.insights?.heatmap || []).map((c: any) => c.hour);
  if (all.length === 0) return [];
  const from = Math.min(...all);
  const to = Math.max(...all);
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
});
const maxHeat = computed(() => Math.max(1, ...(props.insights?.heatmap || []).map((c: any) => c.bookings)));
// One hue, light to dark; empty hours stay plain grey.
const cellStyle = (n: number) => {
  if (!n) return { background: "#f9fafb", color: "transparent" };
  const share = n / maxHeat.value;
  const strength = Math.round(12 + share * 88);
  return {
    background: `color-mix(in srgb, var(--p-primary-color) ${strength}%, white)`,
    color: share > 0.55 ? "#ffffff" : "#374151",
  };
};

const clientLists = computed<{ key: string; title: string; rows: any[] }[]>(() => [
  { key: "visits", title: t("analytics.insights.topByVisits"), rows: props.insights?.top_clients_by_visits || [] },
  { key: "value", title: t("analytics.insights.topByValue"), rows: props.insights?.top_clients_by_value || [] },
]);

const lapsed = computed(() => {
  const today = new Date();
  return (props.insights?.lapsed_regulars || []).map((c: any) => ({
    ...c,
    days_since: Math.floor((today.getTime() - new Date(`${c.last_visit}T12:00:00`).getTime()) / 86400000),
  }));
});
</script>

<style scoped>
.heat-scale {
  background: linear-gradient(
    to right,
    color-mix(in srgb, var(--p-primary-color) 12%, white),
    var(--p-primary-color)
  );
}
</style>
