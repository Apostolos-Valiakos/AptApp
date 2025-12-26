<template>
  <div class="space-y-6 pt-4">
    <div
      class="bg-gray-900 text-white rounded-xl p-8 shadow-xl relative overflow-hidden"
    >
      <div class="flex justify-between items-center mb-1 opacity-70">
        <span class="text-xs uppercase tracking-wider font-bold"
          >Total Due Now</span
        >
      </div>
      <div class="text-5xl font-extrabold mb-6 tracking-tight">
        €{{ totalDueNow.toFixed(2) }}
      </div>
      <div class="space-y-2 border-t border-gray-700 pt-4 text-sm opacity-90">
        <div class="flex justify-between">
          <span>Current Appointment</span>
          <span class="font-medium">€{{ currentApptTotal.toFixed(2) }}</span>
        </div>
        <div
          v-if="previousDebt > 0"
          class="flex justify-between text-orange-300"
        >
          <span>Previous Unpaid Balance</span>
          <span class="font-bold">+ €{{ previousDebt.toFixed(2) }}</span>
        </div>
        <div class="border-t border-gray-700 pt-2 flex justify-between">
          <span>Paid Today</span>
          <span>- €{{ depositAmount.toFixed(2) }}</span>
        </div>
      </div>
    </div>

    <div v-if="totalDueNow > 0" class="animate-fade-in">
      <div class="mb-6">
        <label
          class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2"
          >Payment Method</label
        >
        <Dropdown
          :modelValue="paymentMethod"
          @update:modelValue="$emit('update:paymentMethod', $event)"
          :options="['card', 'cash', 'gift-card']"
          class="w-full"
        />
      </div>
      <div class="mb-6">
        <label
          class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2"
          >Amount to Pay</label
        >
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
        label="Charge & Complete"
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
      <h3 class="text-xl font-bold text-green-900">Payment Complete</h3>
      <p class="text-green-700 text-sm">No outstanding balance.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps({
  totalDueNow: { type: Number, default: 0 },
  currentApptTotal: { type: Number, default: 0 },
  previousDebt: { type: Number, default: 0 },
  depositAmount: { type: Number, default: 0 },
  paymentMethod: { type: String, default: "card" },
  amountToPay: { type: Number, default: 0 },
  loading: { type: Boolean, default: false },
});

defineEmits(["pay", "update:paymentMethod", "update:amountToPay"]);
</script>
