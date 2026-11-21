<template>
  <div class="grid grid-cols-3 gap-4 mb-6">
    <div class="bg-white rounded-xl border border-gray-100 p-5">
      <div class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
        {{ t("analytics.giftCards.totalRevenue") }}
      </div>
      <div class="text-2xl font-black text-gray-900">
        {{ formatMoney(giftCardsSummary.total_revenue) }}
      </div>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-5">
      <div class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
        {{ t("analytics.giftCards.totalOutstanding") }}
      </div>
      <div class="text-2xl font-black text-gray-900">
        {{ formatMoney(giftCardsSummary.total_outstanding) }}
      </div>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-5">
      <div class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
        {{ t("analytics.giftCards.cardsSold") }}
      </div>
      <div class="text-2xl font-black text-gray-900">
        {{ giftCardsSummary.total_cards }}
      </div>
    </div>
  </div>

  <DataTable
    :value="giftCardsReport"
    responsiveLayout="scroll"
    :paginator="true"
    :rows="10"
    class="p-datatable-sm"
  >
    <template #empty>
      <div class="text-center text-gray-400 py-8">
        {{ t("analytics.giftCards.empty") }}
      </div>
    </template>
    <Column field="card_number" :header="t('giftCards.table.cardNumber')" sortable></Column>
    <Column field="customer_name" :header="t('giftCards.table.customer')" sortable></Column>
    <Column field="initial_amount" :header="t('giftCards.table.initialAmount')" sortable>
      <template #body="slotProps">
        {{ formatMoney(slotProps.data.initial_amount) }}
      </template>
    </Column>
    <Column field="remaining_balance" :header="t('giftCards.table.remainingBalance')" sortable>
      <template #body="slotProps">
        {{ formatMoney(slotProps.data.remaining_balance) }}
      </template>
    </Column>
    <Column field="issued_at" :header="t('giftCards.table.issued')" sortable>
      <template #body="slotProps">
        {{ new Date(slotProps.data.issued_at).toLocaleDateString("en-GB") }}
      </template>
    </Column>
  </DataTable>
</template>

<script setup lang="ts">
// Gift cards sold and what's left on them.
import { formatMoney } from "../../utils/format";
import { useFinancialsPage } from "./context";

const {
  giftCardsReport, giftCardsSummary, t,
} = useFinancialsPage();
</script>
