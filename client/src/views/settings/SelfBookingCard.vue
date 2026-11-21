<template>
  <div
    class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8"
  >
    <div class="flex justify-between items-center">
      <div>
        <h3 class="text-lg font-bold text-gray-900">
          {{ t('profile.selfBooking.title') }}
        </h3>
        <p class="text-sm text-gray-500 max-w-xl">
          {{ t('profile.selfBooking.description') }}
        </p>
      </div>
      <ToggleSwitch
        :modelValue="selfBookingEnabled"
        :disabled="isSavingSelfBooking"
        @update:modelValue="saveSelfBooking"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
// Whether clients can book online in the portal (saved as soon as it is switched).
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { api, withMessage } from "../../api/http";
import { useNotify } from "../../composables/useNotify";

const props = defineProps<{ profile: any }>();
const { t } = useI18n();
const notify = useNotify();

const isSavingSelfBooking = ref(false);
const selfBookingEnabled = ref(false);
watch(() => props.profile, (p) => (selfBookingEnabled.value = p?.self_booking_enabled ?? false), { immediate: true });

const saveSelfBooking = async (value: boolean) => {
  isSavingSelfBooking.value = true;
  const previous = selfBookingEnabled.value;
  selfBookingEnabled.value = value;
  try {
    await api
      .put("/api/v1/shop/self-booking", { self_booking_enabled: value })
      .catch(withMessage(t("profile.toast.saveFailed")));
    notify.success(value ? t("profile.selfBooking.enabledDetail") : t("profile.selfBooking.disabledDetail"));
  } catch (e: any) {
    selfBookingEnabled.value = previous;
    notify.error(e.message);
  } finally {
    isSavingSelfBooking.value = false;
  }
};
</script>
