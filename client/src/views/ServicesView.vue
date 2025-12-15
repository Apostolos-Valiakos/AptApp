<template>
  <div class="p-6 bg-white rounded-xl shadow-lg">
    <div class="flex justify-between items-center mb-8">
      <h1 class="text-3xl font-bold text-gray-800">Services Management</h1>
      <Button
        label="Add New Service"
        icon="pi pi-plus"
        class="p-button-success"
        @click="openNew"
      />
    </div>

    <DataTable
      :value="services"
      :paginator="true"
      :rows="10"
      :rowsPerPageOptions="[10, 25, 50]"
      responsiveLayout="scroll"
      class="p-datatable-sm"
      :loading="loading"
    >
      <template #header>
        <div class="flex justify-between">
          <span class="p-input-icon-left">
            <i class="pi pi-search" />
            <InputText
              v-model="search"
              placeholder="Search services..."
              class="w-64"
            />
          </span>
        </div>
      </template>

      <Column field="name" header="Service Name" sortable>
        <template #body="slotProps">
          <strong>{{ slotProps.data.name }}</strong>
        </template>
      </Column>

      <Column field="category" header="Category" sortable>
        <template #body="slotProps">
          <span
            class="px-3 py-1 rounded-full text-xs font-medium"
            :class="getCategoryClass(slotProps.data.category)"
          >
            {{ slotProps.data.category || "Uncategorized" }}
          </span>
        </template>
      </Column>

      <Column field="duration_minutes" header="Duration" sortable>
        <template #body="slotProps">
          {{ formatDuration(slotProps.data.duration_minutes) }}
        </template>
      </Column>

      <Column field="price" header="Price" sortable>
        <template #body="slotProps">
          €{{ Number(slotProps.data.price).toFixed(2) }}
        </template>
      </Column>

      <Column header="Actions" style="width: 150px">
        <template #body="slotProps">
          <Button
            icon="pi pi-pencil"
            class="p-button-rounded p-button-info p-button-sm mr-2"
            @click="editService(slotProps.data)"
          />
          <Button
            icon="pi pi-trash"
            class="p-button-rounded p-button-danger p-button-sm"
            @click="confirmDelete(slotProps.data)"
          />
        </template>
      </Column>
    </DataTable>

    <!-- Edit / Add Dialog -->
    <Dialog
      v-model:visible="dialogVisible"
      :header="editingService?.id ? 'Edit Service' : 'New Service'"
      modal
      class="w-full max-w-2xl"
    >
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2"
            >Service Name</label
          >
          <InputText
            v-model="editingService.name"
            placeholder="e.g., Κούρεμα Γυναικείο"
            class="w-full"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2"
            >Category</label
          >
          <Dropdown
            v-model="editingService.category"
            :options="categories"
            placeholder="Select category"
            class="w-full"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2"
            >Duration (minutes)</label
          >
          <InputNumber
            v-model="editingService.duration_minutes"
            :min="15"
            :max="360"
            showButtons
            class="w-full"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2"
            >Price (€)</label
          >
          <InputNumber
            v-model="editingService.price"
            mode="decimal"
            :minFractionDigits="2"
            :maxFractionDigits="2"
            class="w-full"
          />
        </div>
      </div>

      <template #footer>
        <Button
          label="Cancel"
          icon="pi pi-times"
          class="p-button-text"
          @click="dialogVisible = false"
        />
        <Button
          :label="editingService?.id ? 'Update' : 'Create'"
          icon="pi pi-check"
          class="p-button-success"
          @click="saveService"
        />
      </template>
    </Dialog>

    <!-- Delete Confirm Dialog -->
    <ConfirmDialog></ConfirmDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useToast } from "primevue/usetoast";
import { useConfirm } from "primevue/useconfirm";

const toast = useToast();
const confirm = useConfirm();

const services = ref<any[]>([]);
const loading = ref(true);
const dialogVisible = ref(false);
const search = ref("");

const editingService = ref<any>({
  id: null,
  name: "",
  category: "",
  duration_minutes: 60,
  price: 0.0,
});

const categories = [
  "Hair",
  "Nails",
  "Massage",
  "Facial",
  "Makeup",
  "Waxing",
  "Other",
];

onMounted(() => {
  fetchServices();
  setInterval(fetchServices, 10000); // polling
});

const fetchServices = async () => {
  const token = localStorage.getItem("token");
  try {
    const res = await fetch("/api/v1/services", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      services.value = await res.json();
    } else if (res.status === 401) {
      console.error("Unauthorized");
    }
    loading.value = false;
  } catch (err) {
    toast.add({
      severity: "error",
      summary: "Error",
      detail: "Failed to load services",
      life: 3000,
    });
  }
};

const filteredServices = computed(() => {
  if (!search.value) return services.value;
  return services.value.filter(
    (s) =>
      s.name.toLowerCase().includes(search.value.toLowerCase()) ||
      s.category?.toLowerCase().includes(search.value.toLowerCase())
  );
});

const openNew = () => {
  editingService.value = {
    name: "",
    category: "",
    duration_minutes: 60,
    price: 0.0,
  };
  dialogVisible.value = true;
};

const editService = (service: any) => {
  editingService.value = { ...service };
  dialogVisible.value = true;
};

const saveService = async () => {
  if (!editingService.value.name || !editingService.value.category) {
    toast.add({
      severity: "warn",
      summary: "Validation",
      detail: "Name and category required",
      life: 3000,
    });
    return;
  }

  const token = localStorage.getItem("token");
  const url = editingService.value.id
    ? `/api/v1/services/${editingService.value.id}`
    : "/api/v1/services";

  const method = editingService.value.id ? "PUT" : "POST";

  try {
    await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(editingService.value),
    });
    toast.add({
      severity: "success",
      summary: "Success",
      detail: "Service saved!",
      life: 3000,
    });
    dialogVisible.value = false;
    fetchServices();
  } catch (err) {
    toast.add({
      severity: "error",
      summary: "Error",
      detail: "Failed to save service",
      life: 3000,
    });
  }
};

const confirmDelete = (service: any) => {
  confirm.require({
    message: `Delete "${service.name}" permanently?`,
    header: "Confirm Delete",
    icon: "pi pi-exclamation-triangle",
    accept: () => deleteService(service),
    reject: () => {},
  });
};

const deleteService = async (service: any) => {
  const token = localStorage.getItem("token");
  try {
    await fetch(`/api/v1/services/${service.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    toast.add({
      severity: "success",
      summary: "Deleted",
      detail: `${service.name} removed`,
      life: 3000,
    });
    fetchServices();
  } catch (err) {
    toast.add({
      severity: "error",
      summary: "Error",
      detail: "Failed to delete",
      life: 3000,
    });
  }
};

const formatDuration = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m} minutes`;
};

const getCategoryClass = (category: string) => {
  const map: any = {
    Hair: "bg-red-100 text-red-800",
    Nails: "bg-pink-100 text-pink-800",
    Massage: "bg-green-100 text-green-800",
    Facial: "bg-purple-100 text-purple-800",
    Makeup: "bg-yellow-100 text-yellow-800",
    Waxing: "bg-orange-100 text-orange-800",
    Other: "bg-gray-100 text-gray-800",
  };
  return map[category] || "bg-gray-100 text-gray-800";
};
</script>

<style scoped>
:deep(.p-datatable .p-datatable-tbody > tr > td) {
  padding: 1rem;
}
</style>
