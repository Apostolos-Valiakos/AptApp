<template>
  <!-- Summary cards -->
  <div class="grid grid-cols-2 gap-4 mb-6">
    <div class="bg-white rounded-xl border border-gray-100 p-5">
      <div
        class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1"
      >
        {{ t("analytics.products.totalRevenue") }}
      </div>
      <div class="text-2xl font-black text-gray-900">
        {{ formatMoney(productsSummary.total_revenue) }}
      </div>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-5">
      <div
        class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1"
      >
        {{ t("analytics.products.unitsSold") }}
      </div>
      <div class="text-2xl font-black text-gray-900">
        {{ productsSummary.total_units }}
      </div>
    </div>
  </div>

  <DataTable
    :value="productsReport"
    responsiveLayout="scroll"
    :paginator="true"
    :rows="10"
    class="p-datatable-sm"
  >
    <template #empty>
      <div class="text-center text-gray-400 py-8">
        {{ t("analytics.products.empty") }}
      </div>
    </template>
    <Column
      field="product_name"
      :header="t('analytics.products.product')"
      sortable
    ></Column>
    <Column
      field="variation_name"
      :header="t('analytics.products.variation')"
    ></Column>
    <Column
      field="units_sold"
      :header="t('analytics.products.unitsSold')"
      sortable
    ></Column>
    <Column
      field="total_revenue"
      :header="t('analytics.tables.revenue')"
      sortable
    >
      <template #body="slotProps">
        {{ formatMoney(slotProps.data.total_revenue) }}
      </template>
    </Column>
    <Column
      field="current_stock"
      :header="t('analytics.products.currentStock')"
      sortable
    >
      <template #body="slotProps">
        <Tag
          :value="slotProps.data.current_stock ?? '—'"
          :severity="
            slotProps.data.current_stock === 0
              ? 'danger'
              : slotProps.data.current_stock < 5
                ? 'warn'
                : 'success'
          "
        />
      </template>
    </Column>
  </DataTable>
</template>

<script setup lang="ts">
// Products sold in the period.
import { formatMoney } from "../../utils/format";
import { useFinancialsPage } from "./context";

const {
  productsReport, productsSummary, t,
} = useFinancialsPage();
</script>
