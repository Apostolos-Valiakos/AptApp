<template>
  <!-- Styled like the public home page (landing/): its colours, the PURE
       wordmark and the serif heading font, without the app's top bar. -->
  <div class="pure-login">
    <a :href="homeUrl" class="pure-login-back">
      <i class="pi pi-arrow-left text-xs"></i>
      {{ t("login.backHome") }}
    </a>

    <div class="pure-login-card">
      <a :href="homeUrl" class="pure-login-logo" aria-label="Pure Massage & Spa Experience"></a>
      <h1 class="pure-login-title">{{ t("login.welcome") }}</h1>
      <p class="pure-login-subtitle">{{ t("login.subtitle") }}</p>

      <form @submit.prevent="login" class="space-y-5">
        <div class="flex flex-col gap-1.5">
          <label class="pure-login-label">{{ t("login.username") }}</label>
          <InputText v-model="username" type="text" required autocomplete="username" class="w-full pure-login-input" />
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="pure-login-label">{{ t("login.password") }}</label>
          <div class="relative">
            <InputText
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              required
              autocomplete="current-password"
              placeholder="••••••••"
              class="w-full pr-10 pure-login-input"
            />
            <button
              type="button"
              tabindex="-1"
              class="absolute inset-y-0 right-0 px-3 flex items-center text-[#8f7462] hover:text-[#2a211b] transition-colors"
              @click="showPassword = !showPassword"
            >
              <i :class="showPassword ? 'pi pi-eye-slash' : 'pi pi-eye'" class="text-sm"></i>
            </button>
          </div>
        </div>

        <button type="submit" class="pure-login-submit" :disabled="loading">
          <i v-if="loading" class="pi pi-spin pi-spinner text-sm"></i>
          {{ t("login.signIn") }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import "@fontsource/noto-serif-display/300.css";
import { useI18n } from "vue-i18n";
import { useAuthStore } from "../stores/auth";
import { useRoute, useRouter } from "vue-router";
import { useThemeStore } from "../stores/themes";
import { useToast } from "primevue/usetoast";

const { t, locale } = useI18n();

// Why a login was refused (the server's or the store's code), in the app's language.
const LOGIN_ERRORS: Record<string, string> = {
  invalid_credentials: "login.invalidCredentials",
  shop_inactive: "login.errors.shopInactive",
  account_deactivated: "login.errors.accountDeactivated",
  too_many_attempts: "login.errors.tooManyAttempts",
  network: "login.errors.network",
};

const username = ref("");
const password = ref("");
const loading = ref(false);
const showPassword = ref(false);
const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();
const themeStore = useThemeStore();
const toast = useToast();

// Sent here after the server refused an expired or revoked session
// (see utils/sessionRecovery.ts).
// Back to the public home page (its own server in development).
const homeUrl = (import.meta.env.VITE_LANDING_URL as string | undefined) || "/";

// Open in the language the visitor picked on the home page: passed as ?lang=
// (different ports in development) or read from the page's own setting
// (same address in production).
const applyHomePageLanguage = () => {
  let lang = typeof route.query.lang === "string" ? route.query.lang : null;
  if (!lang) {
    try {
      lang = localStorage.getItem("pure-lang");
    } catch {
      lang = null;
    }
  }
  if (lang === "el" || lang === "en") {
    locale.value = lang;
    try {
      localStorage.setItem("locale", lang);
    } catch {
      // keep it for this visit only
    }
  }
};

onMounted(() => {
  applyHomePageLanguage();
  if (route.query.expired) {
    toast.add({ severity: "warn", summary: t("login.sessionExpired"), life: 6000 });
  }
  if (route.query.expired || route.query.lang) router.replace({ path: "/login" });
});

const login = async () => {
  loading.value = true;
  try {
    const result = await authStore.login(username.value, password.value);

    if (authStore.isAuthenticated) {
      await themeStore.fetchAndApplyTheme();

      if (authStore.user?.role === "client") {
        router.push("/portal");
      } else if (authStore.isOwner) {
        router.push("/app/platform/shops");
      } else {
        router.push("/app/scheduler");
      }
    } else {
      toast.add({ severity: "error", summary: t('login.loginFailed'), detail: t(LOGIN_ERRORS[result.code] || "login.errors.unknown"), life: 4000 });
    }
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.pure-login {
  --pure-bg: #f6f1ea;
  --pure-card: #fffdf9;
  --pure-line: #eadfd2;
  --pure-ink: #2a211b;
  --pure-muted: #8f7462;
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4.5rem 16px 2rem;
  background: var(--pure-bg);
  color: var(--pure-ink);
  position: relative;
}
.pure-login-back {
  position: absolute;
  top: 1.25rem;
  left: 1.25rem;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 1.1rem;
  border-radius: 999px;
  background: var(--pure-line);
  color: var(--pure-ink);
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  text-decoration: none;
  transition: background-color 0.3s;
}
.pure-login-back:hover {
  background: #e0d2c2;
}
.pure-login-card {
  width: 100%;
  max-width: 26rem;
  background: var(--pure-card);
  border: 1px solid var(--pure-line);
  border-radius: 1.5rem;
  padding: 2.5rem 2rem;
  box-shadow: 0 20px 50px -30px rgba(42, 33, 27, 0.35);
}
.pure-login-logo {
  display: block;
  width: 7.5rem;
  aspect-ratio: 600 / 209;
  margin: 0 auto 1.75rem;
  background-color: var(--pure-ink);
  -webkit-mask: url("../assets/brand/pure-word.png") center / contain no-repeat;
  mask: url("../assets/brand/pure-word.png") center / contain no-repeat;
}
.pure-login-title {
  font-family: "Noto Serif Display", Georgia, serif;
  font-weight: 300;
  font-size: 2rem;
  line-height: 1.15;
  text-align: center;
}
.pure-login-subtitle {
  margin: 0.5rem 0 2rem;
  text-align: center;
  font-size: 0.9rem;
  color: var(--pure-muted);
}
.pure-login-label {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--pure-muted);
}
.pure-login :deep(.pure-login-input) {
  background: var(--pure-bg);
  border-color: var(--pure-line);
  color: var(--pure-ink);
  border-radius: 0.75rem;
  padding-top: 0.7rem;
  padding-bottom: 0.7rem;
}
.pure-login :deep(.pure-login-input:enabled:focus) {
  border-color: var(--pure-muted);
  box-shadow: 0 0 0 3px rgba(143, 116, 98, 0.18);
}
.pure-login-submit {
  width: 100%;
  margin-top: 0.75rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  height: 3.1rem;
  border-radius: 999px;
  background: var(--pure-ink);
  color: var(--pure-card);
  font-size: 0.85rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  transition: background-color 0.3s, opacity 0.3s;
}
.pure-login-submit:hover:not(:disabled) {
  background: #3d3028;
}
.pure-login-submit:disabled {
  opacity: 0.7;
}
</style>
