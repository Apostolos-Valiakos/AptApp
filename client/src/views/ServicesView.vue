<template>
  <div class="space-y-6">
    <!-- Page Header -->
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div class="flex justify-between items-center">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-[var(--p-primary-50)] flex items-center justify-center">
            <i class="pi pi-list-check text-[var(--p-primary-600)]"></i>
          </div>
          <div>
            <h1 class="text-2xl font-bold text-gray-900">{{ t('services.title') }}</h1>
            <p class="text-sm text-gray-500">{{ t('services.subtitle', { count: services.length }) }}</p>
          </div>
        </div>
        <Button
          :label="t('services.addNew')"
          icon="pi pi-plus"
          @click="openNew"
        />
      </div>
    </div>

    <!-- Data Table Card -->
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
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
                :placeholder="t('services.search')"
                class="w-64"
              />
            </span>
          </div>
        </template>

        <template #empty>
          <div class="flex flex-col items-center justify-center py-16 text-center">
            <i class="pi pi-list text-5xl text-gray-200 mb-4"></i>
            <p class="text-gray-500 font-semibold text-lg">{{ t('services.empty.title') }}</p>
            <p class="text-gray-400 text-sm mt-1">{{ t('services.empty.subtitle') }}</p>
          </div>
        </template>

        <!-- Service Name with color accent bar -->
        <Column field="name" :header="t('services.table.name')" sortable>
          <template #body="slotProps">
            <div class="flex items-center gap-3">
              <div
                class="w-1 h-8 rounded-full flex-shrink-0"
                :style="{ backgroundColor: slotProps.data.color_code || 'var(--p-primary-300)' }"
              ></div>
              <span class="font-semibold text-gray-900">{{ slotProps.data.name }}</span>
            </div>
          </template>
        </Column>

        <Column field="category" :header="t('services.table.category')" sortable>
          <template #body="slotProps">
            <span
              class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border"
              :style="{
                backgroundColor: (slotProps.data.color_code || 'var(--p-primary-100)') + '20',
                color: slotProps.data.color_code || 'var(--p-primary-700)',
                borderColor: slotProps.data.color_code || 'var(--p-primary-200)',
              }"
            >
              {{ slotProps.data.category || t('services.table.uncategorized') }}
            </span>
          </template>
        </Column>

        <Column field="duration_minutes" :header="t('services.table.duration')" sortable>
          <template #body="slotProps">
            <span class="inline-flex items-center gap-1.5 text-sm text-gray-700">
              <i class="pi pi-clock text-gray-400 text-xs"></i>
              {{ formatDuration(slotProps.data.duration_minutes) }}
            </span>
          </template>
        </Column>

        <Column field="price" :header="t('services.table.price')" sortable>
          <template #body="slotProps">
            <span class="inline-flex items-center gap-1 text-sm font-medium text-gray-800">
              <i class="pi pi-euro text-gray-400 text-xs"></i>
              {{ Number(slotProps.data.price).toFixed(2) }}
            </span>
          </template>
        </Column>

        <!-- Enlarged color swatch with hex code -->
        <Column field="color_code" :header="t('services.table.color')">
          <template #body="slotProps">
            <div class="flex items-center gap-2">
              <div
                class="w-8 h-8 rounded-lg border border-gray-200 shadow-sm flex-shrink-0"
                :style="{ backgroundColor: slotProps.data.color_code || '#e5e7eb' }"
              ></div>
              <span class="text-xs text-gray-500 font-mono">{{ slotProps.data.color_code || '—' }}</span>
            </div>
          </template>
        </Column>

        <Column :header="t('common.actions')">
          <template #body="slotProps">
            <div class="flex gap-1.5 items-center">
              <Button
                icon="pi pi-pencil"
                class="p-button-rounded p-button-text p-button-sm"
                v-tooltip.top="t('common.edit')"
                @click="editService(slotProps.data)"
              />
              <Button
                icon="pi pi-trash"
                class="p-button-rounded p-button-text p-button-sm"
                severity="danger"
                v-tooltip.top="t('common.delete')"
                @click="confirmDelete(slotProps.data)"
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </div>

    <!-- Edit / Add Dialog -->
    <Dialog
      v-model:visible="dialogVisible"
      :header="editingService?.id ? t('services.dialog.editService') : t('services.dialog.newService')"
      modal
      class="w-full max-w-2xl"
    >
      <div class="space-y-5 mt-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('services.dialog.serviceName') }}</label>
            <InputText
              v-model="editingService.name"
              :placeholder="t('services.dialog.serviceNamePlaceholder')"
              class="w-full"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('services.dialog.category') }}</label>
            <Dropdown
              v-model="editingService.category"
              :options="categories"
              :placeholder="t('services.dialog.selectCategory')"
              class="w-full"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('services.dialog.duration') }}</label>
            <InputNumber
              v-model="editingService.duration_minutes"
              :min="15"
              :max="360"
              showButtons
              class="w-full"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('services.dialog.price') }}</label>
            <InputNumber
              v-model="editingService.price"
              mode="decimal"
              :minFractionDigits="2"
              :maxFractionDigits="2"
              class="w-full"
            />
          </div>

          <!-- Color picker — full width with light gray background -->
          <div class="md:col-span-2 p-4 bg-gray-50 rounded-xl border border-gray-200">
            <label class="block text-sm font-medium text-gray-700 mb-3">{{ t('services.dialog.serviceColor') }}</label>
            <div class="flex items-start gap-6">
              <ColorPicker v-model="editingService.color_code" format="hex" />
              <div class="flex-grow">
                <p class="text-xs text-gray-500 mb-3">
                  {{ t('services.dialog.colorNote') }}
                </p>
                <div class="flex items-center gap-3">
                  <InputText
                    v-model="editingService.color_code"
                    class="p-inputtext-sm w-36"
                    placeholder="#000000"
                  />
                  <div
                    class="w-10 h-10 rounded-lg border border-gray-200 shadow-sm transition-colors flex-shrink-0"
                    :style="{ backgroundColor: editingService.color_code }"
                  ></div>
                  <span class="text-xs text-gray-400 font-mono">{{ editingService.color_code }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <Button
          :label="t('common.cancel')"
          icon="pi pi-times"
          variant="text"
          @click="dialogVisible = false"
        />
        <Button
          :label="editingService?.id ? t('common.save') : t('common.save')"
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
import { useI18n } from "vue-i18n";
import { useToast } from "primevue/usetoast";
import { useConfirm } from "primevue/useconfirm";

const { t } = useI18n();

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
  color_code: "var(--p-primary-100)",
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
      summary: t('common.error'),
      detail: t('services.toast.loadFailed'),
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
    color_code: "var(--p-primary-100)",
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
      summary: t('common.required'),
      detail: t('services.toast.validationError'),
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
      summary: t('common.success'),
      detail: t('services.toast.saved'),
      life: 3000,
    });
    dialogVisible.value = false;
    fetchServices();
  } catch (err) {
    toast.add({
      severity: "error",
      summary: t('common.error'),
      detail: t('services.toast.saveFailed'),
      life: 3000,
    });
  }
};

const confirmDelete = (service: any) => {
  confirm.require({
    message: t('services.confirmDelete', { name: service.name }),
    header: t('common.confirmDelete'),
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
      summary: t('common.success'),
      detail: t('services.toast.deleted', { name: service.name }),
      life: 3000,
    });
    fetchServices();
  } catch (err) {
    toast.add({
      severity: "error",
      summary: t('common.error'),
      detail: t('services.toast.deleteFailed'),
      life: 3000,
    });
  }
};

const formatDuration = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0
    ? t('services.duration.hoursMinutes', { h, m })
    : t('services.duration.minutes', { m });
};
</script>

<style scoped>
:deep(.p-datatable .p-datatable-tbody > tr > td) {
  padding: 1rem;
}
</style>
