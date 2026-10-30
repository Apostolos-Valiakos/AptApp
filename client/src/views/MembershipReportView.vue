<template>
  <div class="space-y-6">
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-[var(--p-primary-50)] flex items-center justify-center">
          <i class="pi pi-chart-pie text-[var(--p-primary-600)]"></i>
        </div>
        <div>
          <h1 class="text-2xl font-bold text-gray-900">{{ t('membershipReport.title') }}</h1>
          <p class="text-sm text-gray-500 mt-0.5">{{ t('membershipReport.subtitle') }}</p>
        </div>
      </div>
    </div>

    <div v-if="loading" class="text-center py-12">
      <i class="pi pi-spin pi-spinner text-3xl text-gray-300"></i>
    </div>

    <template v-else-if="report">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div class="text-xs font-bold text-gray-400 uppercase">{{ t('membershipReport.totalActive') }}</div>
          <div class="text-3xl font-bold text-gray-900 mt-1">{{ report.total_active }}</div>
        </div>
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div class="text-xs font-bold text-gray-400 uppercase">{{ t('membershipReport.mrr') }}</div>
          <div class="text-3xl font-bold text-gray-900 mt-1">{{ formatMoney(report.mrr_estimate) }}</div>
        </div>
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div class="text-xs font-bold text-gray-400 uppercase">{{ t('membershipReport.revenue') }}</div>
          <div class="text-3xl font-bold text-gray-900 mt-1">{{ formatMoney(report.membership_revenue) }}</div>
        </div>
      </div>

      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h3 class="font-bold text-gray-700 mb-4">{{ t('membershipReport.byTier') }}</h3>
        <DataTable :value="report.by_tier" class="p-datatable-sm">
          <Column field="name" :header="t('membershipReport.tier')"></Column>
          <Column field="active_count" :header="t('membershipReport.activeMembers')"></Column>
          <Column field="paused_count" :header="t('membershipReport.pausedMembers')"></Column>
          <Column :header="t('membershipReport.monthlyPrice')">
            <template #body="slotProps">{{ formatMoney(slotProps.data.monthly_price) }}</template>
          </Column>
        </DataTable>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 class="font-bold text-gray-700 mb-4">{{ t('membershipReport.mostUsed') }}</h3>
          <div v-if="!report.most_used_services.length" class="text-sm text-gray-400">{{ t('membershipReport.noUsage') }}</div>
          <div
            v-for="s in report.most_used_services"
            :key="s.service_name"
            class="flex justify-between items-center text-sm py-1.5 border-b border-gray-50 last:border-0"
          >
            <span class="text-gray-700">{{ s.service_name }}</span>
            <span class="font-bold text-gray-900">{{ s.uses }}</span>
          </div>
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 class="font-bold text-gray-700 mb-4">{{ t('membershipReport.nearExpiry') }}</h3>
          <div v-if="!report.near_expiry.length" class="text-sm text-gray-400">{{ t('membershipReport.noneNearExpiry') }}</div>
          <div
            v-for="m in report.near_expiry"
            :key="m.id"
            class="flex justify-between items-center text-sm py-1.5 border-b border-gray-50 last:border-0"
          >
            <span class="text-gray-700">{{ m.first_name }} {{ m.last_name }} <span class="text-gray-400">({{ m.tier_name }})</span></span>
            <span class="font-medium text-amber-600">{{ new Date(m.current_period_end).toLocaleDateString("en-GB") }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { api, ApiError } from "../api/http";
import { formatMoney } from "../utils/format";
import { ref, onMounted } from "vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
const loading = ref(true);
const report = ref<any>(null);

onMounted(async () => {
  try {
    // A refusal leaves the report empty, as before; a network failure isn't hidden.
    report.value = await api.get("/api/v1/reports/membership").catch((e) => {
      if (e instanceof ApiError) return report.value;
      throw e;
    });
  } finally {
    loading.value = false;
  }
});
</script>
