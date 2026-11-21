<template>
  <!-- The check-in pass, full screen (P2, N4): the shop's colour, the
       client's name and a large QR to show at reception. It opens from the
       token kept on this device, so it works with no connection. -->
  <div class="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 p-6 text-white bg-[var(--p-primary-color)]" data-testid="pass">
    <Button icon="pi pi-times" rounded text class="!absolute top-[calc(1rem+env(safe-area-inset-top))] right-4 !text-white" :aria-label="t('common.close')" @click="close" />
    <p class="text-xs uppercase tracking-widest opacity-80">{{ shop.name }}</p>
    <p class="portal-display text-3xl text-center">{{ clientName }}</p>
    <p v-if="wallet.membership" class="opacity-90">{{ t("portal.v2.home.member", { tier: wallet.membership.tier_name }) }}</p>
    <!-- A white field around the code: the brightest the web can make it. -->
    <div class="bg-white p-4 rounded-3xl shadow-[var(--portal-shadow-3)]">
      <PassQr v-if="wallet.passToken" :token="wallet.passToken" :label="t('portal.v2.wallet.qrLabel')" />
      <p v-else class="w-[280px] h-[280px] flex items-center justify-center text-center text-gray-500 p-6">{{ t("portal.v2.wallet.noPass") }}</p>
    </div>
    <p class="text-sm opacity-90">{{ t("portal.v2.wallet.showAtReception") }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import Button from "primevue/button";
import { useAuthStore } from "../../stores/auth";
import PassQr from "../components/PassQr.vue";
import { usePortalWalletStore } from "../stores/wallet";
import { usePortalShopStore } from "../stores/shop";
import { useFeedback } from "../composables/useFeedback";

const { t } = useI18n();
const router = useRouter();
const auth = useAuthStore();
const wallet = usePortalWalletStore();
const shop = usePortalShopStore();
const clientName = computed(() => [wallet.client?.first_name, wallet.client?.last_name].filter(Boolean).join(" "));

const close = () => (window.history.length > 1 ? router.back() : router.push("/portal/wallet"));

onMounted(() => {
  useFeedback().tick();
  shop.load();
  wallet.load(auth.clientId);
});
</script>
