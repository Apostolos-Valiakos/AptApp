// The financials page's data: the period and filters, every report it
// fetches for them, and the lists and client profile the tiles open. Its
// tiles and tabs (in this folder) take it with useFinancialsPage().
import { formatDate as dateText } from "../../utils/format";
import { api, ApiError, ifRefused } from "../../api/http";
import { ref, computed, onMounted, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { useToast } from "primevue/usetoast";
import { type DetailKind } from "../AnalyticsDetailsDialog.vue";
import { useSettingsStore } from "../../stores/settings";

export const useFinancials = () => {
  // Sorts a column by a number field. DataTable compares whatever this returns;
  // its types only allow a string, hence the cast.
  const numericSort = (key: string) => ((row: any) => Number(row[key] || 0)) as unknown as (item: any) => string;

  const { t, te, locale } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const settingsStore = useSettingsStore();
  const loading = ref(true);
  const serviceSummaryReport = ref([]);

  // Initialize filters with Current Month
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const filters = ref<{ from: Date | null; to: Date | null }>({
    from: firstDay,
    to: lastDay,
  });

  // Data State
  const finances = ref({
    total_sales: 0,
    total_payments: 0,
    collected_today: 0,
    total_debt: 0,
    total_expenses: 0,
    net_profit: 0,
  });

  const analytics = ref<any>({
    cancellation_rate: 0,
    retention_rate: 0,
    new_clients: 0,
    returning_clients: 0,
    staff_utilization: [],
  });

  const salesReport = ref<any[]>([]);
  const productsReport = ref<any[]>([]);
  const productsSummary = ref<any>({ total_revenue: 0, total_units: 0 });
  const productUsageReport = ref<any[]>([]);
  const giftCardsReport = ref<any[]>([]);
  const giftCardsSummary = ref<any>({ total_revenue: 0, total_outstanding: 0, total_cards: 0 });
  const staffReport = ref([]);
  const paymentsReport = ref<any[]>([]);
  const priceAdjustmentsReport = ref<any[]>([]);
  const appointmentsReport = ref([]);
  const insights = ref<any>(null);
  // Who owes the Σύνολο Χρεών amount, for the dates the tile was loaded for.
  const lastQuery = ref("");
  // Clicking a tile lists what makes up its figure (AnalyticsDetailsDialog).
  const detailsVisible = ref(false);
  const detailsKind = ref<DetailKind | null>(null);
  const detailsRef = ref<any>(null);
  const openDetails = (kind: DetailKind) => {
    detailsKind.value = kind;
    detailsVisible.value = true;
  };
  // A client in the list opens their profile, as on the Clients page. A change
  // there (a payment, a write-off) is reflected in the list and the tile.
  const clientProfileVisible = ref(false);
  const clientProfileId = ref<string | null>(null);
  const openClient = (clientId: string) => {
    clientProfileId.value = clientId;
    clientProfileVisible.value = true;
  };
  const onClientChanged = () => {
    fetchAllReports();
    if (detailsVisible.value) detailsRef.value?.reload();
  };
  const deletedReport = ref<any[]>([]);
  // The dates the insights shown were asked for: the pickers may have moved on.
  const insightsRange = ref<{ from: Date | null; to: Date | null }>({ from: null, to: null });
  const insightsPeriod = computed(() => {
    const day = (d: Date | null) =>
      d
        ? new Date(d).toLocaleDateString(locale.value === "el" ? "el-GR" : "en-GB", { day: "numeric", month: "short", year: "numeric" })
        : "";
    const from = day(insightsRange.value.from);
    const to = day(insightsRange.value.to);
    return from === to ? from : `${from} – ${to}`;
  });


  const formatDate = (d: Date | null) => dateText(d, locale.value, "dayMonth");

  const clearFilters = () => {
    filters.value.from = null;
    filters.value.to = null;
    fetchAllReports();
  };

  const setToday = () => {
    const now = new Date();
    filters.value.from = now;
    filters.value.to = now;
    fetchAllReports();
  };

  const fetchAllReports = async () => {
    loading.value = true;
    const requested = { ...filters.value };

    const params = new URLSearchParams();

    if (filters.value.from) {
      const fromDate = new Date(filters.value.from);
      fromDate.setHours(0, 0, 0, 0);
      params.append("from", fromDate.toISOString());
    }

    if (filters.value.to) {
      const toDate = new Date(filters.value.to);
      toDate.setHours(23, 59, 59, 999);
      params.append("to", toDate.toISOString());
    }

    if (settingsStore.hideCashPaid) {
      params.append("excludeCash", "true");
    }
    if (settingsStore.hideCardPaid) {
      params.append("excludeCard", "true");
    }

    const qs = params.toString() ? `?${params.toString()}` : "";
    lastQuery.value = qs;

    try {
      // Without these the page can't show anything; the others may be refused
      // (e.g. for a role that doesn't see them) and are then left as they were.
      const optional = (url: string) => api.get(url).catch(ifRefused(null));
      const [
        finData,
        salesData,
        staffData,
        payData,
        apptData,
        anaData,
        insightsData,
        serviceSumData,
        productsData,
        productUsageData,
        giftCardsData,
        priceAdjustmentsData,
        deletedData,
      ] = await Promise.all([
        api.get(`/api/v1/reports/finances${qs}`),
        api.get(`/api/v1/reports/sales${qs}`),
        optional(`/api/v1/reports/staff${qs}`),
        api.get(`/api/v1/reports/payments${qs}`),
        optional(`/api/v1/reports/appointments${qs}`),
        api.get(`/api/v1/reports/analytics${qs}`),
        optional(`/api/v1/reports/insights${qs}`),
        api.get(`/api/v1/reports/service-summary${qs}`),
        optional(`/api/v1/reports/products${qs}`),
        optional(`/api/v1/reports/product-usage${qs}`),
        optional(`/api/v1/reports/gift-cards${qs}`),
        optional(`/api/v1/reports/price-adjustments${qs}`),
        optional(`/api/v1/reports/deleted-appointments${qs}`),
      ]);

      finances.value = finData;
      salesReport.value = salesData.details || [];
      analytics.value = anaData;
      staffReport.value = staffData ?? [];
      paymentsReport.value = payData;
      if (priceAdjustmentsData) {
        priceAdjustmentsReport.value = priceAdjustmentsData;
      }
      if (deletedData) deletedReport.value = deletedData;
      appointmentsReport.value = apptData ?? [];
      insights.value = insightsData;
      insightsRange.value = requested;
      serviceSummaryReport.value = serviceSumData;
      if (productsData) {
        productsReport.value = productsData.details || [];
        productsSummary.value = productsData.summary || {
          total_revenue: 0,
          total_units: 0,
        };
      }
      if (productUsageData) {
        productUsageReport.value = productUsageData;
      }
      if (giftCardsData) {
        giftCardsReport.value = giftCardsData.details || [];
        giftCardsSummary.value = giftCardsData.summary || {
          total_revenue: 0,
          total_outstanding: 0,
          total_cards: 0,
        };
      }
    } catch (err: any) {
      console.error(err);
      const toastKey =
        err instanceof ApiError && err.status === 401
          ? "analytics.toast.unauthorized"
          : "analytics.toast.loadFailed";
      toast.add({
        severity: "error",
        summary: t(toastKey),
        detail: t(toastKey),
        life: 4000,
      });
    } finally {
      loading.value = false;
    }
  };

  const chartOptions = computed(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: "bottom" as const },
    },
    scales: {
      y: { beginAtZero: true, grid: { color: "#f3f4f6" } },
      x: { grid: { display: false } },
    },
  }));

  onMounted(fetchAllReports);
  watch(() => settingsStore.hideCashPaid, fetchAllReports);
  watch(() => settingsStore.hideCardPaid, fetchAllReports);

  return { numericSort, router, toast, settingsStore, loading, serviceSummaryReport, today, firstDay, lastDay, filters, finances, analytics, salesReport, productsReport, productsSummary, productUsageReport, giftCardsReport, giftCardsSummary, staffReport, paymentsReport, priceAdjustmentsReport, appointmentsReport, insights, lastQuery, detailsVisible, detailsKind, detailsRef, openDetails, clientProfileVisible, clientProfileId, openClient, onClientChanged, deletedReport, insightsRange, insightsPeriod, formatDate, clearFilters, setToday, fetchAllReports, chartOptions, t, te, locale };
};

export type FinancialsContext = ReturnType<typeof useFinancials>;
