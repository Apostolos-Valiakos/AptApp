<template>
  <div class="space-y-6">
    <!-- Page Header -->
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div class="flex justify-between items-center">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-[var(--p-primary-50)] flex items-center justify-center">
            <i class="pi pi-id-card text-[var(--p-primary-600)]"></i>
          </div>
          <div>
            <h1 class="text-2xl font-bold text-gray-900">{{ t('staff.title') }}</h1>
            <p class="text-sm text-gray-500">{{ t('staff.addNew') }}</p>
          </div>
        </div>
        <Button :label="t('staff.addNew')" icon="pi pi-plus" @click="openNew" />
      </div>
    </div>

    <!-- Data Table Card -->
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <DataTable
        :value="filteredStaff"
        :rows="10"
        paginator
        :rowsPerPageOptions="[10, 20, 50]"
        responsiveLayout="scroll"
        class="p-datatable-sm"
      >
        <template #header>
          <div class="flex justify-between items-center">
            <span class="p-input-icon-left">
              <i class="pi pi-search mr-3" />
              <InputText
                v-model="search"
                :placeholder="t('staff.search')"
                class="w-80"
              />
            </span>
          </div>
        </template>

        <template #empty>
          <div class="flex flex-col items-center justify-center py-16 text-center">
            <i class="pi pi-users text-5xl text-gray-200 mb-4"></i>
            <p class="text-gray-500 font-semibold text-lg">{{ t('staff.empty.title') }}</p>
            <p class="text-gray-400 text-sm mt-1">{{ t('staff.empty.subtitle') }}</p>
          </div>
        </template>

        <!-- Name + Email column with avatar -->
        <Column field="name" :header="t('staff.table.name')">
          <template #body="slotProps">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm bg-[var(--p-primary-100)] text-[var(--p-primary-600)] flex-shrink-0">
                {{ slotProps.data.name?.charAt(0)?.toUpperCase() }}
              </div>
              <div class="min-w-0">
                <div class="font-semibold text-gray-900">{{ slotProps.data.name }}</div>
                <div class="text-xs text-gray-400 truncate">{{ slotProps.data.email || '—' }}</div>
              </div>
            </div>
          </template>
        </Column>

        <Column field="phone" :header="t('staff.table.phone')">
          <template #body="slotProps">
            <span class="text-sm text-gray-700">{{ slotProps.data.phone || '—' }}</span>
          </template>
        </Column>

        <Column field="specialty" :header="t('staff.table.specialty')">
          <template #body="slotProps">
            <Tag
              v-if="slotProps.data.specialty"
              :value="slotProps.data.specialty"
              severity="secondary"
            />
            <span v-else class="text-xs text-gray-400">—</span>
          </template>
        </Column>

        <Column :header="t('common.actions')" style="width: 130px">
          <template #body="slotProps">
            <div class="flex gap-1.5 items-center">
              <Button
                icon="pi pi-pencil"
                class="p-button-rounded p-button-text p-button-sm"
                v-tooltip.top="t('staff.tooltips.edit')"
                @click="editStaff(slotProps.data)"
              />
              <Button
                icon="pi pi-key"
                class="p-button-rounded p-button-text p-button-sm p-button-secondary"
                v-tooltip.top="t('staff.tooltips.createLogin')"
                @click="openLoginDialog(slotProps.data)"
              />
              <Button
                icon="pi pi-trash"
                class="p-button-rounded p-button-text p-button-danger p-button-sm"
                v-tooltip.top="t('staff.tooltips.delete')"
                @click="confirmDelete(slotProps.data)"
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </div>
  </div>

  <!-- Add/Edit Staff Dialog -->
  <Dialog
    v-model:visible="showDialog"
    :header="editingStaff.id ? t('staff.dialog.editStaff') : t('staff.dialog.newStaff')"
    modal
    class="w-full max-w-2xl"
  >
    <div class="space-y-5 mt-2">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('staff.dialog.firstName') }}</label>
          <InputText v-model="editingStaff.first_name" class="w-full" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('staff.dialog.lastName') }}</label>
          <InputText v-model="editingStaff.last_name" class="w-full" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('common.email') }}</label>
          <InputText v-model="editingStaff.email" class="w-full" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('common.phone') }}</label>
          <InputText v-model="editingStaff.phone" class="w-full" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('staff.dialog.specialty') }}</label>
          <InputText v-model="editingStaff.specialty" class="w-full" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('staff.dialog.hourlyRate') }}</label>
          <InputNumber
            v-model="editingStaff.hourly_rate"
            mode="currency"
            currency="EUR"
            class="w-full"
          />
        </div>
        <div class="md:col-span-2">
          <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('staff.dialog.servicesProvided') }}</label>
          <MultiSelect
            v-model="editingStaff.service_ids"
            :options="services"
            optionLabel="name"
            optionValue="id"
            display="chip"
            :placeholder="t('staff.dialog.selectServices')"
            class="w-full"
            filter
          />
        </div>
      </div>
    </div>
    <template #footer>
      <Button
        :label="t('common.cancel')"
        icon="pi pi-times"
        text
        @click="showDialog = false"
      />
      <Button
        :label="t('common.save')"
        icon="pi pi-check"
        @click="saveStaff"
        :loading="loading"
      />
    </template>
  </Dialog>

  <!-- Create Login Dialog -->
  <Dialog
    v-model:visible="showLoginDialog"
    :header="t('staff.loginDialog.title')"
    modal
    class="w-full max-w-md"
  >
    <div class="space-y-5 pt-2">
      <p class="text-sm text-gray-600">
        {{ t('staff.loginDialog.description', { name: loginStaffTarget?.name }) }}
      </p>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('staff.loginDialog.username') }}</label>
        <InputText
          v-model="newLogin.username"
          class="w-full"
          placeholder="e.g. maria.stylist"
        />
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('staff.loginDialog.password') }}</label>
        <InputText
          v-model="newLogin.password"
          class="w-full"
          type="password"
          placeholder="••••••••"
        />
      </div>
    </div>
    <template #footer>
      <Button
        :label="t('common.cancel')"
        icon="pi pi-times"
        text
        @click="showLoginDialog = false"
      />
      <Button
        :label="t('staff.loginDialog.createAccount')"
        icon="pi pi-user-plus"
        class="p-button-success"
        @click="createLogin"
        :loading="loading"
      />
    </template>
  </Dialog>

  <ConfirmDialog></ConfirmDialog>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useI18n } from "vue-i18n";
import { useToast } from "primevue/usetoast";
import { useConfirm } from "primevue/useconfirm";

const { t } = useI18n();

// ... (imports remain same) ...

const toast = useToast();
const confirm = useConfirm();
const staff = ref([]);
const services = ref([]);
const loading = ref(false);
const showDialog = ref(false);
const search = ref("");

const editingStaff = ref<any>({});

// NEW: Login Dialog State
const showLoginDialog = ref(false);
const loginStaffTarget = ref<any>(null);
const newLogin = ref({ username: "", password: "" });

// ... (Existing fetch/save logic remains same) ...
const fetchData = async () => {
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };
  const [staffRes, servicesRes] = await Promise.all([
    fetch("/api/v1/staff", { headers }),
    fetch("/api/v1/services", { headers }),
  ]);
  staff.value = await staffRes.json();
  services.value = await servicesRes.json();
};

const openNew = () => {
  editingStaff.value = {
    id: null,
    first_name: "",
    last_name: "",
    service_ids: [],
  };
  showDialog.value = true;
};

const editStaff = (data: any) => {
  const nameParts = (data.name || "").split(" ");
  editingStaff.value = {
    ...data,
    first_name: nameParts[0],
    last_name: nameParts.slice(1).join(" "),
    service_ids: data.service_ids || [],
  };
  showDialog.value = true;
};

const saveStaff = async () => {
  // ... (Keep existing save logic, ensure you add Authorization header) ...
  loading.value = true;
  const token = localStorage.getItem("token");
  const url = editingStaff.value.id
    ? `/api/v1/staff/${editingStaff.value.id}`
    : "/api/v1/staff";
  const method = editingStaff.value.id ? "PUT" : "POST";

  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(editingStaff.value),
    });
    if (!res.ok) throw new Error("Failed");
    toast.add({
      severity: "success",
      summary: t('common.success'),
      detail: t('staff.toast.saved'),
      life: 3000,
    });
    showDialog.value = false;
    fetchData();
  } catch (err) {
    toast.add({
      severity: "error",
      summary: t('common.error'),
      detail: t('staff.toast.saveFailed'),
      life: 3000,
    });
  } finally {
    loading.value = false;
  }
};

// NEW: Login Handlers
const openLoginDialog = (staffMember: any) => {
  loginStaffTarget.value = staffMember;
  // Suggest a username automatically (e.g., first.last)
  const suggested = staffMember.name.toLowerCase().replace(/\s/g, ".");
  newLogin.value = { username: suggested, password: "" };
  showLoginDialog.value = true;
};

const createLogin = async () => {
  if (!newLogin.value.username || !newLogin.value.password) return;

  loading.value = true;
  const token = localStorage.getItem("token");

  try {
    const res = await fetch(
      `/api/v1/staff/${loginStaffTarget.value.id}/login`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(newLogin.value),
      },
    );

    const data = await res.json();

    if (!res.ok) throw new Error(data.error || "Failed");

    toast.add({
      severity: "success",
      summary: t('staff.toast.accountCreated'),
      detail: t('staff.toast.accountDetail', { name: loginStaffTarget.value.name }),
      life: 4000,
    });
    showLoginDialog.value = false;
  } catch (e: any) {
    toast.add({
      severity: "error",
      summary: t('common.error'),
      detail: e.message,
      life: 4000,
    });
  } finally {
    loading.value = false;
  }
};

// Add confirmDelete and deleteStaff functions
const confirmDelete = (staff: any) => {
  confirm.require({
    message: t('staff.confirmDelete', { name: staff.name }),
    header: t('common.confirmDelete'),
    icon: "pi pi-exclamation-triangle",
    acceptClass: "p-button-danger",
    accept: () => deleteStaff(staff),
  });
};

const deleteStaff = async (staff: any) => {
  const token = localStorage.getItem("token");
  try {
    const res = await fetch(`/api/v1/staff/${staff.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error("Failed to delete");

    toast.add({
      severity: "success",
      summary: t('common.success'),
      detail: t('staff.toast.deleted'),
      life: 3000,
    });
    fetchData();
  } catch (err) {
    toast.add({
      severity: "error",
      summary: t('common.error'),
      detail: t('staff.toast.deleteFailed'),
      life: 4000,
    });
  }
};

const filteredStaff = computed(() => {
  if (!search.value) return staff.value;
  const term = search.value.toLowerCase();
  return staff.value.filter((s: any) => s.name.toLowerCase().includes(term));
});

onMounted(fetchData);
</script>
