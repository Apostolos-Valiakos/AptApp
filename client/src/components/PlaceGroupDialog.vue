<template>
  <!-- A shared place's group (ΣΑΟΥΝΑ, ΧΑΜΜΑΜ): the bookings of one grouped card
       on the scheduler and its totals. Clicking a booking opens it. -->
  <Dialog
    :visible="visible"
    modal
    :header="header"
    :style="{ width: '44rem' }"
    :breakpoints="{ '768px': '96vw' }"
    @update:visible="emit('update:visible', $event)"
  >
    <div v-if="group" class="space-y-5" data-testid="place-group-dialog">
      <!-- Step through the day's groups of this place -->
      <div v-if="groups.length > 1" class="flex items-center justify-between text-sm">
        <Button
          icon="pi pi-chevron-left"
          :label="t('capacity.dialog.previous')"
          text
          size="small"
          :disabled="index === 0"
          @click="emit('update:index', index - 1)"
        />
        <span class="text-gray-500">{{ t("capacity.dialog.groupOf", { n: index + 1, total: groups.length }) }}</span>
        <Button
          icon="pi pi-chevron-right"
          iconPos="right"
          :label="t('capacity.dialog.next')"
          text
          size="small"
          :disabled="index === groups.length - 1"
          @click="emit('update:index', index + 1)"
        />
      </div>

      <!-- Totals -->
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div v-for="tile in totals" :key="tile.label" class="bg-gray-50 rounded-lg p-3">
          <div class="text-[11px] font-bold text-gray-400 uppercase tracking-wide">{{ tile.label }}</div>
          <div class="text-lg font-bold mt-0.5" :class="tile.className || 'text-gray-900'">{{ tile.value }}</div>
        </div>
      </div>

      <!-- The bookings -->
      <section class="space-y-3">
        <div
          v-for="m in group.members"
          :key="`${m.appointmentId}_${m.serviceIndex}`"
          class="border border-gray-100 rounded-xl p-4 cursor-pointer hover:border-[var(--p-primary-300)] hover:bg-[var(--p-primary-50)] transition-colors"
          role="button"
          tabindex="0"
          :title="t('capacity.dialog.openBooking')"
          data-testid="place-group-booking"
          @click="emit('open', m.fullAppointment)"
          @keydown.enter="emit('open', m.fullAppointment)"
        >
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="text-sm text-gray-500">
                <span class="font-semibold text-gray-700">{{ hhmm(m.start) }}–{{ hhmm(m.end) }}</span>
                <span v-if="m.persons > 1" class="ml-1 font-bold text-[var(--p-primary-700)]">×{{ m.persons }}</span>
                · {{ m.service_name }}
              </div>
              <div class="font-bold text-gray-900 uppercase mt-0.5">
                {{ m.client_name }}
                <span v-if="m.fullAppointment?.is_new_client" class="ml-1 text-[10px] font-bold text-purple-600 normal-case">
                  {{ t("scheduler.hoverCard.newClient") }}
                </span>
              </div>
              <div v-if="m.fullAppointment?.client_phone" class="text-sm text-gray-500">{{ m.fullAppointment.client_phone }}</div>
            </div>
            <span class="text-[11px] font-bold text-white px-2 py-0.5 rounded-full" :class="statusColor(m.fullAppointment?.status)">
              {{ statusLabel(m.fullAppointment?.status) }}
            </span>
          </div>

          <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm mt-2">
            <span>{{ t("capacity.dialog.booking") }}: <b>{{ formatMoney(money(m).total) }}</b></span>
            <span>{{ t("capacity.dialog.paid") }}: <b>{{ formatMoney(money(m).paid) }}</b></span>
            <span :class="money(m).owed > 0 ? 'text-red-600' : ''">{{ t("capacity.dialog.owed") }}: <b>{{ formatMoney(money(m).owed) }}</b></span>
            <span v-if="Number(m.fullAppointment?.client_outstanding_balance) > 0" class="text-red-600">
              {{ t("capacity.dialog.clientDebt") }}: <b>{{ formatMoney(m.fullAppointment.client_outstanding_balance) }}</b>
            </span>
          </div>

          <div v-if="otherServices(m).length" class="text-xs text-gray-500 mt-1">
            {{ t("capacity.dialog.alsoBooked") }}: {{ otherServices(m).join(" · ") }}
          </div>

          <div v-if="notes(m).length" class="mt-2 space-y-1">
            <div v-for="n in notes(m)" :key="n.label" class="text-xs bg-amber-50 text-amber-900 rounded-md px-2 py-1 whitespace-pre-line">
              <b>{{ n.label }}:</b> {{ n.text }}
            </div>
          </div>
        </div>
      </section>
    </div>

    <template #footer>
      <Button
        v-if="group && group.peak < group.capacity"
        :label="t('capacity.addPerson')"
        icon="pi pi-plus"
        outlined
        data-testid="place-group-add"
        @click="group && emit('add', new Date(group.start))"
      />
      <Button :label="t('common.close')" @click="emit('update:visible', false)" />
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { formatMoney } from "../utils/format";
import { hhmm } from "../utils/capacity";

export type PlaceGroup = {
  resourceName: string;
  capacity: number;
  peak: number;
  start: number;
  end: number;
  members: any[];
};

const props = defineProps<{ visible: boolean; groups: PlaceGroup[]; index: number }>();
const emit = defineEmits<{
  "update:visible": [boolean];
  "update:index": [number];
  add: [Date];
  open: [any];
}>();

const { t, locale } = useI18n();
const group = computed<PlaceGroup | null>(() => props.groups[props.index] || null);

const header = computed(() => {
  const g = group.value;
  if (!g) return "";
  const day = new Intl.DateTimeFormat(locale.value === "el" ? "el-GR" : "en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(g.start));
  return `${g.resourceName} · ${day} · ${hhmm(g.start)}–${hhmm(g.end)}`;
});

const STATUS_KEYS: Record<string, string> = { "no-show": "noShow", "no-response": "noResponse" };
const statusLabel = (s: string | undefined) => (s ? t(`common.status.${STATUS_KEYS[s] || s}`) : "");
const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-500",
  confirmed: "bg-purple-500",
  arrived: "bg-orange-500",
  started: "bg-green-500",
  completed: "bg-gray-500",
  "no-response": "bg-amber-500",
};
const statusColor = (s: string | undefined) => STATUS_COLORS[s || ""] || "bg-gray-400";

// The whole booking's money (it may hold other services than this one too).
const money = (m: any) => {
  const total = Number(m.fullAppointment?.current_appt_total) || 0;
  const paid = Number(m.fullAppointment?.deposit_amount) || 0;
  return { total, paid, owed: Math.max(0, total - paid) };
};

const otherServices = (m: any) =>
  (m.fullAppointment?.services || [])
    .filter((_: any, i: number) => i !== m.serviceIndex)
    .map((s: any) => `${s.service_name || ""} ${hhmm(s.start_time)}${s.staff_name ? ` (${s.staff_name})` : ""}`.trim());

const notes = (m: any) =>
  [
    { label: t("bookingSidebar.appointmentNotes"), text: (m.fullAppointment?.booking_notes || "").trim() },
    { label: t("booking.notes.internalNote"), text: (m.fullAppointment?.internal_notes || "").trim() },
  ].filter((n) => n.text);

// Totals: a booking with two rows in the group counts once for money.
const totals = computed(() => {
  const g = group.value;
  if (!g) return [];
  const bookings = new Map<string, any>();
  for (const m of g.members) bookings.set(m.appointmentId, m);
  const sums = [...bookings.values()].reduce(
    (acc, m) => {
      const x = money(m);
      return { total: acc.total + x.total, paid: acc.paid + x.paid, owed: acc.owed + x.owed };
    },
    { total: 0, paid: 0, owed: 0 },
  );
  return [
    {
      label: t("capacity.dialog.together"),
      value: `${g.peak}/${g.capacity}`,
      className: g.peak > g.capacity ? "text-red-600" : g.peak === g.capacity ? "text-amber-600" : "text-green-700",
    },
    { label: t("capacity.dialog.bookings"), value: String(bookings.size) },
    { label: t("capacity.dialog.persons"), value: String(g.members.reduce((n, m) => n + (m.persons || 1), 0)) },
    { label: t("capacity.dialog.value"), value: formatMoney(sums.total) },
    { label: t("capacity.dialog.paid"), value: formatMoney(sums.paid) },
    { label: t("capacity.dialog.owed"), value: formatMoney(sums.owed), className: sums.owed > 0 ? "text-red-600" : "" },
  ];
});
</script>
