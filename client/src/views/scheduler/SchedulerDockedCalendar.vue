<template>
    <!-- ===== DOCKED DATE CALENDAR (pinned from the date popup) ===== -->
    <aside
      v-if="calendarDocked"
      class="docked-date-picker flex-shrink-0 bg-white overflow-y-auto overflow-x-hidden"
      :style="{ width: `${dockedWidth}px` }"
      data-testid="docked-calendar"
    >
      <div class="flex justify-end px-2 pt-2">
        <button
          @click="dockCalendar(false)"
          class="w-7 h-7 rounded-md flex items-center justify-center text-[var(--p-primary-600)] bg-[var(--p-primary-50)] hover:bg-[var(--p-primary-100)]"
          v-tooltip.bottom="t('scheduler.undockCalendar')"
          :aria-label="t('scheduler.undockCalendar')"
          data-testid="undock-calendar"
        >
          <i class="pi pi-thumbtack text-sm rotate-45"></i>
        </button>
      </div>
      <DatePicker
        inline
        v-model="dockedDate"
        dateFormat="dd/mm/yy"
        :minDate="isStaffRole ? todayDate : undefined"
        @date-select="onDatePicked"
      />
    </aside>
    <!-- Drag to resize the docked calendar -->
    <div
      v-if="calendarDocked"
      class="dock-resizer"
      :class="{ 'is-dragging': resizingDock }"
      role="separator"
      aria-orientation="vertical"
      tabindex="0"
      :aria-label="t('scheduler.resizeCalendar')"
      :aria-valuenow="dockedWidth"
      :aria-valuemin="DOCKED_MIN_WIDTH"
      :title="t('scheduler.resizeCalendar')"
      data-testid="docked-resizer"
      @pointerdown="startDockResize"
      @pointermove="moveDockResize"
      @pointerup="endDockResize"
      @pointercancel="endDockResize"
      @dblclick="setDockedWidth(DOCKED_DEFAULT_WIDTH, true)"
      @keydown.left.prevent="setDockedWidth(dockedWidth - 16, true)"
      @keydown.right.prevent="setDockedWidth(dockedWidth + 16, true)"
    ></div>
</template>

<script setup lang="ts">
// The month calendar pinned beside the grid, and the handle that resizes it.
import { useScheduler } from "./context";

const {
  isStaffRole, todayDate, t, calendarDocked, DOCKED_DEFAULT_WIDTH, DOCKED_MIN_WIDTH, dockedWidth, resizingDock,
  dockedDate, dockCalendar, setDockedWidth, startDockResize, moveDockResize, endDockResize, onDatePicked,
} = useScheduler();
</script>
