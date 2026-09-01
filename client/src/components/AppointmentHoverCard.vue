<template>
  <Teleport to="body">
    <div
      ref="cardEl"
      class="fixed z-[9999] w-[300px] rounded-xl bg-white shadow-xl border border-gray-100 overflow-hidden pointer-events-none"
      :style="positionStyle"
    >
      <!-- Status header bar -->
      <div :class="statusBarClass" class="py-2 text-center text-white text-sm font-bold">
        {{ statusHeaderText }}
      </div>

      <div class="p-4">
        <div v-if="appointment.is_new_client" class="text-[11px] font-bold text-purple-600 tracking-wide mb-1">
          {{ t("scheduler.hoverCard.newClient") }}
        </div>
        <div class="text-base font-bold text-gray-900 leading-snug">{{ clientName }}</div>
        <div v-if="appointment.client_phone" class="text-sm text-gray-500 mt-0.5">{{ appointment.client_phone }}</div>

        <div class="border-t border-gray-100 my-3"></div>

        <div class="space-y-2">
          <div class="flex text-sm">
            <span class="w-24 flex-shrink-0 text-gray-500">{{ t("scheduler.hoverCard.date") }}</span>
            <span class="text-gray-900 font-medium">{{ dateRangeText }}</span>
          </div>
          <div class="flex text-sm">
            <span class="w-24 flex-shrink-0 text-gray-500">{{ t("scheduler.hoverCard.duration") }}</span>
            <span class="text-gray-900 font-medium">{{ durationText }}</span>
          </div>
          <div class="flex text-sm">
            <span class="w-24 flex-shrink-0 text-gray-500">{{ t("scheduler.hoverCard.service") }}</span>
            <span class="text-gray-900 font-medium">{{ appointment.service_name }}</span>
          </div>
          <div class="flex text-sm items-center">
            <span class="w-24 flex-shrink-0 text-gray-500">{{ t("scheduler.hoverCard.payment") }}</span>
            <span :class="paymentBadgeClass" class="px-2 py-0.5 rounded-md text-xs font-semibold">
              {{ paymentText }}
            </span>
          </div>
        </div>

        <div class="border-t border-gray-100 my-3"></div>

        <div class="flex text-sm">
          <span class="w-24 flex-shrink-0 text-gray-500">{{ t("scheduler.hoverCard.bookedOn") }}</span>
          <span class="text-gray-900 font-medium">{{ bookedOnText }}</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from "vue";
import { useI18n } from "vue-i18n";

const props = defineProps<{
  appointment: any;
  anchorRect: { top: number; left: number; right: number; bottom: number; width: number; height: number };
}>();

const { t, locale } = useI18n();
const cardEl = ref<HTMLElement | null>(null);
const positionStyle = ref<Record<string, string>>({ top: "-9999px", left: "-9999px" });

// Appointment status (new/confirmed/arrived/started/completed/cancelled/no-show)
// reuses the exact same i18n labels/colors BookingDialog already uses, so the
// hover card reads consistently with the dialog it's previewing.
const STATUS_I18N_KEY: Record<string, string> = {
  new: "new",
  confirmed: "confirmed",
  arrived: "arrived",
  started: "started",
  completed: "completed",
  cancelled: "cancelled",
  "no-show": "noShow",
};
const STATUS_BAR_COLOR: Record<string, string> = {
  new: "bg-blue-500",
  confirmed: "bg-purple-500",
  arrived: "bg-orange-500",
  started: "bg-green-500",
  completed: "bg-gray-500",
  cancelled: "bg-red-500",
  "no-show": "bg-red-700",
};

const statusBarClass = computed(() => STATUS_BAR_COLOR[props.appointment.status] || "bg-gray-400");
const statusHeaderText = computed(() => {
  const key = STATUS_I18N_KEY[props.appointment.status];
  const label = key ? t(`common.status.${key}`) : props.appointment.status;
  return `${label} ${t("scheduler.hoverCard.appointmentSuffix")}`;
});

const clientName = computed(() => props.appointment.client_name || t("scheduler.hoverCard.unknownClient"));

const dateRangeText = computed(() => {
  const start: Date | undefined = props.appointment.start;
  const end: Date | undefined = props.appointment.end;
  if (!start) return "—";
  const dateFmt = new Intl.DateTimeFormat(locale.value === "el" ? "el-GR" : "en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const timeFmt = new Intl.DateTimeFormat(locale.value === "el" ? "el-GR" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const datePart = dateFmt.format(start);
  const startTime = timeFmt.format(start);
  const endTime = end ? timeFmt.format(end) : "";
  return endTime ? `${datePart}, ${startTime} - ${endTime}` : `${datePart}, ${startTime}`;
});

const durationText = computed(() => {
  const start: Date | undefined = props.appointment.start;
  const end: Date | undefined = props.appointment.end;
  if (!start || !end) return "—";
  const totalMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(t(h === 1 ? "scheduler.hoverCard.hourSingular" : "scheduler.hoverCard.hoursPlural", { h }));
  if (m > 0 || h === 0) parts.push(t("scheduler.hoverCard.minutesLabel", { m }));
  return parts.join(" ");
});

const isPaid = computed(() => props.appointment.payment_status === "paid");
const paymentBadgeClass = computed(() =>
  isPaid.value ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700",
);
const paymentText = computed(() => {
  const amount = Number(props.appointment.current_appt_total || 0).toFixed(2);
  const label = t(isPaid.value ? "scheduler.hoverCard.paid" : "scheduler.hoverCard.unpaid");
  return `${label} ${amount} €`;
});

const bookedOnText = computed(() => {
  if (!props.appointment.created_at) return "—";
  const d = new Date(props.appointment.created_at);
  if (Number.isNaN(d.getTime())) return "—";
  const fmt = new Intl.DateTimeFormat(locale.value === "el" ? "el-GR" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC", // created_at is a DATE column — treat as a calendar date, not a UTC instant to localize
  });
  return fmt.format(d);
});

// Position the card next to the hovered box: prefer the right side, flip to
// the left if it would overflow the viewport, and clamp vertically so it
// never renders off-screen top/bottom.
const updatePosition = async () => {
  await nextTick();
  const el = cardEl.value;
  if (!el) return;
  const { top, right, left, height } = props.anchorRect;
  const cardWidth = el.offsetWidth || 300;
  const cardHeight = el.offsetHeight || 200;
  const gap = 10;

  let x = right + gap;
  if (x + cardWidth > window.innerWidth - 8) {
    x = left - gap - cardWidth;
  }
  if (x < 8) x = 8;

  let y = top + height / 2 - cardHeight / 2;
  if (y < 8) y = 8;
  if (y + cardHeight > window.innerHeight - 8) {
    y = window.innerHeight - 8 - cardHeight;
  }

  positionStyle.value = { top: `${y}px`, left: `${x}px` };
};

onMounted(updatePosition);
watch(() => props.anchorRect, updatePosition, { deep: true });
</script>
