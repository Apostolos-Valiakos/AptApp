<template>
  <div
    class="min-h-screen flex items-center justify-center bg-gradient-to-br from-[var(--p-primary-50)] via-white to-[var(--p-primary-100)]"
  >
    <div class="max-w-md w-full bg-white rounded-2xl shadow-xl border border-gray-100 p-10">
      <!-- Logo + Brand -->
      <div class="text-center mb-8">
        <div
          class="w-14 h-14 bg-[var(--p-primary-100)] rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm"
        >
          <svg
            viewBox="0 0 24 24"
            class="w-8 h-8 stroke-[var(--p-primary-600)]"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path
              class="fill-[var(--p-primary-color)]"
              fill-opacity="0.4"
              d="M12 12.5C12 12.5 14.5 6 19 7C22 7.7 20.5 12.5 18 13.5C20.5 14.5 21 19 16.5 20.5C13.5 21.5 12 18 12 18"
            />
            <path
              class="fill-[var(--p-primary-color)]"
              fill-opacity="0.4"
              d="M12 12.5C12 12.5 9.5 6 5 7C2 7.7 3.5 12.5 6 13.5C3.5 14.5 3 19 7.5 20.5C10.5 21.5 12 18 12 18"
            />
            <path d="M12 8V19" stroke-width="2" />
            <path d="M12 8C12 8 10.5 3 8 4" />
            <path d="M12 8C12 8 13.5 3 16 4" />
          </svg>
        </div>
        <h1 class="text-2xl font-bold text-gray-900">Petalouda Booking</h1>
        <p class="text-gray-500 mt-1 text-sm">{{ t('login.subtitle') }}</p>
      </div>

      <!-- Form -->
      <form @submit.prevent="login" class="space-y-5">
        <!-- Username -->
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">{{ t('login.username') }}</label>
          <InputText
            v-model="username"
            type="text"
            required
            placeholder="admin"
            class="w-full"
          />
        </div>

        <!-- Password -->
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">{{ t('login.password') }}</label>
          <div class="relative">
            <InputText
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              required
              placeholder="••••••••"
              class="w-full pr-10"
            />
            <button
              type="button"
              tabindex="-1"
              class="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
              @click="showPassword = !showPassword"
            >
              <i :class="showPassword ? 'pi pi-eye-slash' : 'pi pi-eye'" class="text-sm"></i>
            </button>
          </div>
        </div>

        <!-- Submit -->
        <Button
          type="submit"
          :label="t('login.signIn')"
          icon="pi pi-sign-in"
          :loading="loading"
          class="w-full mt-2"
        />
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { useAuthStore } from "../stores/auth";
import { useRouter } from "vue-router";
import { useThemeStore } from "../stores/themes";
import { useToast } from "primevue/usetoast";

const { t } = useI18n();

const username = ref("");
const password = ref("");
const loading = ref(false);
const showPassword = ref(false);
const authStore = useAuthStore();
const router = useRouter();
const themeStore = useThemeStore();
const toast = useToast();

const login = async () => {
  loading.value = true;
  try {
    const result = await authStore.login(username.value, password.value);

    if (authStore.isAuthenticated) {
      await themeStore.fetchAndApplyTheme();

      if (authStore.user?.role === "client") {
        router.push("/portal");
      } else {
        router.push("/app/scheduler");
      }
    } else {
      toast.add({ severity: "error", summary: t('login.loginFailed'), detail: result.error || t('login.invalidCredentials'), life: 4000 });
    }
  } finally {
    loading.value = false;
  }
};
</script>
