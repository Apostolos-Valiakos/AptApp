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
          v-if="isShopAdmin"
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
          v-for="tab in ['Info', 'Αρχεία', 'History', 'Membership']"
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
              >
                First Name
              </label>
              <InputText v-model="editForm.first_name" class="w-full" />
            </div>
            <div>
              <label
                class="block text-xs font-bold text-gray-500 uppercase mb-1"
              >
                Last Name
              </label>
              <InputText v-model="editForm.last_name" class="w-full" />
            </div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label
                class="block text-xs font-bold text-gray-500 uppercase mb-1"
              >
                Email
              </label>
              <InputText v-model="editForm.email" class="w-full" />
            </div>
            <div>
              <label
                class="block text-xs font-bold text-gray-500 uppercase mb-1"
              >
                Phone
              </label>
              <InputText v-model="editForm.phone" class="w-full" />
            </div>
            <div>
              <label
                class="block text-xs font-bold text-gray-500 uppercase mb-1"
              >
                Date of Birth
              </label>
              <Calendar
                v-model="editForm.date_of_birth"
                dateFormat="dd/mm/yy"
                class="w-full"
                placeholder="dd/mm/yyyy"
              />
            </div>
          </div>
          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">
              Notes
            </label>
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

        <div v-if="activeTab === 'History'" class="space-y-4">
          <div
            v-if="visibleHistory.length === 0"
            class="text-center text-gray-400 py-8"
          >
            No appointment history found.
          </div>
          <div
            v-for="appt in visibleHistory"
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
              <span class="font-bold">
                €{{
                  (
                    Number(appt.total_service_price || 0) +
                    Number(appt.total_product_price || 0)
                  ).toFixed(2)
                }}
              </span>
            </div>
          </div>
        </div>
        <div v-if="activeTab === 'Membership'" class="space-y-4">
          <div v-if="membershipLoading" class="text-center py-8">
            <i class="pi pi-spin pi-spinner text-2xl text-gray-400"></i>
          </div>

          <template v-else>
            <div v-if="membership" class="space-y-4">
              <div class="flex justify-between items-center p-4 bg-gray-50 rounded-lg border border-gray-100">
                <div>
                  <div class="font-bold text-gray-900">{{ membership.tier_name }}</div>
                  <span
                    class="text-xs px-2 py-0.5 rounded uppercase font-bold mt-1 inline-block"
                    :class="membershipStatusClass(membership.status)"
                  >
                    {{ membership.status }}
                  </span>
                </div>
                <div class="text-right text-sm text-gray-500">
                  Renews on<br />
                  <span class="font-bold text-gray-900">{{ new Date(membership.current_period_end).toLocaleDateString() }}</span>
                </div>
              </div>

              <div v-if="membershipUsage.length" class="space-y-2">
                <div
                  v-for="u in membershipUsage"
                  :key="u.service_id"
                  class="flex justify-between items-center text-sm p-2 border-b border-gray-50 last:border-0"
                >
                  <span class="text-gray-700">{{ u.service_name }}</span>
                  <span class="font-medium text-gray-900">
                    {{ u.quota_per_month === null ? `${u.used_this_month} used (unlimited)` : `${u.used_this_month} / ${u.quota_per_month} used` }}
                  </span>
                </div>
              </div>

              <div v-if="isShopAdmin" class="flex flex-wrap gap-2 pt-2">
                <Button label="Renew" size="small" @click="renewMembership" :loading="membershipActionLoading" />
                <Button label="Change Tier" size="small" text @click="showAssignMembership = !showAssignMembership" />
                <Button label="Cancel Membership" size="small" severity="danger" text @click="confirmCancelMembership" />
              </div>
            </div>

            <div v-else class="text-center text-gray-400 py-8">
              No active membership.
            </div>

            <div v-if="isShopAdmin && (!membership || showAssignMembership)" class="border-t border-gray-100 pt-4 space-y-3">
              <h4 class="text-sm font-bold text-gray-700">{{ membership ? 'Change Tier' : 'Assign a Membership' }}</h4>
              <Dropdown
                v-model="assignForm.tier_id"
                :options="allTiers"
                optionLabel="name"
                optionValue="id"
                placeholder="Select tier"
                class="w-full"
              />
              <Dropdown
                v-model="assignForm.billing_cycle"
                :options="[{ label: 'Monthly', value: 'monthly' }, { label: 'Yearly', value: 'yearly' }]"
                optionLabel="label"
                optionValue="value"
                class="w-full"
              />
              <Dropdown
                v-model="assignForm.payment_method"
                :options="['cash', 'card', 'bank-transfer']"
                placeholder="Payment method"
                class="w-full"
              />
              <div class="flex gap-2">
                <Button
                  label="Confirm"
                  size="small"
                  @click="assignMembership"
                  :loading="membershipActionLoading"
                  :disabled="!assignForm.tier_id"
                />
                <Button v-if="showAssignMembership" label="Cancel" size="small" text @click="showAssignMembership = false" />
              </div>
            </div>
          </template>
        </div>
        <div v-if="activeTab === 'Αρχεία'" class="space-y-4">
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
              <i class="pi pi-cloud-upload text-3xl text-gray-400"></i>
              <p class="text-sm text-gray-600 font-medium">
                Click to upload documents
              </p>
              <p class="text-xs text-gray-400 mt-1">Max 5MB per file</p>
              <Button label="Select File" size="small" class="mt-1" />
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
                  v-if="isShopAdmin"
                  :href="`/api/v1/clients/files/${file.id}?token=${token}`"
                  target="_blank"
                  class="p-button p-component p-button-icon-only p-button-text p-button-rounded p-button-secondary"
                >
                  <span class="pi pi-download"></span>
                </a>
                <Button
                  icon="pi pi-eye"
                  class="p-button-text p-button-secondary p-button-rounded"
                  @click="viewFile(file)"
                  v-tooltip="'View in new tab'"
                  :loading="viewingFileId === file.id"
                />
                <Button
                  v-if="isShopAdmin"
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
  <ConfirmDialog group="clientProfileFile"></ConfirmDialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from "vue";
import Exercises from "./Exercises.vue";
import { useAuthStore } from "../stores/auth";
import { useSettingsStore } from "../stores/settings";
import { storeToRefs } from "pinia";
import { useToast } from "primevue/usetoast";
import { useConfirm } from "primevue/useconfirm";
const authStore = useAuthStore();
const toast = useToast();
const confirm = useConfirm();
const isShopAdmin = authStore.isShopAdmin;
const settingsStore = useSettingsStore();
const { shopSettings } = storeToRefs(settingsStore);

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
const viewingFileId = ref<number | null>(null); // Track which file is loading

// Computed property for the Avatar initials
const initials = computed(() => {
  if (!clientData.value) return "";
  const f = clientData.value.first_name?.[0] || "";
  const l = clientData.value.last_name?.[0] || "";
  return `${f}${l}`.toUpperCase();
});

const visibleHistory = computed(() => {
  return history.value.filter((a) => {
    const isCashEquivalent =
      a.payment_method === "cash" ||
      (a.payment_method === "gift-card" && a.gift_card_source_method === "cash");
    if (settingsStore.hideCashPaid && a.payment_status === "paid" && isCashEquivalent) return false;
    if (settingsStore.hideCardPaid && a.payment_status === "paid" && a.payment_method === "card") return false;
    return true;
  });
});

const attendanceRate = computed(() => {
  if (!history.value || history.value.length === 0) return 0;

  // Calculate the end of the current day (23:59:59)
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  // Filter appointments up to the end of today
  const relevantAppointments = history.value.filter((appt) => {
    return new Date(appt.start_time) <= endOfToday;
  });

  if (relevantAppointments.length === 0) return 0;

  // Calculate Numerator: (Completed + New)
  const successCount = relevantAppointments.filter((appt) =>
    ["completed", "new"].includes(appt.status?.toLowerCase()),
  ).length;

  // Calculate Denominator: (Completed + No-Show + New + Confirmed + Cancelled)
  const validStatuses = [
    "completed",
    "no-show",
    "new",
    "confirmed",
    "cancelled",
  ];
  const totalCount = relevantAppointments.filter((appt) =>
    validStatuses.includes(appt.status?.toLowerCase()),
  ).length;

  if (totalCount === 0) return 0;

  // Return as a whole percentage
  return Math.round((successCount / totalCount) * 100);
});

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

    if (editForm.value.date_of_birth) {
      editForm.value.date_of_birth = new Date(editForm.value.date_of_birth);
    }
  } finally {
    loading.value = false;
  }
};

// --- Membership ---
const membership = ref<any>(null);
const membershipUsage = ref<any[]>([]);
const membershipLoading = ref(false);
const membershipActionLoading = ref(false);
const allTiers = ref<any[]>([]);
const showAssignMembership = ref(false);
const assignForm = ref<any>({ tier_id: null, billing_cycle: "monthly", payment_method: "cash" });

const membershipStatusClass = (status: string) => {
  if (status === "active") return "bg-green-100 text-green-700";
  if (status === "expired" || status === "cancelled") return "bg-red-100 text-red-700";
  return "bg-gray-100 text-gray-600";
};

const fetchMembership = async () => {
  if (!props.clientId) return;
  membershipLoading.value = true;
  try {
    const res = await fetch(`/api/v1/clients/${props.clientId}/membership`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    membership.value = data.membership;
    membershipUsage.value = data.usage || [];
    showAssignMembership.value = false;
  } finally {
    membershipLoading.value = false;
  }
};

const fetchAllTiers = async () => {
  const res = await fetch("/api/v1/membership-tiers", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.ok) allTiers.value = (await res.json()).filter((t: any) => t.is_active);
};

const assignMembership = async () => {
  if (!assignForm.value.tier_id) return;
  membershipActionLoading.value = true;
  try {
    const res = await fetch(`/api/v1/clients/${props.clientId}/membership`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(assignForm.value),
    });
    if (!res.ok) throw new Error((await res.json()).error || "Failed to assign membership");
    toast.add({ severity: "success", summary: "Membership assigned", life: 3000 });
    await fetchMembership();
  } catch (e: any) {
    toast.add({ severity: "error", summary: "Error", detail: e.message, life: 4000 });
  } finally {
    membershipActionLoading.value = false;
  }
};

const renewMembership = async () => {
  membershipActionLoading.value = true;
  try {
    const res = await fetch(`/api/v1/clients/${props.clientId}/membership/renew`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ payment_method: "cash" }),
    });
    if (!res.ok) throw new Error((await res.json()).error || "Failed to renew");
    toast.add({ severity: "success", summary: "Membership renewed", life: 3000 });
    await fetchMembership();
  } catch (e: any) {
    toast.add({ severity: "error", summary: "Error", detail: e.message, life: 4000 });
  } finally {
    membershipActionLoading.value = false;
  }
};

const confirmCancelMembership = () => {
  confirm.require({
    message: "Cancel this client's membership?",
    header: "Cancel Membership",
    icon: "pi pi-exclamation-triangle",
    acceptClass: "p-button-danger",
    accept: async () => {
      try {
        const res = await fetch(`/api/v1/clients/${props.clientId}/membership`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Failed to cancel");
        toast.add({ severity: "success", summary: "Membership cancelled", life: 3000 });
        await fetchMembership();
      } catch (e: any) {
        toast.add({ severity: "error", summary: "Error", detail: e.message, life: 4000 });
      }
    },
  });
};

watch(
  () => props.visible,
  (val) => {
    if (val && props.clientId) {
      activeTab.value = "Info";
      fetchClientData();
      fetchMembership();
      fetchAllTiers();
      settingsStore.fetchShopSettings();
    }
  },
  { immediate: true },
);

const addCustomField = () =>
  editForm.value.custom_fields.push({ title: "", value: "" });

const saveClientInfo = async () => {
  saving.value = true;
  try {
    const payload = { ...editForm.value };

    if (payload.date_of_birth) {
      const d = new Date(payload.date_of_birth);
      payload.date_of_birth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }

    const res = await fetch(`/api/v1/clients/${props.clientId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      clientData.value = { ...clientData.value, ...payload };
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
      toast.add({
        severity: "error",
        summary: "Upload Failed",
        detail: "File upload failed. Ensure it is under 5MB.",
        life: 4000,
      });
    }
  } finally {
    uploading.value = false;
    if (fileInput.value) fileInput.value.value = "";
  }
};

const deleteFile = (fileId: number) => {
  confirm.require({
    group: "clientProfileFile",
    message: "Delete this file?",
    header: "Confirm Delete",
    icon: "pi pi-exclamation-triangle",
    acceptClass: "p-button-danger",
    accept: async () => {
      try {
        const res = await fetch(`/api/v1/clients/files/${fileId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Request failed");
        files.value = files.value.filter((f: any) => f.id !== fileId);
      } catch (e) {
        toast.add({
          severity: "error",
          summary: "Delete Failed",
          detail: "Could not delete the file. Please try again.",
          life: 4000,
        });
      }
    },
  });
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
const viewFile = async (file: any) => {
  viewingFileId.value = file.id;
  try {
    const response = await fetch(`/api/v1/clients/files/${file.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) throw new Error("Failed to fetch file");

    const blob = await response.blob();
    const fileType = file.file_type || "application/pdf";
    const newBlob = new Blob([blob], { type: fileType });

    const blobUrl = window.URL.createObjectURL(newBlob);

    // Open the tab
    window.open(blobUrl, "_blank");

    setTimeout(() => {
      window.URL.revokeObjectURL(blobUrl);
    }, 100);
  } catch (err) {
    toast.add({
      severity: "error",
      summary: "Preview Failed",
      detail: "Could not open file preview.",
      life: 3000,
    });
  } finally {
    viewingFileId.value = null;
  }
};
</script>
