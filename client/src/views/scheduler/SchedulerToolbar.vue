<template>
  <!-- ===== TOOLBAR ===== -->
  <div
    class="relative flex flex-wrap items-center justify-between gap-3 px-4 md:px-6 border-b border-gray-100 bg-white flex-shrink-0"
    :class="isPhone ? 'py-2' : 'py-3'"
  >
    <!-- PHONE: month title, search, menu -->
    <div
      v-if="isPhone"
      class="flex items-center justify-between w-full gap-2"
    >
      <div class="relative">
        <button
          @click.stop="toggleDatePicker"
          class="flex items-center gap-1.5 text-lg font-bold text-gray-900 select-none"
        >
          {{ mobileMonthTitle }}
          <i
            v-if="!calendarDocked"
            class="pi pi-chevron-down text-xs text-gray-400"
          ></i>
        </button>
        <div
          v-if="showDatePicker"
          @click.stop
          class="absolute top-full left-0 mt-2 z-50 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden"
        >
          <div class="flex justify-end px-2 pt-2">
            <button
              @click="dockCalendar(true)"
              class="w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:text-[var(--p-primary-600)] hover:bg-[var(--p-primary-50)]"
              v-tooltip.bottom="t('scheduler.dockCalendar')"
              :aria-label="t('scheduler.dockCalendar')"
              data-testid="dock-calendar"
            >
              <i class="pi pi-thumbtack text-sm"></i>
            </button>
          </div>
          <DatePicker
            inline
            v-model="pickerDate"
            dateFormat="dd/mm/yy"
            :minDate="isStaffRole ? todayDate : undefined"
            @date-select="onDatePicked"
          />
        </div>
      </div>
      <div class="flex items-center gap-1">
        <button
          @click="calendarApi?.today()"
          class="px-2.5 py-1.5 text-xs font-bold text-[var(--p-primary-700)] bg-[var(--p-primary-50)] rounded-lg"
        >
          {{ t("scheduler.mobile.today") }}
        </button>
        <button
          v-if="!isStaffRole"
          @click="clientSearchVisible = true"
          class="w-10 h-10 flex items-center justify-center rounded-lg text-[var(--p-primary-600)]"
          :aria-label="t('clientSearch.button')"
        >
          <i class="pi pi-search text-lg"></i>
        </button>
        <button
          @click.stop="
            mobileMenuOpen = !mobileMenuOpen;
            showDatePicker = false;
          "
          class="w-10 h-10 flex items-center justify-center rounded-lg text-gray-600"
          :class="mobileMenuOpen ? 'bg-gray-100' : ''"
          :aria-label="t('scheduler.mobile.menu')"
        >
          <i class="pi pi-ellipsis-v text-lg"></i>
        </button>
      </div>
    </div>

    <!-- LEFT: Navigation -->
    <div v-if="!isPhone" class="flex items-center gap-2">
      <button
        @click="canGoPrev && calendarApi?.prev()"
        :disabled="!canGoPrev"
        class="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
        :title="t('scheduler.nav.previous')"
      >
        <i class="pi pi-chevron-left text-sm"></i>
      </button>
      <button
        @click="calendarApi?.today()"
        class="px-3 py-1.5 text-xs font-bold text-[var(--p-primary-700)] bg-[var(--p-primary-50)] hover:bg-[var(--p-primary-100)] rounded-lg transition-colors"
      >
        {{ t("scheduler.nav.today") }}
      </button>
      <button
        @click="calendarApi?.next()"
        class="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
        :title="t('scheduler.nav.next')"
      >
        <i class="pi pi-chevron-right text-sm"></i>
      </button>
      <div class="relative">
        <button
          @click.stop="toggleDatePicker"
          class="flex items-center gap-1 text-sm md:text-base font-bold text-gray-800 min-w-[120px] md:min-w-[180px] select-none hover:text-[var(--p-primary-700)] transition-colors"
        >
          {{ currentTitle }}
          <i
            v-if="!calendarDocked"
            class="pi pi-chevron-down text-[10px] text-gray-400"
          ></i>
        </button>
        <div
          v-if="showDatePicker"
          @click.stop
          class="absolute top-full left-0 mt-2 z-50 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden"
        >
          <div class="flex justify-end px-2 pt-2">
            <button
              @click="dockCalendar(true)"
              class="w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:text-[var(--p-primary-600)] hover:bg-[var(--p-primary-50)]"
              v-tooltip.bottom="t('scheduler.dockCalendar')"
              :aria-label="t('scheduler.dockCalendar')"
              data-testid="dock-calendar"
            >
              <i class="pi pi-thumbtack text-sm"></i>
            </button>
          </div>
          <DatePicker
            inline
            v-model="pickerDate"
            dateFormat="dd/mm/yy"
            :minDate="isStaffRole ? todayDate : undefined"
            @date-select="onDatePicked"
          />
        </div>
      </div>
    </div>

    <!-- RIGHT: Controls (on phones: the ⋮ menu panel) -->
    <div
      v-show="!isPhone || mobileMenuOpen"
      @click.stop
      class="flex items-center gap-2 flex-wrap"
      :class="
        isPhone
          ? 'absolute right-2 top-full mt-1 z-50 w-[min(20rem,calc(100vw-1rem))] bg-white rounded-xl shadow-lg border border-gray-100 p-3 flex-col !items-stretch'
          : ''
      "
    >
      <!-- Status Filter -->
      <div class="flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5">
        <button
          v-for="opt in statusFilterOptions"
          :key="opt.value"
          @click="statusFilter = opt.value"
          :class="
            statusFilter === opt.value
              ? 'bg-white shadow-sm text-gray-900 font-semibold'
              : 'text-gray-500 hover:text-gray-700'
          "
          class="px-2.5 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap"
        >
          <i v-if="opt.icon" :class="opt.icon + ' mr-1 text-[10px]'"></i>
          {{ opt.label }}
        </button>
      </div>

      <!-- View Toggle -->
      <div class="flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5">
        <button
          v-for="view in viewOptions"
          :key="view.value"
          @click="changeView(view.value)"
          :class="
            currentView === view.value
              ? 'bg-white shadow-sm text-gray-900 font-semibold'
              : 'text-gray-500 hover:text-gray-700'
          "
          class="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
        >
          {{ view.label }}
        </button>
      </div>

      <!-- Phone: staff who are off or on leave are hidden unless asked for -->
      <label
        v-if="isPhone && currentView !== 'dayGridMonth'"
        class="flex items-center justify-between gap-3 text-xs font-medium text-gray-600"
      >
        {{ t("scheduler.showAllStaff") }}
        <ToggleSwitch
          :modelValue="showAllStaff"
          data-testid="show-all-staff"
          @update:modelValue="setShowAllStaff"
        />
      </label>

      <!-- Zoom -->
      <div
        class="items-center bg-gray-100 rounded-lg p-0.5"
        :class="isPhone ? 'flex self-start' : 'hidden sm:flex'"
      >
        <button
          @click="zoomOut"
          class="p-1.5 rounded-md text-gray-500 hover:bg-white hover:shadow-sm hover:text-gray-800 transition-all"
          :title="t('scheduler.nav.zoomOut')"
        >
          <i class="pi pi-minus text-xs"></i>
        </button>
        <span class="text-xs font-medium text-gray-400 px-1.5">{{
          t("scheduler.zoom")
        }}</span>
        <button
          @click="zoomIn"
          class="p-1.5 rounded-md text-gray-500 hover:bg-white hover:shadow-sm hover:text-gray-800 transition-all"
          :title="t('scheduler.nav.zoomIn')"
        >
          <i class="pi pi-plus text-xs"></i>
        </button>
      </div>

      <ColorModelToggle v-if="settings.isStaff" />

      <!-- Client search -->
      <button
        v-if="!isPhone && !isStaffRole"
        @click="clientSearchVisible = true"
        class="flex items-center gap-1.5 bg-[var(--p-primary-color)] hover:brightness-105 text-white px-3 md:px-4 py-2 rounded-lg text-xs font-bold shadow-sm active:scale-95 transition-all flex-shrink-0"
      >
        <i class="pi pi-search text-xs"></i>
        <span class="hidden sm:inline">{{ t("clientSearch.button") }}</span>
      </button>

      <!-- Secondary: Swap + Reorder -->
      <div class="flex items-center gap-1">
        <!-- Computer: staff who are off or on leave are hidden unless asked for (the phone's is a switch above). -->
        <button
          v-if="!isPhone && currentView !== 'dayGridMonth'"
          @click="setShowAllStaff(!showAllStaff)"
          class="p-2 rounded-lg border transition-colors flex-shrink-0"
          :class="showAllStaff ? 'border-[var(--p-primary-color)] bg-[var(--p-primary-50)] text-[var(--p-primary-700)]' : 'border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-800'"
          :title="t('scheduler.showAllStaff')"
          :aria-pressed="showAllStaff"
          data-testid="show-all-staff-button"
        >
          <i class="pi pi-users text-sm"></i>
        </button>
        <!-- The waitlist (front desk and admins; hidden by Ctrl+1); its number: the waiting clients who can be booked now. -->
        <button
          v-if="showWaitlist"
          @click="waitlistPanel = true"
          class="relative p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors flex-shrink-0"
          :title="waitlistCount ? `${t('waitlist.title')}: ${t('waitlist.countTitle', { n: waitlistCount })}` : t('waitlist.title')"
          data-testid="waitlist-button"
        >
          <i class="pi pi-list text-sm"></i>
          <span
            v-if="waitlistCount"
            class="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--p-primary-color)] text-white text-[10px] font-bold flex items-center justify-center"
            data-testid="waitlist-count"
            >{{ waitlistCount }}</span
          >
        </button>
        <button
          v-if="!isStaffRole"
          @click="openSwapDialog"
          class="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors flex-shrink-0"
          :title="t('scheduler.nav.swap')"
        >
          <i class="pi pi-arrow-right-arrow-left text-sm"></i>
        </button>
        <button
          @click="reorderDialogVisible = true"
          class="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors flex-shrink-0"
          :title="t('scheduler.nav.reorderStaff')"
        >
          <i class="pi pi-sort-alt text-sm"></i>
        </button>
        <button
          @click="toggleFitStaff"
          :class="
            fitStaff
              ? 'bg-[var(--p-primary-50)] border-[var(--p-primary-200)] text-[var(--p-primary-600)]'
              : 'border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-800'
          "
          class="p-2 rounded-lg border transition-colors flex-shrink-0"
          :title="fitStaff ? 'Scroll mode' : 'Fit all staff in view'"
        >
          <i
            :class="fitStaff ? 'pi pi-arrows-h' : 'pi pi-expand'"
            class="text-sm"
          ></i>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// The calendar's toolbar: dates and navigation, the status filter, the view, zoom, client search, swap and staff order (on phones, a compact bar and a menu).
import ColorModelToggle from "../../components/ColorModelToggle.vue";
import { useScheduler } from "./context";
import { useWaitlist } from "../../composables/useWaitlist";

const {
  reorderDialogVisible, settings, isStaffRole, showWaitlist, clientSearchVisible, currentTitle, currentView, todayDate, canGoPrev,
  fitStaff, toggleFitStaff, statusFilter, statusFilterOptions, viewOptions, calendarApi, openSwapDialog, t,
  isPhone, mobileMenuOpen, mobileMonthTitle, showDatePicker, pickerDate, calendarDocked, dockCalendar, toggleDatePicker,
  onDatePicked, showAllStaff, setShowAllStaff, zoomIn, zoomOut, changeView,
} = useScheduler();
// The waitlist panel and its count (see composables/useWaitlist.ts).
const { panelVisible: waitlistPanel, count: waitlistCount } = useWaitlist();
</script>
