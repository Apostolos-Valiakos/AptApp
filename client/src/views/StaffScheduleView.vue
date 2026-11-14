<template>
  <div class="space-y-6">
    <!-- Page Header -->
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6">
      <div class="flex justify-between items-center flex-wrap gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <div
            class="w-10 h-10 rounded-xl bg-[var(--p-primary-50)] flex items-center justify-center"
          >
            <i class="pi pi-calendar-clock text-[var(--p-primary-600)]"></i>
          </div>
          <div>
            <h1 class="text-xl sm:text-2xl font-bold text-gray-900">
              {{ t("staffSchedule.title") }}
            </h1>
            <p class="text-sm text-gray-500">{{ weekRangeLabel }}</p>
          </div>
        </div>
        <div class="flex items-center gap-2 w-full sm:w-auto">
          <Button
            v-if="authStore.isAnalyticsAllowed"
            class="mr-auto sm:mr-0"
            :label="t('staffSchedule.editShopHours')"
            icon="pi pi-cog"
            text
            size="small"
            @click="openShopHoursDialog"
          />
          <Button
            icon="pi pi-chevron-left"
            class="p-button-outlined"
            :aria-label="t('staffSchedule.prevWeek')"
            @click="prevWeek"
          />
          <Button
            icon="pi pi-chevron-right"
            class="p-button-outlined"
            :aria-label="t('staffSchedule.nextWeek')"
            @click="nextWeek"
          />
        </div>
      </div>
    </div>

    <!-- Phones: one day at a time. -->
    <div v-if="isPhone" class="bg-white rounded-2xl shadow-sm border border-gray-100 p-3" data-testid="schedule-day-view">
      <div class="grid grid-cols-7 gap-1 mb-3" role="tablist">
        <button
          v-for="(d, i) in weekDates"
          :key="d.getTime()"
          type="button"
          role="tab"
          :aria-selected="i === dayIndex"
          class="flex flex-col items-center py-2 rounded-xl transition-colors"
          :class="i === dayIndex ? 'bg-[var(--p-primary-color)] text-white' : 'text-gray-600 hover:bg-gray-50'"
          data-testid="schedule-day"
          @click="dayIndex = i"
        >
          <span class="text-xs font-semibold">{{ t(`staff.workingHours.days.${d.getDay()}`).slice(0, 3) }}</span>
          <span class="text-base font-bold">{{ d.getDate() }}</span>
        </button>
      </div>
      <div class="flex justify-between items-center px-3 py-2 rounded-lg bg-gray-50 text-sm mb-1">
        <span class="font-semibold text-gray-500 text-xs uppercase">{{ t("staffSchedule.shopHours") }}</span>
        <span class="text-gray-600">{{ shopHoursLabel(selectedDay.getDay()) }}</span>
      </div>
      <button
        v-for="s in calendarStore.resources"
        :key="s.id"
        type="button"
        class="w-full flex items-center justify-between gap-3 px-3 py-3 border-b border-gray-100 last:border-b-0 text-left hover:bg-[var(--p-primary-50)]"
        @click="openCellPopup(s, selectedDay)"
      >
        <span class="min-w-0">
          <span class="block font-semibold text-gray-800 text-sm truncate">{{ s.name }}</span>
          <span class="block text-xs text-gray-400">{{ weeklyHoursLabel(s.id) }}</span>
        </span>
        <span class="flex items-center gap-2 flex-shrink-0 text-sm">
          <span
            v-if="leaveFor(s.id, selectedDay)"
            class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold"
            :title="leaveFor(s.id, selectedDay)?.reason || ''"
            data-testid="schedule-leave"
            >{{ t("staffSchedule.onLeave") }}</span
          >
          <span
            v-else
            :class="
              cellRanges(s.id, selectedDay) === null || cellRanges(s.id, selectedDay)?.length === 0
                ? 'text-gray-400'
                : 'text-gray-800 font-medium'
            "
            >{{ cellLabel(s.id, selectedDay) }}</span
          >
          <i
            v-if="!leaveFor(s.id, selectedDay) && ownHoursFor(s.id, selectedDay)"
            class="pi pi-circle-fill text-[6px] text-[var(--p-primary-color)]"
            :title="t('staffSchedule.ownHours')"
            data-testid="schedule-own-day"
          ></i>
          <i class="pi pi-chevron-right text-xs text-gray-300"></i>
        </span>
      </button>
    </div>

    <!-- Grid Card -->
    <div
      v-else
      class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 overflow-x-auto"
    >
      <table class="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th class="text-left p-3 w-48"></th>
            <th
              v-for="d in weekDates"
              :key="d.getTime()"
              class="text-center p-3 font-semibold text-gray-700 whitespace-nowrap"
            >
              <div>{{ t(`staff.workingHours.days.${d.getDay()}`) }}</div>
              <div class="text-xs text-gray-400 font-normal">{{ dayNumLabel(d) }}</div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr class="bg-gray-50">
            <td class="p-3 font-semibold text-gray-500 text-xs uppercase">
              {{ t("staffSchedule.shopHours") }}
            </td>
            <td
              v-for="d in weekDates"
              :key="d.getTime()"
              class="text-center p-3 text-xs text-gray-500 whitespace-nowrap"
            >
              {{ shopHoursLabel(d.getDay()) }}
            </td>
          </tr>
          <tr
            v-for="s in calendarStore.resources"
            :key="s.id"
            class="border-t border-gray-100"
          >
            <td class="p-3">
              <div class="font-semibold text-gray-800 text-sm">{{ s.name }}</div>
              <div class="text-xs text-gray-400">{{ weeklyHoursLabel(s.id) }}</div>
            </td>
            <td
              v-for="d in weekDates"
              :key="d.getTime()"
              class="text-center p-2 cursor-pointer hover:bg-[var(--p-primary-50)] rounded-lg transition-colors whitespace-nowrap"
              :class="{ 'bg-amber-50': leaveFor(s.id, d) }"
              @click="openCellPopup(s, d)"
            >
              <!-- On leave: that instead of the hours (which stay as they were). -->
              <span
                v-if="leaveFor(s.id, d)"
                class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold"
                v-tooltip.top="leaveFor(s.id, d)?.reason || null"
                data-testid="schedule-leave"
                >{{ t("staffSchedule.onLeave") }}</span
              >
              <span
                v-else
                :class="
                  cellRanges(s.id, d) === null || cellRanges(s.id, d)?.length === 0
                    ? 'text-gray-400'
                    : 'text-gray-800'
                "
                >{{ cellLabel(s.id, d) }}</span
              >
              <!-- This date has its own hours (not the weekly schedule's). -->
              <i
                v-if="!leaveFor(s.id, d) && ownHoursFor(s.id, d)"
                class="pi pi-circle-fill text-[6px] text-[var(--p-primary-color)] align-middle ml-1"
                v-tooltip.top="t('staffSchedule.ownHours')"
                data-testid="schedule-own-day"
              ></i>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Small cell popup -->
    <Dialog
      v-model:visible="popupVisible"
      :header="popupStaff?.name"
      modal
      :style="{ width: '360px', maxWidth: '95vw' }"
    >
      <div class="text-xs text-gray-400 mb-3">{{ popupDateLabel }}</div>
      <div class="text-sm text-gray-600 mb-1">
        {{ t("staffSchedule.scheduleType") }}: {{ t("staffSchedule.weekly") }}
      </div>
      <div class="text-sm text-gray-600" :class="popupOwnDay ? 'mb-1' : 'mb-4'">
        {{ t("staffSchedule.from") }}:
        {{ popupInfo ? formatDateLong(popupInfo.effective_from) : "—" }}
        <span v-if="popupInfo" class="text-gray-400">
          · {{ popupInfo.hours }} {{ t("staffSchedule.hoursPerWeek") }}</span
        >
      </div>
      <div v-if="popupOwnDay" class="text-sm text-[var(--p-primary-700)] mb-4" data-testid="schedule-popup-own-day">
        {{ t("staffSchedule.ownHours") }}
      </div>
      <div class="space-y-2">
        <Button
          :label="t('staffSchedule.editDay')"
          class="w-full p-button-outlined"
          :disabled="popupDayIsPast"
          @click="openEditDay"
        />
        <Button
          :label="t('staffSchedule.changeSchedule')"
          class="w-full p-button-outlined"
          :disabled="isPastWeek"
          @click="openEditWeek"
        />
      </div>
      <p v-if="isPastWeek" class="text-xs text-gray-400 mt-3">
        {{ t("staffSchedule.pastWeekReadOnly") }}
      </p>
      <p v-else-if="popupDayIsPast" class="text-xs text-gray-400 mt-3">
        {{ t("staffSchedule.pastDayReadOnly") }}
      </p>
    </Dialog>

    <!-- One date's hours (that date only) -->
    <Dialog
      v-model:visible="editDayVisible"
      :header="t('staffSchedule.editShiftTitle')"
      modal
      :style="{ width: '460px', maxWidth: '95vw' }"
    >
      <div class="text-sm text-gray-500">
        {{ popupStaff?.name }} · {{ popupDateLabel }}
      </div>
      <p class="text-xs text-gray-400 mb-4">{{ t("staffSchedule.onlyThisDate") }}</p>
      <div class="flex gap-2 mb-4 flex-wrap">
        <Button
          :label="t('staffSchedule.normalHours')"
          size="small"
          :class="editDayMode === 'default' ? '' : 'p-button-outlined'"
          data-testid="day-mode-default"
          @click="editDayMode = 'default'"
        />
        <Button
          :label="t('staff.workingHours.dayOff')"
          size="small"
          :class="editDayMode === 'off' ? '' : 'p-button-outlined'"
          data-testid="day-mode-off"
          @click="editDayMode = 'off'"
        />
        <Button
          :label="t('staffSchedule.customHours')"
          size="small"
          :class="editDayMode === 'custom' ? '' : 'p-button-outlined'"
          data-testid="day-mode-custom"
          @click="editDayMode = 'custom'"
        />
      </div>
      <p v-if="editDayMode === 'default'" class="text-sm text-gray-600" data-testid="day-normal-hours">
        {{ weeklyLabel }}
      </p>
      <div v-if="editDayMode === 'custom'" class="space-y-2">
        <div v-for="(range, idx) in editDayRanges" :key="idx" class="flex items-center gap-2">
          <TimeDropdown
            :modelValue="range.start_time"
            @update:modelValue="(v: string) => (range.start_time = v)"
          />
          <span class="text-gray-400 flex-shrink-0">—</span>
          <TimeDropdown
            :modelValue="range.end_time"
            @update:modelValue="(v: string) => (range.end_time = v)"
          />
          <Button
            v-if="editDayRanges.length > 1"
            icon="pi pi-trash"
            class="p-button-rounded p-button-text p-button-sm p-button-danger flex-shrink-0"
            :aria-label="t('common.delete')"
            @click="editDayRanges.splice(idx, 1)"
          />
        </div>
        <Button
          :label="t('staff.workingHours.addRange')"
          icon="pi pi-plus"
          text
          size="small"
          @click="editDayRanges.push({ start_time: '16:00', end_time: '20:00' })"
        />
      </div>
      <template #footer>
        <Button :label="t('common.cancel')" text @click="editDayVisible = false" />
        <Button
          :label="t('common.save')"
          :loading="editDaySaving"
          @click="saveEditDay()"
        />
      </template>
    </Dialog>

    <!-- Change whole week's schedule -->
    <Dialog
      v-model:visible="editWeekVisible"
      :header="t('staffSchedule.changeScheduleTitle')"
      modal
      :style="{ width: '560px' }"
    >
      <div class="text-sm text-gray-500">{{ popupStaff?.name }}</div>
      <p class="text-xs text-gray-400 mb-4" data-testid="week-from-onwards">
        {{ t("staffSchedule.fromOnwards", { date: formatDateLong(toDateStr(weekMonday)) }) }}
      </p>
      <div class="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
        <div
          v-for="day in editWeekDays"
          :key="day.day_of_week"
          class="p-3 bg-gray-50 rounded-xl border border-gray-100"
        >
          <div class="flex items-center gap-3">
            <Checkbox :modelValue="day.active" binary @update:modelValue="toggleWorkingDay(day)" />
            <span class="text-sm font-medium text-gray-800 w-24 flex-shrink-0">
              {{ t(`staff.workingHours.days.${day.day_of_week}`) }}
            </span>
            <div v-if="day.active" class="flex-1 space-y-2 min-w-0">
              <div
                v-for="(range, idx) in day.ranges"
                :key="idx"
                class="flex items-center gap-2"
              >
                <TimeDropdown
                  :modelValue="toTimeStr(range.start_time)"
                  @update:modelValue="(t: string) => (range.start_time = parseTimeToDate(t))"
                />
                <span class="text-gray-400 text-sm flex-shrink-0">—</span>
                <TimeDropdown
                  :modelValue="toTimeStr(range.end_time)"
                  @update:modelValue="(t: string) => (range.end_time = parseTimeToDate(t))"
                />
                <Button
                  icon="pi pi-trash"
                  class="p-button-rounded p-button-text p-button-sm p-button-danger flex-shrink-0"
                  @click="removeWorkingRange(day, idx)"
                />
              </div>
              <Button
                :label="t('staff.workingHours.addRange')"
                icon="pi pi-plus"
                text
                size="small"
                @click="addWorkingRange(day)"
              />
            </div>
            <span v-else class="text-xs text-gray-400">{{ t("staff.workingHours.dayOff") }}</span>
          </div>
        </div>
      </div>
      <template #footer>
        <Button
          v-if="weekHasOwnSchedule"
          :label="t('staffSchedule.removeWeekChange', { date: dayNumLabel(weekMonday) })"
          text
          severity="secondary"
          class="mr-auto"
          data-testid="week-undo"
          @click="clearWeekVersion"
        />
        <Button :label="t('common.cancel')" text @click="editWeekVisible = false" />
        <Button
          :label="t('common.save')"
          :loading="editWeekSaving"
          @click="saveEditWeek()"
        />
      </template>
    </Dialog>

    <!-- Shop hours settings -->
    <Dialog
      v-model:visible="shopHoursVisible"
      :header="t('staffSchedule.editShopHours')"
      modal
      :style="{ width: '480px' }"
    >
      <div class="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
        <div
          v-for="day in shopHoursForm"
          :key="day.day_of_week"
          class="p-3 bg-gray-50 rounded-xl border border-gray-100"
        >
          <div class="flex items-center gap-3">
            <Checkbox :modelValue="day.open" binary @update:modelValue="toggleShopDay(day)" />
            <span class="text-sm font-medium text-gray-800 w-24 flex-shrink-0">
              {{ t(`staff.workingHours.days.${day.day_of_week}`) }}
            </span>
            <div v-if="day.open" class="flex-1 flex items-center gap-2 min-w-0">
              <TimeDropdown
                :modelValue="toTimeStr(day.start_time)"
                @update:modelValue="(t: string) => (day.start_time = parseTimeToDate(t))"
              />
              <span class="text-gray-400 text-sm flex-shrink-0">—</span>
              <TimeDropdown
                :modelValue="toTimeStr(day.end_time)"
                @update:modelValue="(t: string) => (day.end_time = parseTimeToDate(t))"
              />
            </div>
            <span v-else class="text-xs text-gray-400">{{ t("staffSchedule.closed") }}</span>
          </div>
        </div>
      </div>
      <template #footer>
        <Button :label="t('common.cancel')" text @click="shopHoursVisible = false" />
        <Button
          :label="t('common.save')"
          :loading="shopHoursSaving"
          @click="saveShopHours()"
        />
      </template>
    </Dialog>

    <ConfirmDialog></ConfirmDialog>
  </div>
</template>

<script setup lang="ts">
import { api, ApiError, ifRefused } from "../api/http";
import { ref, computed, watch, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useToast } from "primevue/usetoast";
import { useConfirm } from "primevue/useconfirm";
import { useCalendarStore } from "../stores/calendar";
import { useAuthStore } from "../stores/auth";
import TimeDropdown from "../components/booking/TimeDropdown.vue";
import { useIsPhone } from "../composables/useIsPhone";
import {
  mondayOf,
  buildWeekSchedule,
  getWorkingRangesForDate,
  leaveOnDay,
  ownHoursOn,
  weeklyRangesForDate,
  weeklyScheduleStart,
  toLocalDateStr,
  type WeekDaySchedule,
} from "../utils/staffAvailability";

const { t, locale } = useI18n();
const toast = useToast();
const notify = {
  success: (detail: string) => toast.add({ severity: "success", summary: t("common.success"), detail, life: 3000 }),
  error: (detail: string) => toast.add({ severity: "error", summary: t("common.error"), detail, life: 4000 }),
};
const confirm = useConfirm();
const calendarStore = useCalendarStore();
const authStore = useAuthStore();

// Mon->Sun display order, matching StaffView's existing convention (JS
// Date#getDay() is 0=Sun..6=Sat).
const WEEKDAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const toDateStr = (d: Date) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};
const toTimeStr = (d: Date) => {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
};
const parseTimeToDate = (time: string) => {
  const [h, m] = (time || "09:00").split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
};
const defaultRange = () => {
  const start = new Date();
  start.setHours(9, 0, 0, 0);
  const end = new Date();
  end.setHours(17, 0, 0, 0);
  return { start_time: start, end_time: end };
};

// === Week navigation ===
const weekMonday = ref<Date>(mondayOf(new Date()));
const weekDates = computed(() =>
  Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekMonday.value);
    d.setDate(d.getDate() + i);
    return d;
  }),
);
const isPastWeek = computed(() => weekMonday.value < mondayOf(new Date()));

// Phones show one day of the week at a time: today when it's in the shown
// week, otherwise its Monday.
const isPhone = useIsPhone();
const dayIndex = ref(0);
watch(
  weekDates,
  (dates) => {
    const today = new Date().toDateString();
    const i = dates.findIndex((d) => d.toDateString() === today);
    dayIndex.value = i >= 0 ? i : 0;
  },
  { immediate: true },
);
const selectedDay = computed(() => weekDates.value[dayIndex.value] || weekDates.value[0]);
const prevWeek = () => {
  const d = new Date(weekMonday.value);
  d.setDate(d.getDate() - 7);
  weekMonday.value = d;
};
const nextWeek = () => {
  const d = new Date(weekMonday.value);
  d.setDate(d.getDate() + 7);
  weekMonday.value = d;
};
const dayNumLabel = (d: Date) =>
  d.toLocaleDateString(locale.value === "el" ? "el-GR" : "en-GB", {
    day: "2-digit",
    month: "2-digit",
  });
const weekRangeLabel = computed(() => {
  const end = new Date(weekMonday.value);
  end.setDate(end.getDate() + 6);
  return `${dayNumLabel(weekMonday.value)} – ${dayNumLabel(end)}`;
});
const formatDateLong = (dateStr: string) =>
  new Date(`${dateStr}T00:00:00`).toLocaleDateString(
    locale.value === "el" ? "el-GR" : "en-GB",
    { day: "numeric", month: "long", year: "numeric" },
  );

// === Grid cell resolution ===
// The shared rule (utils/staffAvailability.ts): a date's own hours, else the
// weekly schedule in force then.
const cellRanges = (staffId: any, date: Date) => getWorkingRangesForDate(calendarStore.workingHours, staffId, date);
const ownHoursFor = (staffId: any, date: Date) => ownHoursOn(calendarStore.workingHours, staffId, date);

// The weekly schedule in force on a date: the Monday it starts, and its hours a week.
const governingVersion = (staffId: any, date: Date) => {
  const from = weeklyScheduleStart(calendarStore.workingHours, staffId, date);
  if (!from) return null;
  const totalMinutes = (calendarStore.workingHours || [])
    .filter((w: any) => !w.kind && String(w.staff_id) === String(staffId) && w.effective_from === from)
    .reduce((sum: number, w: any) => {
      const [sh, sm] = w.start_time.split(":").map(Number);
      const [eh, em] = w.end_time.split(":").map(Number);
      return sum + (eh * 60 + em - (sh * 60 + sm));
    }, 0);
  return { effective_from: from, hours: Math.round((totalMinutes / 60) * 10) / 10 };
};

// A staff member's leave on a day (from the staff page's time off), if any.
const leaveFor = (staffId: any, date: Date) => leaveOnDay(calendarStore.timeOff, staffId, date);

// Server TIME columns serialize with seconds ("09:00:00") — trim for display.
const hhmm = (s: string) => (s || "").slice(0, 5);
const asShifts = (ranges: { start: string; end: string }[] | null) =>
  (ranges || []).map((r) => ({ start_time: hhmm(r.start), end_time: hhmm(r.end) }));

const cellLabel = (staffId: any, date: Date) => {
  const ranges = cellRanges(staffId, date);
  if (ranges === null) return t("staffSchedule.notSet");
  if (ranges.length === 0) return t("staff.workingHours.dayOff");
  return ranges.map((r) => `${hhmm(r.start)} - ${hhmm(r.end)}`).join(", ");
};

const weeklyHoursLabel = (staffId: any) => {
  const v = governingVersion(staffId, new Date(weekMonday.value));
  return v ? `${v.hours} ${t("staffSchedule.hoursPerWeek")}` : t("staffSchedule.notSet");
};

// === Shop hours reference row ===
const shopHours = ref<{ day_of_week: number; start_time: string; end_time: string }[]>([]);
const loadShopHours = async () => {
  shopHours.value = await api.get("/api/v1/shop-hours").catch(ifRefused([]));
};
const shopHoursLabel = (dow: number) => {
  const row = shopHours.value.find((d) => d.day_of_week === dow);
  return row ? `${hhmm(row.start_time)} - ${hhmm(row.end_time)}` : t("staffSchedule.closed");
};

// === Cell popup ===
const popupVisible = ref(false);
const popupStaff = ref<any>(null);
const popupDate = ref<Date | null>(null);
const popupInfo = computed(() =>
  popupStaff.value && popupDate.value
    ? governingVersion(popupStaff.value.id, popupDate.value)
    : null,
);
const popupDateLabel = computed(() =>
  popupDate.value
    ? popupDate.value.toLocaleDateString(locale.value === "el" ? "el-GR" : "en-GB", {
        weekday: "short",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "",
);
const popupOwnDay = computed(() =>
  popupStaff.value && popupDate.value ? !!ownHoursFor(popupStaff.value.id, popupDate.value) : false,
);
// Today can still be changed; earlier days can't (the server refuses them too).
const popupDayIsPast = computed(() => !popupDate.value || toLocalDateStr(popupDate.value) < toLocalDateStr(new Date()));
const openCellPopup = (staff: any, date: Date) => {
  popupStaff.value = staff;
  popupDate.value = date;
  popupVisible.value = true;
};

// === Saving (both dialogs) ===
// What the server says when it refuses, in words.
const SAVE_ERRORS: Record<string, string> = {
  "end_time must be after start_time": "staffSchedule.errors.endBeforeStart",
  overlapping_ranges: "staffSchedule.errors.overlapping",
  "date cannot be in the past": "staffSchedule.errors.pastDate",
  "effective_from cannot be before the current week": "staffSchedule.errors.pastWeek",
};
const saveFailed = (e: unknown) => {
  const key = e instanceof ApiError ? SAVE_ERRORS[e.data?.error] : undefined;
  notify.error(key ? t(key) : t("staff.workingHours.saveFailed"));
};

/**
 * Sends a schedule change. Bookings it would leave outside come back first
 * (409): listed, and asked about before sending it again with force.
 */
const sendScheduleChange = async (send: (force: boolean) => Promise<unknown>, force = false): Promise<boolean> => {
  try {
    const conflict = await send(force)
      .then(() => null)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 409) return e.data || {};
        throw e;
      });
    if (conflict) {
      const list = (conflict.conflicts || [])
        .map((c: any) => `• ${c.client_name || "—"} — ${c.service_name || ""} (${new Date(c.start_time).toLocaleString()})`)
        .join("\n");
      return new Promise((resolve) => {
        confirm.require({
          message: t("staff.workingHours.conflictMessage", { count: (conflict.conflicts || []).length, list }),
          header: t("staff.workingHours.conflictHeader"),
          icon: "pi pi-exclamation-triangle",
          acceptClass: "p-button-warning",
          accept: async () => resolve(await sendScheduleChange(send, true)),
          reject: () => resolve(false),
          onHide: () => resolve(false),
        });
      });
    }
    notify.success(t("staff.workingHours.saved"));
    await calendarStore.refreshWorkingHours();
    return true;
  } catch (e) {
    saveFailed(e);
    return false;
  }
};

// A weekly schedule from that Monday on.
const saveWeek = (staffId: string, monday: Date, week: WeekDaySchedule[]) =>
  sendScheduleChange((force) =>
    api.post(`/api/v1/staff/${staffId}/working-hours`, {
      enabled: true,
      effective_from: toDateStr(monday),
      schedule: week.filter((d) => d.ranges.length > 0).map((d) => ({ day_of_week: d.day_of_week, ranges: d.ranges })),
      force,
    }),
  );

// === One date's hours ===
const editDayVisible = ref(false);
const editDayMode = ref<"default" | "off" | "custom">("default");
const editDayRanges = ref<{ start_time: string; end_time: string }[]>([]);
const editDaySaving = ref(false);

// What the weekly schedule says for the open date, for the "weekly schedule" choice.
const weeklyLabel = computed(() => {
  if (!popupStaff.value || !popupDate.value) return "";
  const ranges = weeklyRangesForDate(calendarStore.workingHours, popupStaff.value.id, popupDate.value);
  if (ranges === null) return t("staffSchedule.normalHoursNone");
  if (ranges.length === 0) return t("staff.workingHours.dayOff");
  return ranges.map((r) => `${hhmm(r.start)} - ${hhmm(r.end)}`).join(", ");
});

const openEditDay = () => {
  const staff = popupStaff.value;
  const date = popupDate.value;
  if (!staff || !date) return;
  const own = ownHoursFor(staff.id, date);
  editDayMode.value = own === null ? "default" : own.length === 0 ? "off" : "custom";
  // Other hours start from what the day has now (its own, else the weekly schedule's).
  const current = own?.length ? own : asShifts(weeklyRangesForDate(calendarStore.workingHours, staff.id, date));
  editDayRanges.value = current.length ? current.map((r) => ({ ...r })) : [{ start_time: "09:00", end_time: "17:00" }];
  popupVisible.value = false;
  editDayVisible.value = true;
};

const saveEditDay = async () => {
  const staff = popupStaff.value;
  const date = popupDate.value;
  if (!staff || !date) return;
  const url = `/api/v1/staff/${staff.id}/days/${toDateStr(date)}`;
  editDaySaving.value = true;
  const ok =
    editDayMode.value === "default"
      ? await sendScheduleChange(() => api.del(url))
      : await sendScheduleChange((force) =>
          api.put(url, { ranges: editDayMode.value === "off" ? [] : editDayRanges.value, force }),
        );
  editDaySaving.value = false;
  if (ok) editDayVisible.value = false;
};

// === Change whole week ===
const editWeekVisible = ref(false);
const editWeekDays = ref<any[]>([]);
const editWeekSaving = ref(false);

const toggleWorkingDay = (day: any) => {
  day.active = !day.active;
  if (day.active && day.ranges.length === 0) {
    day.ranges.push(defaultRange());
  } else if (!day.active) {
    day.ranges = [];
  }
};
const addWorkingRange = (day: any) => {
  day.ranges.push(defaultRange());
};
const removeWorkingRange = (day: any, idx: number | string) => {
  day.ranges.splice(Number(idx), 1);
  if (day.ranges.length === 0) day.active = false;
};

const openEditWeek = () => {
  const staff = popupStaff.value;
  if (!staff) return;
  const week = buildWeekSchedule(calendarStore.workingHours, staff.id, weekMonday.value);
  editWeekDays.value = WEEKDAY_DISPLAY_ORDER.map((dow) => {
    const day = week.find((d) => d.day_of_week === dow)!;
    return {
      day_of_week: dow,
      active: day.ranges.length > 0,
      ranges: day.ranges.map((r) => ({
        start_time: parseTimeToDate(r.start_time),
        end_time: parseTimeToDate(r.end_time),
      })),
    };
  });
  popupVisible.value = false;
  editWeekVisible.value = true;
};

const saveEditWeek = async () => {
  const staff = popupStaff.value;
  if (!staff) return;
  const week: WeekDaySchedule[] = editWeekDays.value.map((d) => ({
    day_of_week: d.day_of_week,
    ranges: d.active
      ? d.ranges.map((r: any) => ({ start_time: toTimeStr(r.start_time), end_time: toTimeStr(r.end_time) }))
      : [],
  }));
  editWeekSaving.value = true;
  const ok = await saveWeek(staff.id, weekMonday.value, week);
  editWeekSaving.value = false;
  if (ok) editWeekVisible.value = false;
};

// A weekly schedule starts this Monday (its change can be undone).
const weekHasOwnSchedule = computed(
  () =>
    !!popupStaff.value &&
    (calendarStore.workingHours || []).some(
      (w: any) => w.kind !== "day" && String(w.staff_id) === String(popupStaff.value.id) && w.effective_from === toDateStr(weekMonday.value),
    ),
);

// Removes the weekly schedule starting this Monday: the one before it applies
// again from then (not the same as saving no working days, a week off).
const clearWeekVersion = async () => {
  const staff = popupStaff.value;
  if (!staff) return;
  try {
    await api.del(`/api/v1/staff/${staff.id}/working-hours/${toDateStr(weekMonday.value)}`);
    notify.success(t("staff.workingHours.saved"));
    await calendarStore.refreshWorkingHours();
    editWeekVisible.value = false;
  } catch (e) {
    saveFailed(e);
  }
};

// === Shop hours settings ===
const shopHoursVisible = ref(false);
const shopHoursForm = ref<any[]>([]);
const shopHoursSaving = ref(false);

const openShopHoursDialog = () => {
  shopHoursForm.value = WEEKDAY_DISPLAY_ORDER.map((dow) => {
    const row = shopHours.value.find((d) => d.day_of_week === dow);
    return row
      ? { day_of_week: dow, open: true, start_time: parseTimeToDate(row.start_time), end_time: parseTimeToDate(row.end_time) }
      : { day_of_week: dow, open: false, start_time: defaultRange().start_time, end_time: defaultRange().end_time };
  });
  shopHoursVisible.value = true;
};
const toggleShopDay = (day: any) => {
  day.open = !day.open;
};
const saveShopHours = async () => {
  shopHoursSaving.value = true;
  const days = shopHoursForm.value
    .filter((d) => d.open)
    .map((d) => ({ day_of_week: d.day_of_week, start_time: toTimeStr(d.start_time), end_time: toTimeStr(d.end_time) }));
  try {
    await api.put("/api/v1/shop-hours", { days });
    notify.success(t("staff.workingHours.saved"));
    await loadShopHours();
    shopHoursVisible.value = false;
  } catch (e) {
    saveFailed(e);
  } finally {
    shopHoursSaving.value = false;
  }
};

onMounted(async () => {
  if (!calendarStore.resources?.length) {
    await calendarStore.fetchBaseResources();
  } else {
    // Leave added on the staff page since the calendar loaded it.
    calendarStore.refreshTimeOff();
  }
  await loadShopHours();
});
</script>
