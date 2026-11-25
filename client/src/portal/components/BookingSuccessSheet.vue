<template>
  <!-- After booking or moving, from Book or from the assistant's card: a
       check, what was booked, Add to calendar, Share, Done. -->
  <Dialog :visible="!!success.bookingId" modal :closable="false" :showHeader="false" :style="{ width: '420px', maxWidth: '94vw' }" @update:visible="(v) => !v && success.close()">
    <div class="text-center space-y-3 pt-6" data-testid="booking-success">
      <span class="mx-auto w-16 h-16 rounded-full bg-[var(--p-primary-color)] text-[var(--p-primary-contrast-color)] flex items-center justify-center">
        <i class="pi pi-check text-2xl"></i>
      </span>
      <h2 class="portal-display text-2xl">{{ success.kind === "moved" ? t("portal.actions.moved") : t("portal.actions.booked") }}</h2>
      <template v-if="booking">
        <p class="font-semibold">{{ serviceNames(booking) }}</p>
        <p class="opacity-70">{{ formatDate(booking.start_time, locale, "weekdayTime") }}<span v-if="staffNames(booking)"> · {{ staffNames(booking) }}</span></p>
      </template>
      <!-- In the app, after the first booking: one line on why, then Android's
           own permission prompt (reminders and the shop's announcements). -->
      <div v-if="reminders.shouldAsk.value" class="rounded-2xl border border-[var(--p-content-border-color)] p-3 text-sm space-y-2" data-testid="reminders-ask">
        <p>{{ t("portal.v2.native.remindersAsk") }}</p>
        <Button :label="t('portal.v2.native.remindersOn')" icon="pi pi-bell" size="small" outlined data-testid="reminders-allow" @click="allowReminders" />
      </div>
      <div class="flex flex-col gap-2 pt-3">
        <Button v-if="booking" :label="t('portal.v2.actions.addToCalendar')" icon="pi pi-calendar-plus" outlined @click="extras.addToCalendar(booking)" />
        <Button v-if="booking" :label="t('portal.v2.actions.share')" icon="pi pi-share-alt" text @click="extras.share(booking)" />
        <Button :label="t('portal.v2.actions.done')" data-testid="success-done" @click="success.close()" />
      </div>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import { formatDate } from "../../utils/format";
import { useBookingSuccessStore } from "../stores/success";
import { usePortalBookingsStore, serviceNames, staffNames } from "../stores/bookings";
import { useBookingExtras } from "../composables/useBookingExtras";
import { useReminders } from "../native/useReminders";
import { usePush } from "../native/usePush";
import { useRouter } from "vue-router";

const { t, locale } = useI18n();
const success = useBookingSuccessStore();
const bookings = usePortalBookingsStore();
const extras = useBookingExtras();
const reminders = useReminders();
const router = useRouter();

// Allowed: the reminders are scheduled at once, and the phone registers for announcements.
const allowReminders = async () => {
  if (await reminders.requestPermission()) void usePush().register(router);
};

const booking = computed(() => (success.bookingId ? bookings.byId(success.bookingId) : undefined));
// The new booking is in the list once it reloads (it's told to on every change).
watch(() => success.bookingId, (id) => id && !bookings.byId(id) && bookings.load());
</script>
