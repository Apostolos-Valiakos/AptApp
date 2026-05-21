<template>
  <div
    class="min-h-screen bg-[var(--p-primary-100)] dark:bg-[var(--p-primary-100)] transition-colors duration-300"
  >
    <nav
      class="sticky top-0 z-50 bg-gradient-to-r from-[var(--p-primary-color)] to-[var(--p-primary-600)] shadow-md"
    >
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between h-16">
          <div class="flex items-center">
            <div
              class="flex-shrink-0 flex items-center mr-8 group cursor-pointer"
              @click="router.push('/')"
            >
              <div
                class="w-9 h-9 bg-white rounded-xl flex items-center justify-center shadow-sm transition-transform group-hover:rotate-12"
              >
                <svg
                  viewBox="0 0 24 24"
                  class="w-7 h-7 stroke-[var(--p-primary-600)]"
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
              <span
                class="ml-3 text-xl font-extrabold tracking-tight text-white"
              >
                Petalouda Booking
              </span>
            </div>

            <div class="hidden md:flex items-center space-x-1">
              <router-link
                v-for="item in visibleNavItems"
                :key="item.path"
                :to="item.path"
                active-class="bg-white/25 text-white font-bold shadow-inner"
                class="px-4 py-2 rounded-xl text-sm font-bold text-white/90 hover:bg-white/10 hover:text-white transition-all"
              >
                <i :class="item.icon + ' mr-1.5 text-xs'"></i>
                {{ item.label }}
              </router-link>
            </div>
          </div>

          <div class="flex items-center gap-4">
            <div class="hidden md:flex items-center gap-4">
              <button
                @click="toggleLocale"
                class="bg-white/15 hover:bg-white/25 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-all border border-white/20"
                :title="t('nav.language')"
              >
                {{ locale === 'el' ? '🇬🇧 EN' : '🇬🇷 EL' }}
              </button>

              <template v-if="authStore.isAuthenticated">
                <router-link
                  to="/app/profile"
                  class="flex items-center gap-2 text-white/90 hover:text-white transition-colors"
                >
                  <div
                    class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm bg-[var(--p-primary-100)] text-[var(--p-primary-600)]"
                  >
                    {{ authStore.user?.username?.charAt(0).toUpperCase() }}
                  </div>
                  <span class="text-sm font-bold">{{ authStore.user?.username }}</span>
                </router-link>
                <button
                  @click="logout"
                  class="bg-white text-[var(--p-primary-color)] hover:bg-[var(--p-primary-50)] px-5 py-2 rounded-xl text-sm font-bold transition-all shadow-sm active:scale-95"
                >
                  {{ t('nav.logout') }}
                </button>
              </template>

              <template v-else>
                <button
                  @click="router.push('/login')"
                  class="bg-white text-[var(--p-primary-color)] hover:bg-[var(--p-primary-50)] px-6 py-2 rounded-xl text-sm font-bold transition-all shadow-sm active:scale-95"
                >
                  {{ t('nav.login') }}
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
                {{ locale === 'el' ? '🇬🇧 Switch to English' : '🇬🇷 Αλλαγή σε Ελληνικά' }}
              </button>
              <template v-if="authStore.isAuthenticated">
                <button
                  @click="logout"
                  class="w-full text-left px-4 py-3 rounded-xl text-base font-bold text-white hover:bg-white/10"
                >
                  {{ t('nav.logout') }} ({{ authStore.user?.username }})
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
                  {{ t('nav.login') }}
                </button>
              </template>
            </div>
          </div>
        </div>
      </transition>
    </nav>

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
import { ref, onMounted, computed } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useAuthStore } from "../stores/auth";
import FloatingChat from "../components/FloatingChat.vue";
import { useI18n } from "vue-i18n";

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const mobileMenuOpen = ref(false);
const { t, locale } = useI18n();

const isDark = ref(false);

const navItems = computed(() => [
  { label: t('nav.calendar'), path: "/app/scheduler", ownerOnly: false, icon: "pi pi-calendar" },
  { label: t('nav.staff'), path: "/app/staff", ownerOnly: true, icon: "pi pi-users" },
  { label: t('nav.services'), path: "/app/services", ownerOnly: true, icon: "pi pi-wrench" },
  { label: t('nav.clients'), path: "/app/clients", ownerOnly: false, icon: "pi pi-address-book" },
  { label: t('nav.analytics'), path: "/app/financials", ownerOnly: true, icon: "pi pi-chart-bar" },
  {
    label: t('nav.myPortal'),
    path: "/portal",
    ownerOnly: false,
    adminOnly: false,
    clientOnly: true,
    icon: "pi pi-home",
  },
]);

const toggleLocale = () => {
  const next = locale.value === 'el' ? 'en' : 'el';
  locale.value = next;
  localStorage.setItem('locale', next);
};

const isOwner = computed(() => {
  const role = authStore.user?.role;
  return role === "admin" || role === "super_admin";
});
const isClient = computed(() => authStore.isClient);

const visibleNavItems = computed(() => {
  if (!authStore.isAuthenticated) return [];

  return navItems.value.filter((item) => {
    if (isClient.value) return item.clientOnly;
    if (item.clientOnly) return false;
    if (item.ownerOnly && !isOwner.value) return false;

    return true;
  });
});

const isFullWidthPage = computed(() => route.path.includes("/app/scheduler"));

const logout = () => {
  authStore.logout();
  router.push("/");
  mobileMenuOpen.value = false;
};

onMounted(() => {
  // Respect system or previously stored dark theme
  const storedTheme = localStorage.getItem("theme");
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  isDark.value = storedTheme === "dark" || (!storedTheme && systemDark);
  document.documentElement.classList.toggle("dark", isDark.value);
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
