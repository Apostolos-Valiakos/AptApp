<template>
  <!-- Book (REDESIGN_SPEC.md §5.2) in three steps with a summary bar that
       stays in reach; also moving a booking (/portal/book/reschedule/:id). -->
  <div class="p-4 space-y-5" :class="{ 'pb-40': flow.state.service }" data-testid="book">
    <div class="flex items-center gap-3">
      <Button v-if="flow.state.step > 1 && !(flow.state.step === 2 && flow.state.moving)" icon="pi pi-arrow-left" text rounded :aria-label="t('portal.book.back')" @click="flow.back" />
      <h1 class="portal-display portal-h2">{{ flow.state.moving ? t("portal.v2.book.moveTitle") : t("portal.v2.book.title") }}</h1>
    </div>

    <div v-if="flow.state.loadingServices" class="space-y-3" aria-busy="true">
      <Skeleton v-for="i in 3" :key="i" height="4.5rem" class="!rounded-[20px]" />
    </div>

    <!-- K14: the shop takes no online bookings. -->
    <section v-else-if="flow.state.disabled" class="portal-card p-6 text-center space-y-3" data-testid="book-disabled">
      <i class="pi pi-info-circle text-3xl opacity-50"></i>
      <p>{{ t("portal.book.disabled") }}</p>
      <a v-if="extras.callUrl()" :href="extras.callUrl()" class="p-button p-component"><i class="pi pi-phone mr-2"></i>{{ t("portal.v2.home.callUs") }}</a>
    </section>

    <section v-else-if="flow.state.error" class="portal-card p-6 text-center space-y-3" data-testid="book-error">
      <p>{{ t(`portal.actions.errors.${flow.state.error}`) }}</p>
      <a v-if="extras.callUrl()" :href="extras.callUrl()" class="p-button p-component"><i class="pi pi-phone mr-2"></i>{{ t("portal.v2.home.callUs") }}</a>
    </section>

    <template v-else>
      <p v-if="flow.state.moving" class="portal-caption" data-testid="moving-from">
        {{ t("portal.v2.book.movingFrom", { when: formatDate(flow.state.moving.start_time, locale, "weekdayTime") }) }}
      </p>

      <!-- Step 1: the treatment. -->
      <template v-if="flow.state.step === 1">
        <button v-if="shop.aiEnabled" type="button" class="portal-card w-full p-4 flex items-center gap-3 text-left portal-target" data-testid="ask-assistant" @click="assistant.open(t('portal.v2.book.askPrompt'))">
          <i class="pi pi-sparkles text-xl text-[var(--p-primary-color)]"></i>
          <span class="flex-1">
            <span class="block font-semibold">{{ t("portal.v2.book.askTitle") }}</span>
            <span class="portal-caption">{{ t("portal.v2.book.askText") }}</span>
          </span>
          <i class="pi pi-chevron-right opacity-40"></i>
        </button>
        <IconField v-if="flow.services.value.length > 6">
          <InputIcon class="pi pi-search" />
          <InputText v-model="search" :placeholder="t('portal.v2.book.search')" class="w-full" />
        </IconField>
        <div v-if="!flow.services.value.length" class="portal-caption text-center py-6">{{ t("portal.book.noServices") }}</div>
        <div v-for="group in groups" :key="group.label" class="space-y-2">
          <h2 v-if="groups.length > 1" class="portal-micro font-semibold uppercase tracking-wider px-1 pt-2">{{ group.label }}</h2>
          <button
            v-for="svc in group.items"
            :key="svc.id"
            type="button"
            class="portal-card w-full p-4 flex items-center gap-3 text-left portal-target"
            data-testid="service-option"
            @click="flow.chooseService(svc)"
          >
            <span class="w-1.5 self-stretch rounded-full" :style="{ background: svc.color_code || 'var(--p-primary-300)' }"></span>
            <span class="flex-1 min-w-0">
              <span class="block font-semibold">{{ svc.name }}</span>
              <span class="portal-caption">{{ formatDuration(svc.duration_minutes, t) }} · {{ formatMoney(svc.price) }}</span>
            </span>
            <i class="pi pi-chevron-right opacity-40"></i>
          </button>
        </div>
      </template>

      <!-- Step 2: therapist and time. -->
      <template v-else-if="flow.state.step === 2">
        <div class="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1" role="radiogroup" :aria-label="t('portal.book.stepStaff')" data-testid="staff-chips">
          <button
            v-for="choice in staffChoices"
            :key="choice.id"
            type="button"
            role="radio"
            :aria-checked="flow.state.staffChoice === choice.id"
            class="portal-target flex-shrink-0 px-4 rounded-full border text-sm font-medium"
            :class="flow.state.staffChoice === choice.id ? 'bg-[var(--p-primary-color)] text-white border-transparent' : 'border-[var(--portal-border)]'"
            @click="flow.setStaff(choice.id)"
          >
            {{ choice.name }}
          </button>
        </div>

        <div class="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1" data-testid="date-strip">
          <button
            v-for="d in flow.days.value"
            :key="d.date"
            type="button"
            class="flex-shrink-0 w-14 py-2 rounded-2xl flex flex-col items-center gap-1 border"
            :class="flow.state.date === d.date ? 'bg-[var(--p-primary-color)] text-white border-transparent' : 'border-[var(--portal-border)]'"
            :aria-pressed="flow.state.date === d.date"
            :aria-label="`${formatDate(d.date, locale, 'weekdayDayMonth')}: ${t('portal.v2.book.freeCount', { n: d.count }, d.count)}`"
            :data-date="d.date"
            @click="flow.setDate(d.date)"
          >
            <span class="text-[11px] uppercase opacity-80">{{ weekday(d.date) }}</span>
            <span class="text-lg font-semibold leading-none">{{ Number(d.date.slice(8)) }}</span>
            <span class="flex gap-0.5 h-1.5" :data-dots="dots(d.count)">
              <span v-for="i in dots(d.count)" :key="i" class="w-1.5 h-1.5 rounded-full" :class="flow.state.date === d.date ? 'bg-white' : 'bg-[var(--p-primary-color)]'"></span>
            </span>
          </button>
        </div>

        <div v-if="flow.state.loadingSlots" class="grid grid-cols-4 gap-2" aria-busy="true">
          <Skeleton v-for="i in 8" :key="i" height="2.75rem" />
        </div>
        <p v-else-if="!flow.slots.value.length" class="portal-caption text-center py-6" data-testid="no-slots">{{ t("portal.book.noSlots") }}</p>
        <div v-else class="space-y-4" data-testid="slots">
          <div v-for="part in dayParts" :key="part.key">
            <h3 class="portal-micro font-semibold uppercase tracking-wider mb-2">
              {{ t(`portal.v2.book.${part.key}`) }}
              <span v-if="part.slots.length <= 3" class="normal-case tracking-normal font-normal">· {{ t("portal.v2.book.left", { n: part.slots.length }, part.slots.length) }}</span>
            </h3>
            <div class="grid grid-cols-4 gap-2">
              <button
                v-for="s in part.slots"
                :key="s.start_time"
                type="button"
                class="portal-target rounded-xl border text-sm font-medium tabular-nums"
                :class="flow.state.slot?.start_time === s.start_time ? 'bg-[var(--p-primary-color)] text-white border-transparent' : 'border-[var(--portal-border)]'"
                :aria-pressed="flow.state.slot?.start_time === s.start_time"
                data-testid="slot"
                @click="flow.pickSlot(s)"
              >
                {{ clockTime(s.start_time) }}
              </button>
            </div>
          </div>
        </div>
        <button v-if="shop.aiEnabled" type="button" class="text-sm underline opacity-80" data-testid="ask-assistant-times" @click="assistant.open(t('portal.v2.book.askTimes', { service: flow.state.service?.name }))">
          {{ t("portal.v2.book.askLink") }}
        </button>
      </template>

      <!-- Step 3: confirm. -->
      <template v-else>
        <section class="portal-card p-4 space-y-2 text-sm" data-testid="book-summary">
          <div class="flex justify-between gap-3"><span class="opacity-70">{{ t("portal.book.summaryService") }}</span><span class="font-medium text-right">{{ flow.state.service?.name }}</span></div>
          <div class="flex justify-between gap-3"><span class="opacity-70">{{ t("portal.book.summaryStaff") }}</span><span class="font-medium text-right" data-testid="summary-staff">{{ flow.state.slot?.staff_name }}</span></div>
          <div class="flex justify-between gap-3"><span class="opacity-70">{{ t("portal.book.summaryWhen") }}</span><span class="font-medium text-right">{{ slotWhen }}</span></div>
          <div class="flex justify-between gap-3"><span class="opacity-70">{{ t("portal.book.summaryDuration") }}</span><span class="font-medium">{{ formatDuration(flow.state.service?.duration_minutes || 0, t) }}</span></div>
          <div class="flex justify-between gap-3"><span class="opacity-70">{{ t("portal.book.summaryPrice") }}</span><span class="font-medium">{{ formatMoney(flow.state.service?.price) }}</span></div>
        </section>
        <label v-if="!flow.state.moving" class="block space-y-1">
          <span class="portal-caption">{{ t("portal.book.notes") }}</span>
          <Textarea v-model="flow.state.notes" rows="3" autoResize class="w-full" maxlength="500" />
        </label>
        <Message v-if="shop.shop?.cancellation_note" severity="secondary" :closable="false" data-testid="cancellation-note">
          <span class="whitespace-pre-line">{{ shop.shop.cancellation_note }}</span>
        </Message>
      </template>
    </template>

    <!-- The summary bar (P5): what's chosen and the one next step. -->
    <div v-if="flow.state.service && !flow.state.disabled && !flow.state.error" class="fixed inset-x-0 z-30 px-4" :class="wide ? 'bottom-4' : 'bottom-[calc(64px+env(safe-area-inset-bottom))]'" data-testid="summary-bar">
      <div class="max-w-3xl mx-auto portal-card-raised p-3 flex items-center gap-3">
        <div class="flex-1 min-w-0 text-sm">
          <p class="font-semibold truncate">{{ flow.state.service.name }}</p>
          <p class="portal-caption truncate">{{ flow.state.slot ? slotWhen : t("portal.v2.book.pickTime") }} · {{ formatMoney(flow.state.service.price) }}</p>
        </div>
        <Button
          v-if="flow.state.step === 2"
          :label="t('portal.v2.book.continue')"
          :disabled="!flow.state.slot"
          data-testid="continue"
          @click="flow.state.step = 3"
        />
        <Button
          v-else-if="flow.state.step === 3"
          :label="flow.state.moving ? t('portal.v2.book.move') : t('portal.v2.book.book')"
          :loading="flow.state.submitting"
          data-testid="submit"
          @click="flow.submit"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import Button from "primevue/button";
import IconField from "primevue/iconfield";
import InputIcon from "primevue/inputicon";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Skeleton from "primevue/skeleton";
import Textarea from "primevue/textarea";
import { clockTime, formatDate, formatDuration, formatMoney } from "../../utils/format";
import { foldText } from "../../utils/text";
import { groupServicesByCategory } from "../../utils/serviceGroups";
import { useBookFlow, ANYONE, type Slot } from "../composables/useBookFlow";
import { useBookingExtras } from "../composables/useBookingExtras";
import { useMinWidth, PORTAL_DESKTOP_WIDTH } from "../composables/useMinWidth";
import { useAssistantStore } from "../stores/assistant";
import { usePortalShopStore } from "../stores/shop";

const { t, locale } = useI18n();
const flow = useBookFlow();
const extras = useBookingExtras();
const assistant = useAssistantStore();
const shop = usePortalShopStore();
const wide = useMinWidth(PORTAL_DESKTOP_WIDTH);
const search = ref("");

const groups = computed(() => {
  const q = foldText(search.value.trim());
  const list = q ? flow.services.value.filter((s) => foldText(s.name).includes(q)) : flow.services.value;
  return groupServicesByCategory(list, t("services.table.uncategorized"));
});
const staffChoices = computed(() => [{ id: ANYONE, name: t("portal.v2.home.anyone") }, ...flow.staff.value.map((m) => ({ id: m.id, name: m.name }))]);

// Dots under a day: none, a few (1–3 free times) or many.
const dots = (count: number) => (count === 0 ? 0 : count <= 3 ? 1 : count <= 10 ? 2 : 3);
const weekday = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(locale.value === "el" ? "el-GR" : "en-GB", { weekday: "short" });

const dayParts = computed(() => {
  const parts: { key: "morning" | "afternoon" | "evening"; slots: Slot[] }[] = [
    { key: "morning", slots: [] },
    { key: "afternoon", slots: [] },
    { key: "evening", slots: [] },
  ];
  for (const s of flow.slots.value) {
    const h = new Date(s.start_time).getHours();
    parts[h < 12 ? 0 : h < 17 ? 1 : 2].slots.push(s);
  }
  return parts.filter((p) => p.slots.length);
});
const slotWhen = computed(() => (flow.state.slot ? formatDate(flow.state.slot.start_time, locale.value, "weekdayTime") : ""));

onMounted(() => {
  shop.load();
  flow.init();
});
</script>
