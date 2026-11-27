<template>
  <!-- Home's "Up Next" (REDESIGN_SPEC.md §5.1, client-portal-prototype.html):
       the next booking on a bronze card, a live countdown, and the actions
       that fit the moment. -->
  <section class="pp-upnext" data-testid="upnext-card" :data-kind="state.kind">
    <template v-if="state.kind === 'done'">
      <div class="pp-label"><span>{{ t("portal.v2.upNext.enjoy") }}</span></div>
      <div class="pp-when">{{ t("portal.v2.upNext.howWasIt") }}</div>
      <div class="pp-what mb-4">{{ names }}<span v-if="staff"> · {{ staff }}</span></div>
      <div class="pp-upnext-actions">
        <ReviewPrompt v-if="shop.shop?.google_review_url && !b.review_prompted_at" :bookingId="b.id" :reviewUrl="shop.shop.google_review_url" />
        <router-link :to="bookAgainLink" class="pp-btn pp-btn-glass"><i class="pi pi-replay"></i>{{ t("portal.v2.actions.bookAgain") }}</router-link>
      </div>
    </template>

    <template v-else>
      <div class="pp-label">
        <span>{{ t("portal.v2.upNext.label") }}</span>
        <span v-if="showStatus" class="pp-pill"><i class="pi" :class="needsConfirm ? 'pi-exclamation-circle' : 'pi-check'"></i> {{ needsConfirm ? t("portal.v2.upNext.needsConfirm") : t("portal.v2.upNext.confirmed") }}</span>
      </div>
      <div class="pp-when" data-testid="upnext-when">{{ headline }}</div>
      <div class="pp-what">{{ names }}<span v-if="minutes"> · {{ minutes }}′</span><span v-if="staff"> · {{ t("portal.v2.upNext.with", { name: staff }) }}</span></div>

      <div v-if="state.kind !== 'now'" class="pp-countdown" data-testid="upnext-countdown">
        <div v-for="c in countdown" :key="c.label"><b>{{ c.value }}</b><span>{{ c.label }}</span></div>
      </div>
      <div v-else class="h-4"></div>

      <div class="pp-upnext-actions">
        <template v-if="state.kind === 'later'">
          <button v-if="needsConfirm" type="button" class="pp-btn pp-btn-on" :disabled="working" @click="confirm"><i class="pi" :class="working ? 'pi-spin pi-spinner' : 'pi-check'"></i>{{ t("portal.v2.actions.confirm") }}</button>
          <router-link v-else to="/portal/wallet/pass" class="pp-btn pp-btn-on"><i class="pi pi-qrcode"></i>{{ t("portal.v2.actions.pass") }}</router-link>
          <button type="button" class="pp-btn pp-btn-glass" @click="extras.addToCalendar(b)"><i class="pi pi-calendar-plus"></i>{{ t("portal.v2.actions.calendar") }}</button>
          <router-link v-if="movable" :to="`/portal/book/reschedule/${b.id}`" class="pp-btn pp-btn-glass"><i class="pi pi-clock"></i>{{ t("portal.v2.actions.reschedule") }}</router-link>
        </template>
        <template v-else-if="state.kind === 'soon'">
          <router-link to="/portal/wallet/pass" class="pp-btn pp-btn-on"><i class="pi pi-qrcode"></i>{{ t("portal.v2.actions.pass") }}</router-link>
          <button type="button" class="pp-btn pp-btn-glass" @click="extras.addToCalendar(b)"><i class="pi pi-calendar-plus"></i>{{ t("portal.v2.actions.calendar") }}</button>
          <a :href="extras.directionsUrl()" target="_blank" rel="noopener" class="pp-btn pp-btn-glass" @click="extras.openDirections($event)"><i class="pi pi-map-marker"></i>{{ t("portal.v2.actions.directions") }}</a>
        </template>
        <template v-else-if="state.kind === 'go'">
          <a :href="extras.directionsUrl()" target="_blank" rel="noopener" class="pp-btn pp-btn-on" @click="extras.openDirections($event)"><i class="pi pi-directions"></i>{{ t("portal.v2.actions.directions") }}</a>
          <router-link to="/portal/wallet/pass" class="pp-btn pp-btn-glass"><i class="pi pi-qrcode"></i>{{ t("portal.v2.actions.pass") }}</router-link>
          <a v-if="extras.callUrl()" :href="extras.callUrl()" class="pp-btn pp-btn-glass"><i class="pi pi-phone"></i>{{ t("portal.v2.actions.call") }}</a>
        </template>
        <router-link v-if="state.kind === 'now' || needsConfirm || state.kind === 'later'" :to="`/portal/bookings/${b.id}`" class="pp-btn pp-btn-glass" :aria-label="t('portal.v2.actions.details')"><i class="pi pi-ellipsis-h"></i></router-link>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { clockTime, formatDate } from "../../utils/format";
import type { UpNext } from "../utils/upNext";
import { serviceNames, staffNames } from "../stores/bookings";
import { useBookingExtras } from "../composables/useBookingExtras";
import { usePortalBookingActions } from "../composables/usePortalBookingActions";
import { useNow } from "../composables/useNow";
import { usePortalShopStore } from "../stores/shop";
import ReviewPrompt from "./ReviewPrompt.vue";

const props = defineProps<{ state: UpNext }>();
const shop = usePortalShopStore();
const { t, locale } = useI18n();
const extras = useBookingExtras();
const actions = usePortalBookingActions();
const working = ref(false);
// Every second: the countdown shows seconds within the day.
const now = useNow(1000);

const b = computed(() => props.state.booking);
const names = computed(() => serviceNames(b.value));
const staff = computed(() => staffNames(b.value));
const minutes = computed(() => Math.round((new Date(b.value.end_time).getTime() - new Date(b.value.start_time).getTime()) / 60e3));
// Confirming is for a booking the shop hasn't had confirmed and isn't paid.
const needsConfirm = computed(() => b.value.status !== "confirmed" && b.value.payment_status !== "paid");
const showStatus = computed(() => props.state.kind === "later" || props.state.kind === "soon");
// Only a single-service booking can be moved online (the server says so too).
const movable = computed(() => b.value.services.length === 1 && shop.changeableOnline(b.value.start_time));
const bookAgainLink = computed(() => {
  const s = b.value.services[0];
  return { path: "/portal/book", query: { service: s?.service_id, ...(s?.staff_id ? { staff: s.staff_id } : {}) } };
});

// "Αύριο · 18:30", "Σήμερα · 11:00", else the day: as on the prototype.
const headline = computed(() => {
  const { kind, daysLeft } = props.state;
  if (kind === "go") return t("portal.v2.upNext.headOver");
  if (kind === "now") return t("portal.v2.upNext.enjoy");
  const day = daysLeft === 0 ? t("portal.v2.upNext.todayCap") : daysLeft === 1 ? t("portal.v2.upNext.tomorrowCap") : formatDate(b.value.start_time, locale.value, "weekdayShort");
  return `${day} · ${clockTime(b.value.start_time)}`;
});

const pad = (n: number) => String(n).padStart(2, "0");
// Days, hours and minutes when it's more than a day away; hours, minutes and
// seconds within the day.
const countdown = computed(() => {
  const ms = Math.max(0, new Date(b.value.start_time).getTime() - now.value.getTime());
  const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1e3) % 60;
  const cell = (value: string | number, key: string) => ({ value, label: t(`portal.v2.upNext.${key}`) });
  return props.state.kind === "later"
    ? [cell(d, "days"), cell(pad(h), "hours"), cell(pad(m), "minutes")]
    : [cell(pad(Math.floor(ms / 36e5)), "hours"), cell(pad(m), "minutes"), cell(pad(s), "seconds")];
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
