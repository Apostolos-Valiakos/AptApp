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
            class="bg-white/15 hover:bg-white/25 text-white px-3 min-h-[40px] rounded-lg text-xs font-bold transition-all border border-white/20"
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

        <!-- The AI assistant (on when the shop has it switched on). -->
        <div v-if="aiEnabled" class="flex flex-col items-center">
          <button
            type="button"
            class="w-12 h-12 -mt-5 rounded-full bg-gradient-to-br from-[var(--p-primary-color)] to-[var(--p-primary-600)] shadow-lg flex items-center justify-center text-white"
            @click="showAiChat = true"
          >
            <i class="pi pi-comment text-lg"></i>
          </button>
          <span class="text-xs font-medium text-gray-400 mt-0.5">{{
            t("portal.nav.chat")
          }}</span>
        </div>

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
    <ActivityList :items="notifications" :loading="loadingNotifications" @open="openNotification" />
  </Dialog>
  <AiChatPanel v-if="aiEnabled" v-model:visible="showAiChat" />
</template>

<script setup lang="ts">
import { useLocaleToggle } from "../composables/useLocaleToggle";
import { api } from "../api/http";
import { ref, onMounted } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import Dialog from "primevue/dialog";
import AiChatPanel from "./portal/AiChatPanel.vue";
import ActivityList from "../portal/components/ActivityList.vue";
import { usePortalNotifications } from "../portal/composables/usePortalNotifications";
import { usePortalInstall, setShopManifest } from "../portal/composables/usePortalInstall";
import { useAssistantStore } from "../portal/stores/assistant";
import { storeToRefs } from "pinia";

const route = useRoute();
const { t, locale } = useI18n();

const shopName = ref("Pure Spa & Massage Experience");
const aiEnabled = ref(false);
const { visible: showAiChat } = storeToRefs(useAssistantStore());
const {
  items: notifications,
  unreadCount,
  visible: showNotifications,
  loading: loadingNotifications,
  open: openNotifications,
  markAllRead,
  openItem: openNotification,
} = usePortalNotifications();

const isActive = (path: string) => route.path.startsWith(path);

const toggleLocale = useLocaleToggle();

usePortalInstall();

onMounted(async () => {
  try {
    const data = await api.get("/api/v1/shop");
    if (data?.name) shopName.value = data.name;
    if (data?.id) setShopManifest(data.id);
    aiEnabled.value = !!data?.ai_assistant_enabled;
  } catch {}
});
</script>
