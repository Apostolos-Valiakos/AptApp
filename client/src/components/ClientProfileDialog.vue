<template>
  <Dialog
    v-model:visible="isVisible"
    modal
    header="Client Profile"
    :style="{ width: '800px', maxWidth: '95vw', maxHeight: '100%' }"
    :draggable="false"
    class="client-profile-dialog"
    :breakpoints="{ '960px': '100vw' }"
    :contentStyle="{ height: '100%' }"
  >
    <div v-if="loading" class="p-8 text-center">
      <i class="pi pi-spin pi-spinner text-4xl text-gray-400"></i>
    </div>

    <div v-else-if="clientData" class="flex flex-col h-full">
      <div
        class="flex flex-col sm:flex-row items-center sm:items-start gap-4 mb-6 pb-6 border-b border-gray-100"
      >
        <div
          class="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-2xl font-bold flex-shrink-0"
        >
          {{ clientData.first_name?.[0] }}{{ clientData.last_name?.[0] }}
        </div>
        <div class="text-center sm:text-left flex-grow">
          <h2 class="text-2xl font-bold text-gray-900 leading-tight">
            {{ clientData.first_name }} {{ clientData.last_name }}
          </h2>
          <div
            class="text-gray-500 text-sm flex flex-col sm:flex-row gap-1 sm:gap-4 mt-1 items-center sm:items-start"
          >
            <span
              ><i class="pi pi-phone mr-1"></i>
              {{ clientData.phone || "No Phone" }}</span
            >
            <span
              ><i class="pi pi-envelope mr-1"></i>
              {{ clientData.email || "No Email" }}</span
            >
          </div>
        </div>
        <div
          class="text-center sm:text-right mt-2 sm:mt-0 w-full sm:w-auto bg-gray-50 sm:bg-transparent p-2 sm:p-0 rounded-lg"
        >
          <div class="text-xs text-gray-500 uppercase tracking-wider font-bold">
            Balance
          </div>
          <div
            class="text-2xl font-bold"
            :class="
              Number(clientData.outstanding_balance) > 0
                ? 'text-red-500'
                : 'text-green-600'
            "
          >
            €{{ Number(clientData.outstanding_balance || 0).toFixed(2) }}
          </div>
        </div>
      </div>

      <div class="flex gap-6 border-b border-gray-200 mb-6 overflow-x-auto">
        <button
          v-for="tab in ['Info', 'History', 'Files']"
          :key="tab"
          @click="activeTab = tab"
          class="pb-2 px-1 text-sm font-medium transition-colors border-b-2 whitespace-nowrap"
          :class="
            activeTab === tab
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          "
        >
          {{ tab }}
        </button>
      </div>

      <div class="flex-grow overflow-y-auto pr-2 pb-4">
        <div v-if="activeTab === 'Info'" class="space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                class="block text-xs font-bold text-gray-500 uppercase mb-1"
                >First Name</label
              >
              <InputText v-model="editForm.first_name" class="w-full" />
            </div>
            <div>
              <label
                class="block text-xs font-bold text-gray-500 uppercase mb-1"
                >Last Name</label
              >
              <InputText v-model="editForm.last_name" class="w-full" />
            </div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                class="block text-xs font-bold text-gray-500 uppercase mb-1"
                >Email</label
              >
              <InputText v-model="editForm.email" class="w-full" />
            </div>
            <div>
              <label
                class="block text-xs font-bold text-gray-500 uppercase mb-1"
                >Phone</label
              >
              <InputText v-model="editForm.phone" class="w-full" />
            </div>
          </div>
          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1"
              >Notes</label
            >
            <Textarea v-model="editForm.notes" rows="3" class="w-full" />
          </div>

          <div class="bg-gray-50 p-4 rounded-lg border border-gray-100">
            <div class="flex justify-between items-center mb-2">
              <span class="text-xs font-bold text-gray-500 uppercase"
                >Additional Details</span
              >
              <Button
                icon="pi pi-plus"
                size="small"
                class="p-button-text p-button-sm"
                @click="addCustomField"
              />
            </div>

            <div
              v-if="editForm.custom_fields.length === 0"
              class="text-center py-4 text-gray-400 text-sm italic"
            >
              No additional details added.
            </div>

            <div
              v-for="(field, idx) in editForm.custom_fields"
              :key="idx"
              class="flex flex-col sm:flex-row gap-2 mb-3 sm:mb-2 border-b sm:border-none border-gray-200 pb-3 sm:pb-0 last:border-0"
            >
              <div class="w-full sm:w-1/3">
                <InputText
                  v-model="field.title"
                  placeholder="Label"
                  class="w-full font-bold p-inputtext-sm bg-white"
                />
              </div>
              <div class="flex-grow flex gap-2">
                <InputText
                  v-model="field.value"
                  placeholder="Value"
                  class="w-full p-inputtext-sm"
                />
                <Button
                  icon="pi pi-trash"
                  class="p-button-danger p-button-text p-button-sm flex-shrink-0"
                  @click="editForm.custom_fields.splice(idx, 1)"
                />
              </div>
            </div>
          </div>

          <div class="pt-4 flex justify-end">
            <Button
              label="Save Changes"
              icon="pi pi-check"
              @click="saveClientInfo"
              :loading="saving"
              class="w-full sm:w-auto"
            />
          </div>
        </div>

        <div v-if="activeTab === 'History'" class="space-y-3">
          <div
            v-if="history.length === 0"
            class="text-center text-gray-400 py-8"
          >
            No appointment history found.
          </div>
          <div
            v-for="appt in history"
            :key="appt.id"
            class="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 border border-gray-100 rounded-lg bg-gray-50 gap-2"
          >
            <div>
              <div class="font-bold text-gray-900">
                {{ new Date(appt.start_time).toLocaleDateString() }}
                <span class="text-gray-400 font-normal text-sm ml-2">{{
                  new Date(appt.start_time).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                }}</span>
              </div>
              <div class="text-sm text-gray-600 mt-1">
                {{ appt.service_names || "No Services" }}
              </div>
            </div>
            <div
              class="flex justify-between w-full sm:w-auto sm:block text-right"
            >
              <span
                class="text-xs px-2 py-0.5 rounded uppercase font-bold mr-2"
                :class="getStatusColor(appt.status)"
              >
                {{ appt.status }}
              </span>
              <span class="font-bold"
                >€{{
                  (
                    Number(appt.total_service_price || 0) +
                    Number(appt.total_product_price || 0)
                  ).toFixed(2)
                }}</span
              >
            </div>
          </div>
        </div>

        <div v-if="activeTab === 'Files'" class="space-y-4">
          <div
            class="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:bg-gray-50 transition-colors cursor-pointer"
            @click="$refs.fileInput.click()"
          >
            <input
              type="file"
              ref="fileInput"
              @change="handleFileUpload"
              class="hidden"
            />
            <div v-if="!uploading">
              <i class="pi pi-cloud-upload text-3xl text-gray-400 mb-2"></i>
              <p class="text-sm text-gray-600 font-medium">
                Click to upload documents
              </p>
              <p class="text-xs text-gray-400 mt-1">Max 5MB per file</p>
              <Button label="Select File" size="small" class="mt-3" />
            </div>
            <div v-else>
              <i class="pi pi-spin pi-spinner text-2xl text-indigo-600"></i>
              <p class="text-sm text-indigo-600 mt-2">Uploading...</p>
            </div>
          </div>

          <div class="space-y-2">
            <div
              v-for="file in files"
              :key="file.id"
              class="flex items-center justify-between p-3 bg-white border border-gray-200 rounded hover:shadow-sm"
            >
              <div class="flex items-center gap-3 overflow-hidden">
                <div
                  class="w-10 h-10 bg-blue-50 text-blue-500 rounded flex items-center justify-center flex-shrink-0"
                >
                  <i class="pi" :class="getFileIcon(file.file_type)"></i>
                </div>
                <div class="min-w-0">
                  <div class="font-medium text-gray-900 truncate">
                    {{ file.file_name }}
                  </div>
                  <div class="text-xs text-gray-500">
                    {{ formatSize(file.file_size) }} •
                    {{ new Date(file.uploaded_at).toLocaleDateString() }}
                  </div>
                </div>
              </div>
              <div class="flex gap-1">
                <a
                  :href="`/api/v1/clients/files/${file.id}?token=${token}`"
                  target="_blank"
                  class="p-button p-component p-button-icon-only p-button-text p-button-rounded p-button-secondary"
                >
                  <span class="pi pi-download"></span>
                </a>
                <Button
                  icon="pi pi-trash"
                  class="p-button-text p-button-danger p-button-rounded"
                  @click="deleteFile(file.id)"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from "vue";

const props = defineProps(["visible", "clientId"]);
const emit = defineEmits(["update:visible", "refresh"]);

const isVisible = computed({
  get: () => props.visible,
  set: (val) => emit("update:visible", val),
});

const token = localStorage.getItem("token");
const activeTab = ref("Info");
const loading = ref(false);
const saving = ref(false);
const uploading = ref(false);
const clientData = ref<any>(null);
const history = ref<any[]>([]);
const files = ref<any[]>([]);
const editForm = ref<any>({});
const fileInput = ref<any>(null);

const fetchClientData = async () => {
  if (!props.clientId) return;
  loading.value = true;
  try {
    const res = await fetch(`/api/v1/clients/${props.clientId}/full`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    clientData.value = data.client;
    history.value = data.history;
    files.value = data.files;

    editForm.value = JSON.parse(JSON.stringify(data.client));
    if (!editForm.value.custom_fields) editForm.value.custom_fields = [];
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
};

watch(
  () => props.visible,
  (val) => {
    if (val && props.clientId) {
      activeTab.value = "Info";
      fetchClientData();
    }
  }
);

const addCustomField = () =>
  editForm.value.custom_fields.push({ title: "", value: "" });

const saveClientInfo = async () => {
  saving.value = true;
  try {
    const res = await fetch(`/api/v1/clients/${props.clientId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(editForm.value),
    });
    if (res.ok) {
      clientData.value = { ...clientData.value, ...editForm.value };
      emit("refresh");
    }
  } finally {
    saving.value = false;
  }
};

const handleFileUpload = async (event: any) => {
  const file = event.target.files[0];
  if (!file) return;

  uploading.value = true;
  const formData = new FormData();
  formData.append("file", file);

  try {
    const res = await fetch(`/api/v1/clients/${props.clientId}/files`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (res.ok) {
      await fetchClientData();
    } else {
      alert("File upload failed. Ensure it is under 5MB.");
    }
  } finally {
    uploading.value = false;
    if (fileInput.value) fileInput.value.value = "";
  }
};

const deleteFile = async (fileId: number) => {
  if (!confirm("Delete this file?")) return;
  await fetch(`/api/v1/clients/files/${fileId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  files.value = files.value.filter((f: any) => f.id !== fileId);
};

const formatSize = (bytes: number) => {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
};

const getFileIcon = (type: string) => {
  if (type.includes("image")) return "pi-image";
  if (type.includes("pdf")) return "pi-file-pdf";
  return "pi-file";
};

const getStatusColor = (s: string) => {
  const map: any = {
    new: "bg-blue-100 text-blue-800",
    confirmed: "bg-purple-100 text-purple-800",
    completed: "bg-green-100 text-green-800",
    cancelled: "bg-red-100 text-red-800",
    "no-show": "bg-red-200 text-red-900",
  };
  return map[s] || "bg-gray-100";
};
</script>
