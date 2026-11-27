<template>
  <!-- Book (REDESIGN_SPEC.md §5.2, client-portal-prototype.html) in three
       steps with a summary bar that stays in reach; also moving a booking
       (/portal/book/reschedule/:id). -->
  <div class="px-4 pt-2 pb-4 space-y-4" :class="{ 'pb-40': flow.state.service }" data-testid="book">
    <div class="flex gap-1.5 mt-1.5" aria-hidden="true">
      <div v-for="n in 3" :key="n" class="flex-1 h-1 rounded" :class="n <= flow.state.step ? 'bg-[var(--pp-primary)]' : 'bg-[var(--portal-border)]'"></div>
    </div>
    <div v-if="flow.state.moving" class="flex items-center gap-2 px-3.5 py-2.5 rounded-[14px] bg-[var(--pp-warn-bg)] text-[var(--pp-warn)] text-[13.5px]" data-testid="moving-from">
      <i class="pi pi-arrow-right-arrow-left"></i>{{ t("portal.v2.book.movingFrom", { when: formatDate(flow.state.moving.start_time, locale, "weekdayTime") }) }}
    </div>
    <div class="flex items-center gap-2">
      <button v-if="flow.state.step > 1 && !(flow.state.step === 2 && flow.state.moving)" type="button" class="w-10 h-10 -ml-2 rounded-xl grid place-items-center" :aria-label="t('portal.book.back')" @click="flow.back"><i class="pi pi-arrow-left"></i></button>
      <h1 class="pp-h1 !text-[26px]">{{ stepTitle }}</h1>
    </div>
    <p v-if="flow.state.step === 2 && flow.state.service" class="pp-sub !-mt-2">{{ flow.state.service.name }} · {{ flow.state.service.duration_minutes }}′</p>

    <div v-if="flow.state.loadingServices" class="space-y-3" aria-busy="true">
      <Skeleton v-for="i in 3" :key="i" height="4.5rem" class="!rounded-[20px]" />
    </div>

    <!-- K14: the shop takes no online bookings. -->
    <section v-else-if="flow.state.disabled" class="pp-card p-6 text-center space-y-3" data-testid="book-disabled">
      <i class="pi pi-info-circle text-3xl opacity-50"></i>
      <p>{{ t("portal.book.disabled") }}</p>
      <a v-if="extras.callUrl()" :href="extras.callUrl()" class="pp-btn pp-btn-primary"><i class="pi pi-phone"></i>{{ t("portal.v2.home.callUs") }}</a>
    </section>

    <section v-else-if="flow.state.error" class="pp-card p-6 text-center space-y-3" data-testid="book-error">
      <p>{{ t(`portal.actions.errors.${flow.state.error}`) }}</p>
      <a v-if="extras.callUrl()" :href="extras.callUrl()" class="pp-btn pp-btn-primary"><i class="pi pi-phone"></i>{{ t("portal.v2.home.callUs") }}</a>
    </section>

    <template v-else>
      <!-- Step 1: the treatment. -->
      <template v-if="flow.state.step === 1">
        <button v-if="shop.aiEnabled" type="button" class="pp-card w-full p-4 flex items-center gap-3.5 text-left" data-testid="ask-assistant" @click="assistant.open(t('portal.v2.book.askPrompt'))">
          <span class="pp-icon"><i class="pi pi-sparkles"></i></span>
          <span class="flex-1">
            <b class="block">{{ t("portal.v2.book.askTitle") }}</b>
            <span class="pp-small pp-muted">{{ t("portal.v2.book.askText") }}</span>
          </span>
          <i class="pi pi-angle-right pp-muted"></i>
        </button>
        <IconField v-if="flow.services.value.length > 6">
          <InputIcon class="pi pi-search" />
          <InputText v-model="search" :placeholder="t('portal.v2.book.search')" class="w-full !rounded-[14px]" />
        </IconField>
        <!-- The categories as chips, each one scrolling to its treatments. -->
        <div v-if="groups.length > 1" class="pp-hscroll -mx-4 px-4" data-testid="category-chips">
          <button v-for="(group, i) in groups" :key="group.label" type="button" class="pp-chip" :class="{ on: activeGroup === i }" @click="jumpTo(i)">
            <i class="pi" :class="iconFor(group.label)"></i>{{ group.label }}
          </button>
        </div>
        <div v-if="!flow.services.value.length" class="pp-sub text-center py-6">{{ t("portal.book.noServices") }}</div>
        <div v-for="(group, i) in groups" :key="group.label" :ref="(el) => setGroupEl(i, el)" class="space-y-2.5 scroll-mt-20">
          <h2 v-if="groups.length > 1" class="text-xs font-semibold uppercase tracking-[.08em] text-[var(--pp-faint)] pt-2">{{ group.label }}</h2>
          <button
            v-for="svc in group.items"
            :key="svc.id"
            type="button"
            class="pp-card w-full p-4 flex items-center gap-3.5 text-left"
            data-testid="service-option"
            @click="flow.chooseService(svc)"
          >
            <span class="pp-icon"><i class="pi" :class="iconFor(`${svc.category || ''} ${svc.name}`)"></i></span>
            <span class="flex-1 min-w-0">
              <b class="block leading-snug">{{ svc.name }}</b>
              <span class="pp-small pp-muted">{{ svc.duration_minutes }}′</span>
            </span>
            <b class="tabular-nums">{{ formatMoney(svc.price) }}</b>
          </button>
        </div>
      </template>

      <!-- Step 2: therapist and time. -->
      <template v-else-if="flow.state.step === 2">
        <div class="pp-hscroll -mx-4 px-4" role="radiogroup" :aria-label="t('portal.book.stepStaff')" data-testid="staff-chips">
          <button
            v-for="choice in staffChoices"
            :key="choice.id"
            type="button"
            role="radio"
            :aria-checked="flow.state.staffChoice === choice.id"
            class="pp-chip"
            :class="{ on: flow.state.staffChoice === choice.id }"
            @click="flow.setStaff(choice.id)"
          >
            <i v-if="choice.id === ANYONE" class="pi pi-users"></i>{{ choice.name }}
          </button>
        </div>

        <div class="pp-hscroll -mx-4 px-4" data-testid="date-strip">
          <button
            v-for="d in flow.days.value"
            :key="d.date"
            type="button"
            class="w-[58px] pt-2.5 pb-2 rounded-2xl flex flex-col items-center gap-0.5 border"
            :class="[flow.state.date === d.date ? 'bg-[var(--pp-primary)] text-[var(--pp-on-primary)] border-[var(--pp-primary)]' : 'bg-[var(--portal-card)] border-[var(--portal-border)]', { 'opacity-40': d.count === 0 && flow.state.date !== d.date }]"
            :aria-pressed="flow.state.date === d.date"
            :aria-label="`${formatDate(d.date, locale, 'weekdayDayMonth')}: ${t('portal.v2.book.freeCount', { n: d.count }, d.count)}`"
            :data-date="d.date"
            @click="flow.setDate(d.date)"
          >
            <span class="text-[11px] uppercase" :class="flow.state.date === d.date ? 'opacity-85' : 'pp-muted'">{{ weekday(d.date) }}</span>
            <b class="text-lg leading-tight">{{ Number(d.date.slice(8)) }}</b>
            <span class="flex gap-0.5 h-1.5 mt-0.5" :data-dots="dots(d.count)">
              <i v-for="i in dots(d.count)" :key="i" class="w-[5px] h-[5px] rounded-full bg-current opacity-50"></i>
            </span>
          </button>
        </div>

        <div v-if="flow.state.loadingSlots" class="grid grid-cols-4 gap-2" aria-busy="true">
          <Skeleton v-for="i in 8" :key="i" height="2.75rem" />
        </div>
        <p v-else-if="!flow.slots.value.length" class="pp-sub text-center py-6" data-testid="no-slots">{{ t("portal.book.noSlots") }}</p>
        <div v-else class="space-y-4" data-testid="slots">
          <div v-for="part in dayParts" :key="part.key">
            <h3 class="text-xs font-semibold uppercase tracking-[.08em] text-[var(--pp-faint)] mb-2">
              {{ t(`portal.v2.book.${part.key}`) }}
              <span v-if="part.slots.length <= 3" class="normal-case tracking-normal font-normal">· {{ t("portal.v2.book.left", { n: part.slots.length }, part.slots.length) }}</span>
            </h3>
            <div class="grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-2">
              <button
                v-for="s in part.slots"
                :key="s.start_time"
                type="button"
                class="py-3 rounded-xl border font-semibold tabular-nums"
                :class="flow.state.slot?.start_time === s.start_time ? 'bg-[var(--pp-primary)] text-[var(--pp-on-primary)] border-[var(--pp-primary)]' : 'bg-[var(--portal-card)] border-[var(--portal-border)]'"
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
        <section class="pp-card p-[18px] space-y-3.5" data-testid="book-summary">
          <div class="flex items-center gap-3">
            <span class="pp-icon"><i class="pi" :class="iconFor(`${flow.state.service?.category || ''} ${flow.state.service?.name || ''}`)"></i></span>
            <div class="flex-1 min-w-0">
              <b class="block">{{ flow.state.service?.name }}</b>
              <span class="pp-small pp-muted">{{ formatDuration(flow.state.service?.duration_minutes || 0, t) }} · <span data-testid="summary-staff">{{ flow.state.slot?.staff_name }}</span></span>
            </div>
            <b class="tabular-nums">{{ formatMoney(flow.state.service?.price) }}</b>
          </div>
          <div class="grid grid-cols-[26px_1fr] gap-x-2 gap-y-2.5 text-[14.5px]">
            <i class="pi pi-calendar text-[var(--pp-primary)] mt-0.5"></i><span>{{ slotWhen }}</span>
            <template v-if="shop.shop?.address"><i class="pi pi-map-marker text-[var(--pp-primary)] mt-0.5"></i><span>{{ shop.name }}, {{ shop.shop.address }}</span></template>
          </div>
          <Textarea v-if="!flow.state.moving" v-model="flow.state.notes" rows="2" autoResize class="w-full !rounded-xl" maxlength="500" :placeholder="t('portal.book.notes')" :aria-label="t('portal.book.notes')" />
          <p v-if="shop.shop?.cancellation_note" class="pp-small pp-muted whitespace-pre-line" data-testid="cancellation-note"><i class="pi pi-info-circle mr-1"></i>{{ shop.shop.cancellation_note }}</p>
        </section>
      </template>
    </template>

    <!-- The summary bar (P5): what's chosen and the one next step. -->
    <div v-if="flow.state.service && !flow.state.disabled && !flow.state.error" class="fixed inset-x-0 z-30 px-3" :class="wide ? 'bottom-4' : 'bottom-[calc(76px+env(safe-area-inset-bottom))]'" data-testid="summary-bar">
      <div class="max-w-3xl mx-auto rounded-[20px] bg-[var(--portal-card)] border border-[var(--portal-border)] shadow-[var(--portal-shadow-3)] py-3 pr-3 pl-4 flex items-center gap-3">
        <div class="flex-1 min-w-0">
          <b class="block text-sm truncate">{{ flow.state.service.name }}</b>
          <p class="pp-small pp-muted truncate">{{ flow.state.slot ? slotWhen : t("portal.v2.book.pickTime") }} · {{ formatMoney(flow.state.service.price) }}</p>
        </div>
        <button v-if="flow.state.step === 2" type="button" class="pp-btn pp-btn-primary" :disabled="!flow.state.slot" data-testid="continue" @click="flow.state.step = 3">{{ t("portal.v2.book.continue") }}</button>
        <button v-else-if="flow.state.step === 3" type="button" class="pp-btn pp-btn-primary" :disabled="flow.state.submitting" data-testid="submit" @click="flow.submit">
          <i class="pi" :class="flow.state.submitting ? 'pi-spin pi-spinner' : 'pi-check'"></i>{{ flow.state.moving ? t("portal.v2.book.move") : t("portal.v2.book.book") }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import IconField from "primevue/iconfield";
import InputIcon from "primevue/inputicon";
import InputText from "primevue/inputtext";
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
const stepTitle = computed(() => [t("portal.v2.book.chooseService"), t("portal.v2.book.chooseTime"), t("portal.v2.book.confirmTitle")][flow.state.step - 1]);

// An icon for a treatment from its category and name, as on the prototype.
const ICONS: [RegExp, string][] = [
  [/σάουνα|sauna|χαμάμ|hammam/i, "pi-sun"],
  [/laser|αποτρίχωση/i, "pi-bolt"],
  [/πρόσωπ|face|facial|glow|lash|brow|βλεφαρ|φρυδ/i, "pi-sparkles"],
  [/μασάζ|massage|holistic|stones|therapy|θεραπεία/i, "pi-heart"],
];
const iconFor = (text: string) => ICONS.find(([re]) => re.test(text))?.[1] || "pi-star";

// Category chips: pressing one scrolls to its treatments.
const groupEls: HTMLElement[] = [];
const setGroupEl = (i: number, el: unknown) => {
  if (el instanceof HTMLElement) groupEls[i] = el;
};
const activeGroup = ref(0);
const jumpTo = (i: number) => {
  activeGroup.value = i;
  groupEls[i]?.scrollIntoView?.({ behavior: "smooth", block: "start" });
};
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
