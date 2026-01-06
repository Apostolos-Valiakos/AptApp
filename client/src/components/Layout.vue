<template>
  <div
    class="min-h-screen bg-[#fff5f9] dark:bg-[#fff5f9] transition-colors duration-300"
  >
    <nav
      class="sticky top-0 z-50 bg-gradient-to-r from-[#ff93d4] to-[#ff7ec7] shadow-md"
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
                  class="w-7 h-7"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  stroke="#ff7ec7"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path
                    fill="#ff93d4"
                    fill-opacity="0.4"
                    d="M12 12.5C12 12.5 14.5 6 19 7C22 7.7 20.5 12.5 18 13.5C20.5 14.5 21 19 16.5 20.5C13.5 21.5 12 18 12 18"
                  />

                  <path
                    fill="#ff93d4"
                    fill-opacity="0.4"
                    d="M12 12.5C12 12.5 9.5 6 5 7C2 7.7 3.5 12.5 6 13.5C3.5 14.5 3 19 7.5 20.5C10.5 21.5 12 18 12 18"
                  />

                  <path d="M12 8V19" stroke="#ff7ec7" stroke-width="2" />

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
                active-class="bg-white/20 text-white shadow-inner"
                class="px-4 py-2 rounded-xl text-sm font-bold text-pink-50 hover:bg-white/10 hover:text-white transition-all"
              >
                {{ item.label }}
              </router-link>
            </div>
          </div>

          <div class="flex items-center gap-4">
            <div class="hidden md:flex items-center gap-4">
              <router-link
                to="/profile"
                class="text-sm font-bold text-white hover:text-pink-100 transition-colors"
              >
                {{ authStore.user?.username }}
              </router-link>
              <button
                @click="logout"
                class="bg-white text-[#ff93d4] hover:bg-pink-50 px-5 py-2 rounded-xl text-sm font-bold transition-all shadow-sm active:scale-95"
              >
                Logout
              </button>
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
          class="md:hidden bg-[#ff93d4] border-b border-pink-400 shadow-xl"
        >
          <div class="px-4 py-4 space-y-1">
            <router-link
              v-for="item in visibleNavItems"
              :key="item.path"
              :to="item.path"
              class="block px-4 py-3 rounded-xl text-base font-bold text-white hover:bg-white/10"
              @click="mobileMenuOpen = false"
            >
              {{ item.label }}
            </router-link>
            <div class="pt-4 mt-4 border-t border-white/20">
              <button
                @click="logout"
                class="w-full text-left px-4 py-3 rounded-xl text-base font-bold text-white hover:bg-white/10"
              >
                Logout ({{ authStore.user?.username }})
              </button>
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

    <FloatingChat />
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

// Dark mode state kept for system preferences, though toggle is removed
const isDark = ref(false);

const navItems = [
  { label: "Calendar", path: "/scheduler", ownerOnly: false },
  { label: "Staff", path: "/staff", ownerOnly: true },
  { label: "Services", path: "/services", ownerOnly: true },
  { label: "Products", path: "/products", ownerOnly: false },
  { label: "Clients", path: "/clients", ownerOnly: false },
  { label: "Analytics", path: "/financials", ownerOnly: true },
];

const isOwner = computed(() => {
  const role = authStore.user?.role;
  return role === "admin" || role === "super_admin";
});

const visibleNavItems = computed(() => {
  return navItems.filter((item) => !item.ownerOnly || isOwner.value);
});

const isFullWidthPage = computed(() => route.path.includes("/scheduler"));

const logout = () => {
  authStore.logout();
  router.push("/login");
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
/* Global Pink Aesthetic */
::selection {
  background: #ff93d4;
  color: white;
}

::-webkit-scrollbar {
  width: 8px;
}
::-webkit-scrollbar-track {
  background: #fff5f9;
}
::-webkit-scrollbar-thumb {
  background: #ff93d4;
  border-radius: 10px;
}
::-webkit-scrollbar-thumb:hover {
  background: #ff7ec7;
}

.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
</style>
