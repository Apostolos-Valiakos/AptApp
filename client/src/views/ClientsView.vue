<template>
  <div class="p-6 bg-white rounded-xl shadow-lg">
    <div class="flex justify-between items-center mb-8">
      <h1 class="text-3xl font-bold text-gray-800">Clients Management</h1>
      <Button label="Add New Client" icon="pi pi-plus" @click="openNew" />
    </div>

    <DataTable
      :value="filteredClients"
      :paginator="true"
      :rows="15"
      :rowsPerPageOptions="[15, 30, 50, 100]"
      responsiveLayout="scroll"
      class="p-datatable-sm cursor-pointer hover:bg-gray-50"
      :loading="loading"
      sortField="last_name"
      :sortOrder="1"
      selectionMode="single"
      @row-click="(e) => openProfile(e.data)"
    >
      <template #header>
        <div class="flex justify-between items-center">
          <span class="p-input-icon-left">
            <i class="pi pi-search mr-3" />
            <InputText
              v-model="search"
              placeholder="Search by name, email, phone..."
              class="w-80"
            />
          </span>
          <div class="text-sm text-gray-600">
            Total: {{ clients.length }} clients
          </div>
        </div>
      </template>

      <Column field="first_name" header="First Name" sortable>
        <template #body="slotProps">
          <div class="font-medium">{{ slotProps.data.first_name }}</div>
        </template>
      </Column>

      <Column field="last_name" header="Last Name" sortable>
        <template #body="slotProps">
          <div class="font-medium">{{ slotProps.data.last_name }}</div>
        </template>
      </Column>

      <Column field="email" header="Email" sortable>
        <template #body="slotProps">
          <a
            :href="'mailto:' + slotProps.data.email"
            class="text-indigo-600 hover:underline text-sm"
            @click.stop
          >
            {{ slotProps.data.email }}
          </a>
        </template>
      </Column>

      <Column field="phone" header="Phone" sortable>
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

      <Column header="Info">
        <template #body="slotProps">
          <div
            v-if="
              slotProps.data.custom_fields &&
              slotProps.data.custom_fields.length > 0
            "
          >
            <span
              class="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-1 rounded-full"
            >
              {{ slotProps.data.custom_fields.length }} Details
            </span>
          </div>
        </template>
      </Column>

      <Column header="Actions" style="width: 120px">
        <template #body="slotProps">
          <Button
            icon="pi pi-pencil"
            class="p-button-rounded p-button-text p-button-sm"
            @click.stop="openProfile(slotProps.data)"
          />
          <Button
            icon="pi pi-trash"
            class="p-button-rounded p-button-text p-button-sm"
            severity="danger"
            @click.stop="confirmDelete(slotProps.data)"
          />
        </template>
      </Column>
    </DataTable>

    <Dialog
      v-model:visible="dialogVisible"
      header="New Client"
      modal
      class="w-full max-w-3xl"
    >
      <div class="space-y-6 mt-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2"
              >First Name</label
            >
            <InputText v-model="editingClient.first_name" class="w-full" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2"
              >Last Name</label
            >
            <InputText v-model="editingClient.last_name" class="w-full" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2"
              >Email</label
            >
            <InputText
              v-model="editingClient.email"
              type="email"
              class="w-full"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2"
              >Phone</label
            >
            <InputText v-model="editingClient.phone" class="w-full" />
          </div>
        </div>

        <div class="bg-gray-50 p-4 rounded-lg border border-gray-200">
          <div class="flex justify-between items-center mb-3">
            <label
              class="text-sm font-bold text-gray-700 uppercase tracking-wide"
            >
              Custom Details
            </label>
            <Button
              label="Add Field"
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
                placeholder="Title"
                class="w-full p-inputtext-sm font-bold"
              />
            </div>
            <div class="flex-grow">
              <InputText
                v-model="field.value"
                placeholder="Value"
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
          <label class="block text-sm font-medium text-gray-700 mb-2"
            >Notes</label
          >
          <Textarea v-model="editingClient.notes" rows="3" class="w-full" />
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
          label="Create"
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
import { ref, onMounted, computed } from "vue";
import { useToast } from "primevue/usetoast";
import { useConfirm } from "primevue/useconfirm";
import ClientProfileDialog from "../components/ClientProfileDialog.vue"; // Ensure correct path

const toast = useToast();
const confirm = useConfirm();

const clients = ref<any[]>([]);
const loading = ref(true);
const dialogVisible = ref(false); // For creating NEW clients
const search = ref("");

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
});

onMounted(() => {
  fetchClients();
  // Optional: setInterval(fetchClients, 10000);
});

const fetchClients = async () => {
  const token = localStorage.getItem("token");
  try {
    const res = await fetch("/api/v1/clients", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      clients.value = await res.json();
    }
    loading.value = false;
  } catch (err) {
    console.error(err);
  }
};

const filteredClients = computed(() => {
  if (!search.value) return clients.value;
  const term = search.value.toLowerCase();
  return clients.value.filter(
    (c) =>
      `${c.first_name} ${c.last_name}`.toLowerCase().includes(term) ||
      c.email?.toLowerCase().includes(term) ||
      c.phone?.includes(term.replace(/\s/g, ""))
  );
});

// NEW: Open the full profile dialog
const openProfile = (client: any) => {
  selectedClientId.value = client.id;
  profileVisible.value = true;
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
      summary: "Required",
      detail: "First and last name are required",
      life: 3000,
    });
    return;
  }

  const token = localStorage.getItem("token");

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
      summary: "Success",
      detail: "Client created",
      life: 3000,
    });
    dialogVisible.value = false;
    fetchClients();
  } catch (err) {
    toast.add({
      severity: "error",
      summary: "Error",
      detail: "Failed to save client",
      life: 4000,
    });
  }
};

const confirmDelete = (client: any) => {
  confirm.require({
    message: `Delete client "${client.first_name} ${client.last_name}" permanently?`,
    header: "Confirm Delete",
    icon: "pi pi-exclamation-triangle",
    acceptClass: "p-button-danger",
    accept: () => deleteClient(client),
  });
};

const deleteClient = async (client: any) => {
  const token = localStorage.getItem("token");
  try {
    const res = await fetch(`/api/v1/clients/${client.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error("Failed to delete");

    toast.add({
      severity: "success",
      summary: "Deleted",
      detail: "Client removed",
      life: 3000,
    });
    fetchClients();
  } catch (err) {
    toast.add({
      severity: "error",
      summary: "Error",
      detail: "Failed to delete client",
      life: 4000,
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
