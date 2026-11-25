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

    <!-- The settings in groups, one group at a time: a menu on the left on a
         computer, a row at the top on a phone. Every card stays loaded, so
         switching groups loses nothing typed. phone-sections: on phones one
         card of a group is open at a time. -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-8 items-start">
      <nav
        class="lg:col-span-3 lg:sticky lg:top-4 flex lg:flex-col gap-1 overflow-x-auto bg-white rounded-xl border border-gray-100 p-1.5"
        role="tablist"
        :aria-label="t('profile.groups.label')"
      >
        <button
          v-for="g in visibleGroups"
          :key="g.key"
          type="button"
          role="tab"
          :aria-selected="group === g.key"
          :aria-controls="`profile-group-${g.key}`"
          class="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold whitespace-nowrap text-left transition-colors"
          :class="group === g.key ? 'bg-[var(--p-primary-50)] text-[var(--p-primary-700)]' : 'text-gray-600 hover:bg-gray-50'"
          :data-testid="`profile-group-${g.key}`"
          @click="setGroup(g.key)"
        >
          <i :class="g.icon" class="text-sm"></i>
          {{ t(`profile.groups.${g.key}`) }}
        </button>
      </nav>

      <div class="lg:col-span-9 phone-sections">
        <div v-show="group === 'account'" id="profile-group-account" role="tabpanel" class="grid grid-cols-1 xl:grid-cols-2 gap-3 sm:gap-6 items-start">
          <div class="space-y-3 sm:space-y-6">
            <ProfileCard :profile="profile" :isLoadingProfile="isLoadingProfile" />
            <PreferencesCard v-phone-section />
          </div>
          <div class="space-y-3 sm:space-y-6">
            <PersonalInfoCard v-phone-section :profile="profile" :isLoadingProfile="isLoadingProfile" @saved="onProfileSaved" />
            <PasswordCard v-phone-section />
          </div>
        </div>
        <div v-if="isShopAdmin" v-show="group === 'shop'" id="profile-group-shop" role="tabpanel" class="grid grid-cols-1 xl:grid-cols-2 gap-3 sm:gap-6 items-start">
          <div class="space-y-3 sm:space-y-6">
            <ClinicContactCard v-phone-section :profile="profile" />
            <BrandingCard v-phone-section />
          </div>
          <div class="space-y-3 sm:space-y-6">
            <ReplyEmailCard v-phone-section :profile="profile" />
            <CalendarSettingsCard v-phone-section :profile="profile" />
          </div>
        </div>
        <div v-if="authStore.isAnalyticsAllowed" v-show="group === 'clients'" id="profile-group-clients" role="tabpanel" class="space-y-3 sm:space-y-6">
          <SelfBookingCard :profile="profile" />
          <DiscountCodesAdmin v-phone-section />
          <BroadcastCard v-phone-section />
          <ContestsCard v-phone-section />
        </div>
        <div v-if="isSuperAdmin" v-show="group === 'security'" id="profile-group-security" role="tabpanel" class="max-w-xl">
          <ForceLogoutCard v-phone-section />
        </div>
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
import { useRoute, useRouter } from "vue-router";
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

// The groups, each for those who may see its cards; the one shown is kept
// in the address (?group=), so a refresh or a shared link opens it again.
const GROUPS = [
  { key: "account", icon: "pi pi-user", show: () => true },
  { key: "shop", icon: "pi pi-building", show: () => isShopAdmin.value },
  { key: "clients", icon: "pi pi-megaphone", show: () => authStore.isAnalyticsAllowed },
  { key: "security", icon: "pi pi-shield", show: () => isSuperAdmin.value },
];
const route = useRoute();
const router = useRouter();
const visibleGroups = computed(() => GROUPS.filter((g) => g.show()));
const group = computed(() => {
  const asked = String(route.query.group || "");
  return visibleGroups.value.some((g) => g.key === asked) ? asked : "account";
});
const setGroup = (key: string) => router.replace({ query: { ...route.query, group: key } });

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
