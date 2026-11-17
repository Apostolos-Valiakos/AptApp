<template>
  <div
    class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8"
  >
    <div class="flex justify-between items-center mb-6">
      <div>
        <h3 class="text-lg font-bold text-gray-900">
          {{ t("profile.personalInfo.title") }}
        </h3>
        <p class="text-sm text-gray-500">
          {{ t("profile.personalInfo.subtitle") }}
        </p>
      </div>
      <Button
        :label="t('profile.personalInfo.saveChanges')"
        class="p-button-sm p-button-rounded"
        :loading="isSavingProfile"
        @click="updateProfile"
        :disabled="isLoadingProfile"
      />
    </div>

    <div v-if="isLoadingProfile" class="space-y-4">
      <Skeleton height="2.5rem" />
      <Skeleton height="2.5rem" />
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">{{
          t("profile.personalInfo.firstName")
        }}</label>
        <InputText v-model="profileForm.firstName" class="w-full" />
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">{{
          t("profile.personalInfo.lastName")
        }}</label>
        <InputText v-model="profileForm.lastName" class="w-full" />
      </div>
      <div class="md:col-span-2">
        <label class="block text-sm font-medium text-gray-700 mb-1">{{
          t("profile.personalInfo.emailAddress")
        }}</label>
        <div class="p-input-icon-left w-full">
          <InputText v-model="profileForm.email" class="w-full" />
        </div>
      </div>
      <div class="md:col-span-2">
        <label class="block text-sm font-medium text-gray-700 mb-1">{{
          t("profile.personalInfo.phone")
        }}</label>
        <div class="p-input-icon-left w-full">
          <InputText v-model="profileForm.phone" class="w-full" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// The signed-in person's name, email and phone.
import { reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Skeleton from "primevue/skeleton";
import { api } from "../../api/http";
import { useNotify } from "../../composables/useNotify";

const props = defineProps<{ profile: any; isLoadingProfile: boolean }>();
// What was saved, so the page shows the new name.
const emit = defineEmits<{ saved: [{ staff_name: string; staff_email: string }] }>();
const { t } = useI18n();
const notify = useNotify();

const isSavingProfile = ref(false);
const profileForm = reactive({ firstName: "", lastName: "", email: "", phone: "" });
watch(
  () => props.profile,
  (p) => {
    if (!p || (!p.staff_name && !p.username)) return;
    const nameParts = (p.staff_name || p.username).split(" ");
    profileForm.firstName = nameParts[0] || "";
    profileForm.lastName = nameParts.slice(1).join(" ") || "";
    profileForm.email = p.staff_email || "";
    profileForm.phone = p.staff_phone || "";
  },
  { immediate: true },
);

const updateProfile = async () => {
  isSavingProfile.value = true;
  try {
    await api.put("/api/v1/profile", {
      firstName: profileForm.firstName,
      lastName: profileForm.lastName,
      email: profileForm.email,
      phone: profileForm.phone,
    });
    notify.success(t("profile.toast.profileUpdated"));
    emit("saved", { staff_name: `${profileForm.firstName} ${profileForm.lastName}`, staff_email: profileForm.email });
  } catch (e: any) {
    notify.error(t("profile.toast.saveFailed"));
  } finally {
    isSavingProfile.value = false;
  }
};
</script>
