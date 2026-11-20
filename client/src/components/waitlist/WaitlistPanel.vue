<template>
  <Drawer
    v-model:visible="panelVisible"
    position="right"
    :header="t('waitlist.title')"
    class="!w-full sm:!w-[440px]"
    data-testid="waitlist-panel"
  >
    <!-- One freed time open: who waiting suits it. -->
    <div v-if="freedSlot" class="mb-4 rounded-xl border border-green-200 bg-green-50 p-3" data-testid="waitlist-freed">
      <div class="flex items-start justify-between gap-2">
        <div>
          <p class="text-sm font-semibold text-green-900">{{ t("waitlist.freedTitle") }}</p>
          <p class="text-sm text-green-800">{{ slotLabel(freedSlot) }}</p>
        </div>
        <Button icon="pi pi-times" text rounded size="small" :aria-label="t('common.close')" @click="freedSlot = null" />
      </div>
      <p class="text-xs text-green-800 mt-1">{{ t("waitlist.freedHint") }}</p>
    </div>

    <!-- Times cancellations freed that suit someone waiting (the button's number). -->
    <div v-if="!freedSlot && freed.length" class="mb-4" data-testid="waitlist-freed-list">
      <p class="text-xs font-bold text-green-800 uppercase mb-1.5">{{ t("waitlist.freedList") }}</p>
      <div class="space-y-1.5">
        <div
          v-for="f in freed"
          :key="f.id"
          class="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 pl-3 pr-1 py-1.5"
          data-testid="waitlist-freed-item"
        >
          <button type="button" class="flex-1 min-w-0 text-left" data-testid="waitlist-freed-open" @click="freedSlot = f">
            <span class="block text-sm font-semibold text-green-900 truncate">{{ slotLabel(f) }}</span>
            <span class="block text-xs text-green-800">{{ t("waitlist.fits", { n: f.matches.length }, f.matches.length) }}</span>
          </button>
          <Button
            icon="pi pi-times"
            text
            rounded
            size="small"
            severity="secondary"
            :aria-label="t('waitlist.dismiss')"
            :title="t('waitlist.dismiss')"
            data-testid="waitlist-freed-dismiss"
            @click="dismiss(f)"
          />
        </div>
      </div>
    </div>

    <div v-if="!freedSlot" class="flex items-center justify-between gap-2 mb-3">
      <Button :label="t('waitlist.add')" icon="pi pi-plus" size="small" data-testid="waitlist-add" @click="openEntry(null)" />
      <label class="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
        <ToggleSwitch v-model="showingAll" @update:modelValue="load" />
        {{ t("waitlist.showPast") }}
      </label>
    </div>

    <!-- Filters for the list (not for a freed time's clients). -->
    <div v-if="!freedSlot && entries.length" class="mb-3 space-y-2" data-testid="waitlist-filters">
      <IconField>
        <InputIcon class="pi pi-search" />
        <InputText v-model="filters.search" :placeholder="t('waitlist.filters.search')" class="w-full" size="small" data-testid="waitlist-filter-search" />
      </IconField>
      <div class="grid grid-cols-2 gap-2">
        <Select
          v-model="filters.service"
          :options="serviceOptions"
          optionLabel="name"
          optionValue="id"
          filter
          showClear
          :placeholder="t('waitlist.filters.allServices')"
          class="w-full min-w-0"
          size="small"
          data-testid="waitlist-filter-service"
        />
        <Select
          v-model="filters.staff"
          :options="staffOptions"
          optionLabel="name"
          optionValue="id"
          filter
          showClear
          :placeholder="t('waitlist.filters.allStaff')"
          class="w-full min-w-0"
          size="small"
          data-testid="waitlist-filter-staff"
        />
        <DatePicker
          v-model="filters.date"
          dateFormat="dd/mm/yy"
          showButtonBar
          :placeholder="t('waitlist.filters.date')"
          class="w-full min-w-0"
          inputClass="w-full"
          size="small"
          data-testid="waitlist-filter-date"
        />
        <label class="flex items-center gap-2 text-xs text-gray-600 cursor-pointer min-w-0">
          <ToggleSwitch v-model="filters.bookableOnly" data-testid="waitlist-filter-bookable" />
          <span class="leading-tight">{{ t("waitlist.filters.bookableOnly") }}</span>
        </label>
      </div>
      <div v-if="filtering" class="flex items-center justify-between text-xs text-gray-500">
        <span data-testid="waitlist-filter-count">{{ t("waitlist.filters.showing", { n: shown.length, total: entries.length }) }}</span>
        <Button :label="t('waitlist.filters.clear')" icon="pi pi-times" text size="small" data-testid="waitlist-filter-clear" @click="clearFilters" />
      </div>
    </div>

    <p v-if="!shown.length && !loading" class="text-sm text-gray-400 text-center py-8">
      {{ freedSlot ? t("waitlist.noMatches") : filtering ? t("waitlist.filters.none") : t("waitlist.empty") }}
    </p>

    <div class="space-y-2">
      <div
        v-for="e in shown"
        :key="e.id"
        class="rounded-xl border border-gray-100 p-3"
        :class="{ 'opacity-60': isPast(e) }"
        data-testid="waitlist-entry"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="text-sm font-semibold text-gray-900 truncate">{{ e.client_name }}</div>
            <a v-if="e.client_phone" :href="`tel:${e.client_phone}`" class="text-xs text-green-700">{{ e.client_phone }}</a>
          </div>
          <span v-if="isPast(e)" class="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{{ t("waitlist.past") }}</span>
          <span
            v-else-if="!freedSlot && bookable.includes(e.id)"
            class="flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-green-100 text-green-800"
            data-testid="waitlist-bookable"
            >{{ t("waitlist.canBook") }}</span
          >
        </div>
        <div class="text-sm text-gray-700 mt-1">
          {{ e.service_name || t("waitlist.anyService") }} · {{ e.staff_name || t("waitlist.anyone") }}
        </div>
        <div class="text-xs text-gray-500" data-testid="waitlist-when">{{ whenLabel(e) }}</div>
        <p v-if="e.note" class="text-xs text-gray-600 italic mt-1 whitespace-pre-line break-words">{{ e.note }}</p>
        <div class="flex gap-2 mt-2">
          <Button :label="t('waitlist.book')" icon="pi pi-calendar-plus" size="small" data-testid="waitlist-book" @click="book(e)" />
          <Button :label="t('common.edit')" size="small" text data-testid="waitlist-edit" @click="openEntry(e)" />
          <Button :label="t('waitlist.remove')" size="small" text severity="danger" data-testid="waitlist-remove" @click="askRemove(e)" />
        </div>
      </div>
    </div>

    <div v-if="freedSlot" class="mt-4 text-center">
      <Button :label="t('waitlist.wholeList')" text size="small" @click="freedSlot = null" />
    </div>

    <WaitlistEntryDialog v-model:visible="entryVisible" :entry="editing" />
    <WaitlistFreeTimesDialog v-model:visible="freeTimesVisible" :entry="booking" @pick="pickFreeTime" @anyway="bookAnyway" />
  </Drawer>
</template>

<script setup lang="ts">
// The calendar's waitlist panel: who's waiting and for what, adding and
// changing entries, and booking one (at one of their free times; the booking
// dialog opens filled in, and the entry is marked booked when it's saved).
// On top, the times cancellations freed that suit someone waiting, each
// opening on who it suits.
import { computed, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useConfirm } from "primevue/useconfirm";
import WaitlistEntryDialog from "./WaitlistEntryDialog.vue";
import WaitlistFreeTimesDialog from "./WaitlistFreeTimesDialog.vue";
import { useWaitlist, type FreedSlot, type WaitlistEntry } from "../../composables/useWaitlist";
import { useNotify } from "../../composables/useNotify";
import { formatDate, clockTime } from "../../utils/format";
import { askConfirm } from "../../utils/confirm";
import { toLocalDateStr } from "../../utils/staffAvailability";
import { foldText } from "../../utils/text";
import { useCalendarStore } from "../../stores/calendar";

// The booking to open: client, service, therapist, start and the entry it's from.
const emit = defineEmits<{ book: [seed: Record<string, any>] }>();
const { t, locale } = useI18n();
const confirm = useConfirm();
const notify = useNotify();
const { entries, showingAll, loading, panelVisible, freed, freedSlot, bookable, load, remove, dismissFreed } = useWaitlist();

const dismiss = async (f: FreedSlot) => {
  try {
    await dismissFreed(f.id);
  } catch {
    notify.error(t("waitlist.saveFailed"));
  }
};

// The list's filters. A service or therapist also keeps the entries that take
// any service or anyone; a date keeps the entries that can come on it (in
// their dates and on one of their weekdays).
const calendarStore = useCalendarStore();
const filters = reactive({ search: "", service: null as string | null, staff: null as string | null, date: null as Date | null, bookableOnly: false });
const filtering = computed(() => !!(filters.search.trim() || filters.service || filters.staff || filters.date || filters.bookableOnly));
const clearFilters = () => Object.assign(filters, { search: "", service: null, staff: null, date: null, bookableOnly: false });
// The shop's services and staff, plus any an entry names that has since gone.
const optionsFrom = (list: any[], idKey: "service_id" | "staff_id", nameKey: "service_name" | "staff_name") => {
  const named = new Map<string, string>(list.map((x: any) => [String(x.id), x.name]));
  for (const e of entries.value) if (e[idKey] && !named.has(String(e[idKey]))) named.set(String(e[idKey]), e[nameKey] || "—");
  return [...named].map(([id, name]) => ({ id, name }));
};
const serviceOptions = computed(() => optionsFrom((calendarStore.services || []).filter((s: any) => s.is_active !== false), "service_id", "service_name"));
const staffOptions = computed(() => optionsFrom(calendarStore.resources || [], "staff_id", "staff_name"));
// The search: name, phone or note, ignoring accents; a phone also matches
// written without its spaces ("690 000" finds 6900001234).
const searchHits = (e: WaitlistEntry, q: string) => {
  if ([e.client_name, e.client_phone, e.note].some((v) => foldText(v || "").includes(q))) return true;
  const digits = q.replace(/\D/g, "");
  return !!digits && (e.client_phone || "").replace(/\D/g, "").includes(digits);
};
const matches = (e: WaitlistEntry) => {
  const q = foldText(filters.search.trim());
  if (q && !searchHits(e, q)) return false;
  if (filters.service && e.service_id && String(e.service_id) !== filters.service) return false;
  if (filters.staff && e.staff_id && String(e.staff_id) !== filters.staff) return false;
  if (filters.date) {
    const day = toLocalDateStr(filters.date);
    if (day < e.date_from || day > e.date_to) return false;
    if (e.days?.length && !e.days.includes(filters.date.getDay())) return false;
  }
  if (filters.bookableOnly && !bookable.value.includes(e.id)) return false;
  return true;
};

// The ones who can be booked now first (otherwise in the list's order).
const shown = computed(() => {
  if (freedSlot.value) return freedSlot.value.matches;
  const can = (e: WaitlistEntry) => (bookable.value.includes(e.id) ? 0 : 1);
  return entries.value.filter(matches).sort((a, b) => can(a) - can(b));
});
const todayStr = () => toLocalDateStr(new Date());
const isPast = (e: WaitlistEntry) => e.date_to < todayStr();

const dateLabel = (d: string) => formatDate(d, locale.value, "dayMonth");
const whenLabel = (e: WaitlistEntry) => {
  const dates = e.date_from === e.date_to ? dateLabel(e.date_from) : `${dateLabel(e.date_from)} – ${dateLabel(e.date_to)}`;
  const days = e.days?.length
    ? [1, 2, 3, 4, 5, 6, 0].filter((d) => e.days.includes(d)).map((d) => t(`staff.workingHours.days.${d}`).slice(0, 3)).join(", ")
    : t("waitlist.anyDay");
  const hours = e.time_from || e.time_to ? `${e.time_from || "…"}–${e.time_to || "…"}` : t("waitlist.anyTime");
  return `${dates} · ${days} · ${hours}`;
};
const slotLabel = (slot: FreedSlot) =>
  `${formatDate(slot.start, locale.value, "weekdayDayMonth")} ${clockTime(slot.start)}–${clockTime(slot.end)} · ${slot.staff_name}`;

const entryVisible = ref(false);
const editing = ref<WaitlistEntry | null>(null);
const openEntry = (e: WaitlistEntry | null) => {
  editing.value = e;
  entryVisible.value = true;
};

const openBooking = (e: WaitlistEntry, staffId: string | null, start: Date) => {
  emit("book", {
    client_id: e.client_id,
    first_name: e.first_name,
    last_name: e.last_name,
    phone: e.client_phone,
    start_time: start,
    staff_id: staffId,
    service_id: e.service_id,
    waitlist_entry_id: e.id,
  });
  freeTimesVisible.value = false;
  panelVisible.value = false;
  freedSlot.value = null;
};

// Book: a freed time was already matched to them, so it opens at once;
// otherwise their free times are looked up first.
const freeTimesVisible = ref(false);
const booking = ref<WaitlistEntry | null>(null);
const book = (e: WaitlistEntry) => {
  if (freedSlot.value) return openBooking(e, freedSlot.value.staff_id, new Date(freedSlot.value.start));
  booking.value = e;
  freeTimesVisible.value = true;
};
const pickFreeTime = (slot: { staff_id: string; start: Date }) => booking.value && openBooking(booking.value, slot.staff_id, slot.start);
// None suits: the first day they can come (not before today), at the start of their hours.
const bookAnyway = () => {
  const e = booking.value;
  if (!e) return;
  const day = e.date_from > todayStr() ? e.date_from : todayStr();
  openBooking(e, e.staff_id, new Date(`${day}T${e.time_from || "10:00"}:00`));
};

const askRemove = async (e: WaitlistEntry) => {
  const yes = await askConfirm(confirm, {
    header: t("waitlist.removeTitle"),
    message: t("waitlist.removeMessage", { name: e.client_name }),
    icon: "pi pi-exclamation-triangle",
    acceptLabel: t("waitlist.remove"),
    rejectLabel: t("common.cancel"),
  });
  if (!yes) return;
  try {
    await remove(e.id);
  } catch {
    notify.error(t("waitlist.saveFailed"));
  }
};
</script>
