<template>
  <div class="max-w-5xl mx-auto p-6">
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-gray-900">My Profile</h1>
      <p class="text-gray-500">Manage your account settings and preferences.</p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
      <!-- LEFT COL: User Info Card -->
      <div class="md:col-span-1">
        <div
          class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
        >
          <div
            class="h-24 bg-gradient-to-r from-indigo-500 to-purple-600"
          ></div>
          <div class="px-6 relative">
            <div
              class="w-20 h-20 bg-white rounded-full border-4 border-white shadow-md absolute -top-10 flex items-center justify-center text-3xl font-bold text-indigo-600"
            >
              {{ profile.username.charAt(0).toUpperCase() }}
            </div>
          </div>

          <div class="pt-12 pb-6 px-6">
            <h2 class="text-xl font-bold text-gray-900">
              {{ profile.username }}
            </h2>
            <div
              class="text-sm text-gray-500 font-medium uppercase tracking-wider mb-4"
            >
              {{ profile.role }}
            </div>

            <div class="space-y-3">
              <div class="flex items-center text-gray-600 text-sm">
                <i class="pi pi-building mr-3 text-gray-400"></i>
                <span>{{ profile.shop_name || "No Shop Assigned" }}</span>
              </div>
              <div class="flex items-center text-gray-600 text-sm">
                <i class="pi pi-id-card mr-3 text-gray-400"></i>
                <span>ID: {{ profile.id?.substring(0, 8) }}...</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- RIGHT COL: Actions -->
      <div class="md:col-span-2 space-y-6">
        <!-- Change Password Section -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3
            class="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2"
          >
            <i class="pi pi-lock text-indigo-600"></i> Security
          </h3>
          <p class="text-sm text-gray-500 mb-6">
            Ensure your account is using a long, random password to stay secure.
          </p>

          <form @submit.prevent="updatePassword" class="space-y-4 max-w-md">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1"
                >Current Password</label
              >
              <Password
                v-model="security.currentPassword"
                :feedback="false"
                toggleMask
                class="w-full"
                inputClass="w-full"
                placeholder="••••••••"
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
                placeholder="••••••••"
              >
                <template #header>
                  <div class="font-semibold text-xs mb-2">Pick a password</div>
                </template>
                <template #footer>
                  <div class="divider mt-2"></div>
                  <ul
                    class="pl-2 ml-2 mt-0 text-xs text-gray-500"
                    style="line-height: 1.5"
                  >
                    <li>At least one lowercase</li>
                    <li>At least one uppercase</li>
                    <li>At least one numeric</li>
                    <li>Minimum 8 characters</li>
                  </ul>
                </template>
              </Password>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1"
                >Confirm New Password</label
              >
              <Password
                v-model="security.confirmPassword"
                :feedback="false"
                toggleMask
                class="w-full"
                inputClass="w-full"
                placeholder="••••••••"
                :class="{
                  'p-invalid': !passwordsMatch && security.confirmPassword,
                }"
              />
              <small
                v-if="!passwordsMatch && security.confirmPassword"
                class="text-red-500"
                >Passwords do not match</small
              >
            </div>

            <div class="pt-2">
              <Button
                type="submit"
                label="Update Password"
                icon="pi pi-check"
                :loading="loading"
                class="p-button-primary"
                :disabled="!isValidForm"
              />
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useToast } from "primevue/usetoast";
import Password from "primevue/password";
import Button from "primevue/button";

const toast = useToast();
const loading = ref(false);

const profile = ref({
  id: "",
  username: "",
  role: "",
  shop_name: "",
});

const security = ref({
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
});

// Computed Validation
const passwordsMatch = computed(() => {
  return security.value.newPassword === security.value.confirmPassword;
});

const isValidForm = computed(() => {
  return (
    security.value.currentPassword &&
    security.value.newPassword &&
    passwordsMatch.value &&
    security.value.newPassword.length >= 4
  );
});

// Fetch Profile Data
const fetchProfile = async () => {
  const token = localStorage.getItem("token");
  try {
    const res = await fetch("/api/v1/profile", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      profile.value = await res.json();
    }
  } catch (e) {
    console.error("Failed to load profile");
  }
};

// Update Password
const updatePassword = async () => {
  if (!isValidForm.value) return;

  loading.value = true;
  const token = localStorage.getItem("token");

  try {
    const res = await fetch("/api/v1/profile/password", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        currentPassword: security.value.currentPassword,
        newPassword: security.value.newPassword,
      }),
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data.error || "Failed to update");

    toast.add({
      severity: "success",
      summary: "Success",
      detail: "Password updated successfully",
      life: 3000,
    });

    // Clear form
    security.value = {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    };
  } catch (e: any) {
    toast.add({
      severity: "error",
      summary: "Error",
      detail: e.message,
      life: 4000,
    });
  } finally {
    loading.value = false;
  }
};

onMounted(fetchProfile);
</script>
