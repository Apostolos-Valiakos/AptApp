<template>
  <div class="p-4 space-y-4">
    <!-- Active Contest Banner -->
    <div
      v-if="activeContest"
      class="relative rounded-2xl overflow-hidden shadow-md"
      :style="
        activeContest.image_url
          ? ''
          : 'background: linear-gradient(135deg, #8B6F4E, #D4A97A)'
      "
    >
      <img
        v-if="activeContest.image_url"
        :src="activeContest.image_url"
        class="absolute inset-0 w-full h-full object-cover"
      />
      <div
        class="relative z-10 p-5 flex flex-col gap-2"
        :class="activeContest.image_url ? 'bg-black/50' : ''"
      >
        <div class="flex items-center gap-2">
          <i class="pi pi-trophy text-yellow-300"></i>
          <span
            class="text-xs font-semibold uppercase tracking-widest text-yellow-200"
            >Διαγωνισμός</span
          >
        </div>
        <h2 class="text-lg font-bold text-white">{{ activeContest.name }}</h2>
        <p v-if="activeContest.description" class="text-sm text-white/80">
          {{ activeContest.description }}
        </p>
      </div>
    </div>

    <!-- Welcome Banner -->
    <div
      class="bg-gradient-to-r from-[var(--p-primary-color)] to-[var(--p-primary-600)] text-white p-5 rounded-2xl shadow-md"
    >
      <h1 class="text-xl font-bold">
        {{ t("portal.greeting", { name: clientData?.first_name }) }}
      </h1>
      <p class="text-white/80 text-sm mt-1">{{ t("portal.subtitle") }}</p>
    </div>

    <!-- Turn On Notifications -->
    <div
      v-if="showNotificationsCard"
      class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3"
    >
      <div
        class="w-10 h-10 rounded-xl bg-[var(--p-primary-50)] flex items-center justify-center flex-shrink-0"
      >
        <i class="pi pi-bell text-[var(--p-primary-600)]"></i>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-semibold text-gray-800">
          {{ t("portal.notifications.title") }}
        </p>
        <p class="text-xs text-gray-400">
          {{ t("portal.notifications.subtitle") }}
        </p>
      </div>
      <Button
        :label="t('portal.notifications.button')"
        size="small"
        @click="handleEnableNotifications"
      />
    </div>

    <!-- Quick actions -->
    <div class="grid grid-cols-2 gap-3">
      <router-link
        to="/portal/appointments?tab=book"
        class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col items-center gap-2 text-center hover:shadow-md transition-shadow"
      >
        <div
          class="w-10 h-10 rounded-xl bg-[var(--p-primary-50)] flex items-center justify-center"
        >
          <i class="pi pi-calendar-plus text-[var(--p-primary-600)]"></i>
        </div>
        <span class="text-sm font-semibold text-gray-800">{{
          t("portal.home.bookNow")
        }}</span>
      </router-link>

      <a
        v-if="shopPhone"
        :href="`tel:${shopPhone}`"
        class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col items-center gap-2 text-center hover:shadow-md transition-shadow"
      >
        <div
          class="w-10 h-10 rounded-xl bg-[var(--p-primary-50)] flex items-center justify-center"
        >
          <i class="pi pi-phone text-[var(--p-primary-600)]"></i>
        </div>
        <span class="text-sm font-semibold text-gray-800">{{
          t("portal.home.callUs")
        }}</span>
      </a>
    </div>

    <!-- Next appointment preview -->
    <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-bold text-gray-700">
          {{ t("portal.home.nextAppointment") }}
        </h3>
        <router-link
          to="/portal/appointments"
          class="text-xs font-semibold text-[var(--p-primary-600)]"
          >{{ t("portal.home.seeAll") }}</router-link
        >
      </div>

      <div v-if="loading" class="py-4 text-center">
        <i class="pi pi-spin pi-spinner text-2xl text-gray-300"></i>
      </div>
      <div
        v-else-if="!nextAppointment"
        class="flex flex-col items-center justify-center py-6 text-center"
      >
        <i class="pi pi-calendar text-3xl text-gray-300 mb-2"></i>
        <p class="text-sm text-gray-400">{{ t("portal.home.noUpcoming") }}</p>
      </div>
      <div v-else>
        <div class="font-bold text-[var(--p-primary-600)]">
          {{
            new Date(nextAppointment.start_time).toLocaleDateString("el-GR", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })
          }}
        </div>
        <div class="text-sm text-gray-500">
          {{
            new Date(nextAppointment.start_time).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })
          }}
        </div>
        <div class="text-sm font-medium mt-1">
          {{ nextAppointment.service_names }}
        </div>
        <div
          v-if="nextAppointment.staff_names"
          class="text-xs text-gray-500 flex items-center gap-1 mt-1"
        >
          <i class="pi pi-user text-[10px]"></i>
          <span>{{ nextAppointment.staff_names }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { api } from "../../api/http";
import { ref, computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import Button from "primevue/button";
import { useToast } from "primevue/usetoast";
import { usePushNotifications } from "../../composables/usePushNotifications";
import { useAuthStore } from "../../stores/auth";

const { t } = useI18n();
const authStore = useAuthStore();
const toast = useToast();
const {
  isSupported: pushSupported,
  availableHere: pushAvailableHere,
  permission: pushPermission,
  subscribe: subscribeToPush,
} = usePushNotifications();

const showNotificationsCard = computed(
  () =>
    pushSupported &&
    pushPermission.value !== "granted" &&
    pushAvailableHere,
);

const handleEnableNotifications = async () => {
  const result = await subscribeToPush();
  if (result === "subscribed") {
    toast.add({ severity: "success", detail: t("portal.notifications.enabledToast"), life: 3000 });
  } else if (typeof result === "object" && result.error) {
    toast.add({
      severity: "error",
      detail: t("portal.notifications.errorToast", { reason: result.error }),
      life: 6000,
    });
  }
};

const loading = ref(true);
const activeContest = ref<any>(null);
const clientData = ref<any>(null);
const history = ref<any[]>([]);
const shopPhone = ref("");

const nextAppointment = computed(() => {
  const now = Date.now();
  return history.value
    .filter(
      (a) => a.status !== "cancelled" && new Date(a.start_time).getTime() > now,
    )
    .sort(
      (a, b) =>
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
    )[0];
});

onMounted(async () => {
  try {
    activeContest.value = (await api.get("/api/v1/contests/active")) ?? null;
  } catch {}

  try {
    const data = await api.get("/api/v1/shop");
    shopPhone.value = data?.phone || "";
  } catch {}

  try {
    const data = await api.get(`/api/v1/clients/${authStore.clientId}/full`);
    clientData.value = data.client;
    history.value = data.history || [];
  } catch {
  } finally {
    loading.value = false;
  }
});
</script>
