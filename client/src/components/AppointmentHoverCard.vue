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
        <div v-if="clientNotes" class="mt-2 text-sm" data-testid="hover-client-notes">
          <div class="text-[11px] font-bold text-gray-500 uppercase tracking-wide">{{ t("common.clientNotes") }}</div>
          <p class="text-gray-800 whitespace-pre-line break-words line-clamp-3">{{ clientNotes }}</p>
        </div>

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
          <div v-if="otherServicesThatDay" class="text-sm" data-testid="hover-day-services">
            <div class="text-gray-500 mb-1">{{ t("scheduler.hoverCard.dayServices") }}</div>
            <div
              v-for="s in appointment.day_services"
              :key="s.id"
              class="flex gap-2 py-0.5 px-1 -mx-1 rounded"
              :class="s.current ? 'bg-[var(--p-primary-50)] font-semibold text-gray-900' : 'text-gray-700'"
            >
              <span class="flex-shrink-0 tabular-nums">{{ timeOf(s.start) }}</span>
              <span class="min-w-0">
                {{ s.service }}
                <span v-if="s.staff" class="block text-xs font-normal text-gray-500">{{ s.staff }}</span>
              </span>
            </div>
          </div>
          <div v-else class="flex text-sm">
            <span class="w-24 flex-shrink-0 text-gray-500">{{ t("scheduler.hoverCard.service") }}</span>
            <span class="text-gray-900 font-medium">{{ appointment.service_name }}</span>
          </div>
          <div class="flex text-sm items-center">
            <span class="w-24 flex-shrink-0 text-gray-500">{{ t("scheduler.hoverCard.payment") }}</span>
            <span :class="paymentBadgeClass" class="px-2 py-0.5 rounded-md text-xs font-semibold" data-testid="hover-payment">
              {{ paymentText }}
            </span>
          </div>
        </div>

        <!-- Booked outside the staff member's working hours (overtime). -->
        <div
          v-if="overtimeText"
          class="mt-3 border-l-4 border-l-amber-400 bg-amber-50 rounded-r-md px-2 py-1 text-sm text-amber-900"
          data-testid="hover-overtime"
        >
          <i class="pi pi-clock text-xs mr-1"></i>{{ overtimeText }}
        </div>

        <template v-if="appointmentNotes || internalNotes">
          <div class="border-t border-gray-100 my-3"></div>
          <div class="space-y-2">
            <div v-if="appointmentNotes">
              <div class="text-[11px] font-bold text-gray-500 uppercase tracking-wide">
                {{ t("bookingSidebar.appointmentNotes") }}
              </div>
              <p class="text-sm text-gray-800 whitespace-pre-line break-words line-clamp-4">{{ appointmentNotes }}</p>
            </div>
            <div v-if="internalNotes" class="border-l-4 border-l-amber-400 bg-amber-50 rounded-r-md px-2 py-1">
              <div class="text-[11px] font-bold text-amber-700 uppercase tracking-wide">
                {{ t("booking.notes.internalNote") }}
              </div>
              <p class="text-sm text-gray-800 whitespace-pre-line break-words line-clamp-4">{{ internalNotes }}</p>
            </div>
          </div>
        </template>

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
import type { OutsideHours } from "../utils/staffAvailability";
import { formatMoney } from "../utils/format";
import { paymentStatus } from "../utils/money";
import { useAuthStore } from "../stores/auth";
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
  "no-response": "noResponse",
};
const STATUS_BAR_COLOR: Record<string, string> = {
  new: "bg-blue-500",
  confirmed: "bg-purple-500",
  arrived: "bg-orange-500",
  started: "bg-green-500",
  completed: "bg-gray-500",
  cancelled: "bg-red-500",
  "no-show": "bg-red-700",
  "no-response": "bg-amber-500",
};

const statusBarClass = computed(() => STATUS_BAR_COLOR[props.appointment.status] || "bg-gray-400");

// "Outside working hours: 30 min before 10:00 · schedule 10:00–18:00" (see
// outsideWorkingHours in utils/staffAvailability.ts).
const overtimeText = computed(() => {
  const o = props.appointment.overtime as OutsideHours | null | undefined;
  if (!o) return "";
  const k = (key: string, values?: Record<string, unknown>) => t(`scheduler.hoverCard.overtime.${key}`, values || {});
  if (o.dayOff) return `${k("title")}: ${k("dayOff")}`;
  const amount = (ms: number) => {
    const minutes = Math.round(ms / 60000);
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h && m ? k("hoursMinutes", { h, m }) : h ? k("hours", { h }) : k("minutes", { m });
  };
  const parts = o.parts.map((p) =>
    p.kind === "between"
      ? k("between", { amount: amount(p.to - p.from), from: p.at, to: p.until })
      : k(p.kind, { amount: amount(p.to - p.from), time: p.at }),
  );
  return `${k("title")}: ${parts.join(", ")} · ${k("schedule", { hours: o.schedule })}`;
});
const statusHeaderText = computed(() => {
  const key = STATUS_I18N_KEY[props.appointment.status];
  const label = key ? t(`common.status.${key}`) : props.appointment.status;
  return `${label} ${t("scheduler.hoverCard.appointmentSuffix")}`;
});

const otherServicesThatDay = computed(() => (props.appointment.day_services?.length || 0) > 1);
const timeOf = (d: Date) =>
  new Intl.DateTimeFormat(locale.value === "el" ? "el-GR" : "en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(d);

const clientName = computed(() => props.appointment.client_name || t("scheduler.hoverCard.unknownClient"));

const appointmentNotes = computed(() => (props.appointment.booking_notes || "").trim());
const internalNotes = computed(() => (props.appointment.internal_notes || "").trim());

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

const clientNotes = computed(() => (props.appointment.client_notes || "").trim());

// What was paid, and the total when it isn't all paid; plain staff see no
// money, only whether it is paid.
const authStore = useAuthStore();
const moneyState = computed(() => {
  const total = Number(props.appointment.current_appt_total || 0);
  // A booking marked paid stays paid (as it always read here), even when its
  // payments don't add up to the total.
  if (props.appointment.payment_status === "paid") return "paid";
  if (total <= 0) return "unpaid";
  return paymentStatus(total, Number(props.appointment.deposit_amount || 0));
});
const paymentBadgeClass = computed(() =>
  moneyState.value === "paid"
    ? "bg-green-50 text-green-700"
    : moneyState.value === "partial"
      ? "bg-amber-50 text-amber-800"
      : "bg-red-50 text-red-700",
);
const paymentText = computed(() => {
  const total = formatMoney(props.appointment.current_appt_total);
  const paid = formatMoney(props.appointment.deposit_amount);
  if (moneyState.value === "unpaid") {
    return authStore.isStaff ? t("scheduler.hoverCard.unpaid") : `${t("scheduler.hoverCard.unpaid")} ${total}`;
  }
  if (authStore.isStaff) return t("scheduler.hoverCard.paid");
  return moneyState.value === "paid"
    ? `${t("scheduler.hoverCard.paid")} ${formatMoney(Math.max(Number(props.appointment.deposit_amount || 0), Number(props.appointment.current_appt_total || 0)))}`
    : `${t("scheduler.hoverCard.paid")} ${t("common.paidOf", { paid, total })}`;
});

// When it was booked: date and time when recorded (booked_at, since late
// October 2026), else just the date (created_at, a DATE column).
const bookedOnText = computed(() => {
  const bookedAt = props.appointment.booked_at ? new Date(props.appointment.booked_at) : null;
  if (bookedAt && !Number.isNaN(bookedAt.getTime())) {
    return new Intl.DateTimeFormat(locale.value === "el" ? "el-GR" : "en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(bookedAt);
  }
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
