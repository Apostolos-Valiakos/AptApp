<template>
  <div
    class="bg-white rounded-2xl shadow-sm border border-red-100 p-6"
  >
    <h3 class="text-base font-bold text-gray-900 mb-1">{{ t('profile.forceLogout.title') }}</h3>
    <p class="text-sm text-gray-500 mb-4">{{ t('profile.forceLogout.description') }}</p>

    <div v-if="settingsStore.cashLockedByShop" class="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-sm text-amber-800">
      <i class="pi pi-lock"></i>
      {{ t('profile.forceLogout.currentlyLocked') }}
    </div>

    <div class="flex flex-col gap-2">
      <Button
        :label="t('profile.forceLogout.button')"
        icon="pi pi-power-off"
        severity="danger"
        class="w-full"
        :loading="forcingLogout"
        @click="confirmForceLogout"
      />
      <Button
        v-if="settingsStore.cashLockedByShop"
        :label="t('profile.forceLogout.release')"
        icon="pi pi-lock-open"
        text
        class="w-full"
        :loading="releasingLock"
        @click="releaseLock"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
// Super admin: logging everyone in the shop out (and locking the cash filter), and releasing that lock.
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { useConfirm } from "primevue/useconfirm";
import Button from "primevue/button";
import { api } from "../../api/http";
import { useNotify } from "../../composables/useNotify";
import { useAuthStore } from "../../stores/auth";
import { useSettingsStore } from "../../stores/settings";

const { t } = useI18n();
const notify = useNotify();
const confirm = useConfirm();
const authStore = useAuthStore();
const settingsStore = useSettingsStore();

const forcingLogout = ref(false);
const releasingLock = ref(false);

const confirmForceLogout = () => {
  confirm.require({
    message: t("profile.forceLogout.confirmMessage"),
    header: t("profile.forceLogout.confirmHeader"),
    icon: "pi pi-exclamation-triangle",
    acceptClass: "p-button-danger",
    accept: forceLogout,
  });
};

const forceLogout = async () => {
  forcingLogout.value = true;
  try {
    const data = await api.post("/api/v1/shop/force-logout");
    // Keep the calling admin's own session alive with a fresh token, and
    // reflect the lock immediately in this session too (the broadcast only
    // reaches other already-connected clients).
    authStore.refreshToken(data.token);
    settingsStore.setCashLockedByShop(true);
    notify.success(t("profile.forceLogout.toastSuccess"));
  } catch (e) {
    notify.error(t("profile.forceLogout.toastFailed"));
  } finally {
    forcingLogout.value = false;
  }
};

const releaseLock = async () => {
  releasingLock.value = true;
  try {
    await api.post("/api/v1/shop/release-cash-lock");
    settingsStore.setCashLockedByShop(false);
    notify.success(t("profile.forceLogout.releaseToastSuccess"));
  } catch (e) {
    notify.error(t("profile.forceLogout.toastFailed"));
  } finally {
    releasingLock.value = false;
  }
};
</script>
