<template>
  <div class="p-1 sm:p-6 max-w-7xl mx-auto space-y-4 sm:space-y-6">
    <!-- Page Title -->
    <div class="flex items-center gap-3 mb-2">
      <div
        class="w-10 h-10 rounded-xl bg-[var(--p-primary-50)] flex items-center justify-center"
      >
        <i class="pi pi-user text-[var(--p-primary-600)]"></i>
      </div>
      <div>
        <h1 class="text-xl sm:text-2xl font-bold text-gray-900">
          {{ t("profile.title") }}
        </h1>
        <p class="text-sm text-gray-500">{{ t("profile.subtitle") }}</p>
      </div>
    </div>

    <!-- phone-sections: on phones one settings card is open at a time. -->
    <div class="phone-sections grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-8">
      <!-- Left Column -->
      <div class="lg:col-span-4 space-y-3 sm:space-y-6">
        <ProfileCard :profile="profile" :isLoadingProfile="isLoadingProfile" />
        <PreferencesCard v-phone-section />
        <ClinicContactCard v-if="isShopAdmin" v-phone-section :profile="profile" />
        <BrandingCard v-if="isShopAdmin" v-phone-section />
        <ForceLogoutCard v-if="isSuperAdmin" v-phone-section />
      </div>

      <!-- Right Column -->
      <div class="lg:col-span-8 space-y-3 sm:space-y-6">
        <PersonalInfoCard v-phone-section :profile="profile" :isLoadingProfile="isLoadingProfile" @saved="onProfileSaved" />
        <ReplyEmailCard v-if="isShopAdmin" v-phone-section :profile="profile" />
        <CalendarSettingsCard v-if="isShopAdmin" v-phone-section :profile="profile" />
        <SelfBookingCard v-if="authStore.isAnalyticsAllowed" :profile="profile" />
        <DiscountCodesAdmin v-if="authStore.isAnalyticsAllowed" v-phone-section />
        <BroadcastCard v-if="authStore.isAnalyticsAllowed" v-phone-section />
        <PasswordCard v-phone-section />
        <ContestsCard v-if="authStore.isAnalyticsAllowed" v-phone-section />
      </div>
    </div>
  </div>

  <ConfirmDialog></ConfirmDialog>
</template>

<script setup lang="ts">
// The settings page (Προφίλ): one card per setting, in settings/. This page
// loads the signed-in person's profile (with the shop's settings) once and
// hands it to the cards that start from it; who sees which card is decided
// here.
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { api } from "../api/http";
import { useNotify } from "../composables/useNotify";
import { useAuthStore } from "../stores/auth";
import { vPhoneSection } from "../directives/phoneSection";
import DiscountCodesAdmin from "../components/DiscountCodesAdmin.vue";
import ProfileCard from "./settings/ProfileCard.vue";
import PreferencesCard from "./settings/PreferencesCard.vue";
import ClinicContactCard from "./settings/ClinicContactCard.vue";
import BrandingCard from "./settings/BrandingCard.vue";
import ForceLogoutCard from "./settings/ForceLogoutCard.vue";
import PersonalInfoCard from "./settings/PersonalInfoCard.vue";
import ReplyEmailCard from "./settings/ReplyEmailCard.vue";
import CalendarSettingsCard from "./settings/CalendarSettingsCard.vue";
import SelfBookingCard from "./settings/SelfBookingCard.vue";
import BroadcastCard from "./settings/BroadcastCard.vue";
import PasswordCard from "./settings/PasswordCard.vue";
import ContestsCard from "./settings/ContestsCard.vue";

const { t } = useI18n();
const notify = useNotify();
const authStore = useAuthStore();

const isLoadingProfile = ref(true);
const profile = ref<any>({});

const isShopAdmin = computed(() => {
  const role = authStore.user?.role || profile.value?.role;
  return role === "admin" || role === "super_admin" || role === "frontdesk";
});
// Shop-wide "disconnect everyone" is destructive and shop-wide — restricted
// to super_admin only, not plain admin.
const isSuperAdmin = computed(() => (authStore.user?.role || profile.value?.role) === "super_admin");

const fetchProfile = async () => {
  isLoadingProfile.value = true;
  try {
    profile.value = await api.get("/api/v1/profile");
  } catch (e) {
    console.error(e);
    notify.error(t("profile.toast.loadFailed"));
  } finally {
    isLoadingProfile.value = false;
  }
};
onMounted(fetchProfile);

// The new name and email, for the profile card.
const onProfileSaved = (saved: { staff_name: string; staff_email: string }) => {
  profile.value.staff_name = saved.staff_name;
  profile.value.staff_email = saved.staff_email;
};
</script>
