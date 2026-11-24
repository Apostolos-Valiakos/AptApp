<template>
  <!-- A booking opened from a client's history, on top of whatever page the
       history is on (the calendar, Clients, Financials, or a booking itself).
       It needs what the calendar's booking dialog has: the staff, services,
       products, time off, working hours and the shop's opening hours. -->
  <BookingDialog
    v-if="appointment"
    v-model:visible="visible"
    :appointment="appointment"
    :services="calendarStore.services"
    :staff="calendarStore.resources"
    :allProducts="calendarStore.products"
    :timeOff="calendarStore.timeOff"
    :workingHours="calendarStore.workingHours"
    :shopMinTime="shopMinTime"
    :shopMaxTime="shopMaxTime"
    @save="emit('changed')"
    @refresh="emit('changed')"
    @open-appointment="appointment = $event"
  />
</template>

<script setup lang="ts">
import { defineAsyncComponent, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { api } from "../../api/http";
import { useCalendarStore } from "../../stores/calendar";
import { useNotify } from "../../composables/useNotify";
import { toLocalDateStr } from "../../utils/staffAvailability";

// Loaded when first used: the booking dialog itself shows client profiles,
// which show this.
const BookingDialog = defineAsyncComponent(() => import("../BookingDialog.vue"));

const emit = defineEmits<{ changed: [] }>();
const { t } = useI18n();
const notify = useNotify();
const calendarStore = useCalendarStore();

const appointment = ref<any>(null);
const visible = ref(false);
const shopMinTime = ref("07:00:00");
const shopMaxTime = ref("23:00:00");
let shopHoursLoaded = false;

// Closed: forget it, so the next one opens fresh.
watch(visible, (open) => {
  if (!open) appointment.value = null;
});

/**
 * Opens `past` (a history row: id and start_time). The booking comes from its
 * day's list, as the calendar loads it, so the dialog gets the same data.
 * Answers false when it can't be opened (the error is shown).
 */
const open = async (past: { id: string; start_time: string }): Promise<boolean> => {
  try {
    const [rows] = await Promise.all([
      api.get(`/api/v1/appointments?date=${toLocalDateStr(new Date(past.start_time))}`),
      calendarStore.resources.length ? null : calendarStore.fetchBaseResources(),
      shopHoursLoaded
        ? null
        : api
            .get("/api/v1/shop")
            .then((shop: any) => {
              if (shop?.slot_min_time) shopMinTime.value = `${shop.slot_min_time}:00`;
              if (shop?.slot_max_time) shopMaxTime.value = `${shop.slot_max_time}:00`;
              shopHoursLoaded = true;
            })
            .catch(() => {}),
    ]);
    const found = (rows || []).find((a: any) => a.id === past.id);
    if (!found) throw new Error("not in the day's list");
    appointment.value = found;
    visible.value = true;
    return true;
  } catch {
    notify.error(t("booking.openPast.failed"));
    return false;
  }
};

defineExpose({ open });
</script>
