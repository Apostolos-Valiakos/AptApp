<template>
  <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
    <h3 class="font-bold text-gray-900 mb-4">
      {{ t("profile.preferences.title") }}
    </h3>

    <div class="flex items-center justify-between">
      <span class="text-sm text-gray-600">{{
        t("profile.preferences.notifications")
      }}</span>
      <InputSwitch v-model="preferences.notifications" />
    </div>
    <p class="text-xs text-gray-400 mt-1">
      {{ t("profile.preferences.notificationsSoon") }}
    </p>
  </div>
</template>

<script setup lang="ts">
// Personal preferences (notifications: not available yet).
import { reactive } from "vue";
import { useI18n } from "vue-i18n";
import InputSwitch from "primevue/inputswitch";

const { t } = useI18n();
const preferences = reactive({ notifications: true });
</script>
