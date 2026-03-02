<template>
  <div class="p-6 max-w-6xl mx-auto space-y-6">
    <div class="flex justify-between items-end mb-6">
      <div>
        <h1 class="text-3xl font-bold text-gray-900">My Portal</h1>
        <p class="text-gray-500">Welcome back, {{ clientData?.first_name }}</p>
      </div>
    </div>

    <div v-if="loading" class="space-y-4">
      <Skeleton width="100%" height="150px" />
      <Skeleton width="100%" height="300px" />
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div class="md:col-span-1 space-y-6">
        <div class="bg-white p-6 rounded-2xl border shadow-sm">
          <h3 class="font-bold text-gray-700 mb-4">Upcoming Appointments</h3>
          <div
            v-if="upcomingAppointments.length === 0"
            class="text-sm text-gray-500"
          >
            No upcoming appointments scheduled.
          </div>
          <div
            v-for="appt in upcomingAppointments"
            :key="appt.id"
            class="mb-4 pb-4 border-b last:border-0"
          >
            <div class="font-bold text-indigo-600">
              {{ new Date(appt.start_time).toLocaleDateString() }}
            </div>
            <div class="text-sm text-gray-700">
              {{
                new Date(appt.start_time).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              }}
            </div>
            <div class="text-sm font-medium mt-1">{{ appt.service_names }}</div>
          </div>
        </div>

        <div class="bg-white p-6 rounded-2xl border shadow-sm">
          <h3 class="font-bold text-gray-700 mb-4">My Documents</h3>
          <div v-if="files.length === 0" class="text-sm text-gray-500">
            No documents available.
          </div>
          <ul class="space-y-3">
            <li
              v-for="file in files"
              :key="file.id"
              class="flex justify-between items-center p-3 bg-gray-50 rounded-lg"
            >
              <span class="text-sm truncate mr-2">{{ file.file_name }}</span>
              <Button
                icon="pi pi-download"
                class="p-button-rounded p-button-text p-button-sm"
                @click="downloadFile(file)"
              />
            </li>
          </ul>
        </div>
      </div>

      <div class="md:col-span-2">
        <div class="bg-white p-6 rounded-2xl border shadow-sm h-full">
          <h3 class="font-bold text-gray-700 mb-4">Past Appointments</h3>
          <DataTable
            :value="pastAppointments"
            :paginator="true"
            :rows="10"
            class="p-datatable-sm"
          >
            <Column field="start_time" header="Date">
              <template #body="{ data }">{{
                new Date(data.start_time).toLocaleDateString()
              }}</template>
            </Column>
            <Column field="service_names" header="Service"></Column>
            <Column field="status" header="Status">
              <template #body="{ data }">
                <span
                  class="px-2 py-1 text-xs rounded-full bg-gray-100 uppercase font-bold text-gray-600"
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
import { ref, onMounted, computed } from "vue";
import { useAuthStore } from "../stores/auth";
import Skeleton from "primevue/skeleton";
import DataTable from "primevue/datatable";
import Column from "primevue/column";
import Button from "primevue/button";
import { useToast } from "primevue/usetoast";

const authStore = useAuthStore();
const loading = ref(true);
const toast = useToast();

const clientData = ref<any>(null);
const history = ref<any[]>([]);
const files = ref<any[]>([]);

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
  console.log("Fetching portal for client ID:", authStore.clientId);
  try {
    const res = await fetch(`/api/v1/clients/${authStore.clientId}/full`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    });
    const data = await res.json();
    if (res.ok) {
      clientData.value = data.client;
      history.value = data.history;
      files.value = data.files;
    }
  } catch (err) {
    console.error("Failed to load portal data", err);
  } finally {
    loading.value = false;
  }
});

const downloadFile = async (file) => {
  if (!file || !file.id) {
    toast.add({
      severity: "error",
      summary: "Error",
      detail: "File ID is missing",
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
    console.error("Download Error:", err);
    toast.add({
      severity: "error",
      summary: "Download failed",
      detail: err.message,
      life: 3000,
    });
  }
};
</script>
