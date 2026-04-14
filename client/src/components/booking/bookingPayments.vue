<template>
  <div class="space-y-6 pt-4">
    <div
      class="bg-gray-900 text-white rounded-xl p-8 shadow-xl relative overflow-hidden"
    >
      <div class="flex justify-between items-center mb-1 opacity-70">
        <span class="text-xs uppercase tracking-wider font-bold"
          >Συνολικο Υπολοιπο</span
        >
      </div>
      <div class="text-5xl font-extrabold mb-6 tracking-tight">
        €{{ previousDebt.toFixed(2) }}
      </div>
      <div class="space-y-2 border-t border-gray-700 pt-4 text-sm opacity-90">
        <div class="flex justify-between">
          <span>Κόστος ραντεβού</span>
          <span class="font-medium">€{{ currentApptTotal.toFixed(2) }}</span>
        </div>
        <div class="border-t border-gray-700 pt-2 flex justify-between">
          <span>Πληρώθηκαν</span>
          <span>- €{{ depositAmount.toFixed(2) }}</span>
        </div>
      </div>
    </div>

    <div v-if="totalDueNow > 0" class="animate-fade-in">
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
          <h4 class="text-sm font-bold text-blue-900">Appointment Settled</h4>
          <p class="text-xs text-blue-700">
            This appointment is paid. The remaining balance belongs to previous
            unpaid visits.
          </p>
        </div>
      </div>

      <div class="mb-6">
        <label
          class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2"
          >Payment Method</label
        >
        <Dropdown
          :modelValue="paymentMethod"
          @update:modelValue="$emit('update:paymentMethod', $event)"
          :options="['cash', 'card', 'bank-transfer']"
          class="w-full"
        />
      </div>

      <div class="mb-6">
        <label
          class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2"
        >
          {{
            depositAmount >= currentApptTotal
              ? "Pay Toward Pending Balance"
              : "Amount to Pay Now"
          }}
        </label>
        <InputNumber
          :modelValue="amountToPay"
          @update:modelValue="$emit('update:amountToPay', $event)"
          mode="currency"
          currency="EUR"
          class="w-full fresha-input-large"
          inputClass="!text-lg !font-bold"
          :max="totalDueNow"
        />
      </div>

      <Button
        :label="
          depositAmount >= currentApptTotal
            ? 'Clear Remaining Debt'
            : 'Charge & Complete'
        "
        icon="pi pi-check"
        class="w-full !py-4 !text-lg !bg-green-600 hover:!bg-green-700 !border-none"
        :loading="loading"
        @click="$emit('pay')"
      />
    </div>

    <div
      v-else
      class="text-center p-8 bg-green-50 rounded-xl border border-green-100"
    >
      <div
        class="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4"
      >
        <i class="pi pi-check text-2xl"></i>
      </div>
      <h3 class="text-xl font-bold text-green-900">Payment Complete</h3>
      <p class="text-green-700 text-sm">
        This client has no outstanding balance.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps({
  totalDueNow: { type: Number, default: 0 },
  currentApptTotal: { type: Number, default: 0 },
  previousDebt: { type: Number, default: 0 },
  depositAmount: { type: Number, default: 0 },
  amountToPay: { type: Number, default: 0 },
  loading: { type: Boolean, default: false },
  paymentMethod: { type: String, default: "cash" },
});

defineEmits(["update:amountToPay", "update:paymentMethod", "pay"]);
</script>
