<template>
  <!-- Bookings (REDESIGN_SPEC.md §5.3): what's coming and what's been, each
       opening its details (/portal/bookings/:id). -->
  <div class="p-4 space-y-4">
    <h1 class="portal-display portal-h2">{{ t("portal.nav.bookings") }}</h1>
    <OfflineBanner :stale="bookings.failed && bookings.list.length > 0" />
    <SelectButton v-model="tab" :options="tabs" optionLabel="label" optionValue="value" :allowEmpty="false" class="w-full" :dt="{ root: { borderRadius: '999px' } }" data-testid="bookings-tabs" />

    <div v-if="!bookings.loaded && !bookings.list.length" class="space-y-3" aria-busy="true"><Skeleton v-for="i in 3" :key="i" height="5rem" class="!rounded-[20px]" /></div>

    <template v-else-if="tab === 'upcoming'">
      <section v-if="!upcoming.length" class="portal-card p-6 text-center space-y-3" data-testid="no-upcoming">
        <p class="opacity-70">{{ t("portal.upcoming.empty") }}</p>
        <router-link to="/portal/book" class="p-button p-component">{{ t("portal.v2.home.emptyBook") }}</router-link>
      </section>
      <ul class="space-y-3" data-testid="upcoming-list">
        <li v-for="b in upcoming" :key="b.id">
          <router-link :to="`/portal/bookings/${b.id}`" class="portal-card p-4 flex items-start gap-3 portal-target" :class="{ 'opacity-60': b.status === 'cancelled' }">
            <div class="w-12 text-center flex-shrink-0">
              <p class="portal-micro uppercase">{{ monthShort(b.start_time) }}</p>
              <p class="text-2xl font-semibold leading-none">{{ new Date(b.start_time).getDate() }}</p>
            </div>
            <div class="flex-1 min-w-0">
              <p class="font-semibold line-clamp-2" :class="{ 'line-through': b.status === 'cancelled' }">{{ serviceNames(b) }}</p>
              <p class="portal-caption">{{ formatDate(b.start_time, locale, "weekdayTime") }}<span v-if="staffNames(b)"> · {{ staffNames(b) }}</span></p>
              <!-- Under the name, so a long name keeps the whole width. -->
              <Tag v-if="b.status === 'cancelled'" :value="t('portal.upcoming.cancelled')" severity="danger" rounded class="mt-1" />
              <Tag v-else-if="b.status !== 'confirmed' && b.payment_status !== 'paid'" :value="t('portal.v2.upNext.needsConfirm')" severity="warn" rounded class="mt-1" />
            </div>
          </router-link>
        </li>
      </ul>
    </template>

    <template v-else>
      <p v-if="!past.length" class="portal-caption text-center py-6">{{ t("portal.v2.bookings.noPast") }}</p>
      <ul class="space-y-3" data-testid="past-list">
        <li v-for="b in past" :key="b.id" class="portal-card p-4 flex items-center gap-3">
          <router-link :to="`/portal/bookings/${b.id}`" class="flex-1 min-w-0 portal-target">
            <p class="font-semibold truncate">{{ serviceNames(b) }}</p>
            <p class="portal-caption">{{ formatDate(b.start_time, locale, "short") }}<span v-if="staffNames(b)"> · {{ staffNames(b) }}</span></p>
            <p v-if="b.status === 'cancelled' || b.status === 'no-show'" class="portal-micro">{{ t(`common.status.${statusKey(b.status)}`) }}</p>
          </router-link>
          <!-- Only what the client actually paid, nothing when nothing was. -->
          <PaidAmount :paid="b.paid" :total="b.total" onlyPaid class="text-sm" />
          <router-link v-if="b.status !== 'cancelled' && b.services[0]" :to="{ path: '/portal/book', query: { service: b.services[0].service_id, ...(b.services[0].staff_id ? { staff: b.services[0].staff_id } : {}) } }" class="p-button p-button-text p-button-sm p-component" data-testid="past-book-again">
            {{ t("portal.v2.actions.bookAgain") }}
          </router-link>
        </li>
      </ul>
    </template>

    <BookingDetailSheet :booking="selected" @close="router.push({ path: '/portal/bookings', query: route.query })" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import SelectButton from "primevue/selectbutton";
import Skeleton from "primevue/skeleton";
import Tag from "primevue/tag";
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
  { label: t("portal.v2.bookings.upcoming"), value: "upcoming" },
  { label: t("portal.v2.bookings.past"), value: "past" },
]);
// The tab is in the link (?tab=past), so Back and shared links keep it.
const tab = computed({
  get: () => (route.query.tab === "past" ? "past" : "upcoming"),
  set: (v) => router.replace({ path: route.path, query: v === "past" ? { tab: "past" } : {} }),
});
const upcoming = computed(() => [...bookings.upcoming, ...bookings.cancelledUpcoming].sort((a, b) => a.start_time.localeCompare(b.start_time)));
const past = computed(() => bookings.past);
const selected = computed(() => (route.params.id ? bookings.byId(String(route.params.id)) : undefined));
const monthShort = (iso: string) => new Date(iso).toLocaleDateString(locale.value === "el" ? "el-GR" : "en-GB", { month: "short" });

onMounted(() => {
  shop.load();
  bookings.load();
});
</script>
