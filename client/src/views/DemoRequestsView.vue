<template>
  <div class="space-y-6">
    <!-- Page Header -->
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-[var(--p-primary-50)] flex items-center justify-center">
          <i class="pi pi-inbox text-[var(--p-primary-600)]"></i>
        </div>
        <div>
          <h1 class="text-2xl font-bold text-gray-900">{{ t('demoRequests.title') }}</h1>
        </div>
      </div>
    </div>

    <!-- Data Table Card -->
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <DataTable
        :value="requests"
        :rows="10"
        paginator
        :rowsPerPageOptions="[10, 20, 50]"
        responsiveLayout="scroll"
        class="p-datatable-sm"
        :loading="loading"
      >
        <template #empty>
          <div class="flex flex-col items-center justify-center py-16 text-center">
            <i class="pi pi-inbox text-5xl text-gray-200 mb-4"></i>
            <p class="text-gray-500 font-semibold text-lg">{{ t('demoRequests.empty') }}</p>
          </div>
        </template>

        <Column field="name" :header="t('demoRequests.table.name')" />
        <Column field="email" :header="t('demoRequests.table.email')" />
        <Column field="shop_name" :header="t('demoRequests.table.shopName')" />
        <Column :header="t('demoRequests.table.phone')">
          <template #body="slotProps">
            <span class="text-sm text-gray-700">{{ slotProps.data.phone || '—' }}</span>
          </template>
        </Column>
        <Column :header="t('demoRequests.table.message')">
          <template #body="slotProps">
            <span class="text-sm text-gray-500 line-clamp-2 max-w-xs block">{{ slotProps.data.message || '—' }}</span>
          </template>
        </Column>
        <Column :header="t('demoRequests.table.status')">
          <template #body="slotProps">
            <Tag
              :value="t(`demoRequests.status.${slotProps.data.status}`)"
              :severity="slotProps.data.status === 'contacted' ? 'success' : 'info'"
            />
          </template>
        </Column>
        <Column :header="t('demoRequests.table.createdAt')">
          <template #body="slotProps">
            <span class="text-sm text-gray-500">{{ formatDate(slotProps.data.created_at) }}</span>
          </template>
        </Column>
        <Column :header="t('common.actions')" style="width: 140px">
          <template #body="slotProps">
            <div class="flex gap-1.5 items-center">
              <Button
                :icon="slotProps.data.status === 'contacted' ? 'pi pi-refresh' : 'pi pi-check'"
                class="p-button-rounded p-button-text p-button-sm"
                v-tooltip.top="slotProps.data.status === 'contacted' ? t('demoRequests.markNew') : t('demoRequests.markContacted')"
                @click="toggleStatus(slotProps.data)"
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
  </div>

  <ConfirmDialog></ConfirmDialog>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useToast } from "primevue/usetoast";
import { useConfirm } from "primevue/useconfirm";

const { t } = useI18n();
const toast = useToast();
const confirm = useConfirm();

const requests = ref<any[]>([]);
const loading = ref(false);

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString("el-GR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

const fetchData = async () => {
  loading.value = true;
  try {
    const token = localStorage.getItem("token");
    const res = await fetch("/api/v1/platform/demo-requests", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed");
    requests.value = await res.json();
  } catch (err) {
    console.error(err);
    requests.value = [];
  } finally {
    loading.value = false;
  }
};

const toggleStatus = async (request: any) => {
  const newStatus = request.status === "contacted" ? "new" : "contacted";
  const token = localStorage.getItem("token");
  try {
    const res = await fetch(`/api/v1/platform/demo-requests/${request.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!res.ok) throw new Error("Failed");
    request.status = newStatus;
    toast.add({
      severity: "success",
      summary: t("common.success"),
      detail: t("demoRequests.toast.statusUpdated"),
      life: 3000,
    });
  } catch (err) {
    toast.add({
      severity: "error",
      summary: t("common.error"),
      detail: t("demoRequests.toast.failed"),
      life: 4000,
    });
  }
};

const confirmDelete = (request: any) => {
  confirm.require({
    message: t("demoRequests.confirmDelete", { name: request.name }),
    header: t("common.confirmDelete"),
    icon: "pi pi-exclamation-triangle",
    acceptClass: "p-button-danger",
    accept: async () => {
      const token = localStorage.getItem("token");
      try {
        const res = await fetch(`/api/v1/platform/demo-requests/${request.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Failed");
        requests.value = requests.value.filter((r) => r.id !== request.id);
        toast.add({
          severity: "success",
          summary: t("common.success"),
          detail: t("demoRequests.toast.deleted"),
          life: 3000,
        });
      } catch (err) {
        toast.add({
          severity: "error",
          summary: t("common.error"),
          detail: t("demoRequests.toast.failed"),
          life: 4000,
        });
      }
    },
  });
};

onMounted(fetchData);
</script>
