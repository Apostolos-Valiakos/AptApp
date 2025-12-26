<template>
  <div class="flex flex-col h-full border-l border-gray-200 overflow-hidden">
    <div v-if="client" class="p-8 text-center">
      <div
        class="w-20 h-20 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto text-2xl font-bold mb-4"
      >
        {{ client.first_name?.[0] || "?" }}{{ client.last_name?.[0] || "?" }}
      </div>
      <h3 class="text-xl font-bold">{{ client.full_name }}</h3>
      <p class="text-gray-500 text-sm">{{ client.email }}</p>
      <p class="text-gray-500 text-sm mb-4">{{ client.phone }}</p>

      <div
        v-if="Number(client.outstanding_balance) > 0"
        class="inline-block bg-red-100 text-red-800 text-xs font-bold px-3 py-1 rounded-full mb-6"
      >
        Balance: €{{ Number(client.outstanding_balance).toFixed(2) }}
      </div>

      <div
        v-if="client.custom_fields && client.custom_fields.length"
        class="text-left bg-white p-4 rounded-lg shadow-sm border border-gray-100"
      >
        <h4 class="text-xs font-bold text-gray-400 uppercase mb-3">Details</h4>
        <div
          v-for="(field, i) in client.custom_fields"
          :key="i"
          class="flex justify-between text-sm mb-2 border-b border-gray-50 pb-1 last:border-0"
        >
          <span class="text-gray-600">{{ field.title }}</span>
          <span class="font-medium text-gray-900">{{ field.value }}</span>
        </div>
      </div>
    </div>

    <div
      v-else
      class="h-full flex flex-col items-center justify-center text-gray-400"
    >
      <i class="pi pi-user text-3xl mb-2"></i>
      <p>Select a client to view details</p>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps({
  client: {
    type: Object,
    default: null,
  },
});
</script>
