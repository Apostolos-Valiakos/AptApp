<template>
  <div class="space-y-6">
    <!-- Page Header -->
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div class="flex justify-between items-center">
        <div class="flex items-center gap-3">
          <div
            class="w-10 h-10 rounded-xl bg-[var(--p-primary-50)] flex items-center justify-center"
          >
            <i class="pi pi-users text-[var(--p-primary-600)]"></i>
          </div>
          <div>
            <h1 class="text-2xl font-bold text-gray-900">
              {{ t("clients.title") }}
            </h1>
            <p class="text-sm text-gray-500">
              {{ t("clients.subtitle", { count: totalClients }) }}
            </p>
          </div>
        </div>
        <div class="flex gap-2">
          <Button
            icon="pi pi-file-excel"
            severity="secondary"
            outlined
            v-tooltip.top="'Εξαγωγή Excel'"
            @click="exportExcel"
          />
          <Button
            :label="t('clients.addNew')"
            icon="pi pi-plus"
            @click="openNew"
          />
        </div>
      </div>
    </div>

    <!-- Data Table Card -->
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <DataTable
        :value="clients"
        :lazy="true"
        :paginator="true"
        :rows="pageRows"
        :totalRecords="totalClients"
        :rowsPerPageOptions="[15, 30, 50, 100]"
        responsiveLayout="scroll"
        class="p-datatable-sm cursor-pointer hover:bg-gray-50"
        :loading="loading"
        selectionMode="single"
        @row-click="(e) => openProfile(e.data)"
        @page="onPage"
      >
        <template #header>
          <div class="flex justify-between items-center">
            <span class="p-input-icon-left">
              <i class="pi pi-search mr-3" />
              <InputText
                v-model="search"
                :placeholder="t('clients.search')"
                class="w-80"
              />
            </span>
            <div class="text-sm text-gray-500">
              {{ t("clients.subtitle", { count: totalClients }) }}
            </div>
          </div>
        </template>

        <template #empty>
          <div
            class="flex flex-col items-center justify-center py-16 text-center"
          >
            <i class="pi pi-users text-5xl text-gray-200 mb-4"></i>
            <p class="text-gray-500 font-semibold text-lg">
              {{ t("clients.empty.title") }}
            </p>
            <p class="text-gray-400 text-sm mt-1">
              {{ t("clients.empty.subtitle") }}
            </p>
          </div>
        </template>

        <!-- Merged Client column -->
        <Column field="first_name" :header="t('clients.table.client')" sortable>
          <template #body="slotProps">
            <div class="flex items-center gap-3">
              <div
                class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm bg-[var(--p-primary-100)] text-[var(--p-primary-600)] flex-shrink-0"
              >
                {{ slotProps.data.first_name?.charAt(0)?.toUpperCase() }}
              </div>
              <div class="min-w-0">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="font-semibold text-gray-900">
                    {{ slotProps.data.first_name }}
                    {{ slotProps.data.last_name }}
                  </span>
                  <span
                    v-if="
                      slotProps.data.custom_fields &&
                      slotProps.data.custom_fields.length > 0
                    "
                    class="ml-1 text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full"
                  >
                    {{
                      t("clients.table.notes", {
                        count: slotProps.data.custom_fields.length,
                      })
                    }}
                  </span>
                </div>
                <div class="text-xs text-gray-400 truncate">
                  {{ slotProps.data.email || "—" }}
                </div>
              </div>
            </div>
          </template>
        </Column>

        <Column field="phone" :header="t('clients.table.phone')" sortable>
          <template #body="slotProps">
            <a
              :href="'tel:' + slotProps.data.phone"
              class="text-green-600 hover:underline text-sm"
              @click.stop
            >
              {{ formatPhone(slotProps.data.phone) }}
            </a>
          </template>
        </Column>

        <Column :header="t('common.actions')">
          <template #body="slotProps">
            <div class="flex gap-1.5 items-center">
              <Button
                icon="pi pi-envelope"
                class="p-button-rounded p-button-text p-button-sm p-button-info"
                v-tooltip.top="t('clients.actions.inviteToPortal')"
                :aria-label="t('clients.actions.inviteToPortal')"
                @click.stop="inviteClient(slotProps.data)"
              />
              <Button
                icon="pi pi-pencil"
                class="p-button-rounded p-button-text p-button-sm"
                v-tooltip.top="t('clients.actions.viewProfile')"
                :aria-label="t('clients.actions.viewProfile')"
                @click.stop="openProfile(slotProps.data)"
              />
              <Button
                v-if="isShopAdmin"
                icon="pi pi-trash"
                class="p-button-rounded p-button-text p-button-sm"
                severity="danger"
                v-tooltip.top="t('clients.actions.delete')"
                :aria-label="t('clients.actions.delete')"
                @click.stop="confirmDelete(slotProps.data)"
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </div>

    <!-- New Client Dialog -->
    <Dialog
      v-model:visible="dialogVisible"
      :header="t('clients.dialog.newClient')"
      modal
      class="w-full max-w-3xl"
    >
      <div class="space-y-5 mt-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">{{
              t("clients.dialog.firstName")
            }}</label>
            <InputText v-model="editingClient.first_name" class="w-full" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">{{
              t("clients.dialog.lastName")
            }}</label>
            <InputText v-model="editingClient.last_name" class="w-full" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">{{
              t("common.email")
            }}</label>
            <InputText
              v-model="editingClient.email"
              type="email"
              class="w-full"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">{{
              t("common.phone")
            }}</label>
            <InputText v-model="editingClient.phone" class="w-full" />
          </div>
        </div>

        <div v-if="shopSettings">
          <span class="block text-xs font-bold text-gray-500 uppercase mb-3">
            {{ t("clients.dialog.activeServices") }}
          </span>
          <div class="grid grid-cols-3 gap-3">
            <div
              v-if="shopSettings.ergotherapia"
              role="checkbox"
              :aria-checked="editingClient.ergotherapia"
              :aria-label="t('common.services.ergotherapia')"
              tabindex="0"
              @click="editingClient.ergotherapia = !editingClient.ergotherapia"
              @keydown.enter.prevent="
                editingClient.ergotherapia = !editingClient.ergotherapia
              "
              @keydown.space.prevent="
                editingClient.ergotherapia = !editingClient.ergotherapia
              "
              :class="[
                'flex flex-col items-center p-3 rounded-xl border-2 cursor-pointer transition-all text-center',
                editingClient.ergotherapia
                  ? 'border-[var(--p-primary-500)] bg-[var(--p-primary-50)] text-[var(--p-primary-700)]'
                  : 'border-gray-300 bg-white text-gray-500 opacity-60',
              ]"
            >
              <i class="pi pi-briefcase mb-1"></i>
              <span
                class="text-[10px] font-bold uppercase tracking-tight leading-none"
                >{{ t("common.services.ergotherapia") }}</span
              >
            </div>

            <div
              v-if="shopSettings.physiotherapia"
              role="checkbox"
              :aria-checked="editingClient.physiotherapia"
              :aria-label="t('common.services.physiotherapia')"
              tabindex="0"
              @click="
                editingClient.physiotherapia = !editingClient.physiotherapia
              "
              @keydown.enter.prevent="
                editingClient.physiotherapia = !editingClient.physiotherapia
              "
              @keydown.space.prevent="
                editingClient.physiotherapia = !editingClient.physiotherapia
              "
              :class="[
                'flex flex-col items-center p-3 rounded-xl border-2 cursor-pointer transition-all text-center',
                editingClient.physiotherapia
                  ? 'border-[var(--p-primary-500)] bg-[var(--p-primary-50)] text-[var(--p-primary-700)]'
                  : 'border-gray-300 bg-white text-gray-500 opacity-60',
              ]"
            >
              <i class="pi pi-heart mb-1"></i>
              <span
                class="text-[10px] font-bold uppercase tracking-tight leading-none"
                >{{ t("common.services.physiotherapia") }}</span
              >
            </div>

            <div
              v-if="shopSettings.logotherapia"
              role="checkbox"
              :aria-checked="editingClient.logotherapia"
              :aria-label="t('common.services.logotherapia')"
              tabindex="0"
              @click="editingClient.logotherapia = !editingClient.logotherapia"
              @keydown.enter.prevent="
                editingClient.logotherapia = !editingClient.logotherapia
              "
              @keydown.space.prevent="
                editingClient.logotherapia = !editingClient.logotherapia
              "
              :class="[
                'flex flex-col items-center p-3 rounded-xl border-2 cursor-pointer transition-all text-center',
                editingClient.logotherapia
                  ? 'border-[var(--p-primary-500)] bg-[var(--p-primary-50)] text-[var(--p-primary-700)]'
                  : 'border-gray-300 bg-white text-gray-500 opacity-60',
              ]"
            >
              <i class="pi pi-comments mb-1"></i>
              <span
                class="text-[10px] font-bold uppercase tracking-tight leading-none"
                >{{ t("common.services.logotherapia") }}</span
              >
            </div>
          </div>
        </div>

        <div class="bg-gray-50 p-4 rounded-lg border border-gray-200">
          <div class="flex justify-between items-center mb-3">
            <label class="block text-sm font-medium text-gray-700">{{
              t("clients.dialog.customDetails")
            }}</label>
            <Button
              :label="t('clients.dialog.addField')"
              icon="pi pi-plus"
              size="small"
              class="p-button-text p-button-sm"
              @click="addCustomField"
            />
          </div>
          <div
            v-for="(field, index) in editingClient.custom_fields"
            :key="index"
            class="flex gap-3 mb-2 items-center"
          >
            <div class="w-1/3">
              <InputText
                v-model="field.title"
                :placeholder="t('clients.dialog.fieldTitle')"
                class="w-full p-inputtext-sm font-bold"
              />
            </div>
            <div class="flex-grow">
              <InputText
                v-model="field.value"
                :placeholder="t('clients.dialog.fieldValue')"
                class="w-full p-inputtext-sm"
              />
            </div>
            <Button
              icon="pi pi-trash"
              class="p-button-text p-button-danger p-button-sm"
              @click="removeCustomField(index)"
            />
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{{
            t("common.notes")
          }}</label>
          <Textarea v-model="editingClient.notes" rows="3" class="w-full" />
        </div>
      </div>

      <template #footer>
        <Button
          :label="t('common.cancel')"
          icon="pi pi-times"
          class="p-button-text"
          @click="dialogVisible = false"
        />
        <Button
          :label="t('common.save')"
          icon="pi pi-check"
          class="p-button-success"
          @click="saveClient"
        />
      </template>
    </Dialog>

    <ClientProfileDialog
      v-model:visible="profileVisible"
      :clientId="selectedClientId"
      @refresh="fetchClients"
    />

    <ConfirmDialog></ConfirmDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useToast } from "primevue/usetoast";
import { useConfirm } from "primevue/useconfirm";
import { useAuthStore } from "../stores/auth";
import { useSettingsStore } from "../stores/settings";
import { storeToRefs } from "pinia";
import ClientProfileDialog from "../components/ClientProfileDialog.vue"; // Ensure correct path

const { t } = useI18n();
const authStore = useAuthStore();
const isShopAdmin = authStore.isShopAdmin;
const settingsStore = useSettingsStore();
const { shopSettings } = storeToRefs(settingsStore);

const toast = useToast();
const confirm = useConfirm();

const clients = ref<any[]>([]);
const loading = ref(true);
const dialogVisible = ref(false); // For creating NEW clients
const search = ref("");
const token = localStorage.getItem("token");

// NEW: State for the Profile Dialog
const profileVisible = ref(false);
const selectedClientId = ref(null);

const editingClient = ref<any>({
  id: null,
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  notes: "",
  custom_fields: [],
  ergotherapia: false,
  physiotherapia: false,
  logotherapia: false,
});

onMounted(() => {
  fetchClients();
  settingsStore.fetchShopSettings();
});

// Server-side pagination + search
const totalClients = ref(0);
const pageRows = ref(15);
const pageOffset = ref(0);

const fetchClients = async () => {
  loading.value = true;
  loading.value = true;
  try {
    const params = new URLSearchParams({
      limit: String(pageRows.value),
      offset: String(pageOffset.value),
    });
    if (search.value.trim()) params.append("search", search.value.trim());

    const res = await fetch(`/api/v1/clients?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      clients.value = data.clients || [];
      totalClients.value = data.total || 0;
    }
    if (!res.ok) throw new Error("Request failed");
    clients.value = await res.json();
  } catch (err) {
    console.error(err);
    toast.add({
      severity: "error",
      summary: t("common.error"),
      detail: t("clients.toast.loadFailed"),
      life: 4000,
    });
  } finally {
    loading.value = false;
  }
};

const onPage = (event: any) => {
  pageOffset.value = event.first;
  pageRows.value = event.rows;
  fetchClients();
};

// Debounced server-side search
let searchTimeout: ReturnType<typeof setTimeout> | null = null;
watch(search, () => {
  if (searchTimeout) clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    pageOffset.value = 0;
    fetchClients();
  }, 300);
});

const exportExcel = async () => {
  // Export ALL matching clients (not just the current page)
  const params = new URLSearchParams();
  if (search.value.trim()) params.append("search", search.value.trim());
  const res = await fetch(`/api/v1/clients?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return;
  const allClients = await res.json();

  const data = allClients.map((c: any) => ({
    Όνομα: c.first_name || "",
    Επώνυμο: c.last_name || "",
    Email: c.email || "",
    Τηλέφωνο: c.phone || "",
    Υπόλοιπο: c.outstanding_balance ?? 0,
    "Σύνολο πωλήσεων": c.total_sales ?? 0,
    "No-shows": c.no_show_count ?? 0,
  }));
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Πελάτες");
  XLSX.writeFile(wb, `clients_${new Date().toISOString().slice(0, 10)}.xlsx`);
};

// NEW: Open the full profile dialog
const openProfile = (client: any) => {
  selectedClientId.value = client.id;
  profileVisible.value = true;
};
const inviteClient = async (client: any) => {
  if (!client.email) {
    toast.add({
      severity: "warn",
      summary: t("clients.toast.missingEmail"),
      detail: t("clients.toast.missingEmailDetail"),
      life: 3000,
    });
    return;
  }

  try {
    const res = await fetch(`/api/v1/clients/${client.id}/invite`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to invite client");

    toast.add({
      severity: "success",
      summary: t("clients.toast.invited"),
      detail: t("clients.toast.invitedDetail", { email: client.email }),
      life: 3000,
    });
  } catch (err: any) {
    toast.add({
      severity: "error",
      summary: t("common.error"),
      detail: err.message,
      life: 3000,
    });
  }
};
// Open the simple dialog for CREATION only
const openNew = () => {
  editingClient.value = {
    id: null, // Ensure ID is null so it posts to Create route
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    notes: "",
    custom_fields: [],
    ergotherapia: false,
    physiotherapia: false,
    logotherapia: false,
  };
  dialogVisible.value = true;
};

// Existing logic for local dynamic fields (only used in Creation now)
const addCustomField = () => {
  editingClient.value.custom_fields.push({ title: "", value: "" });
};

const removeCustomField = (index: number) => {
  editingClient.value.custom_fields.splice(index, 1);
};

// Save logic (Only for Creation now)
const saveClient = async () => {
  if (!editingClient.value.first_name || !editingClient.value.last_name) {
    toast.add({
      severity: "warn",
      summary: t("common.required"),
      detail: t("clients.toast.requiredFields"),
      life: 3000,
    });
    return;
  }

  // Since we use ClientProfileDialog for edits, this is strictly for POST (Create)
  try {
    const res = await fetch("/api/v1/clients", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(editingClient.value),
    });

    if (!res.ok) throw new Error("Failed to save");

    toast.add({
      severity: "success",
      summary: t("common.success"),
      detail: t("clients.toast.created"),
      life: 3000,
    });
    dialogVisible.value = false;
    fetchClients();
  } catch (err) {
    toast.add({
      severity: "error",
      summary: t("common.error"),
      detail: t("clients.toast.saveFailed"),
      life: 4000,
    });
  }
};

const confirmDelete = (client: any) => {
  confirm.require({
    message: t("clients.confirmDelete", {
      name: `${client.first_name} ${client.last_name}`,
    }),
    header: t("common.confirmDelete"),
    icon: "pi pi-exclamation-triangle",
    acceptClass: "p-button-danger",
    accept: () => deleteClient(client),
  });
};

const deleteClient = async (client: any) => {
  try {
    const res = await fetch(`/api/v1/clients/${client.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || "Failed to delete client");
    }

    toast.add({
      severity: "success",
      summary: t("common.success"),
      detail: t("clients.toast.deleted"),
      life: 3000,
    });

    fetchClients();
  } catch (err: any) {
    toast.add({
      severity: "error",
      summary: t("clients.toast.deleteDenied"),
      detail: err.message || t("clients.toast.saveFailed"),
      life: 5000,
    });
  }
};

const formatPhone = (phone: string) => {
  if (!phone) return "—";
  return phone.replace(/(\d{3})(\d{3})(\d{4})/, "$1 $2 $3");
};
</script>

<style scoped>
:deep(.p-datatable .p-datatable-tbody > tr > td) {
  padding: 1rem;
}
</style>
