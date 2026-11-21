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

    <!-- The rules for online bookings, in the portal and the AI assistant. -->
    <form class="border-t border-gray-100 mt-6 pt-5 space-y-4" data-testid="portal-rules" @submit.prevent="saveRules">
      <label class="block space-y-1">
        <span class="text-sm font-semibold text-gray-800">{{ t("profile.portalRules.notice") }}</span>
        <span class="block text-xs text-gray-500">{{ t("profile.portalRules.noticeHint") }}</span>
        <Select v-model="rules.portal_min_notice_minutes" :options="noticeOptions" optionLabel="label" optionValue="value" class="w-full sm:w-72" data-testid="notice" />
      </label>
      <label class="block space-y-1">
        <span class="text-sm font-semibold text-gray-800">{{ t("profile.portalRules.note") }}</span>
        <span class="block text-xs text-gray-500">{{ t("profile.portalRules.noteHint") }}</span>
        <Textarea v-model="rules.cancellation_note" rows="3" autoResize class="w-full" maxlength="1000" data-testid="cancellation-note" />
      </label>
      <slot name="extra-rules" :rules="rules" />
      <Button type="submit" :label="t('common.save')" :loading="isSavingRules" size="small" data-testid="save-rules" />
    </form>
  </div>
</template>

<script setup lang="ts">
// Whether clients can book online in the portal (saved as soon as it is switched).
import { computed, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { api, withMessage } from "../../api/http";
import { useNotify } from "../../composables/useNotify";

const props = defineProps<{ profile: any }>();
const { t } = useI18n();
const notify = useNotify();

const isSavingSelfBooking = ref(false);
const isSavingRules = ref(false);
const rules = reactive({ portal_min_notice_minutes: 0, cancellation_note: "" });
watch(
  () => props.profile,
  (p) => Object.assign(rules, { portal_min_notice_minutes: Number(p?.portal_min_notice_minutes) || 0, cancellation_note: p?.cancellation_note || "" }),
  { immediate: true },
);
const noticeOptions = computed(() => [
  { label: t("profile.portalRules.none"), value: 0 },
  ...[1, 2, 3, 6, 12, 24, 48].map((h) => ({ label: t("profile.portalRules.hours", { n: h }, h), value: h * 60 })),
]);
const saveRules = async () => {
  isSavingRules.value = true;
  try {
    await api.put("/api/v1/shop/portal-rules", { ...rules }).catch(withMessage(t("profile.toast.saveFailed")));
    notify.success(t("profile.portalRules.saved"));
  } catch (e: any) {
    notify.error(e.message);
  } finally {
    isSavingRules.value = false;
  }
};
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
