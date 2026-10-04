<template>
  <div class="space-y-6">
    <!-- Page Header -->
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div class="flex justify-between items-center flex-wrap gap-3">
        <div class="flex items-center gap-3">
          <div
            class="w-10 h-10 rounded-xl bg-[var(--p-primary-50)] flex items-center justify-center"
          >
            <i class="pi pi-calendar-clock text-[var(--p-primary-600)]"></i>
          </div>
          <div>
            <h1 class="text-2xl font-bold text-gray-900">
              {{ t("staffSchedule.title") }}
            </h1>
            <p class="text-sm text-gray-500">{{ weekRangeLabel }}</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <Button
            v-if="authStore.isAnalyticsAllowed"
            :label="t('staffSchedule.editShopHours')"
            icon="pi pi-cog"
            text
            size="small"
            @click="openShopHoursDialog"
          />
          <Button
            icon="pi pi-chevron-left"
            class="p-button-outlined p-button-sm"
            @click="prevWeek"
          />
          <Button
            icon="pi pi-chevron-right"
            class="p-button-outlined p-button-sm"
            @click="nextWeek"
          />
        </div>
      </div>
    </div>

    <!-- Grid Card -->
    <div
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
              @click="openCellPopup(s, d)"
            >
              <span
                :class="
                  cellRanges(s.id, d) === null || cellRanges(s.id, d)?.length === 0
                    ? 'text-gray-400'
                    : 'text-gray-800'
                "
                >{{ cellLabel(s.id, d) }}</span
              >
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
      :style="{ width: '360px' }"
    >
      <div class="text-xs text-gray-400 mb-3">{{ popupDateLabel }}</div>
      <div class="text-sm text-gray-600 mb-1">
        {{ t("staffSchedule.scheduleType") }}: {{ t("staffSchedule.weekly") }}
      </div>
      <div class="text-sm text-gray-600 mb-4">
        {{ t("staffSchedule.from") }}:
        {{ popupInfo ? formatDateLong(popupInfo.effective_from) : "—" }}
        <span v-if="popupInfo" class="text-gray-400">
          · {{ popupInfo.hours }} {{ t("staffSchedule.hoursPerWeek") }}</span
        >
      </div>
      <div class="space-y-2">
        <Button
          :label="t('staffSchedule.editDay')"
          class="w-full p-button-outlined"
          :disabled="isPastWeek"
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
    </Dialog>

    <!-- Edit single day -->
    <Dialog
      v-model:visible="editDayVisible"
      :header="t('staffSchedule.editShiftTitle')"
      modal
      :style="{ width: '420px' }"
    >
      <div class="text-sm text-gray-500 mb-4">
        {{ popupStaff?.name }} · {{ popupDateLabel }}
      </div>
      <div class="flex gap-2 mb-4 flex-wrap">
        <Button
          :label="t('staffSchedule.useDefault')"
          size="small"
          :class="editDayMode === 'default' ? '' : 'p-button-outlined'"
          @click="editDayMode = 'default'"
        />
        <Button
          :label="t('staff.workingHours.dayOff')"
          size="small"
          :class="editDayMode === 'off' ? '' : 'p-button-outlined'"
          @click="editDayMode = 'off'"
        />
        <Button
          :label="t('staffSchedule.customHours')"
          size="small"
          :class="editDayMode === 'custom' ? '' : 'p-button-outlined'"
          @click="editDayMode = 'custom'"
        />
      </div>
      <div v-if="editDayMode === 'custom'" class="flex items-center gap-2">
        <TimeDropdown
          :modelValue="toTimeStr(editDayStart)"
          @update:modelValue="(t: string) => (editDayStart = parseTimeToDate(t))"
        />
        <span class="text-gray-400 flex-shrink-0">—</span>
        <TimeDropdown
          :modelValue="toTimeStr(editDayEnd)"
          @update:modelValue="(t: string) => (editDayEnd = parseTimeToDate(t))"
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
      <div class="text-sm text-gray-500 mb-4">{{ popupStaff?.name }} · {{ weekRangeLabel }}</div>
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
          :label="t('staffSchedule.useDefaultWeek')"
          text
          severity="secondary"
          class="mr-auto"
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
import { ref, computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useToast } from "primevue/usetoast";
import { useConfirm } from "primevue/useconfirm";
import { useCalendarStore } from "../stores/calendar";
import { useAuthStore } from "../stores/auth";
import TimeDropdown from "../components/booking/TimeDropdown.vue";
import {
  mondayOf,
  buildWeekSchedule,
  dayScheduleExcludingWeek,
  toLocalDateStr,
  type WeekDaySchedule,
} from "../utils/staffAvailability";

const { t, locale } = useI18n();
const toast = useToast();
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
// Lightweight local copy of the resolution rule (latest effective_from <=
// date) — the shared getWorkingRangesForDate returns the ranges only; the
// grid/popup also need the governing version's own effective_from + total
// weekly hours, so this re-derives both from the same raw rows.
const governingVersion = (staffId: any, date: Date) => {
  const dateStr = toLocalDateStr(date);
  const rows = (calendarStore.workingHours || []).filter(
    (w: any) => String(w.staff_id) === String(staffId) && w.effective_from <= dateStr,
  );
  if (rows.length === 0) return null;
  const latest = rows.reduce(
    (m: string, w: any) => (w.effective_from > m ? w.effective_from : m),
    rows[0].effective_from,
  );
  const versionRows = rows.filter((w: any) => w.effective_from === latest);
  const totalMinutes = versionRows.reduce((sum: number, w: any) => {
    const [sh, sm] = w.start_time.split(":").map(Number);
    const [eh, em] = w.end_time.split(":").map(Number);
    return sum + (eh * 60 + em - (sh * 60 + sm));
  }, 0);
  return { effective_from: latest, hours: Math.round((totalMinutes / 60) * 10) / 10 };
};

const cellRanges = (staffId: any, date: Date): { start: string; end: string }[] | null => {
  const dateStr = toLocalDateStr(date);
  const rows = (calendarStore.workingHours || []).filter(
    (w: any) => String(w.staff_id) === String(staffId) && w.effective_from <= dateStr,
  );
  if (rows.length === 0) return null;
  const latest = rows.reduce(
    (m: string, w: any) => (w.effective_from > m ? w.effective_from : m),
    rows[0].effective_from,
  );
  return rows
    .filter((w: any) => w.effective_from === latest && w.day_of_week === date.getDay())
    .map((w: any) => ({ start: w.start_time, end: w.end_time }))
    .sort((a: any, b: any) => (a.start > b.start ? 1 : -1));
};

// Server TIME columns serialize with seconds ("09:00:00") — trim for display.
const hhmm = (s: string) => (s || "").slice(0, 5);

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
  const token = localStorage.getItem("token");
  const res = await fetch("/api/v1/shop-hours", {
    headers: { Authorization: `Bearer ${token}` },
  });
  shopHours.value = res.ok ? await res.json() : [];
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
const openCellPopup = (staff: any, date: Date) => {
  popupStaff.value = staff;
  popupDate.value = date;
  popupVisible.value = true;
};

// === Shared save (both dialogs write through this) ===
const saveWeek = async (
  staffId: string,
  monday: Date,
  week: WeekDaySchedule[],
  force = false,
): Promise<boolean> => {
  const schedule = week
    .filter((d) => d.ranges.length > 0)
    .map((d) => ({ day_of_week: d.day_of_week, ranges: d.ranges }));
  const token = localStorage.getItem("token");
  try {
    const res = await fetch(`/api/v1/staff/${staffId}/working-hours`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        enabled: true,
        effective_from: toDateStr(monday),
        schedule,
        force,
      }),
    });
    if (res.status === 409) {
      const data = await res.json();
      const list = (data.conflicts || [])
        .map(
          (c: any) =>
            `• ${c.client_name || "—"} — ${c.service_name || ""} (${new Date(c.start_time).toLocaleString()})`,
        )
        .join("\n");
      return new Promise((resolve) => {
        confirm.require({
          message: t("staff.workingHours.conflictMessage", { count: data.conflicts.length, list }),
          header: t("staff.workingHours.conflictHeader"),
          icon: "pi pi-exclamation-triangle",
          acceptClass: "p-button-warning",
          accept: async () => resolve(await saveWeek(staffId, monday, week, true)),
          reject: () => resolve(false),
          onHide: () => resolve(false),
        });
      });
    }
    if (!res.ok) throw new Error("Failed");
    toast.add({ severity: "success", summary: t("common.success"), detail: t("staff.workingHours.saved"), life: 3000 });
    await calendarStore.refreshWorkingHours();
    return true;
  } catch {
    toast.add({ severity: "error", summary: t("common.error"), detail: t("staff.workingHours.saveFailed"), life: 4000 });
    return false;
  }
};

// === Edit single day ===
const editDayVisible = ref(false);
const editDayMode = ref<"default" | "off" | "custom">("default");
const editDayStart = ref<Date>(new Date());
const editDayEnd = ref<Date>(new Date());
const editDaySaving = ref(false);

const openEditDay = () => {
  const staff = popupStaff.value;
  const date = popupDate.value;
  if (!staff || !date) return;
  const dow = date.getDay();
  const mondayStr = toLocalDateStr(weekMonday.value);
  const ownRows = (calendarStore.workingHours || []).filter(
    (w: any) => String(w.staff_id) === String(staff.id) && w.effective_from === mondayStr,
  );
  if (ownRows.length === 0) {
    editDayMode.value = "default";
  } else {
    const dayRanges = ownRows
      .filter((w: any) => w.day_of_week === dow)
      .map((w: any) => ({ start_time: w.start_time, end_time: w.end_time }));
    if (dayRanges.length === 0) {
      editDayMode.value = "off";
    } else {
      editDayMode.value = "custom";
      editDayStart.value = parseTimeToDate(dayRanges[0].start_time);
      editDayEnd.value = parseTimeToDate(dayRanges[0].end_time);
    }
  }
  popupVisible.value = false;
  editDayVisible.value = true;
};

const saveEditDay = async () => {
  const staff = popupStaff.value;
  const date = popupDate.value;
  if (!staff || !date) return;
  const dow = date.getDay();
  const week = buildWeekSchedule(calendarStore.workingHours, staff.id, weekMonday.value);
  const target = week.find((d) => d.day_of_week === dow)!;
  if (editDayMode.value === "default") {
    target.ranges = dayScheduleExcludingWeek(calendarStore.workingHours, staff.id, weekMonday.value, dow);
  } else if (editDayMode.value === "off") {
    target.ranges = [];
  } else {
    target.ranges = [{ start_time: toTimeStr(editDayStart.value), end_time: toTimeStr(editDayEnd.value) }];
  }
  editDaySaving.value = true;
  const ok = await saveWeek(staff.id, weekMonday.value, week);
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
const removeWorkingRange = (day: any, idx: number) => {
  day.ranges.splice(idx, 1);
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

// Drops this week's own version entirely, falling through to whatever
// version precedes it — different from saving an empty schedule (which
// would mean "day off every day" rather than "no override this week").
const clearWeekVersion = async () => {
  const staff = popupStaff.value;
  if (!staff) return;
  const token = localStorage.getItem("token");
  try {
    const res = await fetch(
      `/api/v1/staff/${staff.id}/working-hours/${toDateStr(weekMonday.value)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) throw new Error("Failed");
    toast.add({ severity: "success", summary: t("common.success"), detail: t("staff.workingHours.saved"), life: 3000 });
    await calendarStore.refreshWorkingHours();
    editWeekVisible.value = false;
  } catch {
    toast.add({ severity: "error", summary: t("common.error"), detail: t("staff.workingHours.saveFailed"), life: 4000 });
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
  const token = localStorage.getItem("token");
  const days = shopHoursForm.value
    .filter((d) => d.open)
    .map((d) => ({ day_of_week: d.day_of_week, start_time: toTimeStr(d.start_time), end_time: toTimeStr(d.end_time) }));
  try {
    const res = await fetch("/api/v1/shop-hours", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ days }),
    });
    if (!res.ok) throw new Error("Failed");
    toast.add({ severity: "success", summary: t("common.success"), detail: t("staff.workingHours.saved"), life: 3000 });
    await loadShopHours();
    shopHoursVisible.value = false;
  } catch {
    toast.add({ severity: "error", summary: t("common.error"), detail: t("staff.workingHours.saveFailed"), life: 4000 });
  } finally {
    shopHoursSaving.value = false;
  }
};

onMounted(async () => {
  if (!calendarStore.resources?.length) {
    await calendarStore.fetchBaseResources();
  }
  await loadShopHours();
});
</script>
