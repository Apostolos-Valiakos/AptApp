<template>
  <div
    class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden relative"
  >
    <div v-if="isLoadingProfile" class="p-6 space-y-4">
      <div class="flex justify-center">
        <Skeleton shape="circle" size="6rem" />
      </div>
      <Skeleton width="100%" height="2rem" class="mt-4" />
      <Skeleton width="60%" height="1rem" class="mx-auto" />
    </div>

    <div v-else>
      <div
        class="h-32 bg-gradient-to-br from-[var(--p-primary-400)] to-[var(--p-primary-700)]"
      ></div>
      <div class="px-6 relative text-center">
        <div class="relative inline-block -mt-12">
          <div
            class="w-24 h-24 bg-white rounded-full border-4 border-white shadow-lg flex items-center justify-center text-4xl font-bold select-none overflow-hidden"
            :style="{ color: 'var(--p-primary-600)' }"
          >
            <img
              v-if="staffPhotoUrl"
              :src="staffPhotoUrl"
              class="w-full h-full object-cover"
            />
            <span v-else>{{
              profile.username?.charAt(0).toUpperCase()
            }}</span>
          </div>
          <label
            v-if="profile.staff_id"
            class="absolute bottom-0 right-0 w-7 h-7 bg-[var(--p-primary-color)] rounded-full flex items-center justify-center cursor-pointer shadow-md hover:brightness-110 transition-all"
            :title="t('profile.uploadPhoto')"
          >
            <i class="pi pi-camera text-white text-xs"></i>
            <input
              type="file"
              accept="image/*"
              class="hidden"
              @change="uploadPhoto"
            />
          </label>
        </div>

        <div class="mt-4 mb-6">
          <h2 class="text-xl font-bold text-gray-900">
            {{ profile.staff_name || profile.username }}
          </h2>
          <span
            class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[var(--p-primary-50)] text-[var(--p-primary-700)] mt-2 capitalize"
          >
            {{ profile.role }}
          </span>
        </div>

        <div class="border-t border-gray-100 py-4 text-left space-y-3">
          <div class="flex justify-between items-center">
            <div class="flex items-center text-gray-600 text-sm">
              <i class="pi pi-building mr-3 text-gray-400"></i>
              <span class="truncate max-w-[200px]">{{
                profile.shop_name || t("profile.noShopAssigned")
              }}</span>
            </div>
          </div>

          <div
            v-if="profile.specialty"
            class="flex items-center text-gray-600 text-sm"
          >
            <i class="pi pi-briefcase mr-3 text-gray-400"></i>
            <span>{{ profile.specialty }}</span>
          </div>

          <div
            class="flex justify-between items-center group p-2 hover:bg-gray-50 rounded-lg -mx-2 transition-colors cursor-pointer"
            @click="copyToClipboard(profile.user_id)"
          >
            <div class="flex items-center text-gray-600 text-sm">
              <i class="pi pi-id-card mr-3 text-gray-400"></i>
              <span class="font-mono text-xs text-gray-500">
                {{ t("profile.idLabel") }}:
                {{ profile.user_id?.substring(0, 8) }}...
              </span>
            </div>
            <i
              class="pi pi-copy text-xs text-gray-400 opacity-0 group-hover:opacity-100"
            ></i>
          </div>
        </div>

        <!-- Logout Button -->
        <div class="border-t border-gray-100 pt-4 pb-6">
          <Button
            :label="t('profile.signOut')"
            icon="pi pi-sign-out"
            severity="danger"
            variant="outlined"
            class="w-full"
            @click="handleLogout"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// The signed-in person: photo (which they can change), name, role, shop and login id, and signing out.
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useToast } from "primevue/usetoast";
import Button from "primevue/button";
import Skeleton from "primevue/skeleton";
import { api, withMessage } from "../../api/http";
import { useLogout } from "../../composables/useLogout";

const props = defineProps<{ profile: any; isLoadingProfile: boolean }>();
const { t } = useI18n();
const toast = useToast();

const staffPhotoUrl = ref("");
watch(() => props.profile, (p) => (staffPhotoUrl.value = p?.staff_photo_url || ""), { immediate: true });

const copyToClipboard = (text: string) => {
  if (!text) return;
  navigator.clipboard.writeText(text);
  toast.add({
    severity: "info",
    summary: t("common.success"),
    detail: t("profile.toast.idCopied"),
    life: 2000,
  });
};

const uploadPhoto = async (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const staffId = props.profile.staff_id;
  if (!staffId) return;
  const formData = new FormData();
  formData.append("photo", file);
  try {
    const data = await api
      .upload(`/api/v1/staff/${staffId}/photo`, formData)
      .catch(withMessage(t("profile.toast.uploadFailed")));
    staffPhotoUrl.value = data.photo_url;
    toast.add({ severity: "success", summary: t("profile.toast.photoUpdated"), life: 2000 });
  } catch (e: any) {
    toast.add({
      severity: "error",
      summary: t("profile.toast.uploadFailed"),
      detail: e.message,
      life: 3000,
    });
  }
};

const logoutAndClear = useLogout();
const handleLogout = () => logoutAndClear("/login");
</script>
