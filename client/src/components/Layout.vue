<template>
  <div
    class="min-h-screen bg-[var(--p-primary-100)] dark:bg-[var(--p-primary-100)] transition-colors duration-300"
  >
    <nav
      v-if="route.path !== '/'"
      class="sticky top-0 z-50 bg-gradient-to-r from-[var(--p-primary-color)] to-[var(--p-primary-600)] shadow-md"
    >
      <div class="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between h-16">
          <div class="flex items-center min-w-0">
            <div
              class="flex-shrink-0 flex items-center mr-4 lg:mr-6 group cursor-pointer"
              @click="router.push('/')"
            >
              <div
                class="w-9 h-9 bg-white rounded-xl flex items-center justify-center shadow-sm transition-transform group-hover:rotate-12"
              >
                <img src="../../static/logo for photos-02.png" />
              </div>
              <span
                v-if="!authStore.isAuthenticated"
                class="ml-3 text-xl font-extrabold tracking-tight text-white whitespace-nowrap"
              >
                BookFlow
              </span>
            </div>

            <div class="hidden md:flex items-center gap-0.5 min-w-0">
              <router-link
                v-for="item in visibleNavItems"
                :key="item.path"
                :to="item.path"
                active-class="bg-white/25 text-white font-bold shadow-inner"
                class="px-2.5 lg:px-3 py-2 rounded-xl text-sm font-bold text-white/90 hover:bg-white/10 hover:text-white transition-all whitespace-nowrap"
              >
                <i :class="item.icon + ' mr-1 text-xs'"></i>
                {{ item.label }}
              </router-link>
            </div>
          </div>

          <div class="flex items-center gap-2 lg:gap-4 flex-shrink-0">
            <div class="hidden md:flex items-center gap-2 lg:gap-4">
              <button
                @click="toggleLocale"
                class="bg-white/15 hover:bg-white/25 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-all border border-white/20 flex-shrink-0"
                :title="t('nav.language')"
              >
                {{ locale === "el" ? "🇬🇧 EN" : "🇬🇷 EL" }}
              </button>

              <template v-if="authStore.isAuthenticated">
                <router-link
                  to="/app/profile"
                  class="flex items-center gap-2 text-white/90 hover:text-white transition-colors flex-shrink-0"
                  :title="authStore.user?.username"
                >
                  <div
                    class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm bg-[var(--p-primary-100)] text-[var(--p-primary-600)]"
                  >
                    {{ authStore.user?.username?.charAt(0).toUpperCase() }}
                  </div>
                </router-link>
                <button
                  @click="logout"
                  class="bg-white text-[var(--p-primary-color)] hover:bg-[var(--p-primary-50)] px-5 py-2 rounded-xl text-sm font-bold transition-all shadow-sm active:scale-95 flex-shrink-0"
                >
                  {{ t("nav.logout") }}
                </button>
              </template>

              <template v-else>
                <button
                  @click="router.push('/login')"
                  class="bg-white text-[var(--p-primary-color)] hover:bg-[var(--p-primary-50)] px-6 py-2 rounded-xl text-sm font-bold transition-all shadow-sm active:scale-95"
                >
                  {{ t("nav.login") }}
                </button>
              </template>
            </div>

            <button
              @click="mobileMenuOpen = !mobileMenuOpen"
              class="md:hidden p-2 rounded-xl text-white hover:bg-white/10"
            >
              <i
                :class="mobileMenuOpen ? 'pi pi-times' : 'pi pi-bars'"
                class="text-xl"
              ></i>
            </button>
          </div>
        </div>
      </div>

      <transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0 -translate-y-2"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 -translate-y-2"
      >
        <div
          v-if="mobileMenuOpen"
          class="md:hidden bg-[var(--p-primary-color)] border-b border-white/20 shadow-xl"
        >
          <div class="px-4 py-4 space-y-1">
            <router-link
              v-for="item in visibleNavItems"
              :key="item.path"
              :to="item.path"
              class="block px-4 py-3 rounded-xl text-base font-bold text-white hover:bg-white/10"
              @click="mobileMenuOpen = false"
            >
              <i :class="item.icon + ' mr-2 text-sm'"></i>
              {{ item.label }}
            </router-link>

            <div class="pt-4 mt-4 border-t border-white/20 space-y-1">
              <button
                @click="toggleLocale"
                class="w-full text-left px-4 py-3 rounded-xl text-base font-bold text-white hover:bg-white/10"
              >
                {{
                  locale === "el"
                    ? "🇬🇧 Switch to English"
                    : "🇬🇷 Αλλαγή σε Ελληνικά"
                }}
              </button>
              <template v-if="authStore.isAuthenticated">
                <button
                  @click="logout"
                  class="w-full text-left px-4 py-3 rounded-xl text-base font-bold text-white hover:bg-white/10"
                >
                  {{ t("nav.logout") }} ({{ authStore.user?.username }})
                </button>
              </template>
              <template v-else>
                <button
                  @click="
                    router.push('/login');
                    mobileMenuOpen = false;
                  "
                  class="w-full text-left px-4 py-3 rounded-xl text-base font-bold text-white hover:bg-white/10"
                >
                  {{ t("nav.login") }}
                </button>
              </template>
            </div>
          </div>
        </div>
      </transition>
    </nav>

    <div
      v-if="authStore.isImpersonating"
      class="sticky top-16 z-40 bg-amber-500 text-white text-center py-2 text-sm font-bold flex items-center justify-center gap-3"
    >
      <span>{{ t('platform.banner.viewingAs', { shop: authStore.user?.shopName }) }}</span>
      <button @click="handleExitImpersonation" class="underline">
        {{ t('platform.banner.exit') }}
      </button>
    </div>

    <main
      :class="[
        isFullWidthPage
          ? 'w-full'
          : 'max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8',
      ]"
    >
      <router-view />
    </main>

    <FloatingChat v-if="authStore.isAuthenticated && !authStore.isClient" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useAuthStore } from "../stores/auth";
import { useChatStore } from "../stores/chat";
import { useSettingsStore } from "../stores/settings";
import FloatingChat from "../components/FloatingChat.vue";
import { useI18n } from "vue-i18n";

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const chatStore = useChatStore();
const settingsStore = useSettingsStore();
const mobileMenuOpen = ref(false);
const { t, locale } = useI18n();

const isDark = ref(false);

const navItems = computed(() => [
  {
    label: t("nav.calendar"),
    path: "/app/scheduler",
    ownerOnly: false,
    icon: "pi pi-calendar",
  },
  {
    label: t("nav.staff"),
    path: "/app/staff",
    ownerOnly: true,
    icon: "pi pi-users",
  },
  {
    label: t("nav.services"),
    path: "/app/services",
    ownerOnly: true,
    icon: "pi pi-wrench",
  },
  {
    label: t("nav.clients"),
    path: "/app/clients",
    ownerOnly: true,
    icon: "pi pi-address-book",
  },
  {
    label: t("nav.products"),
    path: "/app/products",
    ownerOnly: true,
    icon: "pi pi-box",
  },
  {
    label: t("nav.giftCards"),
    path: "/app/gift-cards",
    ownerOnly: true,
    icon: "pi pi-ticket",
  },
  {
    label: t("nav.analytics"),
    path: "/app/financials",
    ownerOnly: false,
    financialsOnly: true,
    icon: "pi pi-chart-bar",
  },
  {
    label: t("nav.platform"),
    path: "/app/platform/shops",
    ownerOnly: false,
    platformOnly: true,
    icon: "pi pi-building",
  },
  {
    label: t("nav.demoRequests"),
    path: "/app/platform/demo-requests",
    ownerOnly: false,
    platformOnly: true,
    icon: "pi pi-inbox",
  },
  {
    label: t("nav.myPortal"),
    path: "/portal",
    ownerOnly: false,
    adminOnly: false,
    clientOnly: true,
    icon: "pi pi-home",
  },
]);

const toggleLocale = () => {
  const next = locale.value === "el" ? "en" : "el";
  locale.value = next;
  localStorage.setItem("locale", next);
};

const isShopAdmin = computed(() => {
  const role = authStore.user?.role;
  return role === "admin" || role === "super_admin" || role === "frontdesk";
});
const isAnalyticsAllowed = computed(() => authStore.isAnalyticsAllowed);
const isClient = computed(() => authStore.isClient);

const visibleNavItems = computed(() => {
  if (!authStore.isAuthenticated) return [];

  return navItems.value.filter((item) => {
    if (isClient.value) return item.clientOnly;
    if (item.clientOnly) return false;
    if (item.ownerOnly && !isShopAdmin.value) return false;
    if (item.financialsOnly && !isAnalyticsAllowed.value) return false;
    if (item.platformOnly && !authStore.isOwner) return false;

    return true;
  });
});

const isFullWidthPage = computed(() => route.path.includes("/app/scheduler"));

const logout = () => {
  authStore.logout();
  router.push("/");
  mobileMenuOpen.value = false;
};

const handleExitImpersonation = () => {
  authStore.exitImpersonation();
  router.push("/app/platform/shops");
};

// --- Ctrl+1: hide cash/gift-card revenue (global — works on any authenticated page) ---
const isSuperAdmin = computed(() => authStore.user?.role === "super_admin");

const handleKeydown = (e: KeyboardEvent) => {
  // Cash/card revenue-hiding macros disabled.
  // if (e.ctrlKey && e.key === "1") {
  //   e.preventDefault();
  //   // Only super_admin can override a remotely locked filter
  //   if (!isSuperAdmin.value && chatStore.cashLocked) return;
  //   settingsStore.toggleHideCashPaid();
  //   // Only super_admin broadcasts the new state to all connected clients
  //   if (isSuperAdmin.value) {
  //     chatStore.socket?.emit("cash:filter:broadcast", {
  //       hidden: settingsStore.hideCashPaid,
  //     });
  //   }
  // } else if (e.ctrlKey && e.key === "8") {
  //   e.preventDefault();
  //   // Independent lock/broadcast for card, mirrors the cash macro exactly
  //   if (!isSuperAdmin.value && chatStore.cardLocked) return;
  //   settingsStore.toggleHideCardPaid();
  //   if (isSuperAdmin.value) {
  //     chatStore.socket?.emit("card:filter:broadcast", {
  //       hidden: settingsStore.hideCardPaid,
  //     });
  //   }
  // }
};

// Sync when a remote push arrives
watch(
  () => chatStore.remoteHideCash,
  (val) => {
    settingsStore.setHideCashPaid(val);
  },
);
watch(
  () => chatStore.remoteHideCard,
  (val) => {
    settingsStore.setHideCardPaid(val);
  },
);

onMounted(() => {
  // Respect system or previously stored dark theme
  const storedTheme = localStorage.getItem("theme");
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  isDark.value = storedTheme === "dark" || (!storedTheme && systemDark);
  document.documentElement.classList.toggle("dark", isDark.value);

  window.addEventListener("keydown", handleKeydown);
  if (authStore.isAuthenticated && !authStore.isClient) {
    const token = localStorage.getItem("token");
    if (token) chatStore.connect(token);
  }
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeydown);
});
</script>

<style>
::selection {
  background: var(--p-primary-color);
  color: white;
}

::-webkit-scrollbar {
  width: 8px;
}
::-webkit-scrollbar-track {
  background: var(--p-primary-50);
}
::-webkit-scrollbar-thumb {
  background: var(
    --p-primary-300
  ); /* Slightly lighter than main for scrollbar */
  border-radius: 10px;
}
::-webkit-scrollbar-thumb:hover {
  background: var(--p-primary-color);
}

.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
</style>
