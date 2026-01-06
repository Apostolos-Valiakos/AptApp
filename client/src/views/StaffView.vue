<template>
  <div class="bg-white rounded-xl shadow-lg p-6">
    <div class="flex justify-between mb-6">
      <h2 class="text-2xl font-bold">Staff Management</h2>
      <Button label="Add Staff" icon="pi pi-plus" @click="openNew" />
    </div>

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
              placeholder="Search staff..."
              class="w-80"
            />
          </span>
        </div>
      </template>

      <Column field="name" header="Name">
        <template #body="slotProps">
          <div class="font-bold">{{ slotProps.data.name }}</div>
          <div class="text-xs text-gray-500">{{ slotProps.data.email }}</div>
        </template>
      </Column>
      <Column field="phone" header="Phone" />
      <Column field="specialty" header="Specialty" />

      <Column header="Actions" style="width: 140px">
        <template #body="slotProps">
          <div class="flex gap-2">
            <!-- Edit Button -->
            <Button
              icon="pi pi-pencil"
              class="p-button-rounded p-button-text p-button-sm"
              v-tooltip.top="'Edit Details'"
              @click="editStaff(slotProps.data)"
            />
            <!-- NEW: Create Login Button -->
            <Button
              icon="pi pi-key"
              class="p-button-rounded p-button-text p-button-sm p-button-secondary"
              v-tooltip.top="'Create/Reset Login'"
              @click="openLoginDialog(slotProps.data)"
            />
            <!-- NEW: Delete Button (Added for consistency) -->
            <Button
              icon="pi pi-trash"
              class="p-button-rounded p-button-text p-button-danger p-button-sm"
              v-tooltip.top="'Delete Staff'"
              @click="confirmDelete(slotProps.data)"
            />
          </div>
        </template>
      </Column>
    </DataTable>
  </div>

  <!-- Add/Edit Staff Dialog (Existing) -->
  <Dialog
    v-model:visible="showDialog"
    :header="editingStaff.id ? 'Edit Staff' : 'New Staff'"
    modal
    class="w-full max-w-2xl"
  >
    <!-- ... (Existing Form Code) ... -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
      <div>
        <label class="block text-sm font-bold text-gray-700 mb-1"
          >First Name</label
        ><InputText v-model="editingStaff.first_name" class="w-full" />
      </div>
      <div>
        <label class="block text-sm font-bold text-gray-700 mb-1"
          >Last Name</label
        ><InputText v-model="editingStaff.last_name" class="w-full" />
      </div>
      <div>
        <label class="block text-sm font-bold text-gray-700 mb-1">Email</label
        ><InputText v-model="editingStaff.email" class="w-full" />
      </div>
      <div>
        <label class="block text-sm font-bold text-gray-700 mb-1">Phone</label
        ><InputText v-model="editingStaff.phone" class="w-full" />
      </div>
      <div>
        <label class="block text-sm font-bold text-gray-700 mb-1"
          >Specialty</label
        ><InputText v-model="editingStaff.specialty" class="w-full" />
      </div>
      <div>
        <label class="block text-sm font-bold text-gray-700 mb-1"
          >Hourly Rate (€)</label
        ><InputNumber
          v-model="editingStaff.hourly_rate"
          mode="currency"
          currency="EUR"
          class="w-full"
        />
      </div>
      <div class="md:col-span-2">
        <label class="block text-sm font-bold text-gray-700 mb-1"
          >Services Provided</label
        >
        <MultiSelect
          v-model="editingStaff.service_ids"
          :options="services"
          optionLabel="name"
          optionValue="id"
          display="chip"
          placeholder="Select services"
          class="w-full"
          filter
        />
      </div>
    </div>
    <template #footer>
      <Button
        label="Cancel"
        icon="pi pi-times"
        text
        @click="showDialog = false"
      />
      <Button
        label="Save"
        icon="pi pi-check"
        @click="saveStaff"
        :loading="loading"
      />
    </template>
  </Dialog>

  <!-- NEW: Create Login Dialog -->
  <Dialog
    v-model:visible="showLoginDialog"
    header="Create Staff Login"
    modal
    class="w-full max-w-md"
  >
    <div class="space-y-4 pt-2">
      <p class="text-sm text-gray-600 mb-4">
        Create a username and password for
        <strong>{{ loginStaffTarget?.name }}</strong
        >. They will use this to log in to the app.
      </p>
      <div>
        <label class="block text-sm font-bold text-gray-700 mb-1"
          >Username</label
        >
        <InputText
          v-model="newLogin.username"
          class="w-full"
          placeholder="e.g. maria.stylist"
        />
      </div>
      <div>
        <label class="block text-sm font-bold text-gray-700 mb-1"
          >Password</label
        >
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
        label="Cancel"
        icon="pi pi-times"
        text
        @click="showLoginDialog = false"
      />
      <Button
        label="Create Account"
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
import { useToast } from "primevue/usetoast";
import { useConfirm } from "primevue/useconfirm";

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
      summary: "Success",
      detail: "Staff saved",
      life: 3000,
    });
    showDialog.value = false;
    fetchData();
  } catch (err) {
    toast.add({
      severity: "error",
      summary: "Error",
      detail: "Failed to save",
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
      }
    );

    const data = await res.json();

    if (!res.ok) throw new Error(data.error || "Failed");

    toast.add({
      severity: "success",
      summary: "Account Created",
      detail: `Login enabled for ${loginStaffTarget.value.name}`,
      life: 4000,
    });
    showLoginDialog.value = false;
  } catch (e: any) {
    toast.add({
      severity: "error",
      summary: "Error",
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
    message: `Delete staff "${staff.name}" permanently?`,
    header: "Confirm Delete",
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
      summary: "Deleted",
      detail: "Staff deactivated",
      life: 3000,
    });
    fetchData();
  } catch (err) {
    toast.add({
      severity: "error",
      summary: "Error",
      detail: "Failed to delete staff",
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
