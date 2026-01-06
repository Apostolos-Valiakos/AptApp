<template>
  <div class="p-6 bg-white rounded-xl shadow-lg">
    <div class="flex justify-between items-center mb-8">
      <h1 class="text-3xl font-bold text-gray-800">Services Management</h1>
      <Button
        color="primary"
        label="Add New Service"
        icon="pi pi-plus"
        @click="openNew"
      />
    </div>

    <DataTable
      :value="filteredServices"
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
            <i class="pi pi-search mr-3" />
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
            class="px-3 py-1 rounded-full text-xs font-medium border"
            :style="{
              backgroundColor: (slotProps.data.color_code || '#ff93d4') + '20',
              color: slotProps.data.color_code || '#ff93d4',
              borderColor: slotProps.data.color_code || '#ff93d4',
            }"
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
      <Column field="color_code" header="Color">
        <template #body="slotProps">
          <div class="flex items-center gap-2">
            <div
              class="w-6 h-6 rounded-full border border-gray-200"
              :style="{
                backgroundColor: slotProps.data.color_code || '#e5e7eb',
              }"
            ></div>
          </div>
        </template>
      </Column>

      <Column header="Actions" style="width: 150px">
        <template #body="slotProps">
          <Button
            icon="pi pi-pencil"
            class="p-button-rounded p-button-sm mr-2"
            severity="info"
            @click="editService(slotProps.data)"
          />
          <Button
            icon="pi pi-trash"
            class="p-button-rounded p-button-sm"
            severity="danger"
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
        <div
          class="md:col-span-2 flex items-center gap-4 p-4 bg-gray-50 rounded-lg"
        >
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2"
              >Service Color</label
            >
            <ColorPicker v-model="editingService.color_code" format="hex" />
          </div>
          <div class="flex-grow">
            <p class="text-xs text-gray-500 mb-2">
              This color will be used for appointment blocks in the calendar.
            </p>
            <div class="flex items-center gap-2">
              <InputText
                v-model="editingService.color_code"
                class="p-inputtext-sm w-32"
                placeholder="#000000"
              />
              <div
                class="w-8 h-8 rounded border shadow-sm transition-colors"
                :style="{ backgroundColor: editingService.color_code }"
              ></div>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <Button
          label="Cancel"
          icon="pi pi-times"
          variant="text"
          @click="dialogVisible = false"
        />
        <Button
          :label="editingService?.id ? 'Update' : 'Create'"
          icon="pi pi-check"
          severity="success"
          @click="saveService"
        />
      </template>
    </Dialog>

    <!-- Delete Confirm Dialog -->
    <ConfirmDialog></ConfirmDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, onUnmounted } from "vue";
import { useToast } from "primevue/usetoast";
import { useConfirm } from "primevue/useconfirm";

let interval: any;
onMounted(() => {
  fetchServices();
  interval = setInterval(fetchServices, 10000);
});

onUnmounted(() => {
  clearInterval(interval);
});

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
  color_code: "#ff93d4",
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
    color_code: "#ff93d4",
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

  const payload = { ...editingService.value };

  if (payload.color_code && !payload.color_code.startsWith("#")) {
    payload.color_code = `#${payload.color_code}`;
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
      body: JSON.stringify(payload),
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
</script>

<style scoped>
:deep(.p-datatable .p-datatable-tbody > tr > td) {
  padding: 1rem;
}
</style>
