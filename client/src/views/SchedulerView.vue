<template>
  <div class="flex flex-col h-[calc(100vh-48px)] bg-white" @click="closeMenus">
    <SchedulerToolbar />

    <SchedulerDayStrip />

    <div class="flex-grow flex min-h-0">
      <SchedulerDockedCalendar />

      <!-- ===== CALENDAR AREA ===== -->
      <div class="flex-1 min-w-0 overflow-auto relative">
        <!-- Loading overlay -->
        <transition name="fade">
          <div
            v-if="isFetching"
            class="absolute inset-0 z-10 bg-white/60 backdrop-blur-[1px] flex items-center justify-center pointer-events-none"
          >
            <div
              class="flex items-center gap-2 bg-white rounded-full px-4 py-2 shadow-md border border-gray-100"
            >
              <i
                class="pi pi-spin pi-spinner text-[var(--p-primary-color)]"
              ></i>
              <span class="text-xs font-medium text-gray-500">{{
                t("common.loading")
              }}</span>
            </div>
          </div>
        </transition>

        <FullCalendar
          v-if="calendarResources.length > 0"
          ref="fullCalendar"
          :options="calendarOptions"
          :style="{ '--slot-row-height': `${slotRowHeight}px` }"
          class="h-full w-full"
        />

        <!-- Empty state -->
        <div
          v-else
          class="h-full flex flex-col items-center justify-center bg-gray-50/50"
        >
          <div
            class="p-10 bg-white rounded-2xl shadow-sm text-center border border-gray-100 max-w-sm"
          >
            <div
              class="w-16 h-16 bg-[var(--p-primary-50)] text-[var(--p-primary-600)] rounded-full flex items-center justify-center mx-auto mb-4"
            >
              <i class="pi pi-users text-2xl"></i>
            </div>
            <h3 class="text-lg font-bold text-gray-900 mb-2">
              {{ t("scheduler.noStaff.title") }}
            </h3>
            <p class="text-sm text-gray-500 mb-6">
              {{ t("scheduler.noStaff.text") }}
            </p>
            <a
              v-if="!isStaffRole"
              href="/app/staff"
              class="inline-flex items-center gap-2 bg-[var(--p-primary-color)] text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:brightness-105 transition-all"
            >
              <i class="pi pi-plus text-xs"></i>
              {{ t("scheduler.noStaff.addStaff") }}
            </a>
          </div>
        </div>
      </div>
    </div>

    <!-- The calendar's own questions (moving or resizing a card, the waiting
         list, the quick profile). The booking dialog asks in its own box. -->
    <ConfirmDialog />

    <BookingDialog
      v-model:visible="dialogVisible"
      :appointment="selectedAppointment"
      :services="calendarStore.services"
      :staff="calendarStore.resources"
      :allProducts="calendarStore.products"
      :timeOff="calendarStore.timeOff"
      :workingHours="calendarStore.workingHours"
      :shopMinTime="shopSlotMinTime"
      :shopMaxTime="shopSlotMaxTime"
      @save="onBookingSaved"
      @refresh="handleRefresh"
      @open-appointment="selectedAppointment = $event"
      @freed="refreshWaitlist"
    />
    <WaitlistPanel v-if="showWaitlist" @book="openFromWaitlist" />
    <AppointmentSwapDialog
      v-model:visible="swapDialogVisible"
      :appointments="calendarStore.events"
      :staff="calendarStore.resources"
      @swap="handleSwap"
    />

    <AppointmentHoverCard
      v-if="hoveredAppointment && hoverAnchorRect"
      :appointment="hoveredAppointment"
      :anchor-rect="hoverAnchorRect"
    />

    <ClientSearchDialog
      v-model:visible="clientSearchVisible"
      @select="onClientSelected"
    />
    <ClientQuickProfileDialog
      v-model:visible="quickProfileVisible"
      :clientId="quickProfileClientId"
      @book="onBookForClient"
      @openFull="onOpenFullProfile"
      @changed="handleSave"
      :reloadKey="quickProfileReloadKey"
      @openAppointment="openFromQuickProfile"
    />
    <ClientProfileDialog
      v-model:visible="fullProfileVisible"
      :clientId="quickProfileClientId"
      :initialTab="fullProfileTab"
      @refresh="handleRefresh"
    />
  </div>

  <StaffReorderDialog
    v-model:visible="reorderDialogVisible"
    :staff-list="calendarStore.resources"
    @save="handleReorderSave"
  />
</template>

<script setup lang="ts">
// The calendar: staff columns with their bookings, time off and working
// hours, on a day, a week or a month. Its parts live in scheduler/ (state,
// phone layout, docked calendar, what the grid shows, the hover card, zoom,
// moving bookings, live reload and FullCalendar's options); this file puts
// them together and draws the page.
import BookingDialog from "../components/BookingDialog.vue";
import AppointmentSwapDialog from "../components/AppointmentSwapDialog.vue";
import ClientSearchDialog from "../components/ClientSearchDialog.vue";
import ClientQuickProfileDialog from "../components/ClientQuickProfileDialog.vue";
import ClientProfileDialog from "../components/ClientProfileDialog.vue";
import StaffReorderDialog from "../components/StaffReorderDialog.vue";
import AppointmentHoverCard from "../components/AppointmentHoverCard.vue";
import FullCalendar from "@fullcalendar/vue3";
import "./scheduler/scheduler.css";
import { provide } from "vue";
import SchedulerToolbar from "./scheduler/SchedulerToolbar.vue";
import SchedulerDayStrip from "./scheduler/SchedulerDayStrip.vue";
import SchedulerDockedCalendar from "./scheduler/SchedulerDockedCalendar.vue";
import { SchedulerKey } from "./scheduler/context";
import { onMounted, onUnmounted, watch } from "vue";
import WaitlistPanel from "../components/waitlist/WaitlistPanel.vue";
import { useWaitlist } from "../composables/useWaitlist";
import { useSchedulerCore } from "./scheduler/useSchedulerCore";
import { useSchedulerPhone } from "./scheduler/useSchedulerPhone";
import { useDockedCalendar } from "./scheduler/useDockedCalendar";
import { useCalendarData } from "./scheduler/useCalendarData";
import { useHoverCard } from "./scheduler/useHoverCard";
import { useSchedulerZoom } from "./scheduler/useSchedulerZoom";
import { useCalendarMoves } from "./scheduler/useCalendarMoves";
import { useLiveReload } from "./scheduler/useLiveReload";
import { useCalendarOptions } from "./scheduler/useCalendarOptions";

// Each part gets what the parts before it made.
const core = useSchedulerCore();
const phone = useSchedulerPhone({ ...core });
const docked = useDockedCalendar({ ...core, ...phone });
const data = useCalendarData({ ...core, ...phone, ...docked });
const hover = useHoverCard({ ...core, ...phone, ...docked, ...data });
const zoom = useSchedulerZoom({ ...core, ...phone, ...docked, ...data, ...hover });
const moves = useCalendarMoves({ ...core, ...phone, ...docked, ...data, ...hover, ...zoom });
const live = useLiveReload({ ...core, ...phone, ...docked, ...data, ...hover, ...zoom, ...moves });
const options = useCalendarOptions({ ...core, ...phone, ...docked, ...data, ...hover, ...zoom, ...moves, ...live });
provide(SchedulerKey, { ...core, ...phone, ...docked, ...data, ...hover, ...zoom, ...moves, ...live, ...options });

const {
  reorderDialogVisible, calendarStore, isStaffRole, showWaitlist, dialogVisible, clientSearchVisible, quickProfileVisible, quickProfileClientId, fullProfileVisible,
  fullProfileTab, swapDialogVisible, selectedAppointment, fullCalendar, isFetching, shopSlotMinTime, shopSlotMaxTime, handleSwap,
  handleReorderSave, handleSave, handleRefresh, onClientSelected, onBookForClient, quickProfileReloadKey, openFromQuickProfile, onOpenFullProfile,
  t, calendarResources, hoveredAppointment, hoverAnchorRect, slotRowHeight, closeMenus, calendarOptions,
} = { ...core, ...phone, ...docked, ...data, ...hover, ...zoom, ...moves, ...live, ...options };

// The waitlist (front desk and admins) and the times cancellations freed for
// it: loaded with the calendar, and again after a booking here (one booked
// from it leaves it; a cancelled one frees its time) or a change on another
// screen (bookings or the waitlist; see server.js), a burst of them at once.
const waitlist = useWaitlist();
let waitlistTimer: ReturnType<typeof setTimeout> | null = null;
const refreshWaitlist = () => {
  if (!showWaitlist.value) return;
  if (waitlistTimer) clearTimeout(waitlistTimer);
  waitlistTimer = setTimeout(() => {
    waitlistTimer = null;
    waitlist.refresh();
  }, 300);
};
// Ctrl+1 on: the panel closes; off again: the waitlist is loaded afresh.
watch(showWaitlist, (shown) => {
  if (shown) return waitlist.refresh();
  waitlist.panelVisible.value = false;
  waitlist.freedSlot.value = null;
});
onMounted(() => {
  if (isStaffRole.value) return;
  if (showWaitlist.value) waitlist.refresh();
  window.addEventListener("appointments-changed", refreshWaitlist);
  window.addEventListener("waitlist-changed", refreshWaitlist);
});
onUnmounted(() => {
  window.removeEventListener("appointments-changed", refreshWaitlist);
  window.removeEventListener("waitlist-changed", refreshWaitlist);
  if (waitlistTimer) clearTimeout(waitlistTimer);
});
const onBookingSaved = () => {
  handleSave();
  refreshWaitlist();
};
// A waitlist entry to book: the booking dialog opens filled in with it.
const openFromWaitlist = (seed: Record<string, any>) => {
  selectedAppointment.value = seed;
  dialogVisible.value = true;
};
</script>

