<template>
  <div class="space-y-6">
    <!-- Page Header -->
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div class="flex justify-between items-center">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-[var(--p-primary-50)] flex items-center justify-center">
            <i class="pi pi-building text-[var(--p-primary-600)]"></i>
          </div>
          <div>
            <h1 class="text-2xl font-bold text-gray-900">{{ t('platform.shops.title') }}</h1>
          </div>
        </div>
        <Button :label="t('platform.shops.addNew')" icon="pi pi-plus" @click="openNew" />
      </div>
    </div>

    <!-- Data Table Card -->
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <DataTable
        :value="filteredShops"
        :rows="10"
        paginator
        :rowsPerPageOptions="[10, 20, 50]"
        responsiveLayout="scroll"
        class="p-datatable-sm"
        :loading="tableLoading"
      >
        <template #header>
          <div class="flex justify-between items-center">
            <span class="p-input-icon-left">
              <i class="pi pi-search mr-3" />
              <InputText
                v-model="search"
                :placeholder="t('platform.shops.search')"
                class="w-80"
              />
            </span>
          </div>
        </template>

        <template #empty>
          <div class="flex flex-col items-center justify-center py-16 text-center">
            <i class="pi pi-building text-5xl text-gray-200 mb-4"></i>
            <p class="text-gray-500 font-semibold text-lg">{{ t('platform.shops.empty.title') }}</p>
          </div>
        </template>

        <Column field="name" :header="t('platform.shops.table.name')">
          <template #body="slotProps">
            <div class="font-semibold text-gray-900">{{ slotProps.data.name }}</div>
          </template>
        </Column>

        <Column :header="t('platform.shops.table.plan')">
          <template #body="slotProps">
            <Tag :value="slotProps.data.plan" severity="info" class="capitalize" />
          </template>
        </Column>

        <Column :header="t('platform.shops.table.status')">
          <template #body="slotProps">
            <Tag :value="slotProps.data.status" :severity="statusSeverity(slotProps.data.status)" class="capitalize" />
          </template>
        </Column>

        <Column :header="t('platform.shops.table.owner')">
          <template #body="slotProps">
            <div class="text-sm text-gray-700">{{ slotProps.data.owner_name || '—' }}</div>
            <div class="text-xs text-gray-400">{{ slotProps.data.owner_email || '' }}</div>
          </template>
        </Column>

        <Column :header="t('platform.shops.table.admins')" style="width: 100px">
          <template #body="slotProps">
            <span class="text-sm text-gray-700">{{ slotProps.data.admin_count }}</span>
          </template>
        </Column>

        <Column :header="t('platform.shops.table.createdAt')">
          <template #body="slotProps">
            <span class="text-sm text-gray-500">{{ formatDate(slotProps.data.created_at) }}</span>
          </template>
        </Column>

        <Column :header="t('common.actions')" style="width: 160px">
          <template #body="slotProps">
            <div class="flex gap-1.5 items-center">
              <Button
                icon="pi pi-pencil"
                class="p-button-rounded p-button-text p-button-sm"
                v-tooltip.top="t('platform.shops.tooltips.edit')"
                @click="editShop(slotProps.data)"
              />
              <Button
                icon="pi pi-users"
                class="p-button-rounded p-button-text p-button-sm p-button-secondary"
                v-tooltip.top="t('platform.shops.tooltips.manageAdmins')"
                @click="openAdminsDialog(slotProps.data)"
              />
              <Button
                icon="pi pi-sign-in"
                class="p-button-rounded p-button-text p-button-sm p-button-help"
                v-tooltip.top="t('platform.shops.tooltips.viewAs')"
                @click="confirmImpersonate(slotProps.data)"
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </div>
  </div>

  <!-- Add/Edit Shop Dialog -->
  <Dialog
    v-model:visible="showDialog"
    :header="editingShop.id ? t('platform.shops.dialog.editShop') : t('platform.shops.dialog.newShop')"
    modal
    class="w-full max-w-2xl"
  >
    <div class="space-y-5 mt-2">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div class="md:col-span-2">
          <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('platform.shops.dialog.name') }}</label>
          <InputText v-model="editingShop.name" class="w-full" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('platform.shops.dialog.plan') }}</label>
          <Dropdown
            v-model="editingShop.plan"
            :options="planOptions"
            optionLabel="label"
            optionValue="value"
            class="w-full"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('platform.shops.dialog.status') }}</label>
          <Dropdown
            v-model="editingShop.status"
            :options="statusOptions"
            optionLabel="label"
            optionValue="value"
            class="w-full"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('platform.shops.dialog.ownerName') }}</label>
          <InputText v-model="editingShop.owner_name" class="w-full" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('platform.shops.dialog.ownerEmail') }}</label>
          <InputText v-model="editingShop.owner_email" class="w-full" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('platform.shops.dialog.trialEndsAt') }}</label>
          <DatePicker v-model="editingShop.trial_ends_at" class="w-full" dateFormat="dd/mm/yy" showIcon />
        </div>
        <div class="md:col-span-2">
          <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('platform.shops.dialog.notes') }}</label>
          <Textarea v-model="editingShop.notes" class="w-full" rows="3" />
        </div>
      </div>

      <div v-if="!editingShop.id" class="border-t border-gray-100 pt-4">
        <div class="flex items-center gap-3 mb-3">
          <ToggleSwitch v-model="createAdminNow" />
          <span class="text-sm font-medium text-gray-700">{{ t('platform.shops.dialog.createAdminToggle') }}</span>
        </div>
        <div v-if="createAdminNow" class="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('platform.shops.dialog.adminUsername') }}</label>
            <InputText v-model="editingShop.admin_username" class="w-full" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('platform.shops.dialog.adminPassword') }}</label>
            <InputText v-model="editingShop.admin_password" type="password" class="w-full" />
          </div>
        </div>
      </div>
    </div>
    <template #footer>
      <Button :label="t('common.cancel')" icon="pi pi-times" text @click="showDialog = false" />
      <Button :label="t('common.save')" icon="pi pi-check" @click="saveShop" :loading="loading" />
    </template>
  </Dialog>

  <!-- Manage Admins Dialog -->
  <Dialog
    v-model:visible="showAdminsDialog"
    :header="t('platform.admins.title', { shop: adminsTarget?.name })"
    modal
    class="w-full max-w-2xl"
  >
    <div class="space-y-4 pt-2">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 items-end border-b border-gray-100 pb-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('staff.loginDialog.username') }}</label>
          <InputText v-model="newAdminUsername" class="w-full" />
        </div>
        <div class="flex gap-2">
          <div class="flex-1">
            <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('staff.loginDialog.password') }}</label>
            <InputText v-model="newAdminPassword" type="password" class="w-full" />
          </div>
          <Button icon="pi pi-plus" :loading="loading" @click="createAdmin" />
        </div>
      </div>

      <DataTable :value="shopAdmins" class="p-datatable-sm" :loading="adminsLoading">
        <template #empty>
          <p class="text-sm text-gray-400 text-center py-6">{{ t('platform.admins.empty') }}</p>
        </template>
        <Column field="username" :header="t('platform.admins.table.username')" />
        <Column :header="t('platform.admins.table.status')">
          <template #body="slotProps">
            <Tag
              :value="slotProps.data.is_active ? t('platform.admins.active') : t('platform.admins.inactive')"
              :severity="slotProps.data.is_active ? 'success' : 'danger'"
            />
          </template>
        </Column>
        <Column :header="t('platform.admins.table.createdAt')">
          <template #body="slotProps">
            <span class="text-sm text-gray-500">{{ formatDate(slotProps.data.created_at) }}</span>
          </template>
        </Column>
        <Column :header="t('common.actions')" style="width: 140px">
          <template #body="slotProps">
            <div class="flex gap-1.5 items-center">
              <Button
                :icon="slotProps.data.is_active ? 'pi pi-ban' : 'pi pi-check'"
                class="p-button-rounded p-button-text p-button-sm"
                v-tooltip.top="slotProps.data.is_active ? t('platform.admins.deactivate') : t('platform.admins.reactivate')"
                @click="toggleAdminActive(slotProps.data)"
              />
              <Button
                icon="pi pi-key"
                class="p-button-rounded p-button-text p-button-sm p-button-secondary"
                v-tooltip.top="t('platform.admins.resetPassword')"
                @click="openResetPasswordDialog(slotProps.data)"
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </div>
    <template #footer>
      <Button :label="t('common.close')" text @click="showAdminsDialog = false" />
    </template>
  </Dialog>

  <!-- Reset Password Dialog -->
  <Dialog
    v-model:visible="showResetPasswordDialog"
    :header="t('platform.admins.resetDialog.title')"
    modal
    class="w-full max-w-md"
  >
    <div class="pt-2">
      <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('platform.admins.resetDialog.newPassword') }}</label>
      <InputText v-model="resetPasswordValue" type="password" class="w-full" />
    </div>
    <template #footer>
      <Button :label="t('common.cancel')" text @click="showResetPasswordDialog = false" />
      <Button :label="t('platform.admins.resetDialog.confirm')" icon="pi pi-check" @click="confirmResetPassword" :loading="loading" />
    </template>
  </Dialog>

  <ConfirmDialog></ConfirmDialog>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useI18n } from "vue-i18n";
import { useToast } from "primevue/usetoast";
import { useConfirm } from "primevue/useconfirm";
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";

const { t } = useI18n();
const toast = useToast();
const confirm = useConfirm();
const router = useRouter();
const authStore = useAuthStore();

const shops = ref<any[]>([]);
const loading = ref(false);
const tableLoading = ref(false);
const search = ref("");
const showDialog = ref(false);
const editingShop = ref<any>({});
const createAdminNow = ref(false);

const planOptions = computed(() => [
  { label: t("platform.shops.plans.trial"), value: "trial" },
  { label: t("platform.shops.plans.basic"), value: "basic" },
  { label: t("platform.shops.plans.pro"), value: "pro" },
]);
const statusOptions = computed(() => [
  { label: t("platform.shops.statuses.active"), value: "active" },
  { label: t("platform.shops.statuses.suspended"), value: "suspended" },
  { label: t("platform.shops.statuses.cancelled"), value: "cancelled" },
]);

const statusSeverity = (status: string) => {
  if (status === "active") return "success";
  if (status === "suspended") return "warning";
  return "danger";
};

const formatDate = (d: string) =>
  d
    ? new Date(d).toLocaleDateString("el-GR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "—";

const fetchData = async () => {
  tableLoading.value = true;
  try {
    const token = localStorage.getItem("token");
    const res = await fetch("/api/v1/platform/shops", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Request failed");
    shops.value = await res.json();
  } catch (err) {
    console.error(err);
    toast.add({
      severity: "error",
      summary: t("common.error"),
      detail: t("platform.shops.toast.loadFailed"),
      life: 4000,
    });
  } finally {
    tableLoading.value = false;
  }
};

const filteredShops = computed(() => {
  if (!search.value) return shops.value;
  const term = search.value.toLowerCase();
  return shops.value.filter((s: any) => s.name.toLowerCase().includes(term));
});

const openNew = () => {
  editingShop.value = { id: null, plan: "trial", status: "active" };
  createAdminNow.value = false;
  showDialog.value = true;
};

const editShop = (data: any) => {
  editingShop.value = {
    ...data,
    trial_ends_at: data.trial_ends_at ? new Date(data.trial_ends_at) : null,
  };
  showDialog.value = true;
};

const saveShop = async () => {
  if (!editingShop.value.name) {
    toast.add({
      severity: "warn",
      summary: t("common.error"),
      detail: t("platform.shops.toast.nameRequired"),
      life: 3000,
    });
    return;
  }

  loading.value = true;
  const token = localStorage.getItem("token");
  const url = editingShop.value.id
    ? `/api/v1/platform/shops/${editingShop.value.id}`
    : "/api/v1/platform/shops";
  const method = editingShop.value.id ? "PUT" : "POST";

  const body: any = { ...editingShop.value };
  if (!createAdminNow.value) {
    delete body.admin_username;
    delete body.admin_password;
  }

  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed");

    toast.add({
      severity: "success",
      summary: t("common.success"),
      detail: t("platform.shops.toast.saved"),
      life: 3000,
    });
    showDialog.value = false;
    fetchData();
  } catch (err: any) {
    toast.add({
      severity: "error",
      summary: t("common.error"),
      detail: err.message || t("platform.shops.toast.saveFailed"),
      life: 4000,
    });
  } finally {
    loading.value = false;
  }
};

// --- Admins management ---
const showAdminsDialog = ref(false);
const adminsTarget = ref<any>(null);
const shopAdmins = ref<any[]>([]);
const adminsLoading = ref(false);
const newAdminUsername = ref("");
const newAdminPassword = ref("");

const openAdminsDialog = async (shop: any) => {
  adminsTarget.value = shop;
  newAdminUsername.value = "";
  newAdminPassword.value = "";
  showAdminsDialog.value = true;
  adminsLoading.value = true;
  try {
    const token = localStorage.getItem("token");
    const res = await fetch(`/api/v1/platform/shops/${shop.id}/admins`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed");
    shopAdmins.value = await res.json();
  } catch (err) {
    console.error(err);
    shopAdmins.value = [];
  } finally {
    adminsLoading.value = false;
  }
};

const createAdmin = async () => {
  if (!newAdminUsername.value || !newAdminPassword.value) return;
  loading.value = true;
  const token = localStorage.getItem("token");
  try {
    const res = await fetch(`/api/v1/platform/shops/${adminsTarget.value.id}/admins`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        username: newAdminUsername.value,
        password: newAdminPassword.value,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed");

    toast.add({
      severity: "success",
      summary: t("common.success"),
      detail: t("platform.admins.toast.created"),
      life: 3000,
    });
    newAdminUsername.value = "";
    newAdminPassword.value = "";
    openAdminsDialog(adminsTarget.value);
    fetchData();
  } catch (err: any) {
    toast.add({
      severity: "error",
      summary: t("common.error"),
      detail: err.message || t("platform.admins.toast.failed"),
      life: 4000,
    });
  } finally {
    loading.value = false;
  }
};

const toggleAdminActive = (admin: any) => {
  confirm.require({
    message: admin.is_active
      ? t("platform.admins.confirmDeactivate", { username: admin.username })
      : t("platform.admins.confirmReactivate", { username: admin.username }),
    header: t("common.confirmDelete"),
    icon: "pi pi-exclamation-triangle",
    accept: async () => {
      const token = localStorage.getItem("token");
      try {
        const res = await fetch(`/api/v1/platform/admins/${admin.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ is_active: !admin.is_active }),
        });
        if (!res.ok) throw new Error("Failed");
        toast.add({
          severity: "success",
          summary: t("common.success"),
          detail: t("platform.admins.toast.statusUpdated"),
          life: 3000,
        });
        openAdminsDialog(adminsTarget.value);
        fetchData();
      } catch (err) {
        toast.add({
          severity: "error",
          summary: t("common.error"),
          detail: t("platform.admins.toast.failed"),
          life: 4000,
        });
      }
    },
  });
};

// --- Reset password ---
const showResetPasswordDialog = ref(false);
const resetPasswordTarget = ref<any>(null);
const resetPasswordValue = ref("");

const openResetPasswordDialog = (admin: any) => {
  resetPasswordTarget.value = admin;
  resetPasswordValue.value = "";
  showResetPasswordDialog.value = true;
};

const confirmResetPassword = async () => {
  if (!resetPasswordValue.value || resetPasswordValue.value.length < 6) {
    toast.add({
      severity: "warn",
      summary: t("common.error"),
      detail: t("platform.admins.resetDialog.tooShort"),
      life: 3000,
    });
    return;
  }
  loading.value = true;
  const token = localStorage.getItem("token");
  try {
    const res = await fetch(
      `/api/v1/platform/admins/${resetPasswordTarget.value.id}/reset-password`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ newPassword: resetPasswordValue.value }),
      },
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed");

    toast.add({
      severity: "success",
      summary: t("common.success"),
      detail: t("platform.admins.toast.passwordReset"),
      life: 3000,
    });
    showResetPasswordDialog.value = false;
  } catch (err: any) {
    toast.add({
      severity: "error",
      summary: t("common.error"),
      detail: err.message || t("platform.admins.toast.failed"),
      life: 4000,
    });
  } finally {
    loading.value = false;
  }
};

// --- Impersonate ---
const confirmImpersonate = (shop: any) => {
  confirm.require({
    message: t("platform.shops.confirmImpersonate", { name: shop.name }),
    header: t("platform.shops.tooltips.viewAs"),
    icon: "pi pi-sign-in",
    accept: async () => {
      const token = localStorage.getItem("token");
      try {
        const res = await fetch(`/api/v1/platform/impersonate/${shop.id}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed");

        authStore.startImpersonation(data.token, data.user);
        toast.add({
          severity: "success",
          summary: t("common.success"),
          detail: t("platform.shops.toast.impersonating", { name: shop.name }),
          life: 3000,
        });
        router.push("/app/scheduler");
      } catch (err: any) {
        toast.add({
          severity: "error",
          summary: t("common.error"),
          detail: err.message || t("platform.shops.toast.impersonateFailed"),
          life: 4000,
        });
      }
    },
  });
};

onMounted(fetchData);
</script>
