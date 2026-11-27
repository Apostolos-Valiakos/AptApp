<template>
  <!-- Wallet (REDESIGN_SPEC.md §5.4, client-portal-prototype.html): the
       check-in pass, the membership and the visit packages, together. -->
  <div class="px-4 pt-2 pb-4">
    <h1 class="pp-h1 mb-3.5">{{ t("portal.nav.wallet") }}</h1>

    <router-link to="/portal/wallet/pass" class="pp-card block overflow-hidden" data-testid="pass-card">
      <div class="bg-[var(--pp-primary)] text-[var(--pp-on-primary)] px-5 py-[18px] flex items-center justify-between gap-4">
        <div class="min-w-0">
          <div class="pp-small opacity-85">{{ shop.name || t("portal.v2.wallet.member") }}</div>
          <div class="portal-display !font-medium text-[22px] truncate">{{ clientName }}</div>
          <div v-if="wallet.membership" class="pp-small opacity-90">{{ t("portal.v2.home.member", { tier: wallet.membership.tier_name }) }}</div>
        </div>
        <i class="pi pi-qrcode text-[26px]"></i>
      </div>
      <div class="flex items-center gap-3 px-[18px] py-3.5">
        <span class="flex-1 pp-small pp-muted">{{ t("portal.v2.wallet.showAtDesk") }}</span>
        <b class="text-[var(--portal-accent-text)] text-sm">{{ t("portal.v2.actions.pass") }} <i class="pi pi-angle-right text-xs"></i></b>
      </div>
    </router-link>

    <section data-testid="membership">
      <h2 class="pp-h2">{{ t("portal.membership.title") }}</h2>
      <div class="pp-card p-4">
        <template v-if="wallet.membership">
          <div class="flex items-center gap-4">
            <span class="pp-icon"><i class="pi pi-crown"></i></span>
            <div class="flex-1 min-w-0">
              <b class="block">{{ wallet.membership.tier_name }}</b>
              <span class="pp-small pp-muted">{{ t("portal.v2.home.renews", { date: formatDate(wallet.membership.current_period_end, locale, "dayMonth") }) }}</span>
            </div>
            <span class="pp-chip pp-chip-status pp-chip-ok">{{ t("portal.v2.wallet.active") }}</span>
          </div>
          <div v-if="wallet.usage.length" class="mt-3 pt-3 border-t border-[var(--portal-border)] space-y-1.5">
            <div v-for="u in wallet.usage" :key="u.service_id" class="flex justify-between text-sm">
              <span>{{ u.service_name }}</span>
              <span class="font-medium tabular-nums">{{ u.quota_per_month === null ? `${u.used_this_month} / ∞` : `${u.used_this_month} / ${u.quota_per_month}` }}</span>
            </div>
          </div>
        </template>
        <p v-else class="pp-small pp-muted">{{ t("portal.membership.none") }}</p>
      </div>
    </section>

    <section data-testid="packages">
      <h2 class="pp-h2">{{ t("packages.portalTitle") }}</h2>
      <p v-if="!wallet.packages.length" class="pp-card p-4 pp-small pp-muted">{{ t("packages.card.none") }}</p>
      <div class="space-y-3">
        <div v-for="p in wallet.packages" :key="p.id" class="pp-card p-4 flex items-center gap-4" :class="{ 'opacity-60': p.state !== 'active' }">
          <span class="pp-ring" :style="{ '--p': p.total_visits > 0 ? Math.round((p.remaining / p.total_visits) * 100) : 0 }" role="img" :aria-label="t('portal.v2.home.visitsLeft', { left: p.remaining, total: p.total_visits })"><span>{{ p.remaining }}/{{ p.total_visits }}</span></span>
          <div class="min-w-0 flex-1">
            <b class="block truncate">{{ p.name }}</b>
            <span class="block pp-small pp-muted">{{ t("portal.v2.home.visitsLeft", { left: p.remaining, total: p.total_visits }) }}</span>
            <span class="block text-xs pp-muted">{{ p.expires_at ? t("portal.v2.wallet.expires", { date: formatDate(p.expires_at, locale, "short") }) : t("packages.neverExpires") }}</span>
          </div>
          <router-link v-if="p.state === 'active'" to="/portal/book" class="pp-btn pp-btn-soft !min-h-[40px] !px-3.5 !text-sm">{{ t("portal.v2.wallet.book") }}</router-link>
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
