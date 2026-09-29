<template>
  <div class="min-h-screen bg-[var(--p-primary-50)] flex flex-col">
    <!-- Header -->
    <header
      class="sticky top-0 z-40 bg-gradient-to-r from-[var(--p-primary-color)] to-[var(--p-primary-600)] shadow-md"
    >
      <div
        class="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between"
      >
        <div class="flex items-center gap-2 min-w-0">
          <div
            class="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm flex-shrink-0"
          >
            <img src="../../static/logo for photos-02.png" class="w-5 h-5" />
          </div>
          <span class="text-white font-bold text-sm truncate">{{
            shopName
          }}</span>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <button
            @click="openNotifications"
            class="relative w-8 h-8 flex items-center justify-center text-white"
          >
            <i class="pi pi-bell text-lg"></i>
            <span
              v-if="unreadCount > 0"
              class="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center"
              >{{ unreadCount > 9 ? "9+" : unreadCount }}</span
            >
          </button>
          <button
            @click="toggleLocale"
            class="bg-white/15 hover:bg-white/25 text-white px-2.5 py-1 rounded-lg text-xs font-bold transition-all border border-white/20"
          >
            {{ locale === "el" ? "🇬🇧 EN" : "🇬🇷 EL" }}
          </button>
        </div>
      </div>
    </header>

    <!-- Page content -->
    <main class="flex-1 max-w-3xl w-full mx-auto pb-24">
      <router-view />
    </main>

    <!-- Bottom tab bar -->
    <nav
      class="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-100 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]"
    >
      <div
        class="max-w-3xl mx-auto grid grid-cols-4 items-end px-2 pb-[env(safe-area-inset-bottom)]"
      >
        <router-link
          to="/portal/home"
          class="flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors"
          :class="
            isActive('/portal/home')
              ? 'text-[var(--p-primary-600)]'
              : 'text-gray-400'
          "
        >
          <i class="pi pi-home text-lg"></i>
          {{ t("portal.nav.home") }}
        </router-link>

        <router-link
          to="/portal/appointments"
          class="flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors"
          :class="
            isActive('/portal/appointments')
              ? 'text-[var(--p-primary-600)]'
              : 'text-gray-400'
          "
        >
          <i class="pi pi-calendar text-lg"></i>
          {{ t("portal.nav.appointments") }}
        </router-link>

        <!-- Chat FAB — intentionally inert for now, no functionality wired up -->
        <!-- <div class="flex flex-col items-center">
          <button
            type="button"
            class="w-12 h-12 -mt-5 rounded-full bg-gradient-to-br from-[var(--p-primary-color)] to-[var(--p-primary-600)] shadow-lg flex items-center justify-center text-white"
          >
            <i class="pi pi-comment text-lg"></i>
          </button>
          <span class="text-xs font-medium text-gray-400 mt-0.5">{{
            t("portal.nav.chat")
          }}</span>
        </div> -->

        <router-link
          to="/portal/more"
          class="flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors"
          :class="
            isActive('/portal/more')
              ? 'text-[var(--p-primary-600)]'
              : 'text-gray-400'
          "
        >
          <i class="pi pi-bars text-lg"></i>
          {{ t("portal.nav.more") }}
        </router-link>
      </div>
    </nav>
  </div>

  <Dialog
    v-model:visible="showNotifications"
    modal
    :header="t('portal.notificationHistory.title')"
    :style="{ width: '400px', maxWidth: '92vw' }"
  >
    <template #header>
      <div class="flex items-center justify-between w-full pr-4">
        <span class="font-bold">{{
          t("portal.notificationHistory.title")
        }}</span>
        <button
          v-if="unreadCount > 0"
          @click="markAllRead"
          class="text-xs font-semibold text-[var(--p-primary-600)]"
        >
          {{ t("portal.notificationHistory.markAllRead") }}
        </button>
      </div>
    </template>
    <div v-if="loadingNotifications" class="text-center py-8">
      <i class="pi pi-spin pi-spinner text-2xl text-gray-300"></i>
    </div>
    <div
      v-else-if="notifications.length === 0"
      class="flex flex-col items-center justify-center py-10 text-center"
    >
      <i class="pi pi-bell-slash text-3xl text-gray-300 mb-3"></i>
      <p class="text-sm text-gray-400">
        {{ t("portal.notificationHistory.empty") }}
      </p>
    </div>
    <div v-else class="space-y-1 max-h-[60vh] overflow-y-auto -mx-2">
      <button
        v-for="n in notifications"
        :key="n.id"
        type="button"
        class="w-full text-left px-3 py-3 rounded-xl flex items-start gap-3 transition-colors"
        :class="
          n.read_at
            ? 'hover:bg-gray-50'
            : 'bg-[var(--p-primary-50)] hover:bg-[var(--p-primary-100)]'
        "
        @click="openNotification(n)"
      >
        <i
          :class="n.type === 'reminder' ? 'pi pi-calendar' : 'pi pi-megaphone'"
          class="text-[var(--p-primary-600)] mt-0.5 flex-shrink-0"
        ></i>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-semibold text-gray-800 truncate">
            {{ n.title }}
          </p>
          <p class="text-xs text-gray-500 mt-0.5">{{ n.body }}</p>
          <p class="text-[11px] text-gray-400 mt-1">
            {{ new Date(n.created_at).toLocaleString() }}
          </p>
        </div>
        <span
          v-if="!n.read_at"
          class="w-2 h-2 rounded-full bg-[var(--p-primary-color)] mt-1.5 flex-shrink-0"
        ></span>
      </button>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import Dialog from "primevue/dialog";
import { useAuthStore } from "../stores/auth";

const route = useRoute();
const router = useRouter();
const { t, locale } = useI18n();
const authStore = useAuthStore();

const shopName = ref("Pure Spa & Massage Experience");
const unreadCount = ref(0);
const notifications = ref<any[]>([]);
const showNotifications = ref(false);
const loadingNotifications = ref(false);

const fetchNotifications = async () => {
  try {
    const res = await fetch("/api/v1/portal/notifications", {
      headers: { Authorization: `Bearer ${authStore.token}` },
    });
    if (res.ok) {
      const data = await res.json();
      notifications.value = data.items || [];
      unreadCount.value = data.unread_count || 0;
    }
  } catch {}
};

const openNotifications = async () => {
  showNotifications.value = true;
  loadingNotifications.value = true;
  await fetchNotifications();
  loadingNotifications.value = false;
};

const markAllRead = async () => {
  try {
    await fetch("/api/v1/portal/notifications/read-all", {
      method: "PUT",
      headers: { Authorization: `Bearer ${authStore.token}` },
    });
    notifications.value = notifications.value.map((n) => ({
      ...n,
      read_at: n.read_at || new Date().toISOString(),
    }));
    unreadCount.value = 0;
  } catch {}
};

const openNotification = async (n: any) => {
  if (!n.read_at) {
    try {
      await fetch(`/api/v1/portal/notifications/${n.id}/read`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${authStore.token}` },
      });
      n.read_at = new Date().toISOString();
      unreadCount.value = Math.max(0, unreadCount.value - 1);
    } catch {}
  }
  if (n.url) {
    showNotifications.value = false;
    router.push(n.url);
  }
};

const isActive = (path: string) => route.path.startsWith(path);

const toggleLocale = () => {
  const next = locale.value === "el" ? "en" : "el";
  locale.value = next;
  localStorage.setItem("locale", next);
};

// Only ever active on client-portal pages (this component isn't mounted
// anywhere else) — never touches admin/staff pages.
const manifestLink = (): HTMLLinkElement => {
  let link = document.querySelector(
    'link[rel="manifest"]',
  ) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.rel = "manifest";
    document.head.appendChild(link);
  }
  return link;
};

// Points the manifest at this specific shop's name/color once known.
const setShopManifest = (shopId: string) => {
  manifestLink().href = `/manifest.webmanifest?shop_id=${encodeURIComponent(shopId)}`;
};

onMounted(async () => {
  // Registered synchronously, before any network round-trip — Chrome/Brave's
  // installability check can run and decide "not installable" before an
  // awaited fetch resolves, and some builds never re-check afterward even
  // though the manifest/SW show up correctly a moment later. A generic
  // manifest now (swapped for the shop-specific one below once it's known)
  // means the earliest possible check already sees a valid one.
  manifestLink().href = "/manifest.webmanifest";
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/portal/" })
      .catch(() => {});
  }

  try {
    const res = await fetch("/api/v1/shop", {
      headers: { Authorization: `Bearer ${authStore.token}` },
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.name) shopName.value = data.name;
      if (data?.id) setShopManifest(data.id);
    }
  } catch {}
  fetchNotifications();

  // The service worker posts this when a push actually arrives while a tab
  // is open, so the bell updates immediately instead of only on next load.
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "push-received") fetchNotifications();
    });
  }
});
</script>
