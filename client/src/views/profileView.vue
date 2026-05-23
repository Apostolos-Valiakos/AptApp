<template>
  <div class="p-6 max-w-7xl mx-auto space-y-6">
    <!-- Page Title -->
    <div class="flex items-center gap-3 mb-2">
      <div class="w-10 h-10 rounded-xl bg-[var(--p-primary-50)] flex items-center justify-center">
        <i class="pi pi-user text-[var(--p-primary-600)]"></i>
      </div>
      <div>
        <h1 class="text-2xl font-bold text-gray-900">{{ t('profile.title') }}</h1>
        <p class="text-sm text-gray-500">{{ t('profile.subtitle') }}</p>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
      <!-- Left Column -->
      <div class="lg:col-span-4 space-y-6">
        <!-- Profile Card -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden relative">
          <div v-if="isLoadingProfile" class="p-6 space-y-4">
            <div class="flex justify-center">
              <Skeleton shape="circle" size="6rem" />
            </div>
            <Skeleton width="100%" height="2rem" class="mt-4" />
            <Skeleton width="60%" height="1rem" class="mx-auto" />
          </div>

          <div v-else>
            <div class="h-32 bg-gradient-to-br from-[var(--p-primary-400)] to-[var(--p-primary-700)]"></div>
            <div class="px-6 relative text-center">
              <div class="relative inline-block -mt-12">
                <div
                  class="w-24 h-24 bg-white rounded-full border-4 border-white shadow-lg flex items-center justify-center text-4xl font-bold select-none overflow-hidden"
                  :style="{ color: 'var(--p-primary-600)' }"
                >
                  <img v-if="staffPhotoUrl" :src="staffPhotoUrl" class="w-full h-full object-cover" />
                  <span v-else>{{ profile.username?.charAt(0).toUpperCase() }}</span>
                </div>
                <label v-if="profile.staff_id" class="absolute bottom-0 right-0 w-7 h-7 bg-[var(--p-primary-color)] rounded-full flex items-center justify-center cursor-pointer shadow-md hover:brightness-110 transition-all" title="Upload photo">
                  <i class="pi pi-camera text-white text-xs"></i>
                  <input type="file" accept="image/*" class="hidden" @change="uploadPhoto" />
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
                      profile.shop_name || t('profile.noShopAssigned')
                    }}</span>
                  </div>
                </div>

                <div v-if="profile.specialty" class="flex items-center text-gray-600 text-sm">
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
                      {{ t('profile.idLabel') }}: {{ profile.user_id?.substring(0, 8) }}...
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

        <!-- Preferences Card -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 class="font-bold text-gray-900 mb-4">{{ t('profile.preferences.title') }}</h3>

          <div class="flex items-center justify-between">
            <span class="text-sm text-gray-600">{{ t('profile.preferences.notifications') }}</span>
            <InputSwitch v-model="preferences.notifications" />
          </div>
          <p class="text-xs text-gray-400 mt-1">{{ t('profile.preferences.notificationsSoon') }}</p>
        </div>

        <!-- Clinic Contact Info Card (admin only) -->
        <div v-if="isOwner" class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-2">
              <i class="pi pi-building text-[var(--p-primary-color)]"></i>
              <h3 class="font-bold text-gray-900 text-sm">Clinic Info</h3>
            </div>
            <Button size="small" label="Save" :loading="isSavingContact" @click="saveContact" />
          </div>
          <div class="space-y-3">
            <div>
              <label class="text-xs font-medium text-gray-500 block mb-1">Phone</label>
              <InputText v-model="contactForm.phone" class="w-full" placeholder="+30 210 000 0000" />
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500 block mb-1">Address</label>
              <InputText v-model="contactForm.address" class="w-full" placeholder="Street, City" />
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500 block mb-1">Website</label>
              <InputText v-model="contactForm.website" class="w-full" placeholder="https://..." />
            </div>
          </div>
        </div>

        <!-- App Branding Card (owners only) -->
        <div v-if="isOwner" class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div class="flex items-center gap-2 mb-4">
            <i class="pi pi-palette text-[var(--p-primary-color)]"></i>
            <h3 class="font-bold text-gray-900 text-sm">{{ t('profile.branding.title') }}</h3>
          </div>

          <div class="mb-4">
            <label class="text-xs font-semibold text-gray-500 block mb-2">{{ t('profile.branding.quickPresets') }}</label>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="color in presets"
                :key="color"
                @click="saveColor(color)"
                class="w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 focus:outline-none"
                :class="
                  selectedColor === color
                    ? 'border-gray-900 scale-110'
                    : 'border-transparent'
                "
                :style="{ backgroundColor: color }"
              >
                <i
                  v-if="selectedColor === color"
                  class="pi pi-check text-white text-[10px] flex items-center justify-center h-full drop-shadow-md"
                ></i>
              </button>
            </div>
          </div>

          <div>
            <label class="text-xs font-semibold text-gray-500 block mb-2">{{ t('profile.branding.customColor') }}</label>
            <div class="flex items-center gap-3">
              <div class="border rounded-lg p-1">
                <ColorPicker v-model="pickerColor" format="hex" />
              </div>
              <div class="flex-1 min-w-0">
                <div
                  class="text-xs font-mono bg-gray-50 px-2 py-1 rounded border text-gray-600 text-center"
                >
                  #{{ pickerColor }}
                </div>
              </div>
              <Button
                icon="pi pi-check"
                size="small"
                class="!bg-[var(--p-primary-color)] border-none w-8 h-8 !p-0"
                :disabled="!pickerColor || '#' + pickerColor === selectedColor"
                @click="saveCustomColor"
                v-tooltip="t('profile.branding.customColor')"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Right Column -->
      <div class="lg:col-span-8 space-y-6">
        <!-- Personal Information -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
          <div class="flex justify-between items-center mb-6">
            <div>
              <h3 class="text-lg font-bold text-gray-900">{{ t('profile.personalInfo.title') }}</h3>
              <p class="text-sm text-gray-500">{{ t('profile.personalInfo.subtitle') }}</p>
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
              <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('profile.personalInfo.firstName') }}</label>
              <InputText v-model="profileForm.firstName" class="w-full" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('profile.personalInfo.lastName') }}</label>
              <InputText v-model="profileForm.lastName" class="w-full" />
            </div>
            <div class="md:col-span-2">
              <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('profile.personalInfo.emailAddress') }}</label>
              <div class="p-input-icon-left w-full">
                <InputText v-model="profileForm.email" class="w-full" />
              </div>
            </div>
            <div class="md:col-span-2">
              <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('profile.personalInfo.phone') }}</label>
              <div class="p-input-icon-left w-full">
                <InputText v-model="profileForm.phone" class="w-full" />
              </div>
            </div>
          </div>
        </div>

        <!-- Shop Services -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
          <div class="flex justify-between items-center mb-8">
            <div>
              <h3 class="text-lg font-bold text-gray-900">{{ t('profile.shopServices.title') }}</h3>
              <p class="text-sm text-gray-500">{{ t('profile.shopServices.subtitle') }}</p>
            </div>
            <Button
              :label="t('profile.shopServices.saveChanges')"
              class="p-button-sm p-button-rounded"
              @click="updateShopServices"
            />
          </div>

          <div v-if="isLoadingProfile" class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Skeleton height="100px" v-for="i in 3" :key="i" />
          </div>

          <div v-else class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div
              @click="shopForm.ergotherapia = !shopForm.ergotherapia"
              :class="[
                'relative flex flex-col items-center p-5 rounded-xl border-2 cursor-pointer transition-all duration-200 group',
                shopForm.ergotherapia
                  ? 'border-[var(--p-primary-color)] bg-[var(--p-primary-50)]'
                  : 'border-gray-100 bg-white hover:border-gray-200',
              ]"
            >
              <div
                :class="[
                  'w-12 h-12 rounded-full flex items-center justify-center mb-3 transition-colors',
                  shopForm.ergotherapia
                    ? 'bg-[var(--p-primary-color)] text-white'
                    : 'bg-gray-100 text-gray-500 group-hover:bg-gray-200',
                ]"
              >
                <i class="pi pi-briefcase text-xl"></i>
              </div>
              <span
                class="font-semibold text-sm mb-1"
                :class="
                  shopForm.ergotherapia
                    ? 'text-[var(--p-primary-700)]'
                    : 'text-gray-700'
                "
              >
                Εργοθεραπεία
              </span>
              <ToggleSwitch v-model="shopForm.ergotherapia" @click.stop />
            </div>

            <div
              @click="shopForm.physiotherapia = !shopForm.physiotherapia"
              :class="[
                'relative flex flex-col items-center p-5 rounded-xl border-2 cursor-pointer transition-all duration-200 group',
                shopForm.physiotherapia
                  ? 'border-[var(--p-primary-color)] bg-[var(--p-primary-50)]'
                  : 'border-gray-100 bg-white hover:border-gray-200',
              ]"
            >
              <div
                :class="[
                  'w-12 h-12 rounded-full flex items-center justify-center mb-3 transition-colors',
                  shopForm.physiotherapia
                    ? 'bg-[var(--p-primary-color)] text-white'
                    : 'bg-gray-100 text-gray-500 group-hover:bg-gray-200',
                ]"
              >
                <i class="pi pi-heart text-xl"></i>
              </div>
              <span
                class="font-semibold text-sm mb-1"
                :class="
                  shopForm.physiotherapia
                    ? 'text-[var(--p-primary-700)]'
                    : 'text-gray-700'
                "
              >
                Φυσιοθεραπεία
              </span>
              <ToggleSwitch v-model="shopForm.physiotherapia" @click.stop />
            </div>

            <div
              @click="shopForm.logotherapia = !shopForm.logotherapia"
              :class="[
                'relative flex flex-col items-center p-5 rounded-xl border-2 cursor-pointer transition-all duration-200 group',
                shopForm.logotherapia
                  ? 'border-[var(--p-primary-color)] bg-[var(--p-primary-50)]'
                  : 'border-gray-100 bg-white hover:border-gray-200',
              ]"
            >
              <div
                :class="[
                  'w-12 h-12 rounded-full flex items-center justify-center mb-3 transition-colors',
                  shopForm.logotherapia
                    ? 'bg-[var(--p-primary-color)] text-white'
                    : 'bg-gray-100 text-gray-500 group-hover:bg-gray-200',
                ]"
              >
                <i class="pi pi-comments text-xl"></i>
              </div>
              <span
                class="font-semibold text-sm mb-1"
                :class="
                  shopForm.logotherapia
                    ? 'text-[var(--p-primary-700)]'
                    : 'text-gray-700'
                "
              >
                Λογοθεραπεία
              </span>
              <ToggleSwitch v-model="shopForm.logotherapia" @click.stop />
            </div>
          </div>
        </div>

        <!-- Clinic Settings (owner only) -->
        <div v-if="isOwner" class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
          <div class="flex justify-between items-center mb-6">
            <div>
              <h3 class="text-lg font-bold text-gray-900">Clinic Settings</h3>
              <p class="text-sm text-gray-500">Email address clients see when they reply to booking emails.</p>
            </div>
            <Button
              label="Save"
              class="p-button-sm p-button-rounded"
              :loading="isSavingReplyEmail"
              @click="saveReplyEmail"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              <i class="pi pi-reply mr-2 text-gray-400"></i>Reply-To Email
            </label>
            <InputText
              v-model="replyEmailForm"
              class="w-full"
              placeholder="e.g. clinic@example.gr"
              type="email"
            />
            <p class="text-xs text-gray-400 mt-1.5">
              When clients reply to appointment reminders or portal invitations, their email will go to this address. Leave blank to use the system default.
            </p>
          </div>
        </div>

        <!-- Calendar Settings (admin only) -->
        <div v-if="isOwner" class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
          <div class="flex justify-between items-center mb-6">
            <div>
              <h3 class="text-lg font-bold text-gray-900">Calendar Settings</h3>
              <p class="text-sm text-gray-500">Control the scheduler and reminder behaviour.</p>
            </div>
            <Button label="Save" class="p-button-sm p-button-rounded" :loading="isSavingCalSettings" @click="saveCalendarSettings" />
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Opening Time</label>
              <InputText v-model="calSettings.slotMinTime" class="w-full" placeholder="07:00" />
              <p class="text-xs text-gray-400 mt-1">Format: HH:MM (e.g. 08:00)</p>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Closing Time</label>
              <InputText v-model="calSettings.slotMaxTime" class="w-full" placeholder="21:00" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Reminder (hours before)</label>
              <InputNumber v-model="calSettings.reminderHoursBefore" class="w-full" :min="1" :max="72" />
              <p class="text-xs text-gray-400 mt-1">How many hours before the appointment to send the email reminder.</p>
            </div>
            <div class="flex items-center justify-between pt-2">
              <div>
                <p class="text-sm font-medium text-gray-700">Show Weekends</p>
                <p class="text-xs text-gray-400">Display Saturday and Sunday in the calendar.</p>
              </div>
              <ToggleSwitch v-model="calSettings.showWeekends" />
            </div>
          </div>
        </div>

        <!-- Change Password -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
          <h3 class="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
            {{ t('profile.password.title') }}
          </h3>
          <p class="text-sm text-gray-500 mb-6">
            {{ t('profile.password.subtitle') }}
          </p>

          <form
            @submit.prevent="updatePassword"
            class="grid grid-cols-1 md:grid-cols-2 gap-6 items-start"
          >
            <div class="md:col-span-2">
              <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('profile.password.current') }}</label>
              <Password
                v-model="security.currentPassword"
                :feedback="false"
                toggleMask
                class="w-full"
                inputClass="w-full"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('profile.password.new') }}</label>
              <Password
                v-model="security.newPassword"
                toggleMask
                class="w-full"
                inputClass="w-full"
              >
                <template #footer>
                  <div class="divider mt-2"></div>
                  <ul class="pl-2 ml-2 mt-0 text-xs text-gray-500 leading-normal">
                    <li :class="{ 'text-green-600': hasMinLength }">
                      {{ t('profile.password.minLength') }}
                    </li>
                    <li :class="{ 'text-green-600': hasNumber }">
                      {{ t('profile.password.requireNumber') }}
                    </li>
                  </ul>
                </template>
              </Password>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('profile.password.confirm') }}</label>
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
                {{ t('profile.password.noMatch') }}
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
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, reactive, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useToast } from "primevue/usetoast";
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";
import { useThemeStore } from "../stores/themes"; // Import Theme Store

import Password from "primevue/password";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Skeleton from "primevue/skeleton";
import InputSwitch from "primevue/inputswitch";
import ColorPicker from "primevue/colorpicker"; // Import ColorPicker

const { t } = useI18n();
const toast = useToast();
const router = useRouter();
const authStore = useAuthStore();
const themeStore = useThemeStore(); // Init Theme Store

const isLoadingProfile = ref(true);
const isSavingProfile = ref(false);
const isSavingPassword = ref(false);
const isSavingReplyEmail = ref(false);
const replyEmailForm = ref("");
const staffPhotoUrl = ref("");
const isSavingContact = ref(false);
const isSavingCalSettings = ref(false);
const contactForm = reactive({ phone: "", address: "", website: "" });
const calSettings = reactive({ slotMinTime: "07:00", slotMaxTime: "23:00", showWeekends: true, reminderHoursBefore: 24 });

// Data Models
const profile = ref<any>({});
const profileForm = reactive({
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
});
const shopForm = reactive({
  ergotherapia: false,
  logotherapia: false,
  physiotherapia: false,
});

const preferences = reactive({
  notifications: true,
  darkMode: false,
});

const security = reactive({
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
});

// --- Theme / Branding Logic ---
const pickerColor = ref("ff93d4");
const selectedColor = computed(() => themeStore.primaryColor);

const isOwner = computed(() => {
  const role = authStore.user?.role || profile.value?.role;
  return role === "admin" || role === "super_admin";
});

const presets = [
  "#ff93d4", // Default Pink
  "#3b82f6", // Blue
  "#10b981", // Emerald
  "#8b5cf6", // Violet
  "#f59e0b", // Amber
  "#ef4444", // Red
];

const saveColor = (color: string) => {
  themeStore.updateTheme(color);
  pickerColor.value = color.replace("#", "");
};

const saveCustomColor = () => {
  const hex = "#" + pickerColor.value;
  themeStore.updateTheme(hex);
};

// --- Computed Helpers (Password) ---
const passwordsMatch = computed(
  () => security.newPassword === security.confirmPassword,
);
const hasMinLength = computed(() => security.newPassword.length >= 8);
const hasNumber = computed(() => /\d/.test(security.newPassword));
const isValidSecurityForm = computed(
  () =>
    security.currentPassword &&
    hasMinLength.value &&
    hasNumber.value &&
    passwordsMatch.value,
);

// --- Actions ---

const fetchProfile = async () => {
  isLoadingProfile.value = true;
  const token = localStorage.getItem("token");
  try {
    const res = await fetch("/api/v1/profile", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      const data = await res.json();
      profile.value = data;

      // Parse Name
      const nameParts = (data.staff_name || data.username).split(" ");
      profileForm.firstName = nameParts[0] || "";
      profileForm.lastName = nameParts.slice(1).join(" ") || "";
      profileForm.email = data.staff_email || "";
      profileForm.phone = data.staff_phone || "";
      shopForm.ergotherapia = data.ergotherapia;
      shopForm.physiotherapia = data.physiotherapia;
      shopForm.logotherapia = data.logotherapia;
      replyEmailForm.value = data.shop_reply_email || "";
      contactForm.phone = data.shop_phone || "";
      contactForm.address = data.shop_address || "";
      contactForm.website = data.shop_website || "";
      calSettings.slotMinTime = data.slot_min_time || "07:00";
      calSettings.slotMaxTime = data.slot_max_time || "23:00";
      calSettings.showWeekends = data.show_weekends ?? true;
      calSettings.reminderHoursBefore = data.reminder_hours_before ?? 24;
      staffPhotoUrl.value = data.staff_photo_url || "";
    } else {
      throw new Error("Failed to load profile");
    }
  } catch (e) {
    console.error(e);
    toast.add({
      severity: "error",
      summary: t('common.error'),
      detail: t('profile.toast.loadFailed'),
      life: 3000,
    });
  } finally {
    isLoadingProfile.value = false;
  }
};

const copyToClipboard = (text: string) => {
  if (!text) return;
  navigator.clipboard.writeText(text);
  toast.add({
    severity: "info",
    summary: t('common.success'),
    detail: t('profile.toast.idCopied'),
    life: 2000,
  });
};

const updateProfile = async () => {
  isSavingProfile.value = true;
  const token = localStorage.getItem("token");

  try {
    const res = await fetch("/api/v1/profile", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        firstName: profileForm.firstName,
        lastName: profileForm.lastName,
        email: profileForm.email,
        phone: profileForm.phone,
      }),
    });

    if (res.ok) {
      toast.add({
        severity: "success",
        summary: t('common.success'),
        detail: t('profile.toast.profileUpdated'),
        life: 3000,
      });
      // Refresh local data display
      profile.value.staff_name = `${profileForm.firstName} ${profileForm.lastName}`;
      profile.value.staff_email = profileForm.email;
    } else {
      const err = await res.json();
      throw new Error(err.error || "Update failed");
    }
  } catch (e: any) {
    toast.add({
      severity: "error",
      summary: t('common.error'),
      detail: t('profile.toast.saveFailed'),
      life: 3000,
    });
  } finally {
    isSavingProfile.value = false;
  }
};
const updateShopServices = async () => {
  isSavingProfile.value = true;
  const token = localStorage.getItem("token");

  try {
    const res = await fetch("/api/v1/shop/services", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        ergotherapia: shopForm.ergotherapia,
        physiotherapia: shopForm.physiotherapia,
        logotherapia: shopForm.logotherapia,
      }),
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data.error || "Failed to update services");

    toast.add({
      severity: "success",
      summary: t('common.success'),
      detail: t('profile.toast.servicesUpdated'),
      life: 3000,
    });
  } catch (e: any) {
    toast.add({
      severity: "error",
      summary: t('common.error'),
      detail: t('profile.toast.saveFailed'),
      life: 4000,
    });
  } finally {
    isSavingProfile.value = false;
  }
};
const saveReplyEmail = async () => {
  isSavingReplyEmail.value = true;
  const token = localStorage.getItem("token");
  try {
    const res = await fetch("/api/v1/shop/reply-email", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ reply_email: replyEmailForm.value || null }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to save");
    toast.add({ severity: "success", summary: t('common.success'), detail: "Reply-to email saved", life: 3000 });
    profile.value.shop_reply_email = replyEmailForm.value || null;
  } catch (e: any) {
    toast.add({ severity: "error", summary: t('common.error'), detail: e.message || t('profile.toast.saveFailed'), life: 3000 });
  } finally {
    isSavingReplyEmail.value = false;
  }
};

const updatePassword = async () => {
  if (!isValidSecurityForm.value) return;
  isSavingPassword.value = true;
  const token = localStorage.getItem("token");

  try {
    const res = await fetch("/api/v1/profile/password", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        currentPassword: security.currentPassword,
        newPassword: security.newPassword,
      }),
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data.error || "Failed to update password");

    toast.add({
      severity: "success",
      summary: t('common.success'),
      detail: t('profile.toast.passwordUpdated'),
      life: 3000,
    });

    // Clear form
    security.currentPassword = "";
    security.newPassword = "";
    security.confirmPassword = "";
  } catch (e: any) {
    toast.add({
      severity: "error",
      summary: t('common.error'),
      detail: t('profile.toast.saveFailed'),
      life: 4000,
    });
  } finally {
    isSavingPassword.value = false;
  }
};

const saveContact = async () => {
  isSavingContact.value = true;
  const token = localStorage.getItem("token");
  try {
    const res = await fetch("/api/v1/shop/contact", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ phone: contactForm.phone, address: contactForm.address, website: contactForm.website }),
    });
    if (!res.ok) throw new Error((await res.json()).error || "Failed");
    toast.add({ severity: "success", summary: "Saved", detail: "Clinic info updated", life: 3000 });
  } catch (e: any) {
    toast.add({ severity: "error", summary: "Error", detail: e.message, life: 3000 });
  } finally {
    isSavingContact.value = false;
  }
};

const saveCalendarSettings = async () => {
  isSavingCalSettings.value = true;
  const token = localStorage.getItem("token");
  try {
    const res = await fetch("/api/v1/shop/calendar-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        slot_min_time: calSettings.slotMinTime,
        slot_max_time: calSettings.slotMaxTime,
        show_weekends: calSettings.showWeekends,
        reminder_hours_before: calSettings.reminderHoursBefore,
      }),
    });
    if (!res.ok) throw new Error((await res.json()).error || "Failed");
    toast.add({ severity: "success", summary: "Saved", detail: "Calendar settings updated", life: 3000 });
  } catch (e: any) {
    toast.add({ severity: "error", summary: "Error", detail: e.message, life: 3000 });
  } finally {
    isSavingCalSettings.value = false;
  }
};

const uploadPhoto = async (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const token = localStorage.getItem("token");
  const staffId = profile.value.staff_id;
  if (!staffId) return;
  const formData = new FormData();
  formData.append("photo", file);
  try {
    const res = await fetch(`/api/v1/staff/${staffId}/photo`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) throw new Error((await res.json()).error || "Upload failed");
    const data = await res.json();
    staffPhotoUrl.value = data.photo_url;
    toast.add({ severity: "success", summary: "Photo updated", life: 2000 });
  } catch (e: any) {
    toast.add({ severity: "error", summary: "Upload failed", detail: e.message, life: 3000 });
  }
};

const handleLogout = () => {
  authStore.logout();
  router.push("/login");
};

const toggleDarkMode = () => {
  if (preferences.darkMode) {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
};

onMounted(() => {
  fetchProfile();
  // Sync picker with current store color
  if (themeStore.primaryColor) {
    pickerColor.value = themeStore.primaryColor.replace("#", "");
  }
});
</script>
