<template>
  <div class="flex items-center justify-between flex-wrap gap-3 mb-3">
    <p class="text-xs text-gray-400">{{ t("analytics.deleted.note") }}</p>
    <InputText v-model="deletedSearch" size="small" :placeholder="t('analytics.deleted.search')" data-testid="deleted-search" />
  </div>
  <DataTable
    :value="shownDeleted"
    dataKey="id"
    responsiveLayout="scroll"
    :paginator="true"
    :alwaysShowPaginator="false"
    :rows="15"
    class="p-datatable-sm"
    data-testid="deleted-table"
  >
    <template #empty>
      <span class="text-sm text-gray-400">{{ t("analytics.deleted.none") }}</span>
    </template>
    <Column field="deleted_at" :header="t('analytics.deleted.deletedAt')" sortable>
      <template #body="{ data }"><span class="whitespace-nowrap">{{ fmtDateTime(data.deleted_at) }}</span></template>
    </Column>
    <Column field="deleted_by_name" :header="t('analytics.deleted.deletedBy')" sortable />
    <Column field="client_name" :header="t('analytics.deleted.client')" sortable>
      <template #body="{ data }">
        <div class="font-medium uppercase">{{ data.client_name || "—" }}</div>
        <div v-if="data.client_phone" class="text-xs text-gray-400">{{ data.client_phone }}</div>
      </template>
    </Column>
    <Column field="start_time" :header="t('analytics.deleted.bookingDate')" sortable>
      <template #body="{ data }"><span class="whitespace-nowrap">{{ data.start_time ? fmtDateTime(data.start_time) : "—" }}</span></template>
    </Column>
    <Column :header="t('analytics.deleted.services')">
      <template #body="{ data }">
        <div v-for="(s, i) in data.services" :key="i" class="text-sm">
          {{ s.service || "—" }}<template v-if="s.variation"> — {{ s.variation }}</template>
          <span v-if="s.staff" class="text-xs text-gray-400"> · {{ s.staff }}</span>
        </div>
        <div v-for="(p, i) in data.products" :key="`p${i}`" class="text-xs text-gray-500">{{ p.quantity }} × {{ p.product || "—" }}</div>
      </template>
    </Column>
    <Column field="total" :header="t('analytics.deleted.total')" sortable :sortField="numericSort('total')">
      <template #body="{ data }">{{ formatMoney(data.total) }}</template>
    </Column>
    <Column field="status" :header="t('analytics.deleted.status')">
      <template #body="{ data }">{{ deletedStatusLabel(data.status) }}</template>
    </Column>
    <Column field="reason" :header="t('analytics.deleted.reason')">
      <template #body="{ data }">{{ data.reason || "—" }}</template>
    </Column>
  </DataTable>
</template>

<script setup lang="ts">
// Bookings deleted in the period: who, when and why.
import { statusKey } from "../../utils/appointmentStatus";
import { foldText } from "../../utils/text";
import { formatMoney } from "../../utils/format";
import { ref, computed } from "vue";
import { useFinancialsPage } from "./context";

const {
  numericSort, deletedReport, t, te, locale,
} = useFinancialsPage();

const deletedSearch = ref("");
const fmtDateTime = (d: string) =>
  new Date(d).toLocaleString(locale.value === "el" ? "el-GR" : "en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const deletedStatusLabel = (status: string) => {
  const key = `common.status.${statusKey(status)}`;
  return te(key) ? t(key) : status;
};
const shownDeleted = computed(() => {
  const words = foldText(deletedSearch.value).split(/\s+/).filter(Boolean);
  if (!words.length) return deletedReport.value;
  return deletedReport.value.filter((d) => {
    const text = foldText(
      [
        d.client_name,
        d.client_phone,
        d.deleted_by_name,
        d.reason,
        ...d.services.flatMap((s: any) => [s.service, s.staff]),
      ]
        .filter(Boolean)
        .join(" "),
    );
    return words.every((w) => text.includes(w));
  });
});
</script>
