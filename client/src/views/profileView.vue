<template>
  <div class="max-w-6xl mx-auto p-4 lg:p-10">
    <div
      class="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4"
    >
      <div>
        <h1 class="text-3xl font-bold text-gray-900 tracking-tight">
          Account Settings
        </h1>
        <p class="text-gray-500 mt-1">
          Manage your personal details and security preferences.
        </p>
      </div>
      <Button
        label="Log Out"
        icon="pi pi-sign-out"
        class="p-button-outlined p-button-secondary p-button-sm"
        @click="handleLogout"
      />
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
      <div class="lg:col-span-4 space-y-6">
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
              class="h-32 bg-gradient-to-br from-indigo-600 to-purple-700"
            ></div>
            <div class="px-6 relative text-center">
              <div class="relative inline-block -mt-12">
                <div
                  class="w-24 h-24 bg-white rounded-full border-4 border-white shadow-lg flex items-center justify-center text-4xl font-bold text-indigo-600 select-none overflow-hidden"
                >
                  <span>{{ profile.username?.charAt(0).toUpperCase() }}</span>
                </div>
              </div>

              <div class="mt-4 mb-6">
                <h2 class="text-xl font-bold text-gray-900">
                  {{ profile.staff_name || profile.username }}
                </h2>
                <span
                  class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 mt-2 capitalize"
                >
                  {{ profile.role }}
                </span>
              </div>

              <div class="border-t border-gray-100 py-4 text-left space-y-3">
                <div class="flex justify-between items-center">
                  <div class="flex items-center text-gray-600 text-sm">
                    <i class="pi pi-building mr-3 text-gray-400"></i>
                    <span class="truncate max-w-[200px]">{{
                      profile.shop_name || "No Shop Assigned"
                    }}</span>
                  </div>
                </div>

                <div
                  class="flex justify-between items-center group p-2 hover:bg-gray-50 rounded-lg -mx-2 transition-colors cursor-pointer"
                  @click="copyToClipboard(profile.user_id)"
                >
                  <div class="flex items-center text-gray-600 text-sm">
                    <i class="pi pi-id-card mr-3 text-gray-400"></i>
                    <span class="font-mono text-xs text-gray-500">
                      ID: {{ profile.user_id?.substring(0, 8) }}...
                    </span>
                  </div>
                  <i
                    class="pi pi-copy text-xs text-gray-400 opacity-0 group-hover:opacity-100"
                  ></i>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 class="font-bold text-gray-900 mb-4">Preferences</h3>
          <div class="flex items-center justify-between">
            <span class="text-sm text-gray-600">Email Notifications</span>
            <InputSwitch v-model="preferences.notifications" />
          </div>
          <!-- <div class="flex items-center justify-between mt-4">
            <span class="text-sm text-gray-600">Dark Mode</span>
            <InputSwitch
              v-model="preferences.darkMode"
              @change="toggleDarkMode"
            />
          </div> -->
        </div>
      </div>

      <div class="lg:col-span-8 space-y-6">
        <div
          class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8"
        >
          <div class="flex justify-between items-center mb-6">
            <div>
              <h3 class="text-lg font-bold text-gray-900">
                Personal Information
              </h3>
              <p class="text-sm text-gray-500">
                Update your public profile details.
              </p>
            </div>
            <Button
              label="Save Changes"
              class="p-button-sm"
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
              <label class="block text-sm font-medium text-gray-700 mb-1"
                >First Name</label
              >
              <InputText v-model="profileForm.firstName" class="w-full" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1"
                >Last Name</label
              >
              <InputText v-model="profileForm.lastName" class="w-full" />
            </div>
            <div class="md:col-span-2">
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Email Address
                <i class="pi pi-envelope" />
              </label>
              <div class="p-input-icon-left w-full">
                <InputText v-model="profileForm.email" class="w-full" />
              </div>
            </div>
            <div class="md:col-span-2">
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Phone
                <i class="pi pi-phone" />
              </label>
              <div class="p-input-icon-left w-full">
                <InputText v-model="profileForm.phone" class="w-full" />
              </div>
            </div>
          </div>
        </div>

        <div
          class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8"
        >
          <h3
            class="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2"
          >
            Change Password
          </h3>
          <p class="text-sm text-gray-500 mb-6">
            Ensure your account is using a long, random password.
          </p>

          <form
            @submit.prevent="updatePassword"
            class="grid grid-cols-1 md:grid-cols-2 gap-6 items-start"
          >
            <div class="md:col-span-2">
              <label class="block text-sm font-medium text-gray-700 mb-1"
                >Current Password</label
              >
              <Password
                v-model="security.currentPassword"
                :feedback="false"
                toggleMask
                class="w-full"
                inputClass="w-full"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1"
                >New Password</label
              >
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
                      Minimum 8 characters
                    </li>
                    <li :class="{ 'text-green-600': hasNumber }">
                      At least one number
                    </li>
                  </ul>
                </template>
              </Password>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1"
                >Confirm Password</label
              >
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
                Passwords do not match
              </small>
            </div>

            <div class="md:col-span-2 flex justify-end">
              <Button
                type="submit"
                label="Update Password"
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
import { ref, onMounted, computed, reactive } from "vue";
import { useToast } from "primevue/usetoast";
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";
import Password from "primevue/password";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Skeleton from "primevue/skeleton";
import InputSwitch from "primevue/inputswitch";

const toast = useToast();
const router = useRouter();
const authStore = useAuthStore();

const isLoadingProfile = ref(true);
const isSavingProfile = ref(false);
const isSavingPassword = ref(false);

// Data Models
const profile = ref<any>({});
const profileForm = reactive({
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
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

// --- Computed Helpers ---
const passwordsMatch = computed(
  () => security.newPassword === security.confirmPassword
);
const hasMinLength = computed(() => security.newPassword.length >= 8);
const hasNumber = computed(() => /\d/.test(security.newPassword));
const isValidSecurityForm = computed(
  () =>
    security.currentPassword &&
    hasMinLength.value &&
    hasNumber.value &&
    passwordsMatch.value
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
    } else {
      throw new Error("Failed to load profile");
    }
  } catch (e) {
    console.error(e);
    toast.add({
      severity: "error",
      summary: "Error",
      detail: "Could not load profile",
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
    summary: "Copied",
    detail: "ID copied to clipboard",
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
        summary: "Updated",
        detail: "Profile information saved",
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
      summary: "Error",
      detail: e.message,
      life: 3000,
    });
  } finally {
    isSavingProfile.value = false;
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
      summary: "Secure",
      detail: "Password updated successfully",
      life: 3000,
    });

    // Clear form
    security.currentPassword = "";
    security.newPassword = "";
    security.confirmPassword = "";
  } catch (e: any) {
    toast.add({
      severity: "error",
      summary: "Error",
      detail: e.message,
      life: 4000,
    });
  } finally {
    isSavingPassword.value = false;
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

onMounted(fetchProfile);
</script>
