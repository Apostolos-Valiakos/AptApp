<template>
  <!-- Bookings (REDESIGN_SPEC.md §5.3, client-portal-prototype.html): what's
       coming and what's been, each opening its details (/portal/bookings/:id). -->
  <div class="px-4 pt-2 pb-4 space-y-3.5">
    <h1 class="pp-h1">{{ t("portal.nav.bookings") }}</h1>
    <OfflineBanner :stale="bookings.failed && bookings.list.length > 0" />
    <div class="pp-segmented" role="tablist" data-testid="bookings-tabs">
      <button v-for="o in tabs" :key="o.value" type="button" role="tab" :aria-selected="tab === o.value" :aria-pressed="tab === o.value" @click="tab = o.value">{{ o.label }}</button>
    </div>

    <div v-if="!bookings.loaded && !bookings.list.length" class="space-y-3" aria-busy="true"><Skeleton v-for="i in 3" :key="i" height="5rem" class="!rounded-[20px]" /></div>

    <template v-else-if="tab === 'upcoming'">
      <section v-if="!upcoming.length" class="pp-card p-6 text-center space-y-3" data-testid="no-upcoming">
        <p class="pp-sub">{{ t("portal.upcoming.empty") }}</p>
        <router-link to="/portal/book" class="pp-btn pp-btn-primary">{{ t("portal.v2.home.emptyBook") }}</router-link>
      </section>
      <ul v-show="upcoming.length" class="pp-card overflow-hidden" data-testid="upcoming-list">
        <li v-for="b in upcoming" :key="b.id">
          <router-link :to="`/portal/bookings/${b.id}`" class="pp-list-item" :class="{ 'opacity-60': b.status === 'cancelled' }">
            <span class="pp-datebox"><b>{{ new Date(b.start_time).getDate() }}</b><span>{{ monthShort(b.start_time) }}</span></span>
            <span class="flex-1 min-w-0">
              <b class="block line-clamp-2" :class="{ 'line-through': b.status === 'cancelled' }">{{ serviceNames(b) }}</b>
              <span class="block pp-small pp-muted">{{ weekdayTime(b.start_time) }}<span v-if="staffNames(b)"> · {{ staffNames(b) }}</span></span>
            </span>
            <span v-if="b.status === 'cancelled'" class="pp-chip pp-chip-status pp-chip-danger">{{ t("portal.upcoming.cancelled") }}</span>
            <span v-else-if="b.status !== 'confirmed' && b.payment_status !== 'paid'" class="pp-chip pp-chip-status pp-chip-warn">{{ t("portal.v2.upNext.needsConfirm") }}</span>
            <span v-else class="pp-chip pp-chip-status pp-chip-ok">{{ t("portal.v2.upNext.confirmed") }}</span>
          </router-link>
        </li>
      </ul>
    </template>

    <template v-else>
      <p v-if="!past.length" class="pp-sub text-center py-6">{{ t("portal.v2.bookings.noPast") }}</p>
      <ul v-show="past.length" class="pp-card overflow-hidden" data-testid="past-list">
        <li v-for="b in past" :key="b.id" class="pp-list-item">
          <router-link :to="`/portal/bookings/${b.id}`" class="flex items-center gap-3.5 flex-1 min-w-0">
            <span class="pp-datebox opacity-75"><b>{{ new Date(b.start_time).getDate() }}</b><span>{{ monthShort(b.start_time) }}</span></span>
            <span class="flex-1 min-w-0">
              <b class="block truncate">{{ serviceNames(b) }}</b>
              <span class="block pp-small pp-muted">
                <span v-if="staffNames(b)">{{ staffNames(b) }}</span>
                <!-- Only what the client actually paid, nothing when nothing was. -->
                <span v-if="b.paid > 0"><span v-if="staffNames(b)"> · </span>{{ t("common.paid") }} <PaidAmount :paid="b.paid" :total="b.total" onlyPaid /></span>
                <span v-if="b.status === 'cancelled' || b.status === 'no-show'"><span v-if="staffNames(b) || b.paid > 0"> · </span>{{ t(`common.status.${statusKey(b.status)}`) }}</span>
              </span>
            </span>
          </router-link>
          <router-link v-if="b.status !== 'cancelled' && b.services[0]" :to="{ path: '/portal/book', query: { service: b.services[0].service_id, ...(b.services[0].staff_id ? { staff: b.services[0].staff_id } : {}) } }" class="pp-btn pp-btn-soft !min-h-[38px] !px-3 !text-[13px] flex-none" data-testid="past-book-again">
            <i class="pi pi-replay"></i>{{ t("portal.v2.actions.bookAgain") }}
          </router-link>
        </li>
      </ul>
    </template>

    <BookingDetailSheet :booking="selected" @close="closeDetail" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import Skeleton from "primevue/skeleton";
import PaidAmount from "../../components/PaidAmount.vue";
import { statusKey } from "../../utils/appointmentStatus";
import { formatDate } from "../../utils/format";
import BookingDetailSheet from "../components/BookingDetailSheet.vue";
import OfflineBanner from "../components/OfflineBanner.vue";
import { usePortalBookingsStore, serviceNames, staffNames } from "../stores/bookings";
import { usePortalShopStore } from "../stores/shop";

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const bookings = usePortalBookingsStore();
const shop = usePortalShopStore();

const tabs = computed(() => [
  { label: `${t("portal.v2.bookings.upcoming")} · ${upcoming.value.length}`, value: "upcoming" as const },
  { label: t("portal.v2.bookings.past"), value: "past" as const },
]);
// The tab is in the link (?tab=past), so Back and shared links keep it.
const tab = computed({
  get: () => (route.query.tab === "past" ? "past" : "upcoming"),
  set: (v) => router.replace({ path: route.path, query: v === "past" ? { tab: "past" } : {} }),
});
const upcoming = computed(() => [...bookings.upcoming, ...bookings.cancelledUpcoming].sort((a, b) => a.start_time.localeCompare(b.start_time)));
const past = computed(() => bookings.past);
const selected = computed(() => (route.params.id ? bookings.byId(String(route.params.id)) : undefined));
// Closing a booking's details steps back to the list when the list opened
// them, so the next Back (the phone's button too) leaves Bookings instead of
// reopening the booking. Opened from a link or a notification, there's no
// list behind: the details are replaced by it.
const closeDetail = () => {
  const back = router.options.history.state.back;
  if (typeof back === "string" && /^\/portal\/bookings(\?|$)/.test(back)) router.back();
  else router.replace({ path: "/portal/bookings", query: route.query });
};
const weekdayTime = (iso: string) => formatDate(iso, locale.value, "weekdayTime");
const monthShort = (iso: string) => new Date(iso).toLocaleDateString(locale.value === "el" ? "el-GR" : "en-GB", { month: "short" });

onMounted(() => {
  shop.load();
  bookings.load();
});
</script>
