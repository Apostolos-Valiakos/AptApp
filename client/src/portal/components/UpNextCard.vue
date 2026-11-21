<template>
  <!-- Home's "Up Next" (REDESIGN_SPEC.md §5.1): the next booking, what's
       left until it, and the one action that fits the moment. -->
  <section class="portal-card-raised p-5 space-y-4" data-testid="upnext-card" :data-kind="state.kind">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="portal-caption">{{ t("portal.v2.upNext.title") }}</p>
        <h2 class="portal-display portal-h3 mt-1 truncate">{{ names }}</h2>
        <p class="portal-small mt-1">
          {{ formatDate(b.start_time, locale, "weekdayTime") }}<span v-if="staff"> · {{ staff }}</span>
        </p>
      </div>
      <Tag v-if="showStatus" :value="needsConfirm ? t('portal.v2.upNext.needsConfirm') : t('portal.v2.upNext.confirmed')" :severity="needsConfirm ? 'warn' : 'success'" rounded />
    </div>

    <p class="text-lg font-semibold text-[var(--p-primary-700)]" data-testid="upnext-when">{{ countdown }}</p>

    <div v-if="state.kind !== 'now'" class="flex flex-wrap gap-2">
      <template v-if="state.kind === 'later'">
        <Button v-if="needsConfirm" :label="t('portal.v2.actions.confirm')" icon="pi pi-check" :loading="working" @click="confirm" />
        <Button :label="t('portal.v2.actions.addToCalendar')" icon="pi pi-calendar-plus" :outlined="needsConfirm" @click="extras.addToCalendar(b)" />
        <router-link v-if="movable" :to="`/portal/book/reschedule/${b.id}`" class="p-button p-button-text p-component">{{ t("portal.v2.actions.reschedule") }}</router-link>
      </template>
      <template v-else-if="state.kind === 'soon'">
        <router-link to="/portal/wallet/pass" class="p-button p-component"><i class="pi pi-qrcode mr-2"></i>{{ t("portal.v2.actions.pass") }}</router-link>
        <a :href="extras.directionsUrl()" target="_blank" rel="noopener" class="p-button p-button-outlined p-component">{{ t("portal.v2.actions.directions") }}</a>
        <a v-if="extras.callUrl()" :href="extras.callUrl()" class="p-button p-button-text p-component">{{ t("portal.v2.actions.call") }}</a>
      </template>
      <template v-else-if="state.kind === 'go'">
        <a :href="extras.directionsUrl()" target="_blank" rel="noopener" class="p-button p-component"><i class="pi pi-map-marker mr-2"></i>{{ t("portal.v2.actions.directions") }}</a>
        <router-link to="/portal/wallet/pass" class="p-button p-button-outlined p-component">{{ t("portal.v2.actions.pass") }}</router-link>
      </template>
      <template v-else-if="state.kind === 'done'">
        <slot name="done" />
        <router-link :to="bookAgainLink" class="p-button p-button-outlined p-component">{{ t("portal.v2.actions.bookAgain") }}</router-link>
      </template>
      <router-link v-if="state.kind !== 'done'" :to="`/portal/bookings/${b.id}`" class="p-button p-button-text p-component">{{ t("portal.v2.actions.details") }}</router-link>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import Button from "primevue/button";
import Tag from "primevue/tag";
import { formatDate } from "../../utils/format";
import type { UpNext } from "../utils/upNext";
import { serviceNames, staffNames } from "../stores/bookings";
import { useBookingExtras } from "../composables/useBookingExtras";
import { usePortalBookingActions } from "../composables/usePortalBookingActions";
import { usePortalShopStore } from "../stores/shop";

const props = defineProps<{ state: UpNext }>();
const shop = usePortalShopStore();
const { t, locale } = useI18n();
const extras = useBookingExtras();
const actions = usePortalBookingActions();
const working = ref(false);

const b = computed(() => props.state.booking);
const names = computed(() => serviceNames(b.value));
const staff = computed(() => staffNames(b.value));
// Confirming is for a booking the shop hasn't had confirmed and isn't paid.
const needsConfirm = computed(() => b.value.status !== "confirmed" && b.value.payment_status !== "paid");
const showStatus = computed(() => props.state.kind === "later" || props.state.kind === "soon");
// Only a single-service booking can be moved online (the server says so too).
const movable = computed(() => b.value.services.length === 1 && shop.changeableOnline(b.value.start_time));
const bookAgainLink = computed(() => {
  const s = b.value.services[0];
  return { path: "/portal/book", query: { service: s?.service_id, ...(s?.staff_id ? { staff: s.staff_id } : {}) } };
});

const countdown = computed(() => {
  const { kind, minutesLeft, daysLeft } = props.state;
  if (kind === "now") return t("portal.v2.upNext.enjoy");
  if (kind === "done") return t("portal.v2.upNext.howWasIt");
  if (kind === "go") return `${t("portal.v2.upNext.headOver")} · ${t("portal.v2.upNext.inMinutes", { m: minutesLeft })}`;
  if (kind === "soon") {
    const h = Math.floor(minutesLeft / 60);
    return h ? t("portal.v2.upNext.inTime", { h, m: minutesLeft % 60 }) : t("portal.v2.upNext.inMinutes", { m: minutesLeft });
  }
  return daysLeft === 1 ? t("portal.v2.upNext.tomorrow") : t("portal.v2.upNext.inDays", { n: daysLeft }, daysLeft);
});

const confirm = async () => {
  working.value = true;
  try {
    await actions.confirmAttendance(b.value.id);
  } catch {
  } finally {
    working.value = false;
  }
};
</script>
