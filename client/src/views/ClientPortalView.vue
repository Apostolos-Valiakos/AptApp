<template>
  <div class="p-6 max-w-6xl mx-auto space-y-6">
    <!-- Active Contest Banner -->
    <div
      v-if="activeContest"
      class="relative rounded-2xl overflow-hidden shadow-md"
      :style="activeContest.image_url ? '' : 'background: linear-gradient(135deg, #8B6F4E, #D4A97A)'"
    >
      <img
        v-if="activeContest.image_url"
        :src="activeContest.image_url"
        class="absolute inset-0 w-full h-full object-cover"
      />
      <div
        class="relative z-10 p-6 flex flex-col md:flex-row items-start md:items-center gap-4"
        :class="activeContest.image_url ? 'bg-black/50' : ''"
      >
        <div class="flex-1 text-white">
          <div class="flex items-center gap-2 mb-1">
            <i class="pi pi-trophy text-yellow-300 text-lg"></i>
            <span class="text-xs font-semibold uppercase tracking-widest text-yellow-200">Διαγωνισμός</span>
          </div>
          <h2 class="text-xl font-bold">{{ activeContest.name }}</h2>
          <p v-if="activeContest.description" class="text-sm text-white/80 mt-1">{{ activeContest.description }}</p>
          <p class="text-xs text-white/60 mt-2">
            Λήγει {{ new Date(activeContest.end_date).toLocaleDateString("el-GR", { day: "2-digit", month: "long", year: "numeric" }) }}
          </p>
        </div>
        <div class="flex flex-col items-center bg-white/20 backdrop-blur-sm rounded-xl px-6 py-4 text-white min-w-[110px]">
          <span class="text-4xl font-black">{{ activeContest.entries }}</span>
          <span class="text-xs font-medium mt-1 text-white/80">Συμμετοχές</span>
        </div>
      </div>
    </div>

    <!-- Welcome Banner -->
    <div
      class="bg-gradient-to-r from-[var(--p-primary-color)] to-[var(--p-primary-600)] text-white p-6 rounded-2xl shadow-md"
    >
      <h1 class="text-2xl font-bold">
        {{ t("portal.greeting", { name: clientData?.first_name }) }}
      </h1>
      <p class="text-white/80 text-sm mt-1">{{ t("portal.subtitle") }}</p>
    </div>

    <div v-if="loading" class="space-y-4">
      <Skeleton width="100%" height="150px" />
      <Skeleton width="100%" height="300px" />
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <!-- Left Sidebar -->
      <div class="md:col-span-1 space-y-6">
        <!-- My Membership -->
        <div class="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <h3 class="font-bold text-gray-700 mb-4">{{ t("portal.membership.title") }}</h3>

          <div v-if="membershipLoading" class="text-center py-4">
            <i class="pi pi-spin pi-spinner text-2xl text-gray-300"></i>
          </div>

          <template v-else>
            <div v-if="membership" class="space-y-3">
              <div class="flex items-center justify-between">
                <span class="font-bold text-[var(--p-primary-600)]">{{ membership.tier_name }}</span>
                <span class="text-xs text-gray-400">
                  {{ t("portal.membership.renewsOn", { date: new Date(membership.current_period_end).toLocaleDateString() }) }}
                </span>
              </div>
              <div v-for="u in membershipUsage" :key="u.service_id" class="text-sm flex justify-between">
                <span class="text-gray-600">{{ u.service_name }}</span>
                <span class="font-medium text-gray-900">
                  {{ u.quota_per_month === null ? `${u.used_this_month} / ∞` : `${u.used_this_month} / ${u.quota_per_month}` }}
                </span>
              </div>
            </div>
            <div v-else class="text-sm text-gray-400 text-center py-2">
              {{ t("portal.membership.none") }}
            </div>
          </template>

          <div class="border-t border-gray-100 mt-4 pt-4 flex flex-col items-center">
            <canvas ref="qrCanvas" class="w-32 h-32"></canvas>
            <p class="text-xs text-gray-400 mt-2 text-center">{{ t("portal.membership.qrNote") }}</p>
          </div>
        </div>

        <!-- Upcoming Appointments -->
        <div class="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <h3 class="font-bold text-gray-700 mb-4">
            {{ t("portal.upcoming.title") }}
          </h3>

          <!-- Empty state -->
          <div
            v-if="upcomingAppointments.length === 0"
            class="flex flex-col items-center justify-center py-10 text-center"
          >
            <i class="pi pi-calendar text-4xl text-gray-300 mb-3"></i>
            <h3 class="text-base font-medium text-gray-400">
              {{ t("portal.upcoming.empty") }}
            </h3>
          </div>

          <div
            v-for="appt in upcomingAppointments"
            :key="appt.id"
            class="mb-4 pb-4 border-b last:border-0"
          >
            <div class="font-bold text-[var(--p-primary-600)]">
              {{ getRelativeDate(appt.start_time) }}
            </div>
            <div class="text-sm text-gray-500">
              {{
                new Date(appt.start_time).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              }}
            </div>
            <div class="text-sm font-medium mt-1">{{ appt.service_names }}</div>

            <div
              v-if="appt.staff_names"
              class="text-xs text-gray-500 flex items-center gap-1 mt-1"
            >
              <i class="pi pi-user text-[10px]"></i>
              <span>{{ appt.staff_names }}</span>
            </div>
            <div v-if="appt.payment_status !== 'paid'" class="flex gap-3 mt-2">
              <button
                v-if="appt.status !== 'confirmed'"
                @click="confirmAppointment(appt)"
                class="text-xs text-green-600 hover:text-green-800 font-medium flex items-center gap-1 transition-colors"
              >
                <i class="pi pi-check-circle text-xs"></i>
                Confirm
              </button>
              <button
                @click="cancelAppointment(appt)"
                class="text-xs text-red-500 hover:text-red-700 font-medium flex items-center gap-1 transition-colors"
              >
                <i class="pi pi-times-circle text-xs"></i>
                Cancel
              </button>
            </div>
          </div>
        </div>

        <!-- Documents -->
        <div class="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <h3 class="font-bold text-gray-700 mb-4">
            {{ t("portal.documents.title") }}
          </h3>
          <div
            v-if="files.length === 0"
            class="flex flex-col items-center justify-center py-8 text-center"
          >
            <i class="pi pi-folder-open text-3xl text-gray-300 mb-2"></i>
            <p class="text-sm text-gray-400">
              {{ t("portal.documents.empty") }}
            </p>
          </div>
          <ul class="space-y-3">
            <li
              v-for="file in files"
              :key="file.id"
              class="flex justify-between items-center p-3 bg-gray-50 rounded-lg"
            >
              <div class="flex items-center gap-2 min-w-0">
                <i
                  :class="[
                    getFileIcon(file.file_name),
                    'text-gray-400 flex-shrink-0',
                  ]"
                ></i>
                <span class="text-sm truncate">{{ file.file_name }}</span>
              </div>
              <Button
                icon="pi pi-download"
                class="p-button-rounded p-button-text p-button-sm flex-shrink-0"
                @click="downloadFile(file)"
              />
            </li>
          </ul>
        </div>
      </div>

      <!-- Edit Contact Info, Change Password, Email Notifications -->
      <div class="md:col-span-2 space-y-4">
        <!-- Edit Contact Info -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div
            class="flex items-center justify-between cursor-pointer"
            @click="showEditProfile = !showEditProfile"
          >
            <div class="flex items-center gap-2">
              <i class="pi pi-user-edit text-[var(--p-primary-color)]"></i>
              <h3 class="font-bold text-gray-800">My Information</h3>
            </div>
            <i
              :class="
                showEditProfile ? 'pi pi-chevron-up' : 'pi pi-chevron-down'
              "
              class="text-gray-400 text-sm"
            ></i>
          </div>
          <div v-if="showEditProfile" class="mt-4 space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-medium text-gray-500 mb-1"
                  >First Name</label
                >
                <InputText
                  v-model="editProfileForm.first_name"
                  class="w-full"
                />
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
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div
            class="flex items-center justify-between cursor-pointer"
            @click="showChangePassword = !showChangePassword"
          >
            <div class="flex items-center gap-2">
              <i class="pi pi-lock text-[var(--p-primary-color)]"></i>
              <h3 class="font-bold text-gray-800">Change Password</h3>
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
                  passwordForm.confirm &&
                  passwordForm.newPass !== passwordForm.confirm
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
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <i class="pi pi-bell text-[var(--p-primary-color)]"></i>
              <div>
                <p class="font-bold text-gray-800 text-sm">Email Reminders</p>
                <p class="text-xs text-gray-400">
                  Receive appointment reminder emails
                </p>
              </div>
            </div>
            <ToggleSwitch
              v-model="receiveEmails"
              @change="saveNotificationPreference"
            />
          </div>
        </div>
      </div>

      <!-- Past Appointments -->
      <!-- <div class="md:col-span-3">
        <div class="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm h-full">
          <h3 class="font-bold text-gray-700 mb-4">{{ t('portal.past.title') }}</h3>
          <DataTable
            :value="pastAppointments"
            :paginator="true"
            :rows="10"
            class="p-datatable-sm"
            stripedRows
          >
            <Column field="start_time" :header="t('portal.past.date')">
              <template #body="{ data }">
                {{ new Date(data.start_time).toLocaleDateString() }}
              </template>
            </Column>

            <Column field="service_names" :header="t('portal.past.service')"></Column>

            <Column field="staff_names" :header="t('portal.past.professional')">
              <template #body="{ data }">
                <span class="text-gray-600">{{ data.staff_names || "—" }}</span>
              </template>
            </Column>

            <Column field="status" :header="t('portal.past.status')">
              <template #body="{ data }">
                <span
                  :class="['px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase inline-flex items-center', getStatusBadge(data.status)]"
                >
                  {{ data.status }}
                </span>
              </template>
            </Column>
          </DataTable>
        </div>
      </div> -->
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, reactive, nextTick } from "vue";
import { useI18n } from "vue-i18n";
import { useAuthStore } from "../stores/auth";
import Skeleton from "primevue/skeleton";
import DataTable from "primevue/datatable";
import Column from "primevue/column";
import Button from "primevue/button";
import Password from "primevue/password";
import { useToast } from "primevue/usetoast";
import QRCode from "qrcode";

const { t } = useI18n();
const authStore = useAuthStore();
const loading = ref(true);
const toast = useToast();

const activeContest = ref<any>(null);
const clientData = ref<any>(null);
const history = ref<any[]>([]);
const files = ref<any[]>([]);

const membership = ref<any>(null);
const membershipUsage = ref<any[]>([]);
const membershipLoading = ref(true);
const qrCanvas = ref<HTMLCanvasElement | null>(null);

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

const upcomingAppointments = computed(() => {
  const now = new Date().getTime();
  return history.value
    .filter((a) => new Date(a.start_time).getTime() > now)
    .sort(
      (a, b) =>
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
    );
});

const pastAppointments = computed(() => {
  const now = new Date().getTime();
  return history.value.filter((a) => new Date(a.start_time).getTime() <= now);
});

onMounted(async () => {
  // Fetch active contest for this client
  try {
    const contestRes = await fetch("/api/v1/contests/active", {
      headers: { Authorization: `Bearer ${authStore.token}` },
    });
    if (contestRes.ok) {
      const contestData = await contestRes.json();
      activeContest.value = contestData ?? null;
    }
  } catch {}

  try {
    const res = await fetch(`/api/v1/clients/${authStore.clientId}/full`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    });
    const data = await res.json();
    if (res.ok) {
      clientData.value = data.client;
      history.value = data.history;
      files.value = data.files;
      editProfileForm.first_name = data.client?.first_name || "";
      editProfileForm.last_name = data.client?.last_name || "";
      editProfileForm.email = data.client?.email || "";
      editProfileForm.phone = data.client?.phone || "";
      receiveEmails.value = data.client?.receive_emails ?? true;
    }
  } catch (err) {
  } finally {
    loading.value = false;
  }

  try {
    const memRes = await fetch(`/api/v1/clients/${authStore.clientId}/membership`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    });
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
      QRCode.toCanvas(qrCanvas.value, clientData.value.qr_token, { width: 128 }).catch(() => {});
    }
  }
});

const cancelAppointment = async (appt: any) => {
  const token = authStore.token;
  try {
    const res = await fetch(`/api/v1/portal/appointments/${appt.id}/cancel`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok)
      throw new Error((await res.json()).error || "Failed to cancel");
    history.value = history.value.map((a: any) =>
      a.id === appt.id ? { ...a, status: "cancelled" } : a,
    );
    toast.add({ severity: "success", summary: "Cancelled", detail: "Appointment cancelled.", life: 3000 });
  } catch (e: any) {
    toast.add({ severity: "error", summary: "Error", detail: e.message, life: 3000 });
  }
};

const confirmAppointment = async (appt: any) => {
  const token = authStore.token;
  try {
    const res = await fetch(`/api/v1/portal/appointments/${appt.id}/confirm`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok)
      throw new Error((await res.json()).error || "Failed to confirm");
    history.value = history.value.map((a: any) =>
      a.id === appt.id ? { ...a, status: "confirmed" } : a,
    );
    toast.add({ severity: "success", summary: "Confirmed", detail: "Appointment confirmed.", life: 3000 });
  } catch (e: any) {
    toast.add({ severity: "error", summary: "Error", detail: e.message, life: 3000 });
  }
};

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
  const token = authStore.token;
  try {
    const res = await fetch("/api/v1/portal/profile", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(editProfileForm),
    });
    if (!res.ok) throw new Error((await res.json()).error || "Failed");
    if (clientData.value) {
      clientData.value.first_name = editProfileForm.first_name;
      clientData.value.last_name = editProfileForm.last_name;
    }
    toast.add({
      severity: "success",
      summary: "Saved",
      detail: "Profile updated.",
      life: 3000,
    });
    showEditProfile.value = false;
  } catch (e: any) {
    toast.add({
      severity: "error",
      summary: "Error",
      detail: e.message,
      life: 3000,
    });
  } finally {
    isSavingProfile.value = false;
  }
};

const changePassword = async () => {
  if (passwordForm.newPass !== passwordForm.confirm) return;
  isSavingPassword.value = true;
  const token = authStore.token;
  try {
    const res = await fetch("/api/v1/portal/password", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
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
    toast.add({
      severity: "error",
      summary: "Error",
      detail: e.message,
      life: 3000,
    });
  } finally {
    isSavingPassword.value = false;
  }
};

const saveNotificationPreference = async () => {
  const token = authStore.token;
  try {
    await fetch("/api/v1/portal/notifications", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ receive_emails: receiveEmails.value }),
    });
  } catch {}
};

const downloadFile = async (file) => {
  if (!file || !file.id) {
    toast.add({
      severity: "error",
      summary: t("common.error"),
      detail: t("portal.toast.fileIdMissing"),
      life: 3000,
    });
    return;
  }

  try {
    const token = localStorage.getItem("token");
    const response = await fetch(`/api/v1/clients/files/${file.id}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Download failed on server");
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.file_name || "download";
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  } catch (err) {
    toast.add({
      severity: "error",
      summary: t("common.error"),
      detail: t("portal.toast.downloadFailed"),
      life: 3000,
    });
  }
};

const getStatusBadge = (status: string) => {
  const map: any = {
    completed: "bg-green-100 text-green-700",
    confirmed: "bg-blue-100 text-blue-700",
    new: "bg-gray-100 text-gray-600",
    cancelled: "bg-red-100 text-red-600",
    "no-show": "bg-red-200 text-red-800",
    arrived: "bg-orange-100 text-orange-700",
    started: "bg-yellow-100 text-yellow-700",
  };
  return map[status] || "bg-gray-100 text-gray-600";
};

const getRelativeDate = (dateStr: string) => {
  const date = new Date(dateStr);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (date.toDateString() === today.toDateString())
    return t("portal.upcoming.today");
  if (date.toDateString() === tomorrow.toDateString())
    return t("portal.upcoming.tomorrow");
  const diffDays = Math.ceil(
    (date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays <= 7) return t("portal.upcoming.inDays", { n: diffDays });
  return date.toLocaleDateString("el-GR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
};

const getFileIcon = (filename: string) => {
  const ext = filename?.split(".").pop()?.toLowerCase();
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext || ""))
    return "pi pi-image";
  if (["pdf"].includes(ext || "")) return "pi pi-file-pdf";
  if (["doc", "docx"].includes(ext || "")) return "pi pi-file-word";
  return "pi pi-file";
};
</script>
