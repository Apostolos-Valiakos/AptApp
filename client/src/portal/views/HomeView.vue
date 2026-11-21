<template>
  <!-- Home (REDESIGN_SPEC.md §5.1): a greeting, Up Next, Book again, the
       wallet strip, the contest while one runs and a way to call. -->
  <div class="p-4 space-y-6">
    <h1 class="portal-display portal-h2" data-testid="greeting">{{ greeting }}</h1>

    <OfflineBanner :stale="bookings.failed && bookings.list.length > 0" />

    <div v-if="!bookings.loaded && !bookings.list.length" class="portal-card p-5 space-y-3" aria-busy="true">
      <Skeleton width="40%" /><Skeleton width="70%" height="1.5rem" /><Skeleton width="50%" />
    </div>
    <UpNextCard v-else-if="next" :state="next" />
    <section v-else class="portal-card p-6 text-center space-y-3" data-testid="home-empty">
      <i class="pi pi-sparkles text-3xl text-[var(--p-primary-color)]"></i>
      <h2 class="portal-display portal-h3">{{ t("portal.v2.home.emptyTitle") }}</h2>
      <template v-if="shop.shop?.self_booking_enabled !== false">
        <p class="portal-caption">{{ t("portal.v2.home.emptyText") }}</p>
        <router-link to="/portal/book" class="p-button p-component">{{ t("portal.v2.home.emptyBook") }}</router-link>
      </template>
      <a v-else-if="extras.callUrl()" :href="extras.callUrl()" class="p-button p-component"><i class="pi pi-phone mr-2"></i>{{ t("portal.v2.home.callUs") }}</a>
    </section>

    <section v-if="showPushCard" class="portal-card p-4 flex items-center gap-3">
      <i class="pi pi-bell text-[var(--p-primary-600)]"></i>
      <div class="flex-1 min-w-0">
        <p class="font-semibold text-sm">{{ t("portal.notifications.title") }}</p>
        <p class="portal-caption">{{ t("portal.notifications.subtitle") }}</p>
      </div>
      <Button :label="t('portal.notifications.button')" size="small" @click="enablePush" />
    </section>

    <BookAgainCarousel :past="bookings.past" />

    <section v-if="wallet.activePackages.length || wallet.membership" class="space-y-2" data-testid="wallet-strip">
      <h3 class="portal-display portal-h3 px-1">{{ t("portal.v2.home.wallet") }}</h3>
      <router-link to="/portal/wallet" class="portal-card p-4 flex items-center gap-4 portal-target">
        <template v-for="p in wallet.activePackages.slice(0, 2)" :key="p.id">
          <PackageRing :used="p.used" :total="p.total_visits" :label="t('portal.v2.home.visitsLeft', { left: p.remaining, total: p.total_visits })" />
          <div class="min-w-0">
            <p class="font-semibold text-sm truncate">{{ p.name }}</p>
            <p class="portal-caption">{{ t("portal.v2.home.visitsLeft", { left: p.remaining, total: p.total_visits }) }}</p>
          </div>
        </template>
        <div v-if="wallet.membership" class="min-w-0">
          <p class="font-semibold text-sm">{{ t("portal.v2.home.member", { tier: wallet.membership.tier_name }) }}</p>
          <p class="portal-caption">{{ t("portal.membership.renewsOn", { date: formatDate(wallet.membership.current_period_end, locale) }) }}</p>
        </div>
      </router-link>
    </section>

    <section v-if="contest" class="portal-card overflow-hidden" data-testid="contest">
      <img v-if="contest.image_url" :src="contest.image_url" alt="" class="w-full h-32 object-cover" />
      <div class="p-4">
        <p class="portal-micro font-semibold uppercase tracking-wide text-[var(--p-primary-600)]"><i class="pi pi-trophy mr-1"></i>{{ t("portal.contestLabel") }}</p>
        <h3 class="font-semibold mt-1">{{ contest.name }}</h3>
        <p v-if="contest.description" class="portal-caption mt-1">{{ contest.description }}</p>
      </div>
    </section>

    <a v-if="extras.callUrl()" :href="extras.callUrl()" class="portal-target inline-flex items-center gap-2 px-4 rounded-full border border-[var(--portal-border)] text-sm font-medium">
      <i class="pi pi-phone"></i>{{ t("portal.v2.home.callUs") }}
    </a>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import Button from "primevue/button";
import Skeleton from "primevue/skeleton";
import { api } from "../../api/http";
import { formatDate } from "../../utils/format";
import { useAuthStore } from "../../stores/auth";
import { usePushNotifications } from "../../composables/usePushNotifications";
import UpNextCard from "../components/UpNextCard.vue";
import OfflineBanner from "../components/OfflineBanner.vue";
import BookAgainCarousel from "../components/BookAgainCarousel.vue";
import PackageRing from "../components/PackageRing.vue";
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
