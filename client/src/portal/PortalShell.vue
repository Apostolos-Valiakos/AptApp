<template>
  <!-- The redesigned portal's frame (docs/redesign/REDESIGN_SPEC.md §2).
       Phones: a top bar and five tabs with Book raised in the middle.
       From 1024px: a left rail with the same five places, the page, and a
       side panel for the assistant, so nothing covers the page. -->
  <div class="portal-shell min-h-screen flex" :class="wide ? 'flex-row' : 'flex-col'">
    <nav v-if="wide" class="w-60 flex-shrink-0 sticky top-0 h-screen flex flex-col gap-1 p-4 border-r border-[var(--portal-border)] bg-[var(--portal-card)]" :aria-label="t('portal.nav.main')" data-testid="portal-rail">
      <div class="portal-display portal-h3 px-3 pb-4 truncate">{{ shop.name }}</div>
      <router-link
        v-for="tab in tabs"
        :key="tab.to"
        :to="tab.to"
        class="portal-target flex items-center gap-3 px-3 rounded-[var(--portal-radius-button)] font-medium"
        :class="isActive(tab) ? 'bg-[var(--p-primary-50)] text-[var(--portal-accent-text)]' : 'opacity-80 hover:bg-[var(--p-surface-100)]'"
        :aria-current="isActive(tab) ? 'page' : undefined"
      >
        <i :class="tab.icon"></i>
        {{ t(tab.label) }}
      </router-link>
      <div class="mt-auto px-3">
        <SelectButton :modelValue="locale" :options="LANGUAGES" optionLabel="label" optionValue="value" :allowEmpty="false" :aria-label="t('portal.nav.language')" @update:modelValue="switchLanguage" />
      </div>
    </nav>

    <div class="flex-1 min-w-0 flex flex-col">
      <header class="sticky top-0 z-40 bg-[var(--portal-bg)]/90 backdrop-blur border-b border-[var(--portal-border)] pt-[env(safe-area-inset-top)]">
        <div class="h-14 px-4 flex items-center justify-between gap-2 max-w-3xl w-full mx-auto">
          <span class="portal-display text-lg truncate">{{ wide ? "" : shop.name }}</span>
          <div class="flex items-center gap-1 flex-shrink-0">
            <button
              v-if="shop.aiEnabled"
              type="button"
              class="portal-target flex items-center justify-center rounded-full"
              :class="assistant.visible ? 'text-[var(--p-primary-color)]' : ''"
              :aria-label="t('portal.nav.assistant')"
              data-testid="assistant-button"
              @click="assistant.visible ? assistant.close() : assistant.open()"
            >
              <i class="pi pi-sparkles text-lg"></i>
            </button>
            <button type="button" class="portal-target relative flex items-center justify-center" :aria-label="t('portal.nav.activity')" data-testid="activity-button" @click="activity.open">
              <i class="pi pi-bell text-lg"></i>
              <span v-if="activity.unreadCount.value > 0" class="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                {{ activity.unreadCount.value > 9 ? "9+" : activity.unreadCount.value }}
              </span>
            </button>
          </div>
        </div>
      </header>

      <main class="flex-1 w-full max-w-3xl mx-auto" :class="wide ? 'pb-8' : 'pb-28'">
        <router-view />
      </main>
    </div>

    <aside v-if="wide && shop.aiEnabled && assistant.visible" class="w-[380px] flex-shrink-0 sticky top-0 h-screen flex flex-col border-l border-[var(--portal-border)] bg-[var(--portal-card)]" data-testid="portal-side-panel">
      <div class="h-14 px-4 flex items-center justify-between border-b border-[var(--portal-border)]">
        <span class="font-semibold">{{ t("portal.ai.title") }}</span>
        <Button icon="pi pi-times" text rounded :aria-label="t('portal.nav.closeAssistant')" @click="assistant.close()" />
      </div>
      <div class="flex-1 min-h-0"><AiChat /></div>
    </aside>

    <nav v-if="!wide" class="fixed bottom-0 inset-x-0 z-40 bg-[var(--portal-card)] border-t border-[var(--portal-border)] pb-[env(safe-area-inset-bottom)]" :aria-label="t('portal.nav.main')" data-testid="portal-tabs">
      <div class="max-w-3xl mx-auto grid grid-cols-5 items-end px-1">
        <router-link
          v-for="tab in tabs"
          :key="tab.to"
          :to="tab.to"
          class="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium min-h-[56px] justify-end"
          :class="isActive(tab) ? 'text-[var(--portal-accent-text)]' : tab.raised ? '' : 'opacity-60'"
          :aria-current="isActive(tab) ? 'page' : undefined"
        >
          <span
            v-if="tab.raised"
            class="w-14 h-14 -mt-6 mb-0.5 rounded-full bg-[var(--p-primary-color)] text-[var(--p-primary-contrast-color)] flex items-center justify-center shadow-[var(--portal-shadow-2)]"
          ><i :class="tab.icon" class="text-xl"></i></span>
          <i v-else :class="tab.icon" class="text-lg"></i>
          {{ t(tab.label) }}
        </router-link>
      </div>
    </nav>

    <Drawer v-if="!wide && shop.aiEnabled" v-model:visible="assistantVisible" position="bottom" :header="t('portal.ai.title')" class="!h-[85vh]" :dt="{ root: { borderRadius: '28px 28px 0 0' } }">
      <AiChat />
    </Drawer>

    <BookingSuccessSheet />

    <Dialog v-model:visible="activity.visible.value" modal :style="{ width: '400px', maxWidth: '92vw' }">
      <template #header>
        <div class="flex items-center justify-between w-full pr-4">
          <span class="font-bold">{{ t("portal.notificationHistory.title") }}</span>
          <button v-if="activity.unreadCount.value > 0" type="button" class="text-xs font-semibold text-[var(--portal-accent-text)]" @click="activity.markAllRead">
            {{ t("portal.notificationHistory.markAllRead") }}
          </button>
        </div>
      </template>
      <ActivityList :items="activity.items.value" :loading="activity.loading.value" @open="activity.openItem" />
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import "./theme/portal.css";
import { computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Drawer from "primevue/drawer";
import SelectButton from "primevue/selectbutton";
import { setLocale } from "../i18n";
import AiChat from "../components/portal/AiChat.vue";
import ActivityList from "./components/ActivityList.vue";
import BookingSuccessSheet from "./components/BookingSuccessSheet.vue";
import { usePortalTheme } from "./composables/usePortalTheme";
import { usePortalNotifications } from "./composables/usePortalNotifications";
import { usePortalInstall, setShopManifest } from "./composables/usePortalInstall";
import { useMinWidth, PORTAL_DESKTOP_WIDTH } from "./composables/useMinWidth";
import { useAssistantStore } from "./stores/assistant";
import { usePortalShopStore } from "./stores/shop";

type Tab = { to: string; label: string; icon: string; raised?: boolean; also?: string[] };
const tabs: Tab[] = [
  { to: "/portal/home", label: "portal.nav.home", icon: "pi pi-home" },
  { to: "/portal/bookings", label: "portal.nav.bookings", icon: "pi pi-calendar" },
  { to: "/portal/book", label: "portal.nav.book", icon: "pi pi-plus", raised: true },
  { to: "/portal/wallet", label: "portal.nav.wallet", icon: "pi pi-wallet" },
  { to: "/portal/profile", label: "portal.nav.profile", icon: "pi pi-user" },
];
const LANGUAGES = [
  { label: "EL", value: "el" },
  { label: "EN", value: "en" },
];

const route = useRoute();
const { t, locale } = useI18n();
const wide = useMinWidth(PORTAL_DESKTOP_WIDTH);
const shop = usePortalShopStore();
const assistant = useAssistantStore();
const activity = usePortalNotifications();
const assistantVisible = computed({ get: () => assistant.visible, set: (v) => (v ? assistant.open() : assistant.close()) });

usePortalTheme();
usePortalInstall();

// "Book" stays lit while moving a booking (/portal/book/reschedule/…).
const isActive = (tab: Tab) => route.path === tab.to || route.path.startsWith(`${tab.to}/`);

const switchLanguage = async (lang: string) => {
  await setLocale(lang);
  try {
    localStorage.setItem("locale", lang);
  } catch {}
};

onMounted(async () => {
  await shop.load();
  if (shop.shop?.id) setShopManifest(shop.shop.id);
});
</script>
