<template>
  <div class="space-y-6 pt-4">
    <!-- Balance summary card -->
    <div
      class="bg-gradient-to-br from-gray-900 to-gray-800 text-white rounded-xl p-8 shadow-xl relative overflow-hidden"
    >
      <div class="flex justify-between items-center mb-1 opacity-70">
        <span class="text-xs uppercase tracking-wider font-bold">{{
          t("payment.totalBalance")
        }}</span>
      </div>
      <div
        class="text-5xl font-extrabold mb-6 tracking-tight"
        :class="{ 'animate-pulse': totalDueNow > 0 }"
      >
        €{{ totalDueNow.toFixed(2) }}
      </div>
      <div class="space-y-0 border-t border-gray-700 pt-4 text-sm opacity-90">
        <div class="flex justify-between py-2 border-b border-gray-700/50">
          <span>{{ t("payment.appointmentCost") }}</span>
          <span class="font-medium">€{{ currentApptTotal.toFixed(2) }}</span>
        </div>
        <div
          v-if="previousDebt > 0"
          class="flex justify-between py-2 border-b border-gray-700/50"
        >
          <span>{{ t("payment.previousDebt") }}</span>
          <span class="font-medium text-red-300"
            >+ €{{ previousDebt.toFixed(2) }}</span
          >
        </div>
        <div class="flex justify-between pt-2">
          <span>{{ t("payment.paid") }}</span>
          <span>- €{{ depositAmount.toFixed(2) }}</span>
        </div>
      </div>
    </div>

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
        <Dropdown
          :modelValue="paymentMethod"
          @update:modelValue="onPaymentMethodChange"
          :options="['cash', 'card', 'bank-transfer', 'gift-card', 'membership']"
          class="w-full"
        >
          <template #value="slotProps">
            <div class="flex items-center gap-2">
              <i class="pi pi-credit-card text-gray-400"></i>
              <span>{{ slotProps.value }}</span>
            </div>
          </template>
        </Dropdown>
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

        <!-- Shortfall warning -->
        <div
          v-if="
            selectedGiftCard &&
            Number(selectedGiftCard.remaining_balance) < totalDueNow
          "
          class="mt-2 flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg"
        >
          <i class="pi pi-exclamation-triangle text-orange-500 mt-0.5"></i>
          <p class="text-xs text-orange-700">
            {{
              t("payment.giftCard.shortfall", {
                covered: Number(selectedGiftCard.remaining_balance).toFixed(2),
                remaining: (
                  totalDueNow - Number(selectedGiftCard.remaining_balance)
                ).toFixed(2),
              })
            }}
          </p>
        </div>
      </div>

      <!-- Amount to pay (leg 1) -->
      <div class="mb-3">
        <label
          class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2"
        >
          {{
            depositAmount >= currentApptTotal
              ? t("payment.amountTowardBalance")
              : t("payment.amountNow")
          }}
        </label>
        <InputNumber
          :modelValue="amountToPay"
          @update:modelValue="$emit('update:amountToPay', $event)"
          mode="currency"
          currency="EUR"
          class="w-full fresha-input-large"
          inputClass="!text-lg !font-bold"
          :max="maxAmount"
          :disabled="paymentMethod === 'membership'"
        />
      </div>

      <!-- Split payment toggle -->
      <div class="mb-6">
        <button
          v-if="!splitEnabled"
          type="button"
          class="text-xs font-bold text-[var(--p-primary-600)] hover:underline flex items-center gap-1"
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
          />

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

          <div>
            <label
              class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2"
            >
              {{ t("payment.split.secondAmount") }}
            </label>
            <InputNumber
              v-model="amountToPay2"
              mode="currency"
              currency="EUR"
              class="w-full"
              :max="maxAmount2"
            />
            <p class="text-xs text-gray-400 mt-1">
              {{
                t("payment.split.remainingNote", {
                  remaining: remainderAfterBoth.toFixed(2),
                })
              }}
            </p>
          </div>
        </div>
      </div>

      <!-- Pay button -->
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
        @click="submitPayment"
      />
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
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import GiftCardPicker from "./GiftCardPicker.vue";
import MembershipPicker from "./MembershipPicker.vue";
const { t } = useI18n();

const props = defineProps({
  totalDueNow: { type: Number, default: 0 },
  currentApptTotal: { type: Number, default: 0 },
  previousDebt: { type: Number, default: 0 },
  depositAmount: { type: Number, default: 0 },
  amountToPay: { type: Number, default: 0 },
  loading: { type: Boolean, default: false },
  paymentMethod: { type: String, default: "cash" },
  giftCardId: { type: String, default: null },
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

const maxAmount2 = computed(() => {
  const remainderAfterLeg1 = Math.max(
    0,
    props.totalDueNow - (props.amountToPay || 0),
  );
  if (paymentMethod2.value === "gift-card" && selectedGiftCard2.value) {
    return Math.min(
      remainderAfterLeg1,
      Number(selectedGiftCard2.value.remaining_balance),
    );
  }
  return remainderAfterLeg1;
});

const remainderAfterBoth = computed(() =>
  Math.max(
    0,
    props.totalDueNow - (props.amountToPay || 0) - (amountToPay2.value || 0),
  ),
);

const enableSplit = () => {
  splitEnabled.value = true;
  paymentMethod2.value = method2Options.value[0] || "cash";
  amountToPay2.value = Math.max(
    0,
    props.totalDueNow - (props.amountToPay || 0),
  );
};

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

const canSubmit = computed(() => {
  if (props.paymentMethod === "gift-card" && !props.giftCardId) return false;
  if (
    props.paymentMethod === "membership" &&
    (!props.membershipRedemptions || !props.membershipRedemptions.length)
  )
    return false;
  if (splitEnabled.value) {
    if (!amountToPay2.value || amountToPay2.value <= 0) return false;
    if (paymentMethod2.value === "gift-card" && !giftCardId2.value)
      return false;
    if (
      paymentMethod2.value === "membership" &&
      !membershipRedemptions2.value.length
    )
      return false;
  }
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

defineExpose({ disableSplit });
</script>
