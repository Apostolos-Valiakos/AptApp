<template>
  <div
    class="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-300"
  >
    <nav
      class="bg-white dark:bg-gray-800 shadow-lg border-b border-gray-200 dark:border-gray-700"
    >
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between h-16">
          <!-- Navigation Links -->
          <div class="flex space-x-8">
            <div class="flex-shrink-0 flex items-center mr-4">
              <span
                class="text-xl font-bold text-indigo-600 dark:text-indigo-400"
              >
                Booking System
              </span>
            </div>

            <!-- 1. Calendar (Visible to ALL) -->
            <router-link
              to="/scheduler"
              active-class="border-indigo-600 text-gray-900 dark:text-white"
              class="inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-300 dark:hover:text-white transition-colors"
            >
              Calendar
            </router-link>

            <!-- 2. Staff Management (Shop Owner ONLY) -->
            <router-link
              v-if="isOwner"
              to="/staff"
              active-class="border-indigo-600 text-gray-900 dark:text-white"
              class="inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-300 dark:hover:text-white transition-colors"
            >
              Staff
            </router-link>

            <!-- 3. Clients (Visible to ALL - Staff need this to book & edit) -->
            <router-link
              to="/clients"
              active-class="border-indigo-600 text-gray-900 dark:text-white"
              class="inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-300 dark:hover:text-white transition-colors"
            >
              Clients
            </router-link>

            <!-- 4. Services Configuration (Visible to ALL - Staff need to see details) -->
            <!-- Changed: Now visible to everyone so staff can check prices/durations or edit if allowed -->
            <router-link
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

            <!-- 5. Financial Reports (Shop Owner ONLY) -->
            <router-link
              v-if="isOwner"
              to="/financials"
              active-class="border-indigo-600 text-gray-900 dark:text-white"
              class="inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-300 dark:hover:text-white transition-colors"
            >
              Reports
            </router-link>

            <!-- 6. Profile (Visible to ALL) -->
            <router-link
              to="/profile"
              active-class="border-indigo-600 text-gray-900 dark:text-white"
              class="inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-300 dark:hover:text-white transition-colors"
            >
              Profile
            </router-link>
          </div>

          <!-- Right Side: Toggle & Logout -->
          <div class="flex items-center space-x-4">
            <button
              @click="logout"
              class="text-sm font-medium text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </nav>

    <!-- CRITICAL: This is where your pages load -->
    <main class="mx-auto py-6 sm:px-6 lg:px-8">
      <router-view />
      <FloatingChat />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";
import FloatingChat from "../components/FloatingChat.vue";

const router = useRouter();
const authStore = useAuthStore();

// Check if user is Admin or Manager (Not standard Staff)
const isOwner = computed(() => {
  const role = authStore.user?.role;
  console.log(authStore.user);
  return role === "admin" || role === "super_admin";
});

const logout = () => {
  authStore.logout();
  router.push("/login");
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
  // Check local storage or system preference on load
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
<style scoped>
.layout-container {
  min-height: 100vh;
  position: relative;
}
</style>
