<template>
  <div class="flex justify-end mb-4">
    <router-link to="/app/product-usage" class="text-sm text-[var(--p-primary-600)] hover:underline flex items-center gap-1">
      <i class="pi pi-cog text-xs"></i>
      {{ t("analytics.productUsage.manageLink") }}
    </router-link>
  </div>
  <DataTable
    :value="productUsageReport"
    responsiveLayout="scroll"
    :paginator="true"
    :rows="10"
    class="p-datatable-sm"
  >
    <template #empty>
      <div class="text-center text-gray-400 py-8">
        {{ t("analytics.productUsage.empty") }}
      </div>
    </template>
    <Column :header="t('analytics.productUsage.product')">
      <template #body="slotProps">
        {{ slotProps.data.product_name }}
        <span class="text-gray-400 text-xs" v-if="slotProps.data.variation_name">— {{ slotProps.data.variation_name }}</span>
      </template>
    </Column>
    <Column field="unit" :header="t('analytics.productUsage.unit')"></Column>
    <Column :header="t('analytics.productUsage.expected')">
      <template #body="slotProps">
        {{ formatUsageRange(slotProps.data.expected_min, slotProps.data.expected_max) }}
      </template>
    </Column>
    <Column :header="t('analytics.productUsage.actual')">
      <template #body="slotProps">
        {{ slotProps.data.actual === null ? "—" : slotProps.data.actual }}
      </template>
    </Column>
    <Column :header="t('analytics.productUsage.usedBy')">
      <template #body="slotProps">
        <div class="text-xs text-gray-500">
          <div v-for="(svc, i) in slotProps.data.services" :key="i">
            {{ svc.service_name }} ({{ svc.count }} {{ t("analytics.productUsage.bookings") }})
          </div>
        </div>
      </template>
    </Column>
    <Column :header="t('analytics.productUsage.status')">
      <template #body="slotProps">
        <Tag
          :value="usageStatusLabel(slotProps.data.status)"
          :severity="
            slotProps.data.status === 'ok'
              ? 'success'
              : slotProps.data.status === 'no_data'
                ? 'secondary'
                : 'warn'
          "
        />
      </template>
    </Column>
  </DataTable>
</template>

<script setup lang="ts">
// Products used in treatments, against their stocktakes.

import { useFinancialsPage } from "./context";

const {
  router, analytics, productUsageReport, t,
} = useFinancialsPage();

const formatUsageRange = (min: number, max: number) => (min === max ? `${min}` : `${min} - ${max}`);

const usageStatusLabel = (status: string) => {
  const map: Record<string, string> = {
    ok: t("analytics.productUsage.statusOk"),
    over: t("analytics.productUsage.statusOver"),
    under: t("analytics.productUsage.statusUnder"),
    no_data: t("analytics.productUsage.statusNoData"),
  };
  return map[status] || status;
};
</script>
