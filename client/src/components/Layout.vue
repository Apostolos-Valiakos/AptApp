<template>
  <div
    class="min-h-screen bg-[var(--p-primary-100)] dark:bg-[var(--p-primary-100)] transition-colors duration-300"
  >
    <nav
      class="sticky top-0 z-50 bg-gradient-to-r from-[var(--p-primary-color)] to-[var(--p-primary-600)] shadow-md"
    >
      <div class="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between h-12">
          <div class="flex items-center min-w-0 flex-1">
            <div
              class="flex-shrink-0 flex items-center mr-3 lg:mr-5 group cursor-pointer"
              @click="router.push('/')"
            >
              <div
                class="w-7 h-7 bg-white rounded-lg flex items-center justify-center shadow-sm transition-transform group-hover:rotate-12"
              >
                <img src="../../static/logo for photos-02.png" />
              </div>
              <span
                v-if="!authStore.isAuthenticated"
                class="ml-3 text-xl font-extrabold tracking-tight text-white whitespace-nowrap"
              >
                Pure Spa &amp; Massage Experience
              </span>
            </div>

            <!-- Links shrink step by step to fit (see fitNavLinks), so they
                 never slide under the buttons on the right. -->
            <div
              ref="navLinksEl"
              class="hidden md:flex items-center gap-0.5 min-w-0 flex-1 overflow-hidden mr-2"
            >
              <router-link
                v-for="item in visibleNavItems"
                :key="item.path"
                :to="item.path"
                :title="navDensity.iconOnly ? item.label : undefined"
                active-class="bg-white/25 text-white font-bold shadow-inner"
                class="py-1 rounded-lg font-bold text-white/90 hover:bg-white/10 hover:text-white transition-colors whitespace-nowrap flex-shrink-0"
                :class="navDensity.link"
              >
                <i
                  v-if="navDensity.icon"
                  :class="[item.icon, navDensity.iconOnly ? 'text-sm' : 'mr-1 text-xs']"
                ></i>
                <template v-if="!navDensity.iconOnly">{{ item.label }}</template>
              </router-link>
            </div>
          </div>

          <div class="flex items-center gap-2 lg:gap-4 flex-shrink-0">
            <div class="hidden md:flex items-center gap-2 lg:gap-4">
              <button
                @click="toggleLocale"
                class="bg-white/15 hover:bg-white/25 text-white px-2.5 py-1 rounded-lg text-xs font-bold transition-all border border-white/20 flex-shrink-0"
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
                    class="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs bg-[var(--p-primary-100)] text-[var(--p-primary-600)]"
                  >
                    {{ authStore.user?.username?.charAt(0).toUpperCase() }}
                  </div>
                </router-link>
                <button
                  @click="logout"
                  data-testid="logout"
                  class="bg-white text-[var(--p-primary-color)] hover:bg-[var(--p-primary-50)] px-4 py-1 rounded-lg text-sm font-bold transition-all shadow-sm active:scale-95 flex-shrink-0"
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
              class="md:hidden p-1.5 rounded-lg text-white hover:bg-white/10"
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
      class="sticky top-12 z-40 bg-amber-500 text-white text-center py-2 text-sm font-bold flex items-center justify-center gap-3"
    >
      <span>{{ t('platform.banner.viewingAs', { shop: authStore.user?.shopName }) }}</span>
      <button @click="handleExitImpersonation" class="underline">
        {{ t('platform.banner.exit') }}
      </button>
    </div>

    <!-- Offline mode: connection state, changes waiting to sync, and
         conflicts to resolve (see offline/queue.ts). -->
    <div
      v-if="authStore.isAuthenticated && !authStore.isClient && (pendingWrites.length > 0 || !isOnline)"
      class="sticky top-12 z-40"
      data-testid="offline-banner"
    >
      <div
        class="text-center py-2 text-sm font-bold flex items-center justify-center gap-3 cursor-pointer"
        :class="
          conflictCount > 0
            ? 'bg-red-500 text-white'
            : !isOnline
              ? 'bg-gray-700 text-white'
              : 'bg-amber-500 text-white'
        "
        @click="offlinePanelOpen = !offlinePanelOpen"
      >
        <i :class="!isOnline ? 'pi pi-wifi' : 'pi pi-cloud-upload'"></i>
        <span v-if="conflictCount > 0">{{ t("offline.conflicts", { count: conflictCount }) }}</span>
        <span v-else-if="syncNeedsLogin">{{ t("offline.needsLogin", { count: pendingCount }) }}</span>
        <span v-else-if="!isOnline">{{ t("offline.offlineBanner", { count: pendingCount }) }}</span>
        <span v-else>{{ t("offline.pending", { count: pendingCount }) }}</span>
        <button
          v-if="pendingCount > 0 && isOnline && !syncNeedsLogin"
          @click.stop="syncNow"
          :disabled="isSyncingNow"
          class="underline disabled:opacity-60"
        >
          {{ isSyncingNow ? t("offline.syncing") : t("offline.syncNow") }}
        </button>
        <i v-if="pendingWrites.length" :class="offlinePanelOpen ? 'pi pi-chevron-up' : 'pi pi-chevron-down'"></i>
      </div>
      <div
        v-if="offlinePanelOpen && pendingWrites.length"
        class="bg-white dark:bg-[var(--p-primary-900)] border-b border-[var(--p-primary-200)] shadow-lg max-h-72 overflow-y-auto"
      >
        <!-- Centred, with the actions under each line: the top-right
             corner is where toasts appear, and they would cover them. -->
        <div
          v-for="w in pendingWrites"
          :key="w.id"
          class="max-w-2xl mx-auto px-4 py-2 border-b border-[var(--p-primary-100)] last:border-b-0 flex flex-col gap-1.5 text-sm"
          :data-testid="`offline-write-${w.status}`"
        >
          <div class="min-w-0">
            <div class="font-bold truncate">
              <i :class="kindIcon(w.kind)" class="text-xs mr-1 text-gray-400"></i>{{ w.label || w.kind }}
            </div>
            <div v-if="w.status === 'conflict'" class="text-red-600 text-xs">{{ conflictText(w) }}</div>
            <div v-else class="text-gray-500 text-xs">{{ t("offline.waiting") }}</div>
          </div>
          <div v-if="w.status === 'conflict'" class="flex flex-wrap items-center gap-2">
            <button
              v-if="canCancelInstead(w)"
              @click="cancelInsteadQueuedWrite(w.id)"
              class="px-3 py-1 rounded-full text-xs font-semibold text-white bg-[var(--p-primary-600)] hover:bg-[var(--p-primary-700)]"
              data-testid="offline-cancel-instead"
            >
              {{ t("offline.cancelInstead") }}
            </button>
            <button
              v-else-if="canKeepMine(w)"
              @click="keepMineQueuedWrite(w.id)"
              class="px-3 py-1 rounded-full text-xs font-semibold text-white bg-[var(--p-primary-600)] hover:bg-[var(--p-primary-700)]"
              data-testid="offline-keep-mine"
            >
              {{ t("offline.keepMine") }}
            </button>
            <button
              v-else-if="!['depends_on_conflict', 'missing_record', 'appointment_missing', 'has_payments'].includes(w.conflict?.code || '')"
              @click="retryQueuedWrite(w.id)"
              class="px-3 py-1 rounded-full text-xs font-semibold border border-[var(--p-primary-400)] text-[var(--p-primary-700)] hover:bg-[var(--p-primary-50)]"
            >
              {{ t("offline.retry") }}
            </button>
            <button
              @click="confirmDiscard(w)"
              class="px-3 py-1 rounded-full text-xs font-semibold border border-red-300 text-red-600 hover:bg-red-50"
              data-testid="offline-discard"
            >
              {{ canKeepMine(w) ? t("offline.keepTheirs") : t("offline.discard") }}
            </button>
          </div>
        </div>
      </div>
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
import { api, ApiError } from "../api/http";
import { ref, onMounted, onUnmounted, watch, computed, nextTick, defineAsyncComponent } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useAuthStore } from "../stores/auth";
import { useChatStore } from "../stores/chat";
import { useSettingsStore } from "../stores/settings";
// Staff chat: only shown to logged-in staff, so its code loads only then.
const FloatingChat = defineAsyncComponent(() => import("../components/FloatingChat.vue"));
import { useI18n } from "vue-i18n";
import { useToast } from "primevue/usetoast";
import {
  pendingWrites,
  pendingCount,
  conflictCount,
  isOnline,
  syncNeedsLogin,
  flushQueue,
  retryQueuedWrite,
  discardQueuedWrite,
  keepMineQueuedWrite,
  cancelInsteadQueuedWrite,
} from "../offline/queue";
import { canCancelInstead, canKeepMine } from "../offline/sync";
import type { QueuedWrite } from "../offline/db";
import { useLogout } from "../composables/useLogout";

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const chatStore = useChatStore();
const settingsStore = useSettingsStore();
const toast = useToast();
const mobileMenuOpen = ref(false);
const { t, locale } = useI18n();

const offlinePanelOpen = ref(false);
const kindIcon = (kind: string) =>
  ({ appointment: "pi pi-calendar", payment: "pi pi-euro", client: "pi pi-user", delete: "pi pi-trash" })[kind] ||
  "pi pi-circle";
/** Why the server refused a change, in plain words. */
const conflictText = (w: QueuedWrite) => {
  const code = w.conflict?.code || "";
  const clash = w.conflict?.details?.conflicts?.[0];
  if (code === "slot_taken" && clash) {
    return t("offline.conflict.slot_taken_with", {
      client: clash.client_name || "—",
      time: new Date(clash.start_time).toLocaleString("el-GR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
    });
  }
  const known = ["slot_taken", "stale_appointment", "appointment_missing", "depends_on_conflict", "missing_record", "has_payments", "over_capacity"];
  return known.includes(code) ? t(`offline.conflict.${code}`) : w.lastError || code;
};
// Discarding drops a change for good (e.g. a booking), so ask first.
const confirmDiscard = (w: QueuedWrite) => {
  if (window.confirm(t("offline.confirmDiscard", { label: w.label || w.kind }))) discardQueuedWrite(w.id);
};
const isSyncingNow = ref(false);
const syncNow = async () => {
  isSyncingNow.value = true;
  try {
    await flushQueue();
  } finally {
    isSyncingNow.value = false;
  }
};

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
    label: t("nav.membershipTiers"),
    path: "/app/membership-tiers",
    ownerOnly: true,
    icon: "pi pi-id-card",
  },
  {
    label: t("nav.dailyReport"),
    path: "/app/daily-report",
    ownerOnly: true,
    frontdeskOnly: true,
    icon: "pi pi-wallet",
  },
  {
    label: t("nav.expenses"),
    path: "/app/expenses",
    ownerOnly: true,
    frontdeskOnly: true,
    icon: "pi pi-receipt",
  },
  {
    label: t("nav.packages"),
    path: "/app/packages",
    ownerOnly: true,
    icon: "pi pi-clone",
  },
  {
    label: t("nav.qrScanner"),
    path: "/app/qr-scanner",
    ownerOnly: false,
    hideFromAdmin: true,
    icon: "pi pi-qrcode",
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
    path: "/portal/home",
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
    if (item.frontdeskOnly && authStore.user?.role !== "frontdesk") return false;
    if (item.hideFromAdmin && isAnalyticsAllowed.value) return false;
    if (item.platformOnly && !authStore.isOwner) return false;

    return true;
  });
});

// Nav links: start at full size and step down until they fit the space
// left of the right-hand buttons; re-checked on resize and when the links
// change (they differ by role and language).
const NAV_DENSITIES = [
  { link: "px-3 text-sm", icon: true, iconOnly: false },
  { link: "px-2 text-[13px]", icon: true, iconOnly: false },
  { link: "px-1.5 text-xs", icon: true, iconOnly: false },
  { link: "px-1.5 text-xs", icon: false, iconOnly: false },
  { link: "px-1 text-[11px]", icon: false, iconOnly: false },
  { link: "px-2", icon: true, iconOnly: true },
] as const;
const navLinksEl = ref<HTMLElement | null>(null);
const navDensityLevel = ref(0);
const navDensity = computed(() => NAV_DENSITIES[navDensityLevel.value]);

const navOverflows = () => {
  const el = navLinksEl.value;
  return !!el && el.offsetParent !== null && el.scrollWidth > el.clientWidth + 1;
};
let fitting = false;
const fitNavLinks = async () => {
  if (fitting) return;
  fitting = true;
  try {
    navDensityLevel.value = 0;
    await nextTick();
    while (navOverflows() && navDensityLevel.value < NAV_DENSITIES.length - 1) {
      navDensityLevel.value++;
      await nextTick();
    }
  } finally {
    fitting = false;
  }
};
let navResizeObserver: ResizeObserver | null = null;
watch(() => [visibleNavItems.value.length, locale.value], fitNavLinks);

const isFullWidthPage = computed(() => route.path.includes("/app/scheduler"));
const logoutAndClear = useLogout();
const logout = async () => {
  mobileMenuOpen.value = false;
  await logoutAndClear("/");
};

const handleExitImpersonation = () => {
  authStore.exitImpersonation();
  router.push("/app/platform/shops");
};

// --- Ctrl+1: hide cash/gift-card revenue (global — works on any authenticated page) ---
const isSuperAdmin = computed(() => authStore.user?.role === "super_admin");
const isAdminOrAbove = computed(
  () => authStore.user?.role === "admin" || authStore.user?.role === "super_admin",
);

// Admin/super_admin: persists + broadcasts shop-wide via the server, which
// enforces who's allowed to change a currently-locked filter (an admin's
// lock can be released by any admin or a super_admin; a super_admin's lock
// is exclusive to super_admin). See POST /api/v1/shop/cash-filter.
const toggleCashFilterAsAdmin = async () => {
  const newHidden = !settingsStore.hideCashPaid;
  try {
    const data = await api.post("/api/v1/shop/cash-filter", { hidden: newHidden }).catch((e) => {
      if (!(e instanceof ApiError)) throw e;
      toast.add({ severity: "warn", summary: t("common.error"), detail: e.data?.error, life: 4000 });
      return null;
    });
    if (!data) return;
    // The server's own broadcast will also confirm this for every connected
    // tab (including this one) — setting it locally too avoids waiting on it.
    settingsStore.setHideCashPaid(newHidden);
    settingsStore.setCashLockedByShop(data.hidden, data.lockedBy);
  } catch {
    toast.add({ severity: "error", summary: t("common.error"), detail: t("booking.toast.networkError"), life: 3000 });
  }
};

const handleKeydown = (e: KeyboardEvent) => {
  if (e.ctrlKey && e.key === "1") {
    e.preventDefault();
    if (isAdminOrAbove.value) {
      toggleCashFilterAsAdmin();
      return;
    }
    // Plain staff/frontdesk: purely local, unless an admin/super_admin
    // currently has it locked shop-wide.
    if (settingsStore.cashLockedByShop) return;
    settingsStore.toggleHideCashPaid();
  } else if (e.ctrlKey && e.key === "8") {
    e.preventDefault();
    // Independent lock/broadcast for card, mirrors the cash macro exactly
    if (!isSuperAdmin.value && chatStore.cardLocked) return;
    settingsStore.toggleHideCardPaid();
    if (isSuperAdmin.value) {
      chatStore.socket?.emit("card:filter:broadcast", {
        hidden: settingsStore.hideCardPaid,
      });
    }
  }
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

// Plain-HTTP fallback for the cash/card-filter socket broadcasts. A phone
// browser suspends JS and drops its WebSocket while backgrounded — waiting
// on the socket to reconnect and re-sync (see server.js) only helps once the
// tab is actually running again to receive it, which can lag well behind
// the user reopening it. This fetch doesn't depend on a live socket at all,
// so it's called on mount, whenever the tab becomes visible again, and on a
// low-frequency timer as a last-resort safety net.
const resyncFilterState = async () => {
  if (!authStore.isAuthenticated || authStore.isClient) return;
  try {
    const data = await api.get("/api/v1/shop/filter-state");
    if (data.cashLocked) {
      settingsStore.setCashLockedByShop(true, data.cashLockedBy);
    } else {
      settingsStore.setCashLockedByShop(false);
      if (data.cashHidden !== null) settingsStore.setHideCashPaid(data.cashHidden);
    }
    if (data.cardHidden !== null) settingsStore.setHideCardPaid(data.cardHidden);
  } catch {
    // best-effort — the socket-connect sync and the next live broadcast are the other paths
  }
};

const handleVisibilityChange = () => {
  if (document.visibilityState === "visible") resyncFilterState();
};

let filterResyncTimer: ReturnType<typeof setInterval> | null = null;

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

  resyncFilterState();
  document.addEventListener("visibilitychange", handleVisibilityChange);
  filterResyncTimer = setInterval(resyncFilterState, 45000);

  // Observe the nav bar itself: its width follows the window, while the links
  // container's own width is what the fitting changes.
  const navBar = navLinksEl.value?.closest("nav");
  if (navBar) {
    navResizeObserver = new ResizeObserver(() => fitNavLinks());
    navResizeObserver.observe(navBar);
  }
  fitNavLinks();
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeydown);
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  if (filterResyncTimer) clearInterval(filterResyncTimer);
  navResizeObserver?.disconnect();
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
