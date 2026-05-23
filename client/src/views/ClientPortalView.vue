<template>
  <div class="p-6 max-w-6xl mx-auto space-y-6">

    <!-- Welcome Banner -->
    <div class="bg-gradient-to-r from-[var(--p-primary-color)] to-[var(--p-primary-600)] text-white p-6 rounded-2xl shadow-md">
      <h1 class="text-2xl font-bold">{{ t('portal.greeting', { name: clientData?.first_name }) }}</h1>
      <p class="text-white/80 text-sm mt-1">{{ t('portal.subtitle') }}</p>
    </div>

    <div v-if="loading" class="space-y-4">
      <Skeleton width="100%" height="150px" />
      <Skeleton width="100%" height="300px" />
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <!-- Left Sidebar -->
      <div class="md:col-span-1 space-y-6">

        <!-- Upcoming Appointments -->
        <div class="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <h3 class="font-bold text-gray-700 mb-4">{{ t('portal.upcoming.title') }}</h3>

          <!-- Empty state -->
          <div
            v-if="upcomingAppointments.length === 0"
            class="flex flex-col items-center justify-center py-10 text-center"
          >
            <i class="pi pi-calendar text-4xl text-gray-300 mb-3"></i>
            <h3 class="text-base font-medium text-gray-400">{{ t('portal.upcoming.empty') }}</h3>
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
            <button
              @click="cancelAppointment(appt)"
              class="mt-2 text-xs text-red-500 hover:text-red-700 font-medium flex items-center gap-1 transition-colors"
            >
              <i class="pi pi-times-circle text-xs"></i>
              Cancel Appointment
            </button>
          </div>
        </div>

        <!-- Documents -->
        <div class="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <h3 class="font-bold text-gray-700 mb-4">{{ t('portal.documents.title') }}</h3>
          <div
            v-if="files.length === 0"
            class="flex flex-col items-center justify-center py-8 text-center"
          >
            <i class="pi pi-folder-open text-3xl text-gray-300 mb-2"></i>
            <p class="text-sm text-gray-400">{{ t('portal.documents.empty') }}</p>
          </div>
          <ul class="space-y-3">
            <li
              v-for="file in files"
              :key="file.id"
              class="flex justify-between items-center p-3 bg-gray-50 rounded-lg"
            >
              <div class="flex items-center gap-2 min-w-0">
                <i :class="[getFileIcon(file.file_name), 'text-gray-400 flex-shrink-0']"></i>
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
          <div class="flex items-center justify-between cursor-pointer" @click="showEditProfile = !showEditProfile">
            <div class="flex items-center gap-2">
              <i class="pi pi-user-edit text-[var(--p-primary-color)]"></i>
              <h3 class="font-bold text-gray-800">My Information</h3>
            </div>
            <i :class="showEditProfile ? 'pi pi-chevron-up' : 'pi pi-chevron-down'" class="text-gray-400 text-sm"></i>
          </div>
          <div v-if="showEditProfile" class="mt-4 space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-medium text-gray-500 mb-1">First Name</label>
                <InputText v-model="editProfileForm.first_name" class="w-full" />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-500 mb-1">Last Name</label>
                <InputText v-model="editProfileForm.last_name" class="w-full" />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-500 mb-1">Email</label>
                <InputText v-model="editProfileForm.email" class="w-full" type="email" />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-500 mb-1">Phone</label>
                <InputText v-model="editProfileForm.phone" class="w-full" />
              </div>
            </div>
            <div class="flex justify-end">
              <Button label="Save Changes" size="small" :loading="isSavingProfile" @click="saveProfile" />
            </div>
          </div>
        </div>

        <!-- Change Password -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div class="flex items-center justify-between cursor-pointer" @click="showChangePassword = !showChangePassword">
            <div class="flex items-center gap-2">
              <i class="pi pi-lock text-[var(--p-primary-color)]"></i>
              <h3 class="font-bold text-gray-800">Change Password</h3>
            </div>
            <i :class="showChangePassword ? 'pi pi-chevron-up' : 'pi pi-chevron-down'" class="text-gray-400 text-sm"></i>
          </div>
          <div v-if="showChangePassword" class="mt-4 space-y-4">
            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1">Current Password</label>
              <Password v-model="passwordForm.current" :feedback="false" toggleMask class="w-full" inputClass="w-full" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1">New Password</label>
              <Password v-model="passwordForm.newPass" toggleMask class="w-full" inputClass="w-full" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1">Confirm New Password</label>
              <Password v-model="passwordForm.confirm" :feedback="false" toggleMask class="w-full" inputClass="w-full" />
              <small v-if="passwordForm.confirm && passwordForm.newPass !== passwordForm.confirm" class="text-red-500 block mt-1">Passwords do not match</small>
            </div>
            <div class="flex justify-end">
              <Button label="Update Password" size="small" :loading="isSavingPassword" :disabled="!passwordForm.current || !passwordForm.newPass || passwordForm.newPass !== passwordForm.confirm" @click="changePassword" />
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
                <p class="text-xs text-gray-400">Receive appointment reminder emails</p>
              </div>
            </div>
            <ToggleSwitch v-model="receiveEmails" @change="saveNotificationPreference" />
          </div>
        </div>

      </div>

      <!-- Past Appointments -->
      <div class="md:col-span-3">
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
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, reactive } from "vue";
import { useI18n } from "vue-i18n";
import { useAuthStore } from "../stores/auth";
import Skeleton from "primevue/skeleton";
import DataTable from "primevue/datatable";
import Column from "primevue/column";
import Button from "primevue/button";
import Password from "primevue/password";
import { useToast } from "primevue/usetoast";

const { t } = useI18n();
const authStore = useAuthStore();
const loading = ref(true);
const toast = useToast();

const clientData = ref<any>(null);
const history = ref<any[]>([]);
const files = ref<any[]>([]);

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
});

const cancelAppointment = async (appt: any) => {
  const token = authStore.token;
  try {
    const res = await fetch(`/api/v1/portal/appointments/${appt.id}/cancel`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error((await res.json()).error || "Failed to cancel");
    history.value = history.value.map((a: any) =>
      a.id === appt.id ? { ...a, status: "cancelled" } : a
    );
    toast.add({ severity: "success", summary: "Cancelled", detail: "Appointment cancelled.", life: 3000 });
  } catch (e: any) {
    toast.add({ severity: "error", summary: "Error", detail: e.message, life: 3000 });
  }
};

const saveProfile = async () => {
  if (!editProfileForm.first_name || !editProfileForm.last_name) {
    toast.add({ severity: "warn", summary: "Required", detail: "First and last name are required", life: 3000 });
    return;
  }
  isSavingProfile.value = true;
  const token = authStore.token;
  try {
    const res = await fetch("/api/v1/portal/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(editProfileForm),
    });
    if (!res.ok) throw new Error((await res.json()).error || "Failed");
    if (clientData.value) {
      clientData.value.first_name = editProfileForm.first_name;
      clientData.value.last_name = editProfileForm.last_name;
    }
    toast.add({ severity: "success", summary: "Saved", detail: "Profile updated.", life: 3000 });
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
  const token = authStore.token;
  try {
    const res = await fetch("/api/v1/portal/password", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ currentPassword: passwordForm.current, newPassword: passwordForm.newPass }),
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
  const token = authStore.token;
  try {
    await fetch("/api/v1/portal/notifications", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ receive_emails: receiveEmails.value }),
    });
  } catch {}
};

const downloadFile = async (file) => {
  if (!file || !file.id) {
    toast.add({
      severity: "error",
      summary: t('common.error'),
      detail: t('portal.toast.fileIdMissing'),
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
      summary: t('common.error'),
      detail: t('portal.toast.downloadFailed'),
      life: 3000,
    });
  }
};

const getStatusBadge = (status: string) => {
  const map: any = {
    completed: 'bg-green-100 text-green-700',
    confirmed: 'bg-blue-100 text-blue-700',
    new: 'bg-gray-100 text-gray-600',
    cancelled: 'bg-red-100 text-red-600',
    'no-show': 'bg-red-200 text-red-800',
    arrived: 'bg-orange-100 text-orange-700',
    started: 'bg-yellow-100 text-yellow-700',
  };
  return map[status] || 'bg-gray-100 text-gray-600';
};

const getRelativeDate = (dateStr: string) => {
  const date = new Date(dateStr);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (date.toDateString() === today.toDateString()) return t('portal.upcoming.today');
  if (date.toDateString() === tomorrow.toDateString()) return t('portal.upcoming.tomorrow');
  const diffDays = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 7) return t('portal.upcoming.inDays', { n: diffDays });
  return date.toLocaleDateString('el-GR', { weekday: 'short', day: 'numeric', month: 'short' });
};

const getFileIcon = (filename: string) => {
  const ext = filename?.split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) return 'pi pi-image';
  if (['pdf'].includes(ext || '')) return 'pi pi-file-pdf';
  if (['doc', 'docx'].includes(ext || '')) return 'pi pi-file-word';
  return 'pi pi-file';
};
</script>
