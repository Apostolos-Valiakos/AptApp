// Everything the booking dialog holds while it is open, and what follows
// from it: the form, its service and product rows, the client, the money,
// the payment tab's choices and which part of the dialog is showing. Made
// once by BookingDialog.vue; its parts (useBookingClient, useBookingLoad,
// useBookingSave, useBookingPayment, useBookingDelete) and its components
// (see context.ts) all work on this one copy.
import { computed, ref, type Ref } from "vue";
import { useI18n } from "vue-i18n";
import { useConfirm } from "primevue/useconfirm";
import { useToast } from "primevue/usetoast";
import { useNotify } from "../../../composables/useNotify";
import { useIsPhone } from "../../../composables/useIsPhone";
import { useBookingTotals } from "../../../composables/useBookingTotals";
import { useAuthStore } from "../../../stores/auth";
import { useSettingsStore } from "../../../stores/settings";
import { fullyHidden, hiddenAmount } from "../../../utils/paymentFilters";
import { emptyDiscount, type DiscountState } from "../../../utils/discount";
import { formatDate as dateText } from "../../../utils/format";
import type { ServiceSnapshot } from "../../../utils/appointmentChanges";

export type BookingDialogProps = {
  appointment?: any;
  services?: any[];
  staff?: any[];
  allProducts?: any[];
  timeOff?: any[];
  workingHours?: any[];
  shopMinTime?: string;
  shopMaxTime?: string;
};
export type BookingDialogEmit = (event: "save" | "refresh" | "open-appointment" | "freed", ...args: any[]) => void;

// Each booking dialog asks its questions in its own confirmation box
// (BookingDialog.vue). A booking can open on top of another one (from a
// client's history), and pages have their own box: shared, every question
// would show in all of them.
let dialogCount = 0;

export const createBookingState = (props: BookingDialogProps, emit: BookingDialogEmit, dialogVisible: Ref<boolean>) => {
  const confirmGroup = `booking-${++dialogCount}`;
  const pageConfirm = useConfirm();
  const confirm: typeof pageConfirm = {
    ...pageConfirm,
    require: (options) => pageConfirm.require({ group: confirmGroup, ...options }),
  };
  const toast = useToast();
  const notify = useNotify();
  const { t, locale } = useI18n();
  const authStore = useAuthStore();

  // --- The form
  const form = ref<any>({
    id: null,
    client_id: null,
    start_time: new Date(),
    status: "new",
    internal_notes: "",
    booking_notes: "",
    deposit_amount: 0,
    payment_status: "unpaid",
    payment_method: "card",
    is_block: false,
    save_receipt: true,
    is_eoppy: false,
  });
  const servicesList = ref<Array<any>>([]);
  const productsList = ref<Array<any>>([]);
  const isRecurring = ref(false);
  const recurrenceForm = ref<{ freq: string; end_date: Date | null }>({ freq: "Weekly", end_date: null });
  const currentStaffId = ref<number | string | null>(null);

  const isEditMode = computed(() => !!form.value.id);
  const isBlockEdit = computed(() => !!form.value.time_off_id);
  // Plain staff only read a booking; the server refuses their changes too.
  const isReadOnly = computed(() => authStore.isStaff);

  // A staff member is required per service row — every block needs to land on
  // a specific person's calendar column. A time-off block still needs exactly
  // one staff member picked on its single row (see saveAsTimeOff), even
  // though it has no real service selected.
  const missingStaffService = computed(() =>
    form.value.is_block
      ? !servicesList.value[0]?.staff_id
      : servicesList.value.some((s: any) => s.service_id && !s.staff_id),
  );
  const canSaveBooking = computed(() => servicesList.value.length > 0 && !missingStaffService.value);
  const canRepeatBooking = computed(
    () => !!form.value.client_id && servicesList.value.length > 0 && servicesList.value.every((s) => s.service_id && s.staff_id),
  );

  // What the booking was when loaded or last saved: the change confirmation,
  // the debt beside it and the "changed meanwhile" check compare against it.
  // currentVersion is sent with saves as base_version, so an edit made from an
  // outdated copy (changed on another device, or online while this one was
  // offline) is refused instead of overwriting the newer change; null when
  // unknown (a change of this appointment is already waiting to sync).
  const originalServices = ref<ServiceSnapshot[]>([]);
  const originalSnapshot = ref({ price: 0, deposit: 0, isPast: false });
  const originalDiscountAmount = ref(0);
  const currentVersion = ref<number | null>(null);
  const savedStatus = ref("");

  // --- The client (server-side search — with 5000+ clients the full list is
  // never loaded here, see calendar.ts)
  const selectedClient = ref<any>(null);
  // The client's notes as edited in the sidebar; they are saved with the
  // booking's Save, and closing without saving drops the change.
  const clientNotesDraft = ref("");
  const walkInClientId = ref<string | null>(null);
  // A new booking added to the client's appointment that day: its time.
  const groupedWithTime = ref<string | null>(null);
  const isWalkInSelected = computed(
    () => !!selectedClient.value?.is_walk_in || (!!walkInClientId.value && form.value.client_id === walkInClientId.value),
  );
  const showClientProfile = ref(false);
  const currentProfileId = ref<string | null>(null);

  // This client's other active appointments the same calendar day (any staff
  // member), fetched fresh per open. An admin/frontdesk/super_admin can fold
  // several into one combined payment (canCombineDayPayment); a plain staff
  // member still sees the list and the combined total read-only.
  const siblingAppointments = ref<any[]>([]);
  const selectedSiblingIds = ref<string[]>([]);
  const siblingsLoading = ref(false);
  // Combining several of a client's same-day appointments into one payment
  // crosses staff ownership — gated the same way canSellExtras gates
  // packages/gift cards server-side.
  const canCombineDayPayment = computed(() => authStore.isShopAdmin);
  const selectedSiblingsTotal = computed(() =>
    siblingAppointments.value
      .filter((s: any) => selectedSiblingIds.value.includes(s.id))
      .reduce((sum: number, s: any) => sum + Number(s.total_cost || 0), 0),
  );

  // --- Money
  const discount = ref<DiscountState>(emptyDiscount());
  const discountCodes = ref<any[]>([]);
  // Packages and gift cards picked to sell with this payment: sold in full
  // when the payment is made, added to the total so staff take one amount.
  const pendingPackages = ref<{ package_type_id: string; name: string; price: number }[]>([]);
  const pendingPackagesTotal = computed(() => pendingPackages.value.reduce((sum, p) => sum + Number(p.price), 0));
  const pendingGiftCards = ref<{ card_number: string; customer_name: string; initial_amount: number }[]>([]);
  const pendingGiftCardsTotal = computed(() => pendingGiftCards.value.reduce((sum, g) => sum + Number(g.initial_amount), 0));

  // Services the cash/card filters hide, whole or in part: still part of the
  // booking (saved with it), just not shown, and left out of the money shown.
  // The hidden part is paid, so what's due doesn't change.
  const settingsForFilters = useSettingsStore();
  const hiddenPart = (row: any) => hiddenAmount(row?._hidden, settingsForFilters);
  const isHiddenRow = (row: any) => fullyHidden(row?._charged, row?._hidden, settingsForFilters);
  const hiddenServicesTotal = computed(() => servicesList.value.reduce((sum: number, row: any) => sum + hiddenPart(row), 0));
  // The header and the "paid with" note follow the services shown.
  const shownStartTime = computed(() => {
    if (!hiddenServicesTotal.value) return form.value.start_time;
    const times = servicesList.value
      .filter((row: any) => !isHiddenRow(row) && row.start_time)
      .map((row: any) => new Date(row.start_time).getTime());
    return times.length ? new Date(Math.min(...times)) : form.value.start_time;
  });
  const shownPaidMethod = computed(() => {
    if (!hiddenServicesTotal.value) return form.value.payment_method;
    const ways = [...new Set(servicesList.value.filter((row: any) => !isHiddenRow(row) && row._paidWith).map((row: any) => row._paidWith))];
    return ways.length === 1 && !String(ways[0]).includes(",") ? ways[0] : null;
  });

  // The money side (totals, earlier debt, what's due now): see
  // composables/useBookingTotals.ts.
  const totals = useBookingTotals({
    services: servicesList,
    products: productsList,
    discount,
    client: selectedClient,
    isEdit: isEditMode,
    form,
    siblings: siblingAppointments,
    selectedSiblingIds,
    pendingPackagesTotal,
    pendingGiftCardsTotal,
    savedUnpaid: computed(() => Math.max(0, originalSnapshot.value.price - originalSnapshot.value.deposit)),
    savedStatus,
  });
  // The client's balance beside the booking: earlier debt, and what's left on
  // this booking once it's completed (its remainder is owed now).
  const sidebarBalance = computed(
    () =>
      totals.previousDebt.value +
      (form.value.id && savedStatus.value === "completed" ? Math.max(0, originalSnapshot.value.price - originalSnapshot.value.deposit) : 0),
  );

  // --- The payment tab: 1 checkout, 2 way of paying, 3 price change and charge.
  const paymentStep = ref(1);
  const paymentLoading = ref(false);
  const amountToPayNow = ref(0);
  const selectedPaymentMethod = ref<"card" | "cash" | "gift-card" | "membership">("card");
  const selectedGiftCardId = ref<string | null>(null);
  const selectedMembershipRedemptions = ref<any[]>([]);
  const saleChoicesOpen = ref(false);
  const priceChangeVisible = ref(false);
  const refundVisible = ref(false);
  // The payment tab's child components, for the calls made into them.
  const bookingPaymentsRef = ref<any>(null);
  const bookingPackagesRef = ref<any>(null);
  const packageSaleRef = ref<any>(null);
  const giftCardSaleRef = ref<any>(null);
  const canChangePriceOrRefund = computed(() => authStore.isShopAdmin);
  // A completed appointment's price is final (the server refuses it too).
  const canChangePrice = computed(
    () =>
      canChangePriceOrRefund.value &&
      form.value.status !== "completed" &&
      !siblingAppointments.value.some((s: any) => selectedSiblingIds.value.includes(s.id) && s.status === "completed"),
  );
  const canSellExtras = computed(() => !!form.value.client_id && authStore.isShopAdmin);
  const isPaymentSettled = computed(() => totals.combinedTotalDueNow.value <= 0);
  const canReachCharge = computed(() => !!bookingPaymentsRef.value?.canContinue);

  // --- What's showing
  const currentTab = ref("Booking");
  const tabs = [
    { key: "Booking", label: computed(() => t("booking.tabs.booking")) },
    { key: "Products", label: computed(() => t("booking.tabs.products")) },
    { key: "Notes", label: computed(() => t("booking.tabs.notes")) },
    { key: "Payment", label: computed(() => t("booking.tabs.payment")) },
  ] as const;
  const visibleTabs = computed(() => tabs.filter((tab) => tab.key !== "Payment" || !isReadOnly.value));
  const showPaymentNav = computed(() => currentTab.value === "Payment" && !isPaymentSettled.value && !isReadOnly.value);
  const loading = ref(false);
  // The past visit being opened from the sidebar (the form waits for it).
  const loadingPastId = ref<string | null>(null);
  const showRepeatDialog = ref(false);
  // Phones: the client's details open over the form.
  const showMobileSidebar = ref(false);
  const isMobile = useIsPhone();
  const deleteReason = ref("");

  const statusOptions = computed(() => [
    { label: t("common.status.new"), value: "new" },
    { label: t("common.status.confirmed"), value: "confirmed" },
    { label: t("common.status.arrived"), value: "arrived" },
    { label: t("common.status.started"), value: "started" },
    { label: t("common.status.completed"), value: "completed" },
    { label: t("common.status.noShow"), value: "no-show" },
    { label: t("common.status.noResponse"), value: "no-response" },
    { label: t("common.status.cancelled"), value: "cancelled" },
  ]);
  const formatDate = (d: Date) => dateText(d, locale.value, "weekdayTime");
  // The booking's times, per therapist: what it frees when it's cancelled or
  // deleted (the calendar offers them to the waitlist).
  const freedSlots = () =>
    servicesList.value
      .filter((s: any) => s.staff_id && s.start_time)
      .map((s: any) => {
        const start = new Date(s.start_time);
        return { staff_id: s.staff_id, start, end: new Date(start.getTime() + (Number(s.duration_override) || 60) * 60000) };
      });

  return {
    props, emit, dialogVisible, confirm, confirmGroup, toast, notify, t, locale, authStore,
    form, servicesList, productsList, isRecurring, recurrenceForm, currentStaffId,
    isEditMode, isBlockEdit, isReadOnly, missingStaffService, canSaveBooking, canRepeatBooking,
    originalServices, originalSnapshot, originalDiscountAmount, currentVersion, savedStatus,
    selectedClient, clientNotesDraft, walkInClientId, groupedWithTime, isWalkInSelected, showClientProfile, currentProfileId,
    siblingAppointments, selectedSiblingIds, siblingsLoading, canCombineDayPayment, selectedSiblingsTotal,
    discount, discountCodes, pendingPackages, pendingPackagesTotal, pendingGiftCards, pendingGiftCardsTotal,
    hiddenPart, isHiddenRow, hiddenServicesTotal, shownStartTime, shownPaidMethod,
    ...totals, sidebarBalance,
    paymentStep, paymentLoading, amountToPayNow, selectedPaymentMethod, selectedGiftCardId, selectedMembershipRedemptions,
    saleChoicesOpen, priceChangeVisible, refundVisible, bookingPaymentsRef, bookingPackagesRef, packageSaleRef, giftCardSaleRef,
    canChangePriceOrRefund, canChangePrice, canSellExtras, isPaymentSettled, canReachCharge,
    currentTab, visibleTabs, showPaymentNav, loading, loadingPastId, showRepeatDialog, showMobileSidebar, isMobile, deleteReason,
    statusOptions, formatDate, freedSlots,
  };
};

export type BookingState = ReturnType<typeof createBookingState>;
