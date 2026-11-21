<template>
  <div
    class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8"
  >
    <h3
      class="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2"
    >
      {{ t("profile.password.title") }}
    </h3>
    <p class="text-sm text-gray-500 mb-6">
      {{ t("profile.password.subtitle") }}
    </p>

    <form
      @submit.prevent="updatePassword"
      class="grid grid-cols-1 md:grid-cols-2 gap-6 items-start"
    >
      <div class="md:col-span-2">
        <label class="block text-sm font-medium text-gray-700 mb-1">{{
          t("profile.password.current")
        }}</label>
        <Password
          v-model="security.currentPassword"
          :feedback="false"
          toggleMask
          class="w-full"
          inputClass="w-full"
        />
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">{{
          t("profile.password.new")
        }}</label>
        <Password
          v-model="security.newPassword"
          toggleMask
          class="w-full"
          inputClass="w-full"
        >
          <template #footer>
            <div class="divider mt-2"></div>
            <ul
              class="pl-2 ml-2 mt-0 text-xs text-gray-500 leading-normal"
            >
              <li :class="{ 'text-green-600': hasMinLength }">
                {{ t("profile.password.minLength") }}
              </li>
              <li :class="{ 'text-green-600': hasNumber }">
                {{ t("profile.password.requireNumber") }}
              </li>
            </ul>
          </template>
        </Password>
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">{{
          t("profile.password.confirm")
        }}</label>
        <Password
          v-model="security.confirmPassword"
          :feedback="false"
          toggleMask
          class="w-full"
          inputClass="w-full"
          :class="{
            'p-invalid': !passwordsMatch && security.confirmPassword,
          }"
        />
        <small
          v-if="!passwordsMatch && security.confirmPassword"
          class="text-red-500 block mt-1"
        >
          {{ t("profile.password.noMatch") }}
        </small>
      </div>

      <div class="md:col-span-2 flex justify-end">
        <Button
          type="submit"
          :label="t('profile.password.update')"
          :disabled="!isValidSecurityForm"
          :loading="isSavingPassword"
        />
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
// Changing one's own password (at least 8 characters, with a number).
import { computed, reactive, ref } from "vue";
import { passwordHasDigit, passwordLongEnough } from "../../utils/password";
import { useI18n } from "vue-i18n";
import Button from "primevue/button";
import Password from "primevue/password";
import { api } from "../../api/http";
import { useNotify } from "../../composables/useNotify";

const { t } = useI18n();
const notify = useNotify();

const isSavingPassword = ref(false);
const security = reactive({ currentPassword: "", newPassword: "", confirmPassword: "" });
const passwordsMatch = computed(() => security.newPassword === security.confirmPassword);
const hasMinLength = computed(() => passwordLongEnough(security.newPassword));
const hasNumber = computed(() => passwordHasDigit(security.newPassword));
const isValidSecurityForm = computed(
  () => security.currentPassword && hasMinLength.value && hasNumber.value && passwordsMatch.value,
);

const updatePassword = async () => {
  if (!isValidSecurityForm.value) return;
  isSavingPassword.value = true;
  try {
    await api.put("/api/v1/profile/password", {
      currentPassword: security.currentPassword,
      newPassword: security.newPassword,
    });
    notify.success(t("profile.toast.passwordUpdated"));
    security.currentPassword = "";
    security.newPassword = "";
    security.confirmPassword = "";
  } catch (e: any) {
    notify.error(t("profile.toast.saveFailed"));
  } finally {
    isSavingPassword.value = false;
  }
};
</script>
