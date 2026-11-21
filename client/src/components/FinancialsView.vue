<template>
  <div class="analytics-page p-1 sm:p-6 max-w-7xl mx-auto">
    <!-- Page Header -->
    <div class="mb-6 sm:mb-8 flex items-start justify-between gap-4 flex-wrap">
      <div>
        <h1 class="text-xl sm:text-2xl font-bold text-gray-900">
          {{ t("analytics.title") }}
        </h1>
        <p class="text-gray-500 mt-1 text-sm">{{ t("analytics.subtitle") }}</p>
      </div>
      <div class="analytics-links flex gap-2 flex-wrap w-full sm:w-auto">
        <Button
          :label="t('nav.expenses')"
          icon="pi pi-receipt"
          class="p-button-outlined flex-shrink-0"
          @click="router.push('/app/expenses')"
        />
        <Button
          :label="t('nav.dailyReport')"
          icon="pi pi-wallet"
          class="p-button-outlined flex-shrink-0"
          data-testid="analytics-daily-report"
          @click="router.push('/app/daily-report')"
        />
        <Button
          :label="t('nav.membershipReport')"
          icon="pi pi-chart-pie"
          class="p-button-outlined flex-shrink-0"
          @click="router.push('/app/membership-report')"
        />
        <Button
          :label="t('nav.bonusReport')"
          icon="pi pi-star"
          class="p-button-outlined flex-shrink-0"
          data-testid="analytics-bonus-report"
          @click="router.push('/app/bonus-report')"
        />
      </div>
    </div>

    <!-- Filter Bar -->
    <div class="bg-white p-4 sm:p-5 rounded-2xl border border-gray-100 shadow-sm mb-6">
      <h2 class="text-sm font-bold text-gray-700 mb-3">
        {{ t("analytics.filter.title") }}
      </h2>
      <div class="flex flex-col lg:flex-row gap-4 lg:items-end">
        <div class="flex-grow w-full">
          <div class="flex flex-col sm:flex-row gap-3">
            <div class="flex-1">
              <Calendar
                v-model="filters.from"
                :placeholder="t('analytics.filter.from')"
                showIcon
                class="w-full"
                inputClass="w-full"
                dateFormat="dd/mm/yy"
              />
            </div>
            <div class="flex-1">
              <Calendar
                v-model="filters.to"
                :placeholder="t('analytics.filter.to')"
                showIcon
                class="w-full"
                inputClass="w-full"
                dateFormat="dd/mm/yy"
              />
            </div>
            <Button
              :label="t('analytics.filter.today')"
              icon="pi pi-calendar"
              class="p-button-outlined w-full sm:w-auto flex-shrink-0"
              @click="setToday"
            />
          </div>
        </div>

        <div class="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
          <Button
            :label="t('analytics.filter.apply')"
            icon="pi pi-filter"
            class="w-full sm:w-auto"
            @click="fetchAllReports"
            :loading="loading"
          />
          <Button
            :label="t('analytics.filter.clear')"
            icon="pi pi-times"
            class="p-button-outlined p-button-secondary w-full sm:w-auto"
            @click="clearFilters"
          />
        </div>
      </div>
    </div>

    <FinancialsKpis />

    <!-- Tab Section -->
    <!-- scrollable: on a narrow screen the tabs scroll instead of being cut. -->
    <TabView scrollable class="bg-white rounded-2xl shadow-sm border border-gray-100 p-1 sm:p-2">
      <!-- Tab: Booking insights -->
      <!-- Tab: Booking insights -->
      <TabPanel :value="0" :header="t('analytics.tabs.insights')">
        <div class="p-1 sm:p-4 md:p-6">
          <BookingInsights :insights="insights" :loading="loading" :period="insightsPeriod" />
        </div>
      </TabPanel>

      <!-- Tab: Service Performance (All Statuses) -->
      <TabPanel :value="1" :header="t('analytics.tabs.servicePerformance')">
        <ServicePerformanceTab />
      </TabPanel>

      <!-- Tab: Sales by Service -->
      <TabPanel :value="2" :header="t('analytics.tabs.sales')">
        <SalesByServiceTab />
      </TabPanel>

      <!-- Tab: Products -->
      <TabPanel :value="3" :header="t('analytics.tabs.products')">
        <ProductsTab />
      </TabPanel>

      <!-- Tab: Product Usage -->
      <TabPanel :value="4" :header="t('analytics.tabs.productUsage')">
        <ProductUsageTab />
      </TabPanel>

      <!-- Tab: Gift Cards -->
      <TabPanel :value="5" :header="t('analytics.tabs.giftCards')">
        <GiftCardsTab />
      </TabPanel>

      <!-- Tab: Staff Performance -->
      <TabPanel :value="6" :header="t('analytics.tabs.staffPerformance')">
        <StaffPerformanceTab />
      </TabPanel>

      <!-- Tab: Payments Log -->
      <TabPanel :value="7" :header="t('analytics.tabs.paymentsLog')">
        <PaymentsTab />
      </TabPanel>

      <!-- Tab: Deleted bookings (by when they were deleted) -->
      <TabPanel :value="8" :header="t('analytics.tabs.deleted')">
        <DeletedBookingsTab />
      </TabPanel>

    </TabView>

    <AnalyticsDetailsDialog
      ref="detailsRef"
      v-model:visible="detailsVisible"
      :kind="detailsKind"
      :query="lastQuery"
      :closeOnEscape="!clientProfileVisible"
      @open-client="openClient"
    />

    <ClientProfileDialog v-model:visible="clientProfileVisible" :clientId="clientProfileId" @refresh="onClientChanged" />
  </div>
</template>

<script setup lang="ts">
// Financials and analytics: the period's money tiles and one tab per report.
// The data is in financials/useFinancials.ts; the tiles and tabs are in
// financials/.
import { provide } from "vue";
import TabView from "primevue/tabview";
import TabPanel from "primevue/tabpanel";
import BookingInsights from "./BookingInsights.vue";
import ClientProfileDialog from "./ClientProfileDialog.vue";
import AnalyticsDetailsDialog from "./AnalyticsDetailsDialog.vue";
import FinancialsKpis from "./financials/FinancialsKpis.vue";
import ServicePerformanceTab from "./financials/ServicePerformanceTab.vue";
import SalesByServiceTab from "./financials/SalesByServiceTab.vue";
import ProductsTab from "./financials/ProductsTab.vue";
import ProductUsageTab from "./financials/ProductUsageTab.vue";
import GiftCardsTab from "./financials/GiftCardsTab.vue";
import StaffPerformanceTab from "./financials/StaffPerformanceTab.vue";
import PaymentsTab from "./financials/PaymentsTab.vue";
import DeletedBookingsTab from "./financials/DeletedBookingsTab.vue";
import { useFinancials } from "./financials/useFinancials";
import { FinancialsKey } from "./financials/context";

const financials = useFinancials();
provide(FinancialsKey, financials);
const {
  router, loading, filters, insights, lastQuery, detailsVisible, detailsKind,
  detailsRef, clientProfileVisible, clientProfileId, openClient, onClientChanged, insightsPeriod, clearFilters, setToday,
  fetchAllReports, t,
} = financials;
</script>

<style>
/* Phones: tiles two per row and more compact, the three report links share
   the width, and nothing smaller than 12px. */
@media (max-width: 639px) {
  .analytics-page .kpi-grid > button {
    padding: 0.875rem;
  }
  .analytics-page .kpi-grid > button .w-10.h-10 {
    display: none;
  }
  .analytics-page .kpi-grid .text-3xl {
    font-size: 1.25rem;
    line-height: 1.75rem;
  }
  .analytics-page .analytics-links > .p-button {
    flex: 1 1 auto;
  }
  /* The "*" footnotes under the tiles repeat the note above them. */
  .analytics-page .kpi-grid p[class*="text-[10px]"] {
    display: none;
  }
  .analytics-page [class*="text-[10px]"],
  .analytics-page [class*="text-[11px]"],
  .analytics-page [class*="text-[9px]"] {
    font-size: 12px !important;
  }
}
</style>
