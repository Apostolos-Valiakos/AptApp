<template>
  <div class="p-4 space-y-4">
    <!-- My Packages -->
    <div class="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
      <h3 class="font-bold text-gray-700 mb-4">{{ t("packages.portalTitle") }}</h3>
      <ClientPackagesPanel :clientId="authStore.clientId" portal />
    </div>

    <!-- My Membership -->
    <div class="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
      <h3 class="font-bold text-gray-700 mb-4">
        {{ t("portal.membership.title") }}
      </h3>

      <div v-if="membershipLoading" class="text-center py-4">
        <i class="pi pi-spin pi-spinner text-2xl text-gray-300"></i>
      </div>

      <template v-else>
        <div v-if="membership" class="space-y-3">
          <div class="flex items-center justify-between">
            <span class="font-bold text-[var(--p-primary-600)]">{{
              membership.tier_name
            }}</span>
            <span class="text-xs text-gray-400">
              {{
                t("portal.membership.renewsOn", {
                  date: new Date(
                    membership.current_period_end,
                  ).toLocaleDateString("en-GB"),
                })
              }}
            </span>
          </div>
          <div
            v-for="u in membershipUsage"
            :key="u.service_id"
            class="text-sm flex justify-between"
          >
            <span class="text-gray-600">{{ u.service_name }}</span>
            <span class="font-medium text-gray-900">
              {{
                u.quota_per_month === null
                  ? `${u.used_this_month} / ∞`
                  : `${u.used_this_month} / ${u.quota_per_month}`
              }}
            </span>
          </div>
        </div>
        <div v-else class="text-sm text-gray-400 text-center py-2">
          {{ t("portal.membership.none") }}
        </div>
      </template>

      <div
        class="border-t border-gray-100 mt-4 pt-4 flex flex-col items-center"
      >
        <canvas
          ref="qrCanvas"
          class="w-32 h-32 cursor-pointer transition-transform hover:scale-105"
          @click="showQrModal = true"
        ></canvas>
        <p class="text-xs text-gray-400 mt-2 text-center">
          {{ t("portal.membership.qrNote") }}
        </p>
      </div>
    </div>

    <!-- Edit Contact Info -->
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <div
        class="flex items-center justify-between cursor-pointer"
        @click="showEditProfile = !showEditProfile"
      >
        <div class="flex items-center gap-2">
          <i class="pi pi-user-edit text-[var(--p-primary-color)]"></i>
          <h3 class="font-bold text-gray-800">
            {{ t("portal.more.myInformation") }}
          </h3>
        </div>
        <i
          :class="showEditProfile ? 'pi pi-chevron-up' : 'pi pi-chevron-down'"
          class="text-gray-400 text-sm"
        ></i>
      </div>
      <div v-if="showEditProfile" class="mt-4 space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-medium text-gray-500 mb-1"
              >First Name</label
            >
            <InputText v-model="editProfileForm.first_name" class="w-full" />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-500 mb-1"
              >Last Name</label
            >
            <InputText v-model="editProfileForm.last_name" class="w-full" />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-500 mb-1"
              >Email</label
            >
            <InputText
              v-model="editProfileForm.email"
              class="w-full"
              type="email"
            />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-500 mb-1"
              >Phone</label
            >
            <InputText v-model="editProfileForm.phone" class="w-full" />
          </div>
        </div>
        <div class="flex justify-end">
          <Button
            label="Save Changes"
            size="small"
            :loading="isSavingProfile"
            @click="saveProfile"
          />
        </div>
      </div>
    </div>

    <!-- Change Password -->
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <div
        class="flex items-center justify-between cursor-pointer"
        @click="showChangePassword = !showChangePassword"
      >
        <div class="flex items-center gap-2">
          <i class="pi pi-lock text-[var(--p-primary-color)]"></i>
          <h3 class="font-bold text-gray-800">
            {{ t("portal.more.changePassword") }}
          </h3>
        </div>
        <i
          :class="
            showChangePassword ? 'pi pi-chevron-up' : 'pi pi-chevron-down'
          "
          class="text-gray-400 text-sm"
        ></i>
      </div>
      <div v-if="showChangePassword" class="mt-4 space-y-4">
        <div>
          <label class="block text-xs font-medium text-gray-500 mb-1"
            >Current Password</label
          >
          <Password
            v-model="passwordForm.current"
            :feedback="false"
            toggleMask
            class="w-full"
            inputClass="w-full"
          />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-500 mb-1"
            >New Password</label
          >
          <Password
            v-model="passwordForm.newPass"
            toggleMask
            class="w-full"
            inputClass="w-full"
          />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-500 mb-1"
            >Confirm New Password</label
          >
          <Password
            v-model="passwordForm.confirm"
            :feedback="false"
            toggleMask
            class="w-full"
            inputClass="w-full"
          />
          <small
            v-if="
              passwordForm.confirm && passwordForm.newPass !== passwordForm.confirm
            "
            class="text-red-500 block mt-1"
            >Passwords do not match</small
          >
        </div>
        <div class="flex justify-end">
          <Button
            label="Update Password"
            size="small"
            :loading="isSavingPassword"
            :disabled="
              !passwordForm.current ||
              !passwordForm.newPass ||
              passwordForm.newPass !== passwordForm.confirm
            "
            @click="changePassword"
          />
        </div>
      </div>
    </div>

    <!-- Email Notifications -->
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <i class="pi pi-bell text-[var(--p-primary-color)]"></i>
          <div>
            <p class="font-bold text-gray-800 text-sm">
              {{ t("portal.more.emailReminders") }}
            </p>
            <p class="text-xs text-gray-400">
              {{ t("portal.more.emailRemindersNote") }}
            </p>
          </div>
        </div>
        <ToggleSwitch
          v-model="receiveEmails"
          @change="saveNotificationPreference"
        />
      </div>
    </div>

    <!-- Save as an App -->
    <div
      v-if="showInstallCard"
      class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-center justify-between gap-3"
    >
      <div class="flex items-center gap-2 min-w-0">
        <i class="pi pi-mobile text-[var(--p-primary-color)]"></i>
        <div class="min-w-0">
          <p class="font-bold text-gray-800 text-sm truncate">
            {{ t("portal.install.title") }}
          </p>
          <p v-if="!installIsActionable" class="text-xs text-gray-400">
            {{ installSubtitle }}
          </p>
        </div>
      </div>
      <Button
        v-if="installIsActionable"
        :label="t('portal.install.button')"
        size="small"
        outlined
        @click="handleInstallClick"
      />
    </div>

    <!-- Turn On Notifications -->
    <div
      v-if="showNotificationsCard"
      class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-center justify-between gap-3"
    >
      <div class="flex items-center gap-2 min-w-0">
        <i class="pi pi-bell text-[var(--p-primary-color)]"></i>
        <p class="font-bold text-gray-800 text-sm truncate">
          {{ t("portal.notifications.title") }}
        </p>
      </div>
      <Button
        :label="t('portal.notifications.button')"
        size="small"
        outlined
        @click="handleEnableNotifications"
      />
    </div>

    <!-- Logout -->
    <Button
      :label="t('portal.more.logout')"
      icon="pi pi-sign-out"
      severity="secondary"
      outlined
      class="w-full"
      @click="logout"
    />
  </div>

  <Dialog
    v-model:visible="showManualInstallDialog"
    modal
    :header="t('portal.install.iosTitle')"
    :style="{ width: '340px', maxWidth: '90vw' }"
  >
    <p class="text-sm text-gray-600">
      {{ isIOS ? t("portal.install.iosInstructions", { icon: "" }) : t("portal.install.braveInstructions") }}
      <i :class="isIOS ? 'pi pi-upload' : 'pi pi-ellipsis-v'" class="text-[var(--p-primary-600)]"></i>
    </p>
  </Dialog>

  <Dialog
    v-model:visible="showQrModal"
    modal
    :header="t('portal.membership.qrNote')"
    :style="{ width: '360px', maxWidth: '90vw' }"
    @show="renderLargeQr"
  >
    <div class="flex justify-center py-4">
      <canvas ref="qrCanvasLarge" class="w-64 h-64"></canvas>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive, nextTick } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useAuthStore } from "../../stores/auth";
import ClientPackagesPanel from "../../components/ClientPackagesPanel.vue";
import InputText from "primevue/inputtext";
import Password from "primevue/password";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import ToggleSwitch from "primevue/toggleswitch";
import { useToast } from "primevue/usetoast";
import QRCode from "qrcode";
import { usePwaInstall } from "../../composables/usePwaInstall";
import { usePushNotifications } from "../../composables/usePushNotifications";

const { t } = useI18n();
const router = useRouter();
const authStore = useAuthStore();
const toast = useToast();
const { canInstall, promptInstall, isIOS, isStandalone, status: pwaStatus } = usePwaInstall();
const {
  isSupported: pushSupported,
  permission: pushPermission,
  subscribe: subscribeToPush,
} = usePushNotifications();

const showInstallCard = computed(() => pwaStatus() !== "installed");
const installIsActionable = computed(() =>
  ["ready", "manual"].includes(pwaStatus()),
);
const installSubtitle = computed(() => {
  switch (pwaStatus()) {
    case "insecure-context":
      return t("portal.install.unavailableInsecure");
    case "not-yet-eligible":
      return t("portal.install.unavailableNotYet");
    default:
      return "";
  }
});
const showManualInstallDialog = ref(false);

const showNotificationsCard = computed(
  () =>
    pushSupported &&
    pushPermission.value !== "granted" &&
    (!isIOS || isStandalone),
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

const handleInstallClick = async () => {
  if (canInstall.value) {
    const outcome = await promptInstall();
    if (outcome === "accepted") {
      toast.add({ severity: "success", detail: t("portal.install.installedToast"), life: 3000 });
    }
    return;
  }
  showManualInstallDialog.value = true;
};

const clientData = ref<any>(null);
const membership = ref<any>(null);
const membershipUsage = ref<any[]>([]);
const membershipLoading = ref(true);
const qrCanvas = ref<HTMLCanvasElement | null>(null);
const qrCanvasLarge = ref<HTMLCanvasElement | null>(null);
const showQrModal = ref(false);

const showEditProfile = ref(false);
const showChangePassword = ref(false);
const isSavingProfile = ref(false);
const isSavingPassword = ref(false);
const receiveEmails = ref(true);

const editProfileForm = reactive({
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
});

const passwordForm = reactive({
  current: "",
  newPass: "",
  confirm: "",
});

const renderLargeQr = () => {
  if (qrCanvasLarge.value && clientData.value?.qr_token) {
    QRCode.toCanvas(qrCanvasLarge.value, clientData.value.qr_token, {
      width: 256,
    }).catch(() => {});
  }
};

onMounted(async () => {
  try {
    const res = await fetch(`/api/v1/clients/${authStore.clientId}/full`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    });
    if (res.ok) {
      const data = await res.json();
      clientData.value = data.client;
      editProfileForm.first_name = data.client?.first_name || "";
      editProfileForm.last_name = data.client?.last_name || "";
      editProfileForm.email = data.client?.email || "";
      editProfileForm.phone = data.client?.phone || "";
      receiveEmails.value = data.client?.receive_emails ?? true;
    }
  } catch {}

  try {
    const memRes = await fetch(
      `/api/v1/clients/${authStore.clientId}/membership`,
      { headers: { Authorization: `Bearer ${authStore.token}` } },
    );
    if (memRes.ok) {
      const memData = await memRes.json();
      membership.value = memData.membership;
      membershipUsage.value = memData.usage || [];
    }
  } catch {
  } finally {
    membershipLoading.value = false;
  }

  if (clientData.value?.qr_token) {
    await nextTick();
    if (qrCanvas.value) {
      QRCode.toCanvas(qrCanvas.value, clientData.value.qr_token, {
        width: 128,
      }).catch(() => {});
    }
  }
});

const saveProfile = async () => {
  if (!editProfileForm.first_name || !editProfileForm.last_name) {
    toast.add({
      severity: "warn",
      summary: "Required",
      detail: "First and last name are required",
      life: 3000,
    });
    return;
  }
  isSavingProfile.value = true;
  try {
    const res = await fetch("/api/v1/portal/profile", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authStore.token}`,
      },
      body: JSON.stringify(editProfileForm),
    });
    if (!res.ok) throw new Error((await res.json()).error || "Failed");
    toast.add({
      severity: "success",
      summary: "Saved",
      detail: "Profile updated.",
      life: 3000,
    });
    showEditProfile.value = false;
  } catch (e: any) {
    toast.add({ severity: "error", summary: "Error", detail: e.message, life: 3000 });
  } finally {
    isSavingProfile.value = false;
  }
};

const changePassword = async () => {
  if (passwordForm.newPass !== passwordForm.confirm) return;
  isSavingPassword.value = true;
  try {
    const res = await fetch("/api/v1/portal/password", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authStore.token}`,
      },
      body: JSON.stringify({
        currentPassword: passwordForm.current,
        newPassword: passwordForm.newPass,
      }),
    });
    if (!res.ok) throw new Error((await res.json()).error || "Failed");
    toast.add({ severity: "success", summary: "Password updated", life: 3000 });
    passwordForm.current = "";
    passwordForm.newPass = "";
    passwordForm.confirm = "";
    showChangePassword.value = false;
  } catch (e: any) {
    toast.add({ severity: "error", summary: "Error", detail: e.message, life: 3000 });
  } finally {
    isSavingPassword.value = false;
  }
};

const saveNotificationPreference = async () => {
  try {
    await fetch("/api/v1/portal/notifications", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authStore.token}`,
      },
      body: JSON.stringify({ receive_emails: receiveEmails.value }),
    });
  } catch {}
};

const logout = () => {
  authStore.logout();
  router.push("/");
};
</script>
