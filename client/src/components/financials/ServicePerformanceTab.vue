<template>
  <DataTable
    :value="serviceSummaryReport"
    responsiveLayout="scroll"
    :paginator="true"
    :rows="10"
    class="p-datatable-sm"
    stripedRows
  >
    <Column
      field="service_name"
      :header="t('analytics.tables.serviceName')"
    ></Column>
    <Column
      field="service_count"
      :header="t('analytics.tables.quantity')"
      sortable
      class="text-center"
    >
      <template #body="slotProps">
        <span class="font-medium"
          >{{ slotProps.data.service_count }}
          {{ t("analytics.demographics.apptsCol") }}</span
        >
      </template>
    </Column>
    <Column
      field="total_paid"
      :header="t('analytics.tables.moneyPaid')"
      sortable
    >
      <template #body="slotProps">
        <span class="text-green-700 font-bold"
          >{{ formatMoney(slotProps.data.total_paid) }}</span
        >
      </template>
    </Column>
    <Column
      field="total_owed"
      :header="t('analytics.tables.moneyOwed')"
      sortable
    >
      <template #body="slotProps">
        <span
          :class="
            Number(slotProps.data.total_owed) > 0
              ? 'text-red-600 font-bold'
              : 'text-gray-400'
          "
        >
          {{ formatMoney(slotProps.data.total_owed) }}
        </span>
      </template>
    </Column>
    <Column
      field="total_value"
      :header="t('analytics.tables.totalValue')"
      sortable
    >
      <template #body="slotProps">
        <span class="text-gray-600 italic"
          >{{ formatMoney(slotProps.data.total_value) }}</span
        >
      </template>
    </Column>
  </DataTable>
  <p class="text-[10px] text-gray-500 mt-2 italic">
    * {{ t("analytics.serviceNote") }}
  </p>
</template>

<script setup lang="ts">
// Each service's bookings in the period, by status.
import { formatMoney } from "../../utils/format";
import { useFinancialsPage } from "./context";

const {
  serviceSummaryReport, t,
} = useFinancialsPage();
</script>
