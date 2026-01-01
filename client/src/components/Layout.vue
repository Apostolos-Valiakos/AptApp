<template>
  <div
    class="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-300"
  >
    <nav
      class="bg-white dark:bg-gray-800 shadow-lg border-b border-gray-200 dark:border-gray-700 z-20 relative"
    >
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between h-16">
          <div class="flex">
            <div class="flex-shrink-0 flex items-center mr-4">
              <span
                class="text-xl font-bold text-indigo-600 dark:text-indigo-400"
              >
                Booking System
              </span>
            </div>

            <div class="hidden md:flex space-x-8">
              <router-link
                to="/scheduler"
                active-class="border-indigo-600 text-gray-900 dark:text-white"
                class="inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-300 dark:hover:text-white transition-colors"
              >
                Calendar
              </router-link>

              <router-link
                v-if="isOwner"
                to="/staff"
                active-class="border-indigo-600 text-gray-900 dark:text-white"
                class="inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-300 dark:hover:text-white transition-colors"
              >
                Staff
              </router-link>

              <router-link
                v-if="isOwner"
                to="/services"
                active-class="border-indigo-600 text-gray-900 dark:text-white"
                class="inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-300 dark:hover:text-white transition-colors"
              >
                Services
              </router-link>

              <router-link
                to="/products"
                active-class="border-indigo-600 text-gray-900 dark:text-white"
                class="inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-300 dark:hover:text-white transition-colors"
              >
                Products
              </router-link>

              <router-link
                to="/clients"
                active-class="border-indigo-600 text-gray-900 dark:text-white"
                class="inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-300 dark:hover:text-white transition-colors"
              >
                Clients
              </router-link>

              <router-link
                v-if="isOwner"
                to="/financials"
                active-class="border-indigo-600 text-gray-900 dark:text-white"
                class="inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-300 dark:hover:text-white transition-colors"
              >
                Analytics
              </router-link>
            </div>
          </div>

          <div class="flex items-center gap-4">
            <button
              @click="toggleTheme"
              class="p-2 rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 focus:outline-none transition-colors"
              title="Toggle Theme"
            ></button>

            <div class="hidden md:flex items-center">
              <span
                class="text-sm text-gray-700 dark:text-gray-300 mr-4 font-medium"
              >
                <a href="/profile">
                  {{ authStore.user?.username }}
                </a>
              </span>
              <button
                @click="logout"
                class="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors shadow-sm"
              >
                Logout
              </button>
            </div>

            <div class="flex items-center md:hidden">
              <button
                @click="mobileMenuOpen = !mobileMenuOpen"
                class="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
              >
                <i
                  class="pi"
                  :class="mobileMenuOpen ? 'pi-times' : 'pi-bars'"
                  style="font-size: 1.5rem"
                ></i>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="mobileMenuOpen"
        class="md:hidden bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700"
      >
        <div class="pt-2 pb-3 space-y-1 px-4">
          <router-link
            to="/scheduler"
            class="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-700"
            @click="mobileMenuOpen = false"
          >
            Calendar
          </router-link>

          <router-link
            v-if="isOwner"
            to="/staff"
            class="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-700"
            @click="mobileMenuOpen = false"
          >
            Staff
          </router-link>

          <router-link
            v-if="isOwner"
            to="/services"
            class="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-700"
            @click="mobileMenuOpen = false"
          >
            Services
          </router-link>

          <router-link
            to="/products"
            class="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-700"
            @click="mobileMenuOpen = false"
          >
            Products
          </router-link>

          <router-link
            to="/clients"
            class="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-700"
            @click="mobileMenuOpen = false"
          >
            Clients
          </router-link>

          <router-link
            v-if="isOwner"
            to="/financials"
            class="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-700"
            @click="mobileMenuOpen = false"
          >
            Analytics
          </router-link>

          <div class="border-t border-gray-200 dark:border-gray-700 pt-4 mt-2">
            <div class="flex items-center px-3 mb-3">
              <div class="text-base font-medium text-gray-800 dark:text-white">
                <a href="/profile">
                  {{ authStore.user?.username }}
                </a>
              </div>
            </div>
            <button
              @click="logout"
              class="block w-full text-left px-3 py-2 rounded-md text-base font-medium text-red-600 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </nav>

    <main
      :class="
        isFullWidthPage
          ? 'w-full'
          : 'max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8'
      "
    >
      <router-view />
      <FloatingChat />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useAuthStore } from "../stores/auth";
import FloatingChat from "../components/FloatingChat.vue";

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const mobileMenuOpen = ref(false);

// Check if user is Admin or Manager
const isOwner = computed(() => {
  const role = authStore.user?.role;
  return role === "admin" || role === "super_admin";
});

// FIX: Determine if current page should be 100% width (Calendar)
const isFullWidthPage = computed(() => {
  return route.path.includes("/scheduler");
});

const logout = () => {
  authStore.logout();
  router.push("/login");
  mobileMenuOpen.value = false;
};

const isDark = ref(false);

const toggleTheme = () => {
  isDark.value = !isDark.value;
  if (isDark.value) {
    document.documentElement.classList.add("dark");
    localStorage.setItem("theme", "dark");
  } else {
    document.documentElement.classList.remove("dark");
    localStorage.setItem("theme", "light");
  }
};

onMounted(() => {
  const storedTheme = localStorage.getItem("theme");
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

  if (storedTheme === "dark" || (!storedTheme && systemDark)) {
    isDark.value = true;
    document.documentElement.classList.add("dark");
  } else {
    isDark.value = false;
    document.documentElement.classList.remove("dark");
  }
});
</script>
