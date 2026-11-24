// The payment tab: what to suggest paying, keeping the amount in step with
// what's due, taking a payment (with packages and gift cards sold alongside),
// and taking in a price change, a refund or a package visit used.
import { nextTick, watch } from "vue";
import { fetchOrQueue } from "../../../offline/queue";
import { emptyDiscount } from "../../../utils/discount";
import { formatMoney } from "../../../utils/format";
import { paymentShares } from "../../../utils/money";
import { personsOf } from "../../../utils/capacity";
import { markManualStarts } from "../../../utils/serviceSequence";
import { snapshotServices } from "../../../utils/appointmentChanges";
import type { BookingState } from "./useBookingState";

// A second way of paying (a split payment), as the payment form sends it.
export type PaymentSplit = { amount2: number; payment_method2: string; gift_card_id2: string | null; redemptions2?: any[] } | null;
import type { Later } from "./context";

export const useBookingPayment = (state: BookingState, later: Later) => {
  const {
    emit, toast, t, form, servicesList, productsList, originalServices, originalSnapshot,
    originalDiscountAmount, currentVersion, selectedClient, siblingAppointments, selectedSiblingIds, discount, pendingPackages, pendingPackagesTotal,
    pendingGiftCards, pendingGiftCardsTotal, paymentStep, paymentLoading, amountToPayNow, selectedPaymentMethod, selectedGiftCardId, selectedMembershipRedemptions,
    saleChoicesOpen, priceChangeVisible, refundVisible, bookingPaymentsRef, bookingPackagesRef, isPaymentSettled, currentTab, currentApptTotal,
    previousDebt, combinedTotalDueNow, suggestedAmount,
  } = state;

  const openSale = (sale: any) => {
    saleChoicesOpen.value = false;
    sale?.openSell();
  };
  // Nothing unsaved on the payment tab outlives the dialog or moves to another
  // booking. What was already saved (a used visit, a price change) stays.
  const resetPayment = () => {
    paymentStep.value = 1;
    saleChoicesOpen.value = false;
    priceChangeVisible.value = false;
    refundVisible.value = false;
    pendingPackages.value = [];
    pendingGiftCards.value = [];
    selectedPaymentMethod.value = "card";
    selectedGiftCardId.value = null;
    selectedMembershipRedemptions.value = [];
    bookingPaymentsRef.value?.disableSplit();
  };
  // Only earlier debt left on this booking: nothing to check out, straight to paying it.
  watch(currentTab, (tab) => {
    if (tab !== "Payment") return;
    saleChoicesOpen.value = false;
    paymentStep.value = form.value.deposit_amount >= currentApptTotal.value && previousDebt.value > 0 ? 2 : 1;
  });
  // Something sold is paid in full: the amount to pay grows and shrinks with it.
  watch(
    () => pendingPackagesTotal.value + pendingGiftCardsTotal.value,
    (sales, before) => {
      amountToPayNow.value = Math.max(0, Math.min(combinedTotalDueNow.value, amountToPayNow.value + sales - before));
    },
  );
  watch(isPaymentSettled, (settled) => {
    if (settled) paymentStep.value = 1;
  });

  // Suggests a sensible default amount: pay off whatever's explicitly owed for
  // this appointment plus any currently-checked same-day siblings, falling
  // back to the full combined total (incl. old debt) only once there's
  // nothing left owed on the selected set. Called once on dialog open (via
  // nextTick below, so currentApptTotal/totalDueNow have settled) and again
  // whenever the sibling selection itself changes — selecting a sibling is a
  // deliberate "include this in the payment" action, so the suggested amount
  // must track it upward too, not just clamp down (see the clamp watch below,
  // which only ever handles decreases).
  const suggestAmountToPay = () => {
    amountToPayNow.value = suggestedAmount();
  };

  watch(selectedSiblingIds, () => nextTick(suggestAmountToPay), { deep: true });

  // Only clamp the entered amount when the total due drops below it (e.g. a
  // service is removed). suggestAmountToPay above handles increases (initial
  // suggestion + sibling selection); this only ever needs to handle decreases
  // so a user's custom partial-payment amount is never silently overwritten by
  // an unrelated service-price change.
  watch(combinedTotalDueNow, (newVal) => {
    if (amountToPayNow.value > newVal) {
      amountToPayNow.value = Math.max(0, newVal); // a client in credit owes nothing
    }
  });

  const onPackageChanged = (data: any) => {
    if (data.new_balance !== undefined && selectedClient.value) {
      selectedClient.value.outstanding_balance = Number(data.new_balance);
    }
    if (data.amount) form.value.deposit_amount += Number(data.amount);
    if (data.status) form.value.status = data.status;
    if (data.payment_status) form.value.payment_status = data.payment_status;
    originalSnapshot.value = {
      ...originalSnapshot.value,
      deposit: form.value.deposit_amount,
    };
    emit("save");
  };

  // A manual checkout price change re-derives each service's price_override
  // server-side (see /api/v1/appointments/:id/price-change) — the server is
  // the sole authority on the split, so servicesList is replaced verbatim from
  // its response rather than re-deriving the same math client-side too.
  const onPriceChanged = (data: any) => {
    if (Array.isArray(data.services)) {
      // Only the prices changed: each row keeps everything else (its variation, label).
      const rowFor = (s: any) =>
        servicesList.value.find(
          (r: any) =>
            r.service_id === s.service_id &&
            r.staff_id === s.staff_id &&
            new Date(r.start_time).getTime() === new Date(s.start_time).getTime(),
        );
      servicesList.value = markManualStarts(data.services.map((s: any) => ({
        ...rowFor(s),
        service_id: s.service_id,
        staff_id: s.staff_id,
        start_time: new Date(s.start_time),
        duration_override: s.duration_override,
        price_override: Number(s.price_override),
        persons: personsOf(s),
      })));
      originalServices.value = snapshotServices(servicesList.value);
    }
    // The new price replaces any discount; what's left on the products is their price now.
    if (data.discount_cleared) {
      discount.value = emptyDiscount();
      originalDiscountAmount.value = 0;
      if (Array.isArray(data.products)) {
        productsList.value = data.products.map((p: any) => ({
          product_id: p.product_id,
          staff_id: p.staff_id ?? null,
          quantity: p.quantity,
          price: Number(p.price || 0),
        }));
      }
    }
    // The same-day appointments paid with this one have new prices too.
    siblingAppointments.value = siblingAppointments.value.map((s: any) =>
      data.totals?.[s.id] === undefined
        ? s
        : { ...s, total_cost: data.totals[s.id], owed: Math.max(0, data.totals[s.id] - Number(s.deposit_amount || 0)) },
    );
    if (data.new_balance !== undefined && selectedClient.value) {
      selectedClient.value.outstanding_balance = Number(data.new_balance);
    }
    if (data.version !== undefined) currentVersion.value = data.version;
    if (data.booking_notes !== undefined) form.value.booking_notes = data.booking_notes || "";
    // The dialog stays open: charging comes right after this.
    originalSnapshot.value = { ...originalSnapshot.value, price: currentApptTotal.value };
    later.markLoaded();
    emit("refresh");
  };

  const onRefunded = (data: any) => {
    if (data.new_balance !== undefined && selectedClient.value) {
      selectedClient.value.outstanding_balance = Number(data.new_balance);
    }
    // deposit_amount tracks "amount paid so far" for this dialog's own display
    // (max refundable, balance summary) — a refund reduces net-collected, so
    // it needs to shrink the same way a payment grows it.
    form.value.deposit_amount = Math.max(
      0,
      form.value.deposit_amount - Number(data.amount || 0),
    );
    // The server now keeps the booking's paid state in step with the refund.
    if (data.payment_status) form.value.payment_status = data.payment_status;
    originalSnapshot.value = {
      ...originalSnapshot.value,
      deposit: form.value.deposit_amount,
    };
    emit("save");
  };

  // A payment moved to another way of paying: what was paid in all is the
  // same, only the calendar and the client's balance need refreshing.
  const onPaymentMethodChanged = (data: any) => {
    if (data.new_balance !== undefined && selectedClient.value) {
      selectedClient.value.outstanding_balance = Number(data.new_balance);
    }
    if (data.payment_status) form.value.payment_status = data.payment_status;
    emit("save");
  };

  // A price change can move what's owed after the amount was chosen. Paying the
  // whole amount simply follows it; a split, a part payment, a gift card or a
  // membership needs a person to look again.
  const onPriceChangedInPayment = (data: any) => {
    const dueBefore = combinedTotalDueNow.value;
    const amountBefore = amountToPayNow.value;
    const paidWhole = amountBefore === dueBefore || amountBefore === suggestedAmount();
    const simple =
      paidWhole &&
      !bookingPaymentsRef.value?.splitEnabled &&
      !["gift-card", "membership"].includes(selectedPaymentMethod.value);
    const wasSettled = isPaymentSettled.value;
    onPriceChanged(data);
    nextTick(() => {
      const due = combinedTotalDueNow.value;
      if (due <= 0) return;
      if (wasSettled) {
        amountToPayNow.value = suggestedAmount();
        return;
      }
      if (simple) {
        amountToPayNow.value = Math.min(due, Math.max(0, amountBefore + due - dueBefore));
        toast.add({ severity: "info", summary: t("payment.stepper.amountFollowed", { amount: formatMoney(amountToPayNow.value) }), life: 3500 });
        return;
      }
      amountToPayNow.value = Math.min(due, amountBefore);
      toast.add({ severity: "warn", summary: t("payment.stepper.checkAmount"), life: 4000 });
    });
  };
  const paymentRequestBody = (
    { serviceLegAmount, serviceLegAmount2, extrasOnSecond, packageTotal, giftCardTotal }: {
      serviceLegAmount: number; serviceLegAmount2: number; extrasOnSecond: number; packageTotal: number; giftCardTotal: number;
    },
    split: PaymentSplit,
  ) => ({
    appointment_id: form.value.id,
    ...(selectedSiblingIds.value.length > 0
      ? { appointment_ids: [form.value.id, ...selectedSiblingIds.value] }
      : {}),
    client_id: form.value.client_id,
    amount: serviceLegAmount,
    payment_method: selectedPaymentMethod.value,
    gift_card_id: selectedGiftCardId.value,
    redemptions: selectedMembershipRedemptions.value,
    ...(packageTotal > 0
      ? {
          package_purchases: pendingPackages.value.map((p) => ({
            package_type_id: p.package_type_id,
          })),
        }
      : {}),
    ...(giftCardTotal > 0
      ? { gift_card_purchases: pendingGiftCards.value }
      : {}),
    ...(split
      ? {
          amount2: serviceLegAmount2,
          extras_amount2: extrasOnSecond,
          payment_method2: split.payment_method2,
          gift_card_id2: split.gift_card_id2,
          redemptions2: split.redemptions2,
        }
      : {}),
  });

  // Back to a fresh choice after a payment: a gift card's cached balance is
  // stale, and any further payment (e.g. covering a shortfall) needs a fresh pick.
  const resetPaymentChoice = () => {
    selectedGiftCardId.value = null;
    selectedMembershipRedemptions.value = [];
    if (
      selectedPaymentMethod.value === "gift-card" ||
      selectedPaymentMethod.value === "membership"
    ) {
      selectedPaymentMethod.value = "card";
    }
    bookingPaymentsRef.value?.disableSplit();
    paymentStep.value = 1;
  };

  // The messages after a recorded payment: what was sold, and what was paid.
  const announcePayment = (data: any, split: PaymentSplit, serviceLegAmount: number) => {
    if (data.packages_purchased?.length) {
      toast.add({
        severity: "success",
        summary: t("packages.sell.sold"),
        detail: data.packages_purchased.map((p: any) => p.name).join(", "),
        life: 3000,
      });
      pendingPackages.value = [];
      bookingPackagesRef.value?.load();
    }

    if (data.gift_cards_purchased?.length) {
      toast.add({
        severity: "success",
        summary: t("giftCards.quickSell.sold"),
        detail: data.gift_cards_purchased
          .map((g: any) => g.card_number)
          .join(", "),
        life: 3000,
      });
      pendingGiftCards.value = [];
    }

    // Every recorded payment is confirmed: a split one with both legs,
    // otherwise the amount and method (package and gift-card sales have
    // their own toasts above).
    if (!split && (serviceLegAmount > 0 || selectedPaymentMethod.value === "membership")) {
      toast.add({
        severity: "success",
        summary: t("payment.recordedToast"),
        detail: t("payment.recordedToastDetail", {
          amount: formatMoney(serviceLegAmount),
          method: t(`payment.methodLabels.${selectedPaymentMethod.value}`),
        }),
        life: 4000,
      });
    }
    if (split) {
      toast.add({
        severity: "success",
        summary: t("payment.split.paidToast"),
        detail: t("payment.split.paidToastDetail", {
          method1: t(`payment.methodLabels.${selectedPaymentMethod.value}`),
          amount1: formatMoney(amountToPayNow.value),
          method2: t(`payment.methodLabels.${split.payment_method2}`),
          amount2: formatMoney(split.amount2),
        }),
        life: 5000,
      });
    }
  };

  const recordPayment = async (
    split: {
      amount2: number;
      payment_method2: string;
      gift_card_id2: string | null;
      redemptions2?: any[];
    } | null,
  ) => {
    if (
      amountToPayNow.value <= 0 &&
      pendingPackagesTotal.value <= 0 &&
      pendingGiftCardsTotal.value <= 0
    ) {
      toast.add({ severity: "warn", summary: t("booking.toast.paymentFailed"), detail: t("payment.nothingToPay"), life: 3500 });
      return;
    }
    paymentLoading.value = true;

    // The entered amount covers "service + package" together (see totalDueNow),
    // but only the non-package part goes through the appointment's own debt
    // logic server-side — the package is sold in full, separately, regardless
    // of how much of the service itself is actually being paid right now.
    const packageTotal = pendingPackagesTotal.value;
    const giftCardTotal = pendingGiftCardsTotal.value;
    // Packages and gift cards are paid first (see paymentShares).
    const {
      extrasOnSecond,
      owedOnFirst: serviceLegAmount,
      owedOnSecond: serviceLegAmount2,
    } = paymentShares(amountToPayNow.value, packageTotal + giftCardTotal, split ? split.amount2 : null);

    // Save any pending form changes (services, notes) before processing payment.
    // Do NOT force status='completed' here — the transaction endpoint handles that
    // atomically so a failed payment can't leave the appointment marked complete.
    if (!(await later.save(false))) {
      paymentLoading.value = false;
      return;
    }

    if (!form.value.id) {
      // No booking to attach the payment to (the save above didn't go through).
      // A booking saved offline has a temporary id here, and its payment is
      // queued behind it — that case doesn't reach this branch.
      toast.add({
        severity: "warn",
        summary: t("booking.toast.paymentFailed"),
        detail: t("booking.toast.paymentWaitingForSync"),
        life: 5000,
      });
      paymentLoading.value = false;
      return;
    }

    try {
      const result = await fetchOrQueue(
        "/api/v1/transactions",
        "POST",
        paymentRequestBody({ serviceLegAmount, serviceLegAmount2, extrasOnSecond, packageTotal, giftCardTotal }, split),
        {
          kind: "payment",
          label:
            `${t("payment.title")} — ${selectedClient.value?.first_name || ""}`.trim(),
        },
      );

      if (result.queued) {
        const totalPaidThisVisit = serviceLegAmount + serviceLegAmount2;
        // Reflect the payment locally right away so staff aren't blocked, but
        // this is optimistic — the server hasn't actually seen it yet. The
        // queued request already carries package_purchases, so the package(s)
        // will be created once it syncs.
        form.value.deposit_amount += totalPaidThisVisit;
        currentVersion.value = null; // the queued payment will change it
        pendingPackages.value = [];
        pendingGiftCards.value = [];
        // Any selected siblings' owed/payment_status are about to change once
        // the queue flushes server-side — clear rather than show stale figures
        // while offline.
        selectedSiblingIds.value = [];
        siblingAppointments.value = [];
        toast.add({
          severity: "warn",
          summary: t("booking.toast.savedOffline"),
          detail: t("booking.toast.paymentQueuedDetail"),
          life: 5000,
        });
        resetPaymentChoice();
        paymentLoading.value = false;
        return;
      }

      const res = result.response;

      if (res.ok) {
        const data = await res.json();
        const totalPaidThisVisit = serviceLegAmount + serviceLegAmount2;

        // Update local deposit_amount for immediate UI feedback (package
        // purchases never touch the appointment's own deposit/payment_status).
        form.value.deposit_amount += totalPaidThisVisit;

        // Any paid siblings' owed/payment_status are now stale (the server
        // already updated them) — clear rather than show outdated figures;
        // re-opening the dialog refetches fresh state.
        selectedSiblingIds.value = [];
        siblingAppointments.value = [];

        // Use the authoritative balance returned by the server instead of guessing by subtraction
        if (data.new_balance !== undefined && selectedClient.value) {
          selectedClient.value.outstanding_balance = Number(data.new_balance);
        }
        if (data.appointment_version !== undefined) currentVersion.value = data.appointment_version;

        announcePayment(data, split, serviceLegAmount);

        resetPaymentChoice();

        emit("save"); // Refresh the background calendar
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.add({
          severity: "error",
          summary: t("booking.toast.paymentFailed"),
          detail: errData.error || t("booking.toast.paymentFailedDetail"),
          life: 4000,
        });
      }
    } catch (e) {
      console.error(e);
      toast.add({
        severity: "error",
        summary: t("booking.toast.paymentFailed"),
        detail: t("booking.toast.networkError"),
        life: 4000,
      });
    } finally {
      paymentLoading.value = false;
    }
  };

  return { openSale, resetPayment, suggestAmountToPay, onPackageChanged, onPriceChanged, onRefunded, onPaymentMethodChanged, onPriceChangedInPayment, recordPayment };
};
