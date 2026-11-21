<template>
  <div
    class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8"
  >
    <div class="flex justify-between items-center mb-6">
      <div>
        <h3 class="text-lg font-bold text-gray-900">{{ t('profile.calendarSettings.title') }}</h3>
        <p class="text-sm text-gray-500">
          {{ t('profile.calendarSettings.subtitle') }}
        </p>
      </div>
      <Button
        :label="t('common.save')"
        class="p-button-sm p-button-rounded"
        :loading="isSavingCalSettings"
        @click="saveCalendarSettings"
      />
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1"
          >{{ t('profile.calendarSettings.openingTime') }}</label
        >
        <InputText
          v-model="calSettings.slotMinTime"
          class="w-full"
          placeholder="07:00"
        />
        <p class="text-xs text-gray-400 mt-1">
          {{ t('profile.calendarSettings.timeFormat') }}
        </p>
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1"
          >{{ t('profile.calendarSettings.closingTime') }}</label
        >
        <InputText
          v-model="calSettings.slotMaxTime"
          class="w-full"
          placeholder="21:00"
        />
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1"
          >{{ t('profile.calendarSettings.reminderHoursBefore') }}</label
        >
        <InputNumber
          v-model="calSettings.reminderHoursBefore"
          class="w-full"
          :min="1"
          :max="72"
        />
        <p class="text-xs text-gray-400 mt-1">
          {{ t('profile.calendarSettings.reminderHoursNote') }}
        </p>
      </div>
      <div class="flex items-center justify-between pt-2">
        <div>
          <p class="text-sm font-medium text-gray-700">{{ t('profile.calendarSettings.showWeekends') }}</p>
          <p class="text-xs text-gray-400">
            {{ t('profile.calendarSettings.showWeekendsNote') }}
          </p>
        </div>
        <ToggleSwitch v-model="calSettings.showWeekends" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// The calendar's opening and closing times, weekends, and how long before a booking its reminder goes out.
import { reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import { api, withMessage } from "../../api/http";
import { useNotify } from "../../composables/useNotify";

const props = defineProps<{ profile: any }>();
const { t } = useI18n();
const notify = useNotify();

const isSavingCalSettings = ref(false);
const calSettings = reactive({ slotMinTime: "07:00", slotMaxTime: "23:00", showWeekends: true, reminderHoursBefore: 24 });
watch(
  () => props.profile,
  (p) => {
    if (!p) return;
    calSettings.slotMinTime = p.slot_min_time || "07:00";
    calSettings.slotMaxTime = p.slot_max_time || "23:00";
    calSettings.showWeekends = p.show_weekends ?? true;
    calSettings.reminderHoursBefore = p.reminder_hours_before ?? 24;
  },
  { immediate: true },
);

const saveCalendarSettings = async () => {
  isSavingCalSettings.value = true;
  try {
    await api
      .put("/api/v1/shop/calendar-settings", {
        slot_min_time: calSettings.slotMinTime,
        slot_max_time: calSettings.slotMaxTime,
        show_weekends: calSettings.showWeekends,
        reminder_hours_before: calSettings.reminderHoursBefore,
      })
      .catch(withMessage(t("profile.toast.saveFailed")));
    notify.success(t("profile.calendarSettings.updated"));
  } catch (e: any) {
    notify.error(e.message);
  } finally {
    isSavingCalSettings.value = false;
  }
};
</script>
