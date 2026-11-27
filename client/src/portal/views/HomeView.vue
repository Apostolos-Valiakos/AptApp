<template>
  <!-- Home (REDESIGN_SPEC.md §5.1, client-portal-prototype.html): the date
       and a greeting, Up Next, Book again, the wallet, the contest while one
       runs, and Call / Directions. -->
  <div class="px-4 pt-1 pb-4">
    <p class="pp-sub mt-1.5" data-testid="today">{{ formatDate(now, locale, "weekdayLong") }}</p>
    <h1 class="pp-h1 mt-1.5 mb-1" data-testid="greeting">{{ greeting }}</h1>

    <OfflineBanner class="mt-3" :stale="bookings.failed && bookings.list.length > 0" />

    <div v-if="!bookings.loaded && !bookings.list.length" class="pp-card p-5 space-y-3 mt-[18px]" aria-busy="true">
      <Skeleton width="40%" /><Skeleton width="70%" height="1.5rem" /><Skeleton width="50%" />
    </div>
    <UpNextCard v-else-if="next" :state="next" class="mt-[18px]" />
    <section v-else class="pp-upnext mt-[18px]" data-testid="home-empty">
      <div class="pp-label"><span>{{ t("portal.v2.upNext.label") }}</span></div>
      <div class="pp-when">{{ t("portal.v2.home.emptyTitle") }}</div>
      <template v-if="shop.shop?.self_booking_enabled !== false">
        <p class="pp-what">{{ t("portal.v2.home.emptyText") }}</p>
        <router-link to="/portal/book" class="pp-btn pp-btn-on mt-4 relative z-[1]"><i class="pi pi-plus"></i>{{ t("portal.v2.home.emptyBook") }}</router-link>
      </template>
      <a v-else-if="extras.callUrl()" :href="extras.callUrl()" class="pp-btn pp-btn-on mt-4 relative z-[1]"><i class="pi pi-phone"></i>{{ t("portal.v2.home.callUs") }}</a>
    </section>

    <section v-if="showPushCard" class="pp-card p-4 flex items-center gap-3 mt-4">
      <span class="pp-icon"><i class="pi pi-bell"></i></span>
      <div class="flex-1 min-w-0">
        <p class="font-semibold text-sm">{{ t("portal.notifications.title") }}</p>
        <p class="pp-small pp-muted">{{ t("portal.notifications.subtitle") }}</p>
      </div>
      <button type="button" class="pp-btn pp-btn-soft !min-h-[40px] !px-3 text-sm" @click="enablePush">{{ t("portal.notifications.button") }}</button>
    </section>

    <BookAgainCarousel :past="bookings.past" />

    <section v-if="wallet.activePackages.length || wallet.membership" data-testid="wallet-strip">
      <h2 class="pp-h2">{{ t("portal.v2.home.wallet") }} <router-link to="/portal/wallet">{{ t("portal.v2.home.seeAll") }}</router-link></h2>
      <div class="space-y-3">
        <div v-for="p in wallet.activePackages.slice(0, 2)" :key="p.id" class="pp-card p-4 flex items-center gap-4">
          <span class="pp-ring" :style="{ '--p': ringShare(p) }" role="img" :aria-label="t('portal.v2.home.visitsLeft', { left: p.remaining, total: p.total_visits })"><span>{{ p.remaining }}/{{ p.total_visits }}</span></span>
          <router-link to="/portal/wallet" class="flex-1 min-w-0">
            <b class="block truncate">{{ t("portal.v2.home.package", { name: p.name }) }}</b>
            <span class="pp-small pp-muted">{{ t("portal.v2.home.visitsRemaining", { n: p.remaining }, p.remaining) }}</span>
          </router-link>
          <router-link to="/portal/wallet/pass" class="pp-btn pp-btn-soft !min-h-[40px] !px-3.5" :aria-label="t('portal.v2.actions.pass')"><i class="pi pi-qrcode"></i></router-link>
        </div>
        <router-link v-if="wallet.membership" to="/portal/wallet" class="pp-card p-4 flex items-center gap-4">
          <span class="pp-icon"><i class="pi pi-crown"></i></span>
          <span class="flex-1 min-w-0">
            <b class="block">{{ t("portal.v2.home.member", { tier: wallet.membership.tier_name }) }}</b>
            <span class="pp-small pp-muted">{{ t("portal.v2.home.renews", { date: formatDate(wallet.membership.current_period_end, locale, "dayMonth") }) }}</span>
          </span>
          <i class="pi pi-angle-right pp-muted"></i>
        </router-link>
      </div>
    </section>

    <section v-if="contest" class="pp-card p-4 flex items-center gap-3.5 mt-3.5 bg-gradient-to-r from-[var(--pp-primary-50)] to-[var(--portal-card)]" data-testid="contest">
      <img v-if="contest.image_url" :src="contest.image_url" alt="" class="w-[46px] h-[46px] rounded-[14px] object-cover flex-none" />
      <span v-else class="pp-icon"><i class="pi pi-gift"></i></span>
      <div class="flex-1 min-w-0">
        <b class="block">{{ contest.name }}</b>
        <p v-if="contest.description" class="pp-small pp-muted">{{ contest.description }}</p>
      </div>
    </section>

    <div v-if="extras.callUrl() || shop.shop?.address" class="flex gap-2 mt-3.5">
      <a v-if="extras.callUrl()" :href="extras.callUrl()" class="pp-btn pp-btn-ghost flex-1"><i class="pi pi-phone"></i>{{ t("portal.v2.actions.call") }}</a>
      <a v-if="shop.shop?.address" :href="extras.directionsUrl()" target="_blank" rel="noopener" class="pp-btn pp-btn-ghost flex-1" @click="extras.openDirections($event)"><i class="pi pi-map-marker"></i>{{ t("portal.v2.actions.directions") }}</a>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import Skeleton from "primevue/skeleton";
import { api } from "../../api/http";
import { formatDate } from "../../utils/format";
import { useAuthStore } from "../../stores/auth";
import { usePushNotifications } from "../../composables/usePushNotifications";
import UpNextCard from "../components/UpNextCard.vue";
import OfflineBanner from "../components/OfflineBanner.vue";
import BookAgainCarousel from "../components/BookAgainCarousel.vue";
import { usePortalBookingsStore } from "../stores/bookings";
import { usePortalWalletStore } from "../stores/wallet";
import { usePortalShopStore } from "../stores/shop";
import { useBookingExtras } from "../composables/useBookingExtras";
import { useNow } from "../composables/useNow";
import { upNext } from "../utils/upNext";

const { t, locale } = useI18n();
const auth = useAuthStore();
const bookings = usePortalBookingsStore();
const wallet = usePortalWalletStore();
const shop = usePortalShopStore();
const extras = useBookingExtras();
const now = useNow();
const contest = ref<any>(null);
const { isSupported, availableHere, permission, enable: enablePush } = usePushNotifications();
const showPushCard = computed(() => isSupported && availableHere && permission.value !== "granted");

const next = computed(() => upNext(bookings.list, now.value));
// The share of visits left, for the ring (as on the prototype).
const ringShare = (p: { remaining: number; total_visits: number }) => (p.total_visits > 0 ? Math.round((p.remaining / p.total_visits) * 100) : 0);

const greeting = computed(() => {
  const name = wallet.client?.first_name;
  if (!name) return t("portal.v2.greeting.plain");
  const h = now.value.getHours();
  return t(h < 12 ? "portal.v2.greeting.morning" : h < 18 ? "portal.v2.greeting.afternoon" : "portal.v2.greeting.evening", { name });
});

onMounted(() => {
  bookings.load();
  wallet.load(auth.clientId);
  shop.load();
  api.get("/api/v1/contests/active").then((c) => (contest.value = c || null)).catch(() => {});
});
</script>
