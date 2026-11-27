<template>
  <!-- The check-in pass (P2, N4, client-portal-prototype.html): a white card
       on a bright page, the shop's name over a large QR to show at reception.
       It opens from the token kept on this device, so it works offline. -->
  <div class="fixed inset-0 z-50 grid place-items-center p-5 bg-[#f4eee6] pt-[calc(1.25rem+env(safe-area-inset-top))]" data-testid="pass" @click.self="close">
    <div class="w-full max-w-[330px] rounded-[26px] overflow-hidden bg-white text-[#211a14] shadow-[0_30px_60px_rgb(0_0_0/0.25)]" role="dialog" aria-modal="true" :aria-label="t('portal.v2.actions.pass')">
      <div class="bg-[#8b6f4e] text-white px-5 py-[18px] flex items-center justify-between gap-3">
        <div class="min-w-0">
          <div class="text-[13px] opacity-85 truncate">{{ shop.name }}</div>
          <div class="portal-display !font-medium text-xl">{{ t("portal.v2.actions.pass") }}</div>
        </div>
        <button type="button" class="w-10 h-10 rounded-xl grid place-items-center hover:bg-white/15" :aria-label="t('common.close')" @click="close"><i class="pi pi-times"></i></button>
      </div>
      <div class="px-5 pt-[18px] pb-[22px] text-center">
        <div class="flex justify-center my-1.5">
          <PassQr v-if="wallet.passToken" :token="wallet.passToken" :size="250" :label="t('portal.v2.wallet.qrLabel')" />
          <p v-else class="w-[250px] h-[250px] flex items-center justify-center text-center text-gray-500 p-6">{{ t("portal.v2.wallet.noPass") }}</p>
        </div>
        <div class="font-semibold">{{ t("portal.v2.wallet.showAtReception") }}</div>
        <div class="flex justify-between text-left text-xs text-[#6f604f] border-t border-dashed border-[#e9e0d4] pt-3 mt-3 gap-3">
          <div class="min-w-0">{{ t("portal.v2.wallet.member") }}<b class="block text-sm text-[#211a14] truncate">{{ clientName }}</b></div>
          <div v-if="wallet.membership">{{ t("portal.v2.wallet.tier") }}<b class="block text-sm text-[#211a14]">{{ wallet.membership.tier_name }}</b></div>
          <div v-if="next">{{ t("portal.v2.upNext.label") }}<b class="block text-sm text-[#211a14]">{{ clockTime(next.booking.start_time) }}</b></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { clockTime } from "../../utils/format";
import { usePortalBookingsStore } from "../stores/bookings";
import { upNext } from "../utils/upNext";
import { useAuthStore } from "../../stores/auth";
import PassQr from "../components/PassQr.vue";
import { usePortalWalletStore } from "../stores/wallet";
import { usePortalShopStore } from "../stores/shop";
import { useFeedback } from "../composables/useFeedback";
import { useBrightness } from "../native/useBrightness";
import { useNativeChrome } from "../native/useNativeChrome";
import { PORTAL_PRIMARY } from "../theme/portalPreset";
import { DARK_CLASS } from "../composables/usePortalTheme";

const { t } = useI18n();
const router = useRouter();
const auth = useAuthStore();
const wallet = usePortalWalletStore();
const shop = usePortalShopStore();
const bookings = usePortalBookingsStore();
const next = computed(() => upNext(bookings.list));
const clientName = computed(() => [wallet.client?.first_name, wallet.client?.last_name].filter(Boolean).join(" "));

const close = () => (window.history.length > 1 ? router.back() : router.push("/portal/wallet"));

// In the app, the screen at full brightness while the pass is open, so the
// shop's scanner reads it; back to what it was after.
const brightness = useBrightness();
// The pass's light page goes under the status bar too: dark icons while it's
// open (even in dark mode), the page's own after.
const chrome = useNativeChrome();
onUnmounted(() => {
  void brightness.restore();
  chrome.applyTheme(document.documentElement.classList.contains(DARK_CLASS), PORTAL_PRIMARY);
});

onMounted(() => {
  useFeedback().tick();
  void brightness.boost();
  chrome.iconsOver("#f4eee6");
  shop.load();
  wallet.load(auth.clientId);
});
</script>
