<template>
  <!-- One booking in full (N3): when, where, with whom, what it costs and
       what was paid, with everything that can be done with it. A sheet from
       the bottom on a phone, a panel from the side on a desktop. -->
  <Drawer :visible="!!booking" :position="wide ? 'right' : 'bottom'" :header="booking ? serviceNames(booking) : ''" :class="wide ? '!w-[420px]' : '!h-auto max-h-[90vh]'" :dt="wide ? undefined : { root: { borderRadius: '28px 28px 0 0' } }" @update:visible="(v) => !v && emit('close')">
    <div v-if="booking" class="space-y-4" data-testid="booking-detail">
      <div class="flex items-center gap-2 flex-wrap">
        <Tag :value="t(`common.status.${statusKey(booking.status)}`)" :severity="booking.status === 'cancelled' ? 'danger' : booking.status === 'confirmed' || booking.status === 'completed' ? 'success' : 'secondary'" rounded />
      </div>
      <dl class="space-y-3 text-sm">
        <div class="flex gap-3"><dt class="w-6"><i class="pi pi-clock opacity-60"></i></dt><dd>{{ formatDate(booking.start_time, locale, "weekdayTime") }} – {{ clockTime(booking.end_time) }}</dd></div>
        <div v-if="staffNames(booking)" class="flex gap-3"><dt class="w-6"><i class="pi pi-user opacity-60"></i></dt><dd>{{ staffNames(booking) }}</dd></div>
        <div v-if="shop.shop?.address" class="flex gap-3"><dt class="w-6"><i class="pi pi-map-marker opacity-60"></i></dt><dd><a :href="extras.directionsUrl()" target="_blank" rel="noopener" @click="extras.openDirections($event)" class="underline">{{ shop.shop.address }}</a></dd></div>
        <div class="flex gap-3"><dt class="w-6"><i class="pi pi-euro opacity-60"></i></dt>
          <dd class="flex gap-3">
            <span>{{ formatMoney(booking.total) }}</span>
            <!-- Only what was actually paid, as the staff see it. -->
            <span v-if="booking.paid > 0" class="opacity-80">{{ t("common.paid") }}: <PaidAmount :paid="booking.paid" :total="booking.total" onlyPaid /></span>
          </dd>
        </div>
        <div v-if="booking.booking_notes" class="flex gap-3"><dt class="w-6"><i class="pi pi-comment opacity-60"></i></dt><dd class="whitespace-pre-line">{{ booking.booking_notes }}</dd></div>
      </dl>

      <div v-if="upcoming" class="grid grid-cols-2 gap-2">
        <Button v-if="needsConfirm" :label="t('portal.v2.actions.confirm')" icon="pi pi-check" class="col-span-2" :loading="working === 'confirm'" data-testid="detail-confirm" @click="confirm" />
        <router-link v-if="changeable && booking.services.length === 1" :to="`/portal/book/reschedule/${booking.id}`" class="p-button p-button-outlined p-component justify-center" data-testid="detail-reschedule">{{ t("portal.v2.actions.reschedule") }}</router-link>
        <Button :label="t('portal.v2.actions.addToCalendar')" icon="pi pi-calendar-plus" outlined @click="extras.addToCalendar(booking)" />
        <Button :label="t('portal.v2.actions.share')" icon="pi pi-share-alt" outlined @click="extras.share(booking)" />
        <a :href="extras.directionsUrl()" target="_blank" rel="noopener" @click="extras.openDirections($event)" class="p-button p-button-outlined p-component justify-center">{{ t("portal.v2.actions.directions") }}</a>
        <a v-if="extras.callUrl()" :href="extras.callUrl()" class="p-button p-button-outlined p-component justify-center">{{ t("portal.v2.actions.call") }}</a>
        <Button v-if="changeable" :label="t('portal.v2.actions.cancel')" severity="danger" text class="col-span-2" :loading="working === 'cancel'" data-testid="detail-cancel" @click="cancel" />
        <!-- Inside the shop's notice period only the shop can change it. -->
        <p v-else class="col-span-2 portal-caption text-center" data-testid="too-late">{{ t("portal.actions.errors.too_late") }}</p>
      </div>
      <router-link v-else-if="booking.status !== 'cancelled' && booking.services[0]" :to="{ path: '/portal/book', query: { service: booking.services[0].service_id, ...(booking.services[0].staff_id ? { staff: booking.services[0].staff_id } : {}) } }" class="p-button p-component w-full justify-center">{{ t("portal.v2.actions.bookAgain") }}</router-link>
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
import Tag from "primevue/tag";
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
