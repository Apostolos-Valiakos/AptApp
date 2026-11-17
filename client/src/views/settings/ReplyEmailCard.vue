<template>
  <div
    class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8"
  >
    <div class="flex justify-between items-center mb-6">
      <div>
        <h3 class="text-lg font-bold text-gray-900">{{ t('profile.clinicSettings.title') }}</h3>
        <p class="text-sm text-gray-500">
          {{ t('profile.clinicSettings.subtitle') }}
        </p>
      </div>
      <Button
        :label="t('common.save')"
        class="p-button-sm p-button-rounded"
        :loading="isSavingReplyEmail"
        @click="saveReplyEmail"
      />
    </div>
    <div>
      <label class="block text-sm font-medium text-gray-700 mb-1">
        <i class="pi pi-reply mr-2 text-gray-400"></i>{{ t('profile.clinicSettings.replyToEmail') }}
      </label>
      <InputText
        v-model="replyEmailForm"
        class="w-full"
        placeholder="e.g. clinic@example.gr"
        type="email"
      />
      <p class="text-xs text-gray-400 mt-1.5">
        {{ t('profile.clinicSettings.replyToEmailNote') }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
// The address clients' replies to the shop's emails go to.
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import { api, withMessage } from "../../api/http";
import { useNotify } from "../../composables/useNotify";

const props = defineProps<{ profile: any }>();
const { t } = useI18n();
const notify = useNotify();

const isSavingReplyEmail = ref(false);
const replyEmailForm = ref("");
watch(() => props.profile, (p) => (replyEmailForm.value = p?.shop_reply_email || ""), { immediate: true });

const saveReplyEmail = async () => {
  isSavingReplyEmail.value = true;
  try {
    await api
      .put("/api/v1/shop/reply-email", { reply_email: replyEmailForm.value || null })
      .catch(withMessage(t("profile.toast.saveFailed")));
    notify.success(t("profile.clinicSettings.replyEmailSaved"));
  } catch (e: any) {
    notify.error(e.message || t("profile.toast.saveFailed"));
  } finally {
    isSavingReplyEmail.value = false;
  }
};
</script>
