<template>
  <div
    class="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8"
  >
    <div class="max-w-md w-full space-y-8 bg-white p-8 rounded-xl shadow-lg">
      <div v-if="!tokenError">
        <div class="text-center mb-8">
          <h2 class="text-3xl font-extrabold text-gray-900">Complete Setup</h2>
          <p class="mt-2 text-sm text-gray-600">
            Set a password to access your portal
          </p>
        </div>

        <form class="space-y-6" @submit.prevent="handleSignup">
          <div>
            <label class="block text-sm font-medium text-gray-700"
              >Password</label
            >
            <Password
              v-model="password"
              toggleMask
              class="w-full mt-1"
              inputClass="w-full"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700"
              >Confirm Password</label
            >
            <Password
              v-model="confirmPassword"
              :feedback="false"
              toggleMask
              class="w-full mt-1"
              inputClass="w-full"
            />
            <small
              v-if="password !== confirmPassword && confirmPassword"
              class="text-red-500"
              >Passwords do not match.</small
            >
          </div>
          <Button
            type="submit"
            label="Create Account"
            class="w-full"
            :loading="loading"
            :disabled="!isFormValid"
          />
        </form>
      </div>

      <div v-else class="text-center">
        <i class="pi pi-times-circle text-red-500 text-5xl mb-4"></i>
        <h3 class="text-xl font-bold text-gray-900">Invalid Link</h3>
        <p class="text-gray-600 mt-2">
          This invitation link is invalid or has expired.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "primevue/usetoast";
import Password from "primevue/password";
import Button from "primevue/button";

const route = useRoute();
const router = useRouter();
const toast = useToast();

const password = ref("");
const confirmPassword = ref("");
const loading = ref(false);
const tokenError = ref(false);
const token = route.query.token as string;

const isFormValid = computed(
  () => password.value.length >= 6 && password.value === confirmPassword.value,
);

onMounted(() => {
  if (!token) tokenError.value = true;
});

const handleSignup = async () => {
  loading.value = true;
  try {
    const res = await fetch("/api/v1/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password: password.value }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to create account");

    toast.add({
      severity: "success",
      summary: "Account Created",
      detail: "You can now log in!",
      life: 3000,
    });
    router.push("/login");
  } catch (err: any) {
    toast.add({
      severity: "error",
      summary: "Error",
      detail: err.message,
      life: 3000,
    });
  } finally {
    loading.value = false;
  }
};
</script>
