<template>
  <Dialog
    v-model:visible="visible"
    :header="entry ? t('waitlist.editTitle') : t('waitlist.addTitle')"
    modal
    :style="{ width: '520px', maxWidth: '95vw' }"
  >
    <div class="space-y-4">
      <!-- Client -->
      <div>
        <label class="block text-xs font-bold text-gray-500 uppercase mb-1">{{ t("waitlist.client") }}</label>
        <ClientSelector v-if="!client" @select="client = $event" />
        <div
          v-else
          class="flex items-center justify-between gap-2 p-2.5 border border-gray-200 rounded-lg bg-gray-50"
          data-testid="waitlist-client"
        >
          <span class="min-w-0">
            <span class="block text-sm font-semibold text-gray-900 truncate">{{ client.full_name || `${client.first_name} ${client.last_name}` }}</span>
            <span class="block text-xs text-gray-500">{{ client.phone || client.client_phone }}</span>
          </span>
          <Button icon="pi pi-times" text rounded size="small" :aria-label="t('common.delete')" @click="client = null" />
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">{{ t("waitlist.service") }}</label>
          <Select
            v-model="form.service_id"
            :options="serviceOptions"
            optionLabel="name"
            optionValue="id"
            filter
            class="w-full"
            data-testid="waitlist-service"
          />
        </div>
        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">{{ t("waitlist.therapist") }}</label>
          <Select
            v-model="form.staff_id"
            :options="staffOptions"
            optionLabel="name"
            optionValue="id"
            class="w-full"
            data-testid="waitlist-staff"
          />
        </div>
      </div>

      <!-- When they can come -->
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">{{ t("waitlist.dateFrom") }}</label>
          <DatePicker v-model="form.date_from" dateFormat="dd/mm/yy" :minDate="today" class="w-full" />
        </div>
        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">{{ t("waitlist.dateTo") }}</label>
          <DatePicker v-model="form.date_to" dateFormat="dd/mm/yy" :minDate="form.date_from || today" class="w-full" />
        </div>
      </div>
      <div>
        <label class="block text-xs font-bold text-gray-500 uppercase mb-1">{{ t("waitlist.days") }}</label>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="d in WEEK"
            :key="d"
            type="button"
            class="px-2.5 py-1 rounded-full text-xs font-medium border transition-colors"
            :class="form.days.includes(d) ? 'bg-[var(--p-primary-color)] border-transparent text-white' : 'bg-white border-gray-200 text-gray-600'"
            :data-testid="`waitlist-day-${d}`"
            @click="toggleDay(d)"
          >
            {{ t(`staff.workingHours.days.${d}`).slice(0, 3) }}
          </button>
        </div>
        <p class="text-xs text-gray-400 mt-1">{{ t("waitlist.daysHint") }}</p>
      </div>
      <div>
        <label class="block text-xs font-bold text-gray-500 uppercase mb-1">{{ t("waitlist.hours") }}</label>
        <div class="flex items-center gap-2">
          <TimeDropdown v-model="form.time_from" :placeholder="t('waitlist.anyTime')" class="flex-1" />
          <span class="text-gray-400">—</span>
          <TimeDropdown v-model="form.time_to" :placeholder="t('waitlist.anyTime')" class="flex-1" />
          <Button
            v-if="form.time_from || form.time_to"
            icon="pi pi-times"
            text
            rounded
            size="small"
            :aria-label="t('waitlist.anyTime')"
            @click="form.time_from = ''; form.time_to = ''"
          />
        </div>
      </div>
      <div>
        <label class="block text-xs font-bold text-gray-500 uppercase mb-1">{{ t("common.notes") }}</label>
        <Textarea v-model="form.note" rows="2" maxlength="500" class="w-full" data-testid="waitlist-note" />
      </div>
    </div>
    <template #footer>
      <Button :label="t('common.cancel')" text @click="visible = false" />
      <Button :label="t('common.save')" :loading="saving" :disabled="!client" data-testid="waitlist-save" @click="submit" />
    </template>
  </Dialog>
</template>

<script setup lang="ts">
// Adding someone to the waitlist, or changing their entry: who, which
// service and therapist (or any), and when they can come.
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { ApiError } from "../../api/http";
import ClientSelector from "../ClientSelector.vue";
import TimeDropdown from "../booking/TimeDropdown.vue";
import { useCalendarStore } from "../../stores/calendar";
import { useNotify } from "../../composables/useNotify";
import { useWaitlist, type WaitlistEntry } from "../../composables/useWaitlist";
import { toLocalDateStr } from "../../utils/staffAvailability";

const props = defineProps<{ entry: WaitlistEntry | null }>();
const visible = defineModel<boolean>("visible", { default: false });
const { t } = useI18n();
const notify = useNotify();
const calendarStore = useCalendarStore();
const { save } = useWaitlist();

// Monday first, as the rest of the app shows a week.
const WEEK = [1, 2, 3, 4, 5, 6, 0];
const today = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
})();
const inTwoWeeks = () => {
  const d = new Date(today);
  d.setDate(d.getDate() + 14);
  return d;
};

const client = ref<any>(null);
const form = ref({
  service_id: null as string | null,
  staff_id: null as string | null,
  date_from: today as Date | null,
  date_to: inTwoWeeks() as Date | null,
  days: [] as number[],
  time_from: "",
  time_to: "",
  note: "",
});
const saving = ref(false);

const serviceOptions = computed(() => [
  { id: null, name: t("waitlist.anyService") },
  ...(calendarStore.services || []).filter((s: any) => s.is_active !== false).map((s: any) => ({ id: s.id, name: s.name })),
]);
const staffOptions = computed(() => [
  { id: null, name: t("waitlist.anyone") },
  ...(calendarStore.resources || []).map((s: any) => ({ id: s.id, name: s.name })),
]);

// Open: the entry being changed, or a fresh one.
watch(visible, (open) => {
  if (!open) return;
  const e = props.entry;
  client.value = e ? { id: e.client_id, first_name: e.first_name, last_name: e.last_name, full_name: e.client_name, phone: e.client_phone } : null;
  form.value = {
    service_id: e?.service_id ?? null,
    staff_id: e?.staff_id ?? null,
    date_from: e ? new Date(`${e.date_from}T00:00:00`) : new Date(today),
    date_to: e ? new Date(`${e.date_to}T00:00:00`) : inTwoWeeks(),
    days: [...(e?.days || [])],
    time_from: e?.time_from || "",
    time_to: e?.time_to || "",
    note: e?.note || "",
  };
});

const toggleDay = (d: number) => {
  const days = form.value.days;
  form.value.days = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort();
};

// What the server says when it refuses, in words.
const PROBLEMS: Record<string, string> = {
  "date_from and date_to are required": "waitlist.errors.dates",
  "date_to must not be before date_from": "waitlist.errors.dates",
  "time_to must be after time_from": "waitlist.errors.hours",
};

const submit = async () => {
  if (!client.value) return;
  saving.value = true;
  try {
    const f = form.value;
    await save(
      {
        client_id: client.value.id,
        service_id: f.service_id,
        staff_id: f.staff_id,
        date_from: f.date_from ? toLocalDateStr(f.date_from) : null,
        date_to: f.date_to ? toLocalDateStr(f.date_to) : null,
        days: f.days,
        time_from: f.time_from || null,
        time_to: f.time_to || null,
        note: f.note,
      },
      props.entry?.id,
    );
    notify.success(t("waitlist.saved"));
    visible.value = false;
  } catch (e) {
    const key = e instanceof ApiError ? PROBLEMS[e.data?.error] : undefined;
    notify.error(key ? t(key) : t("waitlist.saveFailed"));
  } finally {
    saving.value = false;
  }
};
</script>
