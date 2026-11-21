<template>
  <div v-if="currentTab === 'Booking'" class="space-y-6">
    <!-- Client selector -->
    <div class="space-y-2">
      <label
        class="text-xs font-bold text-gray-500 uppercase tracking-wider"
        >{{ t("booking.clientLabel") }}</label
      >

      <ClientSelector
        v-if="!form.client_id"
        @select="onClientPicked"
      />

      <div v-else class="flex gap-2">
        <div
          class="flex-grow flex justify-between items-center p-3 border border-gray-200 rounded-xl bg-gray-50 hover:bg-red-50 hover:border-red-200 transition-colors cursor-pointer group"
          data-testid="booking-client-clear"
          @click="clearSelectedClient"
        >
          <div class="flex items-center gap-3">
            <div
              class="w-8 h-8 rounded-full bg-[var(--p-primary-100)] text-[var(--p-primary-600)] font-bold flex items-center justify-center text-sm"
            >
              {{ selectedClient?.first_name?.[0] || "?"
              }}{{ selectedClient?.last_name?.[0] || "?" }}
            </div>
            <div>
              <div class="font-bold text-gray-900 text-sm">
                {{ selectedClient?.full_name }}
              </div>
              <div class="text-xs text-gray-500">
                {{ selectedClient?.phone }}
              </div>
            </div>
          </div>
          <div
            class="w-6 h-6 rounded-full bg-gray-200 group-hover:bg-red-100 flex items-center justify-center transition-colors"
          >
            <i
              class="pi pi-times text-xs text-gray-400 group-hover:text-red-500"
            ></i>
          </div>
        </div>
        <!-- No profile for the walk-in client: it stands for "no
             specific client" and its details can't be edited. Nor
             for a client added offline, until it syncs. -->
        <Button
          v-if="!isWalkInSelected && !isTempId(String(form.client_id))"
          icon="pi pi-eye"
          class="p-button-outlined p-button-secondary w-12"
          style="
            color: var(--p-primary-color);
            border-color: var(--p-primary-color);
          "
          v-tooltip.top="t('booking.viewProfile')"
          @click="openClientProfile"
        />
      </div>
    </div>

    <div
      v-if="groupedWithTime"
      class="mb-3 flex items-center gap-2 rounded-lg bg-[var(--p-primary-50)] border border-[var(--p-primary-200)] px-3 py-2 text-sm text-[var(--p-primary-800)]"
    >
      <i class="pi pi-link text-xs"></i>
      {{ t("booking.groupedWithExisting", { time: groupedWithTime }) }}
    </div>

    <!-- Services -->
    <BookingServices
      :isHidden="isHiddenRow"
      :hiddenPart="hiddenPart"
      v-model="servicesList"
      :services="props.services"
      :staff="props.staff"
      :baseStartTime="new Date(form.start_time)"
      :default-staff-id="currentStaffId"
      :timeOff="props.timeOff || []"
      :workingHours="props.workingHours || []"
      :requireStaff="true"
      :shopMinTime="props.shopMinTime"
      :shopMaxTime="props.shopMaxTime"
    />

    <!-- Status + Block time -->
    <div
      class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-gray-100"
    >
      <div>
        <label
          class="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2"
          >{{ t("booking.statusLabel") }}</label
        >
        <Dropdown
          v-model="form.status"
          :options="statusOptions"
          optionLabel="label"
          optionValue="value"
          class="w-full"
        >
          <template #option="slotProps">
            <div class="flex items-center gap-2">
              <div
                class="w-3 h-3 rounded-full"
                :class="statusDot(slotProps.option.value)"
              ></div>
              {{ slotProps.option.label }}
            </div>
          </template>
        </Dropdown>
      </div>

      <div class="flex flex-col justify-end pb-2">
        <Button
          type="button"
          :label="t('booking.blockTime')"
          icon="pi pi-ban"
          :class="form.is_block ? '' : 'p-button-outlined'"
          :severity="form.is_block ? 'warning' : 'secondary'"
          v-tooltip.top="t('booking.blockTimeNote')"
          @click="form.is_block = !form.is_block"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// The booking tab: the client, the services, the status and blocking the time.
import ClientSelector from "../../ClientSelector.vue";
import BookingServices from "../bookingServices.vue";
import { statusDot } from "../../../utils/appointmentStatus";
import { isTempId } from "../../../offline/tempIds";
import { useBookingDialog } from "./context";

const {
  props, t, form, servicesList, currentStaffId, selectedClient, groupedWithTime, isWalkInSelected,
  hiddenPart, isHiddenRow, currentTab, statusOptions, onClientPicked, clearSelectedClient, openClientProfile,
} = useBookingDialog();
</script>
