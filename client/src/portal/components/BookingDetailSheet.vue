<template>
  <!-- One booking in full (N3, client-portal-prototype.html): when, with
       whom, where, what it costs and what was paid, and everything that can be
       done with it. A sheet from the bottom on a phone, a panel from the side
       on a desktop. -->
  <Drawer :visible="!!booking" :position="wide ? 'right' : 'bottom'" :class="wide ? '!w-[420px]' : '!h-auto max-h-[90vh]'" :dt="wide ? undefined : { root: { borderRadius: '28px 28px 0 0' } }" @update:visible="(v) => !v && emit('close')">
    <template #header>
      <span class="font-[family-name:var(--portal-font-display,_Georgia)] font-medium text-[22px] leading-tight">{{ booking ? serviceNames(booking) : "" }}</span>
    </template>
    <div v-if="booking" class="space-y-4" data-testid="booking-detail">
      <span class="pp-status" :class="statusTone">{{ statusLabel }}</span>
      <div class="pp-kv">
        <i class="pi pi-calendar"></i><span>{{ formatDate(booking.start_time, locale, "weekdayLong") }} · {{ clockTime(booking.start_time) }}–{{ clockTime(booking.end_time) }}</span>
        <template v-if="staffNames(booking)"><i class="pi pi-user"></i><span>{{ staffNames(booking) }}</span></template>
        <i class="pi pi-euro"></i>
        <span class="flex gap-3 flex-wrap">
          <span class="tabular-nums">{{ formatMoney(booking.total) }}</span>
          <!-- Only what was actually paid, as the staff see it. -->
          <span v-if="booking.paid > 0" class="opacity-80">{{ t("common.paid") }}: <PaidAmount :paid="booking.paid" :total="booking.total" onlyPaid /></span>
        </span>
        <template v-if="booking.booking_notes"><i class="pi pi-comment"></i><span class="whitespace-pre-line">{{ booking.booking_notes }}</span></template>
      </div>
      <a v-if="shop.shop?.address" :href="extras.directionsUrl()" target="_blank" rel="noopener" class="block" @click="extras.openDirections($event)">
        <span class="pp-map" aria-hidden="true"><i class="pi pi-map-marker"></i></span>
        <span class="block text-sm mt-2 opacity-80"><i class="pi pi-map-marker mr-1 text-[var(--p-primary-color)]"></i>{{ shop.shop.address }}</span>
      </a>

      <template v-if="upcoming">
        <Button v-if="needsConfirm" :label="t('portal.v2.actions.confirm')" icon="pi pi-check" class="w-full !min-h-[46px] !rounded-[14px] !font-semibold" :loading="working === 'confirm'" data-testid="detail-confirm" @click="confirm" />
        <div class="pp-actions-grid">
          <router-link to="/portal/wallet/pass" class="pp-action"><i class="pi pi-qrcode"></i>{{ t("portal.v2.actions.pass") }}</router-link>
          <button type="button" class="pp-action" @click="extras.addToCalendar(booking)"><i class="pi pi-calendar-plus"></i>{{ t("portal.v2.actions.calendar") }}</button>
          <a :href="extras.directionsUrl()" target="_blank" rel="noopener" class="pp-action" @click="extras.openDirections($event)"><i class="pi pi-directions"></i>{{ t("portal.v2.actions.directions") }}</a>
          <router-link v-if="changeable && booking.services.length === 1" :to="`/portal/book/reschedule/${booking.id}`" class="pp-action" data-testid="detail-reschedule"><i class="pi pi-clock"></i>{{ t("portal.v2.actions.reschedule") }}</router-link>
          <button type="button" class="pp-action" @click="extras.share(booking)"><i class="pi pi-share-alt"></i>{{ t("portal.v2.actions.share") }}</button>
          <a v-if="extras.callUrl()" :href="extras.callUrl()" class="pp-action"><i class="pi pi-phone"></i>{{ t("portal.v2.actions.call") }}</a>
          <button v-if="changeable" type="button" class="pp-action danger" :disabled="working === 'cancel'" data-testid="detail-cancel" @click="cancel"><i class="pi" :class="working === 'cancel' ? 'pi-spin pi-spinner' : 'pi-times-circle'"></i>{{ t("portal.v2.actions.cancel") }}</button>
        </div>
        <!-- Inside the shop's notice period only the shop can change it. -->
        <p v-if="!changeable" class="text-sm opacity-70 text-center" data-testid="too-late">{{ t("portal.actions.errors.too_late") }}</p>
      </template>
      <router-link v-else-if="booking.status !== 'cancelled' && booking.services[0]" :to="{ path: '/portal/book', query: { service: booking.services[0].service_id, ...(booking.services[0].staff_id ? { staff: booking.services[0].staff_id } : {}) } }" class="p-button p-component w-full justify-center !min-h-[46px] !rounded-[14px]"><i class="pi pi-replay mr-2"></i>{{ t("portal.v2.actions.bookAgain") }}</router-link>
    </div>
  </Drawer>
  <!-- The cancel question's box: nothing else in the portal draws one, and a
       question with no box waits forever (Cancel would do nothing). -->
  <ConfirmDialog />
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useConfirm } from "primevue/useconfirm";
import Button from "primevue/button";
import ConfirmDialog from "primevue/confirmdialog";
import Drawer from "primevue/drawer";
import PaidAmount from "../../components/PaidAmount.vue";
import { askConfirm } from "../../utils/confirm";
import { statusKey } from "../../utils/appointmentStatus";
import { clockTime, formatDate, formatMoney } from "../../utils/format";
import { serviceNames, staffNames, type PortalBooking } from "../stores/bookings";
import { usePortalShopStore } from "../stores/shop";
import { useBookingExtras } from "../composables/useBookingExtras";
import { usePortalBookingActions } from "../composables/usePortalBookingActions";
import { useFeedback } from "../composables/useFeedback";
import { useMinWidth, PORTAL_DESKTOP_WIDTH } from "../composables/useMinWidth";

const props = defineProps<{ booking: PortalBooking | undefined }>();
const emit = defineEmits<{ close: [] }>();
const { t, locale } = useI18n();
const confirmService = useConfirm();
const shop = usePortalShopStore();
const extras = useBookingExtras();
const actions = usePortalBookingActions();
const feedback = useFeedback();
const wide = useMinWidth(PORTAL_DESKTOP_WIDTH);
const working = ref<"" | "confirm" | "cancel">("");

const upcoming = computed(() => !!props.booking && props.booking.status !== "cancelled" && new Date(props.booking.start_time).getTime() > Date.now());
const changeable = computed(() => !!props.booking && shop.changeableOnline(props.booking.start_time));
// The status as on the prototype: confirmed in green, waiting in orange.
const statusTone = computed(() => {
  const st = props.booking?.status;
  if (st === "cancelled" || st === "no-show") return "danger";
  if (st === "confirmed" || st === "completed") return "ok";
  return upcoming.value && needsConfirm.value ? "warn" : "plain";
});
const statusLabel = computed(() =>
  statusTone.value === "warn" ? t("portal.v2.upNext.needsConfirm") : t(`common.status.${statusKey(props.booking?.status || "")}`),
);
const needsConfirm = computed(() => !!props.booking && props.booking.status !== "confirmed" && props.booking.payment_status !== "paid");

const confirm = async () => {
  working.value = "confirm";
  try {
    await actions.confirmAttendance(props.booking!.id);
  } catch {
  } finally {
    working.value = "";
  }
};

// Cancelling can't be undone: a warning, the shop's own note, then a clear
// "Cancel booking".
const cancel = async () => {
  feedback.warning();
  const note = shop.shop?.cancellation_note;
  const yes = await askConfirm(confirmService, {
    header: t("portal.cancelConfirm.header"),
    message: note ? `${t("portal.cancelConfirm.message")}\n\n${note}` : t("portal.cancelConfirm.message"),
    icon: "pi pi-exclamation-triangle",
    acceptLabel: t("portal.v2.bookings.cancelBooking"),
    rejectLabel: t("portal.v2.bookings.keep"),
    acceptProps: { severity: "danger" },
  });
  if (!yes) return;
  working.value = "cancel";
  try {
    await actions.cancel(props.booking!.id);
    emit("close");
  } catch {
  } finally {
    working.value = "";
  }
};
</script>
