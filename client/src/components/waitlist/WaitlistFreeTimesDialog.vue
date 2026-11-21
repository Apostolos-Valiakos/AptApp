<template>
  <Dialog
    v-model:visible="visible"
    :header="entry ? t('waitlist.freeTimes.title', { name: entry.client_name }) : ''"
    modal
    :style="{ width: '560px', maxWidth: '95vw' }"
  >
    <div v-if="entry" class="text-sm text-gray-600 mb-3">
      {{ entry.service_name || t("waitlist.anyService") }} · {{ entry.staff_name || t("waitlist.anyone") }}
      <template v-if="result"> · {{ formatDuration(result.duration_minutes, t) }}</template>
    </div>

    <div v-if="loading" class="flex justify-center py-8"><ProgressSpinner style="width: 32px; height: 32px" /></div>

    <template v-else-if="result">
      <div v-if="!days.length" class="text-center py-6" data-testid="free-times-none">
        <p class="text-sm text-gray-500 mb-3">
          {{ t("waitlist.freeTimes.none", { from: dateLabel(firstFrom), to: dateLabel(result.to) }) }}
        </p>
        <Button :label="t('waitlist.freeTimes.bookAnyway')" size="small" outlined data-testid="free-times-anyway" @click="emit('anyway')" />
      </div>

      <div v-else class="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
        <div v-for="day in days" :key="day.date" data-testid="free-times-day">
          <div class="text-xs font-bold text-gray-500 uppercase mb-1.5">{{ formatDate(day.date, locale, "weekdayDayMonth") }}</div>
          <div v-for="s in day.staff" :key="s.staff_id" class="mb-2" data-testid="free-times-staff">
            <div class="text-sm font-medium text-gray-800 mb-1">{{ s.staff_name }}</div>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="start in shownStarts(day.date, s)"
                :key="start"
                type="button"
                class="px-2.5 py-1 rounded-lg text-xs font-medium border border-gray-200 bg-white text-gray-700 hover:border-[var(--p-primary-color)] hover:text-[var(--p-primary-color)] transition-colors"
                data-testid="free-time"
                @click="emit('pick', { staff_id: s.staff_id, start: new Date(`${day.date}T${start}:00`) })"
              >
                {{ start }}
              </button>
              <button
                v-if="s.starts.length > shownStarts(day.date, s).length"
                type="button"
                class="px-2.5 py-1 rounded-lg text-xs text-gray-500 hover:text-gray-800"
                data-testid="free-times-more"
                @click="expanded.add(`${day.date}|${s.staff_id}`)"
              >
                {{ t("waitlist.freeTimes.more", { n: s.starts.length - shownStarts(day.date, s).length }) }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- A long wait comes a week of free days at a time. -->
      <div v-if="result.next" class="text-center mt-3">
        <Button
          :label="t('waitlist.freeTimes.later')"
          icon="pi pi-chevron-down"
          text
          size="small"
          :loading="loadingMore"
          data-testid="free-times-later"
          @click="loadLater"
        />
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
// When a waiting client can be booked: the free start times within their
// dates, weekdays and hours, by day and therapist (server: freeTimes in
// domain/waitlist.js; working hours, leave, breaks, other bookings, who does
// the service and shared places all count). Picking one opens the booking.
import { reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { api } from "../../api/http";
import { useNotify } from "../../composables/useNotify";
import type { WaitlistEntry } from "../../composables/useWaitlist";
import { formatDate, formatDuration } from "../../utils/format";

type StaffTimes = { staff_id: string; staff_name: string; starts: string[] };
type FreeDay = { date: string; staff: StaffTimes[] };
type FreeTimes = { duration_minutes: number; from: string; to: string; next: string | null; days: FreeDay[] };

const props = defineProps<{ entry: WaitlistEntry | null }>();
const visible = defineModel<boolean>("visible", { default: false });
// pick: a free time; anyway: none suits, open the booking as it is.
const emit = defineEmits<{ pick: [slot: { staff_id: string; start: Date }]; anyway: [] }>();
const { t, locale } = useI18n();
const notify = useNotify();

const loading = ref(false);
const loadingMore = ref(false);
// The latest answer (its `to` and `next`), and every day found so far.
const result = ref<FreeTimes | null>(null);
const days = ref<FreeDay[]>([]);
const firstFrom = ref("");
// A therapist's day shows its first few times until "more" is pressed.
const FIRST = 8;
const expanded = reactive(new Set<string>());
const shownStarts = (date: string, s: StaffTimes) => (expanded.has(`${date}|${s.staff_id}`) ? s.starts : s.starts.slice(0, FIRST));
const dateLabel = (d: string) => formatDate(d, locale.value, "dayMonth");

const fetchTimes = (after?: string): Promise<FreeTimes> =>
  api.get(`/api/v1/waitlist/${props.entry!.id}/free-times${after ? `?after=${after}` : ""}`);

watch(visible, async (open) => {
  if (!open || !props.entry) return;
  result.value = null;
  days.value = [];
  expanded.clear();
  loading.value = true;
  try {
    result.value = await fetchTimes();
    days.value = result.value.days;
    firstFrom.value = result.value.from;
  } catch {
    notify.error(t("waitlist.freeTimes.loadFailed"));
    visible.value = false;
  } finally {
    loading.value = false;
  }
});

const loadLater = async () => {
  if (!result.value?.next) return;
  loadingMore.value = true;
  try {
    result.value = await fetchTimes(result.value.next);
    days.value = [...days.value, ...result.value.days];
  } catch {
    notify.error(t("waitlist.freeTimes.loadFailed"));
  } finally {
    loadingMore.value = false;
  }
};
</script>
