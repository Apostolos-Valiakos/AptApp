// The money side of the booking dialog: the appointment's total, the
// client's earlier debt, and what is due now. The rules are pure functions
// (tested in tests/booking/totals.test.ts); useBookingTotals wires them to the
// dialog's state.
import { computed, type Ref } from "vue";
import { computeDiscountAmount, type DiscountState } from "../utils/discount";

/**
 * Bookings from this date on count toward a client's stored balance (the
 * server's clientBalanceSql uses the same cut-off).
 */
export const BALANCE_START = new Date("2026-03-01T00:00:00");

/** Whether a booking starting at `start` is already part of the client's stored balance (it has happened). */
export const countsInStoredBalance = (start: Date | string | null | undefined, now = new Date()) => {
  if (!start) return false;
  const at = new Date(start);
  return at >= BALANCE_START && at <= now;
};

/**
 * The client's debt from other bookings. The stored balance already
 * contains whatever is unpaid on this booking and on the selected same-day
 * ones if they have happened; that part is taken out, so it isn't counted
 * twice (once here and once as this visit's own amount).
 */
export const previousDebtFrom = ({
  storedBalance,
  isEdit,
  currentInBalance,
  currentUnpaid,
  selectedSiblingsUnpaidInBalance,
}: {
  storedBalance: number;
  isEdit: boolean;
  currentInBalance: boolean;
  currentUnpaid: number;
  selectedSiblingsUnpaidInBalance: number;
}) => {
  if (!isEdit) return storedBalance;
  let debt = storedBalance;
  if (currentInBalance) debt -= currentUnpaid;
  debt -= selectedSiblingsUnpaidInBalance;
  return Math.max(0, debt);
};

/**
 * The amount offered when the payment tab opens: what's unpaid on this
 * booking and the selected same-day ones, or everything due (old debt too)
 * once those are paid.
 */
export const suggestedPayment = (currentUnpaid: number, selectedSiblingsOwed: number, combinedTotalDue: number) => {
  const selectedUnpaid = currentUnpaid + selectedSiblingsOwed;
  return selectedUnpaid > 0 ? selectedUnpaid : Math.max(0, combinedTotalDue);
};

export function useBookingTotals(state: {
  services: Ref<any[]>;
  products: Ref<any[]>;
  discount: Ref<DiscountState>;
  client: Ref<any>;
  isEdit: Ref<boolean>;
  form: Ref<{ start_time: any; deposit_amount: number }>;
  siblings: Ref<any[]>;
  selectedSiblingIds: Ref<string[]>;
  pendingPackagesTotal: Ref<number>;
  pendingGiftCardsTotal: Ref<number>;
}) {
  const selectedSiblings = computed(() =>
    state.siblings.value.filter((s) => state.selectedSiblingIds.value.includes(s.id)),
  );
  const selectedSiblingsOwedTotal = computed(() =>
    selectedSiblings.value.reduce((sum, s) => sum + Number(s.owed), 0),
  );
  const selectedSiblingsDepositTotal = computed(() =>
    selectedSiblings.value.reduce((sum, s) => sum + Number(s.deposit_amount), 0),
  );

  const servicesTotal = computed(() =>
    state.services.value.reduce((sum, s) => sum + (Number(s.price_override) || 0), 0),
  );
  const productsTotal = computed(() =>
    state.products.value.reduce((sum, p) => sum + (Number(p.price) || 0) * (p.quantity || 1), 0),
  );
  const discountAmount = computed(() =>
    computeDiscountAmount(state.discount.value, servicesTotal.value, productsTotal.value),
  );
  const currentApptTotal = computed(() => servicesTotal.value + productsTotal.value - discountAmount.value);
  const currentUnpaid = computed(() => Math.max(0, currentApptTotal.value - state.form.value.deposit_amount));

  const isApptInDatabaseBalance = computed(() => !!state.form.value && state.isEdit.value && countsInStoredBalance(state.form.value.start_time));

  const previousDebt = computed(() => {
    if (!state.client.value) return 0;
    return previousDebtFrom({
      storedBalance: Number(state.client.value.outstanding_balance || 0),
      isEdit: state.isEdit.value,
      currentInBalance: isApptInDatabaseBalance.value,
      currentUnpaid: currentUnpaid.value,
      selectedSiblingsUnpaidInBalance: selectedSiblings.value
        .filter((s) => countsInStoredBalance(s?.services?.[0]?.start_time))
        .reduce((sum, s) => sum + Number(s.owed), 0),
    });
  });

  // Earlier debt + what's unpaid on this visit + packages and gift cards
  // bought with this payment (sold in full, not part of this booking's debt).
  const totalDueNow = computed(
    () => previousDebt.value + currentUnpaid.value + state.pendingPackagesTotal.value + state.pendingGiftCardsTotal.value,
  );
  // What the payment panel collects: the above plus the selected same-day bookings.
  const combinedTotalDueNow = computed(() => totalDueNow.value + selectedSiblingsOwedTotal.value);

  const suggestedAmount = () =>
    suggestedPayment(currentUnpaid.value, selectedSiblingsOwedTotal.value, combinedTotalDueNow.value);

  return {
    servicesTotal,
    productsTotal,
    discountAmount,
    currentApptTotal,
    selectedSiblingsOwedTotal,
    selectedSiblingsDepositTotal,
    isApptInDatabaseBalance,
    previousDebt,
    totalDueNow,
    combinedTotalDueNow,
    suggestedAmount,
  };
}
