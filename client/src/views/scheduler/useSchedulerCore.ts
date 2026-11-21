// The calendar screen's own state: the dialogs, the view shown, the status filter and what follows a booking dialog's save.
import { useNotify } from "../../composables/useNotify";
import { ref, watch, computed } from "vue";
import { useCalendarStore } from "../../stores/calendar";
import { useSettingsStore } from "../../stores/settings";
import { useToast } from "primevue/usetoast";
import { useConfirm } from "primevue/useconfirm";
import { useI18n } from "vue-i18n";
import { useAuthStore } from "../../stores/auth";
import { api as http, ApiError } from "../../api/http";

export const useSchedulerCore = () => {
  // Plain values several parts of the screen set and read (not shown, so not
  // reactive): a drag or a move question in progress, the hover card's timer,
  // the width the rows were last fitted to.
  const flags = {
    lastFitWidth: window.innerWidth,
    dragInProgress: false,
    moveConfirmOpen: false,
  };

  const reorderDialogVisible = ref(false);
  const authStore = useAuthStore();
  const toast = useToast();
  const notify = useNotify();
  const confirm = useConfirm();
  const { t, locale } = useI18n();
  const calendarStore = useCalendarStore();
  const settings = useSettingsStore();

  // Plain "staff" (not frontdesk/admin/super_admin) can only ever browse today
  // and forward — mirrors the same restriction enforced server-side in
  // GET /api/v1/appointments, so navigation UI can't even attempt to go back.
  const isStaffRole = computed(() => authStore.isStaff);
  // The waitlist: front desk and admins, and hidden (button, number and
  // panel) while Ctrl+1 hides cash amounts.
  const showWaitlist = computed(() => !isStaffRole.value && !settings.hideCashPaid);
  const todayDateStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  // UI State
  const dialogVisible = ref(false);
  const clientSearchVisible = ref(false);
  const quickProfileVisible = ref(false);
  const quickProfileClientId = ref<string | null>(null);
  const fullProfileVisible = ref(false);
  const fullProfileTab = ref("Info");
  const swapDialogVisible = ref(false);
  const selectedAppointment = ref<any>(null);
  const fullCalendar = ref<any>(null);
  const currentTitle = ref("");
  const currentView = ref("resourceTimeGridDay");
  const currentStart = ref("");
  const currentEnd = ref("");
  const isFetching = ref(false);
  // Mirrors the shop's slotMinTime/slotMaxTime, set directly on the FullCalendar
  // API instance today (see onMounted below) but not otherwise stored reactively
  // — needed here to compute off-hours gaps within the visible window.
  const shopSlotMinTime = ref("07:00:00");
  const shopSlotMaxTime = ref("23:00:00");
  const todayDate = computed(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  // Phones fit about 6-7 narrow staff columns (time gutter ~44px) and scroll
  // sideways for the rest; larger screens keep the roomier width.
  const getDayMinWidth = () =>
    window.innerWidth < 768
      ? Math.max(46, Math.floor((window.innerWidth - 44) / 5.5))
      : 160;

  const canGoPrev = computed(() => {
    if (!isStaffRole.value || !currentStart.value) return true;
    const viewStart = new Date(currentStart.value);
    viewStart.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return viewStart > today;
  });

  // --- Fit staff toggle ---
  const fitStaff = ref(localStorage.getItem("fitStaff") === "true");

  const toggleFitStaff = () => {
    fitStaff.value = !fitStaff.value;
    localStorage.setItem("fitStaff", String(fitStaff.value));
    const api = fullCalendar.value?.getApi();
    if (api) {
      api.setOption("dayMinWidth", fitStaff.value ? 0 : getDayMinWidth());
    }
  };
  // Ctrl+1 "hide cash/gift-card revenue" is handled globally in Layout.vue;
  // this view just reads the shared state.

  // --- Status filter ---
  const statusFilter = ref<"all" | "active" | "cancelled">("all");
  const statusFilterOptions = computed<
    { label: string; value: "all" | "active" | "cancelled"; icon: string }[]
  >(() => [
    { label: t("scheduler.filter.all"), value: "all", icon: "" },
    {
      label: t("scheduler.filter.active"),
      value: "active",
      icon: "pi pi-check-circle",
    },
    {
      label: t("scheduler.filter.cancelled"),
      value: "cancelled",
      icon: "pi pi-times-circle",
    },
  ]);

  // --- View options ---
  const viewOptions = computed(() => [
    { label: t("scheduler.view.day"), value: "resourceTimeGridDay" },
    { label: t("scheduler.view.week"), value: "resourceTimeGridWeek" },
    { label: t("scheduler.view.month"), value: "dayGridMonth" },
  ]);

  const calendarApi = computed(() => fullCalendar.value?.getApi());

  // --- Swap ---
  const openSwapDialog = () => {
    swapDialogVisible.value = true;
  };

  const handleSwap = async (swapData: {
    appointment1_id: number;
    appointment2_id: number;
  }) => {
    try {
      // (This request used to go without the login token, so the server
      // always refused it.)
      const data = await http
        .post("/api/v1/appointments/swap", swapData)
        .catch((e: ApiError) => {
          throw new Error(e.data?.error || "Swap failed");
        });
      if (!data.success) throw new Error(t("scheduler.toasts.swapFailedError"));

      swapDialogVisible.value = false;
      await calendarStore.fetchAppointments(currentStart.value, currentEnd.value);
      toast.add({
        severity: "success",
        summary: t("scheduler.toasts.swapComplete"),
        detail: t("scheduler.toasts.swapCompleteDetail"),
        life: 2500,
      });
    } catch (err: any) {
      toast.add({
        severity: "error",
        summary: t("scheduler.toasts.swapFailed"),
        detail: err.message || t("scheduler.toasts.swapFailedDetail"),
        life: 3000,
      });
    }
  };

  const handleReorderSave = async (newOrder: any[]) => {
    try {
      await calendarStore.updateResourceOrder(newOrder);
    } catch {
      toast.add({
        severity: "error",
        summary: t("scheduler.toasts.updateFailed"),
        detail: t("scheduler.toasts.staffOrderFailed"),
        life: 4000,
      });
      return;
    }
    notify.success(t("scheduler.toasts.staffOrderUpdated"));
  };

  // --- Actions ---
  const handleSave = async () => {
    dialogVisible.value = false;
    await handleRefresh();
  };

  const handleRefresh = () =>
    Promise.all([
      calendarStore.fetchAppointments(currentStart.value, currentEnd.value),
      calendarStore.refreshTimeOff(),
    ]);

  const onClientSelected = (client: any) => {
    quickProfileClientId.value = client.id;
    quickProfileVisible.value = true;
  };

  const onBookForClient = (client: any) => {
    if (isStaffRole.value) return;
    selectedAppointment.value = {
      client_id: client.client_id,
      ...client,
      start_time: new Date(),
    };
    dialogVisible.value = true;
  };

  // A visit clicked in the client's quick profile opens in the booking dialog,
  // over the profile, which stays open underneath.
  const quickProfileReloadKey = ref(0);
  const openFromQuickProfile = (appt: any) => {
    selectedAppointment.value = appt;
    dialogVisible.value = true;
  };
  watch(dialogVisible, (open) => {
    if (!open && quickProfileVisible.value) quickProfileReloadKey.value++;
  });

  const onOpenFullProfile = ({
    clientId,
    tab,
  }: {
    clientId: string;
    tab: string;
  }) => {
    quickProfileClientId.value = clientId;
    fullProfileTab.value = tab;
    fullProfileVisible.value = true;
  };
  // A day the server refused or failed to load: the calendar is empty, so say why.
  watch(
    () => calendarStore.loadFailed,
    (failed) => {
      if (failed) {
        toast.add({
          severity: "error",
          summary: t("scheduler.toasts.loadFailed"),
          detail: t("scheduler.toasts.loadFailedDetail"),
          life: 5000,
        });
      }
    },
  );

  return { flags, reorderDialogVisible, authStore, toast, notify, confirm, calendarStore, settings, isStaffRole, showWaitlist, todayDateStr, dialogVisible, clientSearchVisible, quickProfileVisible, quickProfileClientId, fullProfileVisible, fullProfileTab, swapDialogVisible, selectedAppointment, fullCalendar, currentTitle, currentView, currentStart, currentEnd, isFetching, shopSlotMinTime, shopSlotMaxTime, todayDate, getDayMinWidth, canGoPrev, fitStaff, toggleFitStaff, statusFilter, statusFilterOptions, viewOptions, calendarApi, openSwapDialog, handleSwap, handleReorderSave, handleSave, handleRefresh, onClientSelected, onBookForClient, quickProfileReloadKey, openFromQuickProfile, onOpenFullProfile, t, locale };
};
