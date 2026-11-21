<template>
  <!-- Wallet (REDESIGN_SPEC.md §5.4): the check-in pass, the membership and
       the visit packages, together. -->
  <div class="p-4 space-y-5">
    <h1 class="portal-display portal-h2">{{ t("portal.nav.wallet") }}</h1>

    <router-link to="/portal/wallet/pass" class="block rounded-[var(--portal-radius-card)] p-5 text-white shadow-[var(--portal-shadow-2)] bg-[var(--p-primary-color)] portal-target" data-testid="pass-card">
      <div class="flex items-center justify-between gap-4">
        <div class="min-w-0">
          <p class="text-xs uppercase tracking-widest opacity-80">{{ shop.name }}</p>
          <p class="portal-display text-2xl mt-1 truncate">{{ clientName }}</p>
          <p v-if="wallet.membership" class="text-sm opacity-90 mt-1">{{ t("portal.v2.home.member", { tier: wallet.membership.tier_name }) }}</p>
        </div>
        <span class="w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center"><i class="pi pi-qrcode text-2xl"></i></span>
      </div>
      <p class="text-sm mt-4 opacity-90">{{ t("portal.v2.wallet.openPass") }}</p>
    </router-link>

    <section class="space-y-2" data-testid="membership">
      <h2 class="portal-display portal-h3 px-1">{{ t("portal.membership.title") }}</h2>
      <div class="portal-card p-4 space-y-2">
        <template v-if="wallet.membership">
          <div class="flex items-center justify-between gap-3">
            <span class="font-semibold text-[var(--p-primary-700)]">{{ wallet.membership.tier_name }}</span>
            <span class="portal-caption">{{ t("portal.membership.renewsOn", { date: formatDate(wallet.membership.current_period_end, locale) }) }}</span>
          </div>
          <div v-for="u in wallet.usage" :key="u.service_id" class="flex justify-between text-sm">
            <span>{{ u.service_name }}</span>
            <span class="font-medium tabular-nums">{{ u.quota_per_month === null ? `${u.used_this_month} / ∞` : `${u.used_this_month} / ${u.quota_per_month}` }}</span>
          </div>
        </template>
        <p v-else class="portal-caption">{{ t("portal.membership.none") }}</p>
      </div>
    </section>

    <section class="space-y-2" data-testid="packages">
      <h2 class="portal-display portal-h3 px-1">{{ t("packages.portalTitle") }}</h2>
      <p v-if="!wallet.packages.length" class="portal-card p-4 portal-caption">{{ t("packages.card.none") }}</p>
      <div v-for="p in wallet.packages" :key="p.id" class="portal-card p-4 flex items-center gap-4" :class="{ 'opacity-60': p.state !== 'active' }">
        <PackageRing :used="p.used" :total="p.total_visits" :size="56" :label="t('portal.v2.home.visitsLeft', { left: p.remaining, total: p.total_visits })" />
        <div class="min-w-0 flex-1">
          <p class="font-semibold truncate">{{ p.name }}</p>
          <p class="portal-caption">{{ t("portal.v2.home.visitsLeft", { left: p.remaining, total: p.total_visits }) }}</p>
          <p class="portal-micro">{{ p.expires_at ? `${t("packages.card.expires")}: ${formatDate(p.expires_at, locale, "short")}` : t("packages.neverExpires") }}</p>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { formatDate } from "../../utils/format";
import { useAuthStore } from "../../stores/auth";
import PackageRing from "../components/PackageRing.vue";
import { usePortalWalletStore } from "../stores/wallet";
import { usePortalShopStore } from "../stores/shop";

const { t, locale } = useI18n();
const auth = useAuthStore();
const wallet = usePortalWalletStore();
const shop = usePortalShopStore();
const clientName = computed(() => [wallet.client?.first_name, wallet.client?.last_name].filter(Boolean).join(" "));

onMounted(() => {
  shop.load();
  wallet.load(auth.clientId);
});
</script>
