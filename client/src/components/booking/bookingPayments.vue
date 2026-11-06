<template>
  <div class="space-y-6">
    <!-- Cash payment banner (shown together with the Payment Complete state below) -->
    <div
      v-if="totalDueNow <= 0 && paidPaymentMethod === 'cash'"
      class="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3"
    >
      <div
        class="w-10 h-10 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center flex-shrink-0"
      >
        <i class="pi pi-money-bill"></i>
      </div>
      <div>
        <h4 class="text-sm font-bold text-amber-900">
          {{ t("payment.cashPaidNotice.title") }}
        </h4>
        <p class="text-xs text-amber-700">
          {{ t("payment.cashPaidNotice.note") }}
        </p>
      </div>
    </div>

    <div v-if="totalDueNow > 0" class="animate-fade-in">
      <!-- Step 2: how the client pays -->
      <div v-show="step === 2">
      <!-- Appointment settled info box -->
      <div
        v-if="depositAmount >= currentApptTotal && previousDebt > 0"
        class="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-3"
      >
        <div
          class="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center flex-shrink-0"
        >
          <i class="pi pi-info-circle"></i>
        </div>
        <div>
          <h4 class="text-sm font-bold text-blue-900">
            {{ t("payment.settled") }}
          </h4>
          <p class="text-xs text-blue-700">{{ t("payment.settledNote") }}</p>
        </div>
      </div>

      <!-- Payment method (leg 1) -->
      <div class="mb-6">
        <label
          class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2"
          >{{ t("payment.paymentMethod") }}</label
        >
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <button
            v-for="method in METHODS"
            :key="method"
            type="button"
            class="flex items-center justify-center gap-2 px-3 py-3 rounded-xl border text-sm font-semibold transition-colors"
            :class="
              paymentMethod === method
                ? 'border-[var(--p-primary-color)] bg-[var(--p-primary-50)] text-[var(--p-primary-700)] ring-1 ring-[var(--p-primary-color)]'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            "
            :aria-pressed="paymentMethod === method"
            :data-testid="`payment-method-${method}`"
            @click="onPaymentMethodChange(method)"
          >
            <i :class="['pi', paidMethodIcons[method]]"></i>
            {{ t(`common.paymentMethod.${method}`) }}
          </button>
        </div>
      </div>

      <!-- Membership picker (leg 1) -->
      <div v-if="paymentMethod === 'membership'" class="mb-6">
        <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
          {{ t("payment.membership.label") }}
        </label>
        <MembershipPicker
          ref="membershipPickerRef"
          :clientId="clientId"
          :catalogServices="catalogServices"
          :appointmentServices="appointmentServices"
          @update:redemptions="(v) => $emit('update:membershipRedemptions', v)"
          @update:amount="onMembershipAmountChange"
        />
      </div>

      <!-- Gift card picker (leg 1) -->
      <div v-if="paymentMethod === 'gift-card'" class="mb-6">
        <label
          class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2"
        >
          {{ t("payment.giftCard.label") }}
        </label>
        <GiftCardPicker
          :modelValue="giftCardId"
          @update:modelValue="(v) => $emit('update:giftCardId', v)"
          @update:card="(c) => (selectedGiftCard = c)"
        />

      </div>

      <p v-if="methodProblem" class="text-xs text-red-600 mb-3" data-testid="payment-sale-method">
        {{ t(methodProblem) }}
      </p>

      <!-- Split payment toggle -->
      <div class="mb-6">
        <button
          v-if="!splitEnabled"
          type="button"
          class="text-xs font-bold text-[var(--p-primary-600)] hover:underline flex items-center gap-1"
          data-testid="payment-add-split"
          @click="enableSplit"
        >
          <i class="pi pi-plus text-[10px]"></i>
          {{ t("payment.split.add") }}
        </button>

        <div
          v-else
          class="border border-gray-200 rounded-xl p-4 bg-gray-50/60 space-y-4"
        >
          <div class="flex justify-between items-center">
            <span
              class="text-xs font-bold text-gray-500 uppercase tracking-wider"
            >
              {{ t("payment.split.secondMethod") }}
            </span>
            <button
              type="button"
              class="text-gray-400 hover:text-red-500"
              @click="disableSplit"
            >
              <i class="pi pi-times"></i>
            </button>
          </div>

          <Dropdown
            :modelValue="paymentMethod2"
            @update:modelValue="onPaymentMethod2Change"
            :options="method2Options"
            class="w-full"
          >
            <template #value="slotProps">
              {{ slotProps.value ? t(`common.paymentMethod.${slotProps.value}`) : "" }}
            </template>
            <template #option="slotProps">
              {{ t(`common.paymentMethod.${slotProps.option}`) }}
            </template>
          </Dropdown>

          <GiftCardPicker
            v-if="paymentMethod2 === 'gift-card'"
            :modelValue="giftCardId2"
            @update:modelValue="(v) => (giftCardId2 = v)"
            @update:card="(c) => (selectedGiftCard2 = c)"
          />

          <MembershipPicker
            v-if="paymentMethod2 === 'membership'"
            ref="membershipPicker2Ref"
            :clientId="clientId"
            :catalogServices="catalogServices"
            :appointmentServices="appointmentServices"
            @update:redemptions="(v) => (membershipRedemptions2 = v)"
            @update:amount="onMembershipAmount2Change"
          />

        </div>
      </div>

      </div>

      <!-- Step 3: price change and charge -->
      <div v-show="step === 3" class="space-y-6">
        <div class="bg-white border border-gray-200 rounded-xl p-4 space-y-4" data-testid="payment-review">
          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              {{ t(`common.paymentMethod.${paymentMethod}`) }} ·
              {{ depositAmount >= currentApptTotal ? t("payment.amountTowardBalance") : t("payment.amountNow") }}
            </label>
            <InputNumber
              :modelValue="amountToPay"
              @update:modelValue="$emit('update:amountToPay', $event)"
              @input="fillSecondAmount($event.value as number | null)"
              mode="currency"
              currency="EUR"
              class="w-full fresha-input-large"
              inputClass="!text-lg !font-bold"
              :max="maxAmount"
              :disabled="paymentMethod === 'membership'"
            />
          </div>
          <div v-if="splitEnabled">
            <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              {{ t(`common.paymentMethod.${paymentMethod2}`) }} · {{ t("payment.split.secondAmount") }}
            </label>
            <InputNumber
              :modelValue="amountToPay2"
              @update:modelValue="onSecondAmountChange"
              data-testid="payment-second-amount"
              mode="currency"
              currency="EUR"
              class="w-full"
              :max="maxAmount2"
            />
          </div>
          <div v-if="remainderAfterBoth > 0" class="flex justify-between text-sm border-t border-gray-100 pt-3">
            <span class="text-gray-600">{{ t("payment.stepper.remaining") }}</span>
            <span class="font-semibold text-red-600" data-testid="payment-remaining">{{ formatMoney(remainderAfterBoth) }}</span>
          </div>
          <p v-if="salesProblem" class="text-xs text-red-600" data-testid="payment-sale-problem">
            {{ t(salesProblem, { amount: formatMoney(salesTotal) }) }}
          </p>
          <div
            v-if="
              paymentMethod === 'gift-card' &&
              selectedGiftCard &&
              Number(selectedGiftCard.remaining_balance) < totalDueNow
            "
            class="flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg"
          >
            <i class="pi pi-exclamation-triangle text-orange-500 mt-0.5"></i>
            <p class="text-xs text-orange-700">
              {{
                t("payment.giftCard.shortfall", {
                  covered: formatMoney(selectedGiftCard.remaining_balance),
                  remaining: formatMoney(totalDueNow - Number(selectedGiftCard.remaining_balance)),
                })
              }}
            </p>
          </div>
        </div>

        <slot name="beforeCharge" />

        <Button
          :label="
            depositAmount >= currentApptTotal
              ? t('payment.clearDebt')
              : t('payment.chargeComplete')
          "
          icon="pi pi-check"
          class="w-full !py-4 !text-lg !bg-green-600 hover:!bg-green-700 !border-none"
          :loading="loading"
          :disabled="!canSubmit"
          data-testid="payment-submit"
          @click="submitPayment"
        />
      </div>
    </div>
    <!-- Payment complete state -->
    <div
      v-else
      class="text-center p-8 bg-green-50 rounded-xl border border-green-100 animate-fade-in"
    >
      <div
        class="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4"
      >
        <i class="pi pi-check text-3xl"></i>
      </div>
      <h3 class="text-xl font-bold text-green-900">
        {{ t("payment.paymentComplete") }}
      </h3>
      <p class="text-green-700 text-sm">
        {{ t("payment.noOutstandingBalance") }}
      </p>
      <div
        v-if="paidMethodDisplay"
        class="inline-flex items-center gap-1.5 mt-3 px-3 py-1 bg-white border border-green-200 rounded-full text-xs font-semibold text-green-800"
      >
        <i :class="['pi', paidMethodDisplay.icon]"></i>
        {{ t("payment.paidVia", { method: paidMethodDisplay.label }) }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatMoney } from "../../utils/format";
import { ref, computed, watch, type PropType } from "vue";
import { useI18n } from "vue-i18n";
import GiftCardPicker from "./GiftCardPicker.vue";
import MembershipPicker from "./MembershipPicker.vue";
const { t } = useI18n();

const METHODS = ["cash", "card", "bank-transfer", "gift-card", "membership"];

const props = defineProps({
  step: { type: Number, default: 2 },
  totalDueNow: { type: Number, default: 0 },
  currentApptTotal: { type: Number, default: 0 },
  salesTotal: { type: Number, default: 0 },
  previousDebt: { type: Number, default: 0 },
  depositAmount: { type: Number, default: 0 },
  amountToPay: { type: Number, default: 0 },
  loading: { type: Boolean, default: false },
  paymentMethod: { type: String, default: "cash" },
  giftCardId: { type: String as PropType<string | null>, default: null },
  paidPaymentMethod: { type: String, default: null },
  clientId: { type: String, default: null },
  catalogServices: { type: Array as () => any[], default: () => [] },
  appointmentServices: { type: Array as () => any[], default: () => [] },
  membershipRedemptions: { type: Array as () => any[], default: () => [] },
});

const emit = defineEmits([
  "update:amountToPay",
  "update:paymentMethod",
  "update:giftCardId",
  "update:membershipRedemptions",
  "pay",
]);

const membershipPickerRef = ref<any>(null);
const membershipPicker2Ref = ref<any>(null);
const membershipRedemptions2 = ref<any[]>([]);
const membershipAmount2 = ref(0);

const onMembershipAmountChange = (amount: number) => {
  emit("update:amountToPay", amount);
};

const selectedGiftCard = ref<any>(null);

// Purely a display concern — the actual payment_method stays exactly as
// stored/paid. Only bank-transfer is shown with cash's icon/label.
const paidMethodIcons: Record<string, string> = {
  cash: "pi-money-bill",
  "bank-transfer": "pi-money-bill",
  card: "pi-credit-card",
  "gift-card": "pi-ticket",
  membership: "pi-id-card",
};

const paidMethodDisplay = computed(() => {
  const method = props.paidPaymentMethod;
  if (!method || !paidMethodIcons[method]) return null;
  return {
    icon: paidMethodIcons[method],
    label: t(`payment.methodLabels.${method}`),
  };
});

const maxAmount = computed(() => {
  if (props.paymentMethod === "gift-card" && selectedGiftCard.value) {
    return Math.min(
      props.totalDueNow,
      Number(selectedGiftCard.value.remaining_balance),
    );
  }
  return props.totalDueNow;
});

const onPaymentMethodChange = (value: string) => {
  emit("update:paymentMethod", value);
};

// Clears the (potentially stale) selected card whenever leg 1's method moves
// away from "gift-card" — whether the user changed the dropdown or the
// parent reset it programmatically after a successful payment.
watch(
  () => props.paymentMethod,
  (val) => {
    if (val !== "gift-card") selectedGiftCard.value = null;
  },
);

// --- Split payment (second leg) ---
const splitEnabled = ref(false);
const paymentMethod2 = ref("cash");
const giftCardId2 = ref<string | null>(null);
const selectedGiftCard2 = ref<any>(null);
const amountToPay2 = ref(0);

const onMembershipAmount2Change = (amount: number) => {
  membershipAmount2.value = amount;
  amountToPay2.value = amount;
};

// Leg 2's method options exclude whichever method leg 1 is currently using —
// splitting into the SAME method twice is meaningless.
const method2Options = computed(() =>
  ["cash", "card", "bank-transfer", "gift-card", "membership"].filter(
    (m) => m !== props.paymentMethod,
  ),
);

// The first amount gives way to what's typed in the second, unless a
// membership fixes it (its amount comes from the services it covers).
const maxAmount2 = computed(() => {
  const room =
    props.paymentMethod === "membership"
      ? Math.max(0, props.totalDueNow - (props.amountToPay || 0))
      : props.totalDueNow;
  if (paymentMethod2.value === "gift-card" && selectedGiftCard2.value) {
    return Math.min(room, Number(selectedGiftCard2.value.remaining_balance));
  }
  return room;
});

const onSecondAmountChange = (value: number | null) => {
  amountToPay2.value = value || 0;
  const roomForFirst = Math.max(0, props.totalDueNow - amountToPay2.value);
  if ((props.amountToPay || 0) > roomForFirst) emit("update:amountToPay", roomForFirst);
};

const remainderAfterBoth = computed(() =>
  Math.max(
    0,
    props.totalDueNow - (props.amountToPay || 0) - (amountToPay2.value || 0),
  ),
);

const enableSplit = () => {
  splitEnabled.value = true;
  paymentMethod2.value = method2Options.value[0] || "cash";
  fillSecondAmount(props.amountToPay);
};

// The second way of paying takes what the first leaves, up to a gift card's
// balance. A membership's amount comes from the services it covers instead.
const fillSecondAmount = (firstAmount: number | null) => {
  if (!splitEnabled.value || paymentMethod2.value === "membership") return;
  const rest = Math.max(0, props.totalDueNow - (firstAmount || 0));
  amountToPay2.value =
    paymentMethod2.value === "gift-card" && selectedGiftCard2.value
      ? Math.min(rest, Number(selectedGiftCard2.value.remaining_balance))
      : rest;
};
watch(
  () => [props.amountToPay, props.totalDueNow, paymentMethod2.value, selectedGiftCard2.value],
  () => fillSecondAmount(props.amountToPay),
);

const disableSplit = () => {
  splitEnabled.value = false;
  paymentMethod2.value = "cash";
  giftCardId2.value = null;
  selectedGiftCard2.value = null;
  amountToPay2.value = 0;
  membershipRedemptions2.value = [];
  membershipPicker2Ref.value?.clear();
};

const onPaymentMethod2Change = (value: string) => {
  paymentMethod2.value = value;
  if (value !== "gift-card") {
    giftCardId2.value = null;
    selectedGiftCard2.value = null;
  }
  if (value !== "membership") {
    membershipRedemptions2.value = [];
  }
};

// Auto-open the split panel the moment a selected gift card falls short —
// covers the motivating case without requiring the manual "+ add" click.
watch(
  () => [
    props.paymentMethod,
    selectedGiftCard.value,
    props.totalDueNow,
    props.amountToPay,
  ],
  () => {
    if (
      props.paymentMethod === "gift-card" &&
      selectedGiftCard.value &&
      Number(selectedGiftCard.value.remaining_balance) < props.totalDueNow &&
      !splitEnabled.value
    ) {
      enableSplit();
    }
  },
);

// Packages and gift cards being sold must be paid in full, by the first way of
// paying and then the second, and only with cash, card or bank transfer.
const SALE_METHODS = ["cash", "card", "bank-transfer"];
const methodProblem = computed(() =>
  props.salesTotal > 0 && !SALE_METHODS.includes(props.paymentMethod) ? "payment.stepper.saleMethod" : null,
);
const salesProblem = computed(() => {
  if (props.salesTotal <= 0 || methodProblem.value) return null;
  const second = splitEnabled.value && SALE_METHODS.includes(paymentMethod2.value) ? amountToPay2.value || 0 : 0;
  if ((props.amountToPay || 0) + second < props.salesTotal - 0.005) return "payment.stepper.saleInFull";
  return null;
});

// Step 2 is about the ways of paying: each is chosen and has what it needs.
const canContinue = computed(() => {
  if (methodProblem.value) return false;
  if (props.paymentMethod === "gift-card" && !props.giftCardId) return false;
  if (
    props.paymentMethod === "membership" &&
    (!props.membershipRedemptions || !props.membershipRedemptions.length)
  )
    return false;
  if (splitEnabled.value) {
    if (paymentMethod2.value === "gift-card" && !giftCardId2.value) return false;
    if (paymentMethod2.value === "membership" && !membershipRedemptions2.value.length) return false;
  }
  return true;
});

// Step 3 adds the amounts.
const canSubmit = computed(() => {
  if (!canContinue.value || salesProblem.value) return false;
  if (!(props.amountToPay > 0)) return false;
  if (splitEnabled.value && !(amountToPay2.value > 0)) return false;
  return true;
});

const submitPayment = () => {
  emit(
    "pay",
    splitEnabled.value
      ? {
          amount2: amountToPay2.value,
          payment_method2: paymentMethod2.value,
          gift_card_id2: giftCardId2.value,
          redemptions2: membershipRedemptions2.value,
        }
      : null,
  );
};

defineExpose({ disableSplit, canContinue, splitEnabled });
</script>
