<template>
  <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
    <div class="flex justify-between items-center mb-6">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-[var(--p-primary-50)] flex items-center justify-center">
          <i class="pi pi-id-card text-[var(--p-primary-600)]"></i>
        </div>
        <div>
          <h1 class="text-2xl font-bold text-gray-900">{{ t('membershipTiers.title') }}</h1>
          <p class="text-sm text-gray-500 mt-0.5">{{ t('membershipTiers.subtitle') }}</p>
        </div>
      </div>
      <Button :label="t('membershipTiers.addNew')" icon="pi pi-plus" @click="openNewDialog" />
    </div>

    <DataTable
      :value="tiers"
      :loading="loading"
      responsiveLayout="scroll"
      class="p-datatable-sm"
      :rowHover="true"
    >
      <template #empty>
        <div class="flex flex-col items-center justify-center py-16 text-center">
          <i class="pi pi-id-card text-4xl text-gray-300 mb-3"></i>
          <h3 class="text-base font-medium text-gray-400">{{ t('membershipTiers.empty.title') }}</h3>
          <p class="text-sm text-gray-400 mt-1">{{ t('membershipTiers.empty.subtitle') }}</p>
        </div>
      </template>

      <Column :header="t('membershipTiers.table.name')">
        <template #body="slotProps">
          <div class="flex items-center gap-2">
            <span
              class="w-3 h-3 rounded-full flex-shrink-0"
              :style="{ backgroundColor: slotProps.data.color || '#9CA3AF' }"
            ></span>
            <span class="font-semibold">{{ slotProps.data.name }}</span>
            <Tag v-if="!slotProps.data.is_active" :value="t('membershipTiers.inactive')" severity="secondary" />
          </div>
        </template>
      </Column>

      <Column :header="t('membershipTiers.table.monthlyPrice')">
        <template #body="slotProps">€{{ Number(slotProps.data.monthly_price).toFixed(2) }}</template>
      </Column>

      <Column :header="t('membershipTiers.table.yearlyPrice')">
        <template #body="slotProps">€{{ Number(slotProps.data.yearly_price).toFixed(2) }}</template>
      </Column>

      <Column :header="t('membershipTiers.table.gracePeriod')">
        <template #body="slotProps">{{ t('membershipTiers.daysCount', { n: slotProps.data.grace_period_days }) }}</template>
      </Column>

      <Column :header="t('membershipTiers.table.services')">
        <template #body="slotProps">
          <div class="flex flex-wrap gap-1">
            <Tag
              v-for="svc in slotProps.data.services"
              :key="svc.service_id"
              :value="`${svc.service_name} (${svc.quota_per_month === null ? t('membershipTiers.unlimited') : svc.quota_per_month + 'x'})`"
              severity="info"
            />
            <span v-if="!slotProps.data.services.length" class="text-xs text-gray-400">—</span>
          </div>
        </template>
      </Column>

      <Column :header="t('common.actions')" headerClass="text-center">
        <template #body="slotProps">
          <div class="flex gap-2">
            <Button
              icon="pi pi-pencil"
              class="p-button-rounded p-button-text p-button-sm"
              v-tooltip.top="t('membershipTiers.tooltips.edit')"
              @click="editTier(slotProps.data)"
            />
            <Button
              icon="pi pi-trash"
              class="p-button-rounded p-button-text p-button-sm"
              severity="danger"
              v-tooltip.top="t('membershipTiers.tooltips.delete')"
              @click="confirmDeleteTier(slotProps.data)"
            />
          </div>
        </template>
      </Column>
    </DataTable>

    <Dialog
      v-model:visible="tierDialog"
      :header="isEdit ? t('membershipTiers.dialog.editTier') : t('membershipTiers.dialog.newTier')"
      modal
      :style="{ width: '38rem' }"
    >
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div class="col-span-2">
            <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('membershipTiers.dialog.name') }}</label>
            <InputText v-model="form.name" class="w-full" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('membershipTiers.dialog.monthlyPrice') }}</label>
            <InputNumber v-model="form.monthly_price" mode="decimal" :minFractionDigits="2" class="w-full" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('membershipTiers.dialog.yearlyPrice') }}</label>
            <InputNumber v-model="form.yearly_price" mode="decimal" :minFractionDigits="2" class="w-full" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('membershipTiers.dialog.color') }}</label>
            <ColorPicker v-model="form.color" format="hex" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('membershipTiers.dialog.gracePeriod') }}</label>
            <InputNumber v-model="form.grace_period_days" class="w-full" suffix=" days" :min="0" />
            <small class="text-gray-400">{{ t('membershipTiers.dialog.gracePeriodNote') }}</small>
          </div>
        </div>

        <div class="border-t border-gray-100 pt-4">
          <div class="flex justify-between items-center mb-2">
            <label class="text-sm font-medium text-gray-700">{{ t('membershipTiers.dialog.coveredServices') }}</label>
            <Button
              :label="t('membershipTiers.dialog.addService')"
              icon="pi pi-plus"
              text
              size="small"
              @click="addServiceRow"
            />
          </div>

          <div v-if="!form.services.length" class="text-xs text-gray-400 py-2">
            {{ t('membershipTiers.dialog.noServices') }}
          </div>

          <div v-for="(row, i) in form.services" :key="i" class="flex items-center gap-2 mb-2">
            <Dropdown
              v-model="row.service_id"
              :options="allServices"
              optionLabel="name"
              optionValue="id"
              :placeholder="t('membershipTiers.dialog.selectService')"
              class="flex-grow"
            />
            <InputNumber
              v-model="row.quota_per_month"
              class="w-32"
              :placeholder="t('membershipTiers.unlimited')"
              :min="1"
            />
            <Button icon="pi pi-times" text severity="danger" @click="form.services.splice(i, 1)" />
          </div>
        </div>
      </div>

      <template #footer>
        <Button :label="t('common.cancel')" icon="pi pi-times" text @click="tierDialog = false" />
        <Button
          :label="t('membershipTiers.dialog.save')"
          icon="pi pi-check"
          @click="saveTier"
          :loading="saving"
          :disabled="!form.name"
        />
      </template>
    </Dialog>

    <ConfirmDialog></ConfirmDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useToast } from "primevue/usetoast";
import { useConfirm } from "primevue/useconfirm";

const { t } = useI18n();
const toast = useToast();
const confirm = useConfirm();

const tiers = ref<any[]>([]);
const allServices = ref<any[]>([]);
const loading = ref(true);
const saving = ref(false);
const tierDialog = ref(false);
const isEdit = ref(false);
const editingId = ref<string | null>(null);

const token = () => localStorage.getItem("token");

const emptyForm = () => ({
  name: "",
  monthly_price: 0,
  yearly_price: 0,
  color: "9CA3AF",
  grace_period_days: 0,
  is_active: true,
  services: [] as any[],
});

const form = ref<any>(emptyForm());

const fetchTiers = async () => {
  loading.value = true;
  try {
    const res = await fetch("/api/v1/membership-tiers", {
      headers: { Authorization: `Bearer ${token()}` },
    });
    if (res.ok) tiers.value = await res.json();
  } finally {
    loading.value = false;
  }
};

const fetchServices = async () => {
  const res = await fetch("/api/v1/services", {
    headers: { Authorization: `Bearer ${token()}` },
  });
  if (res.ok) allServices.value = await res.json();
};

onMounted(() => {
  fetchTiers();
  fetchServices();
});

const addServiceRow = () => {
  form.value.services.push({ service_id: null, quota_per_month: null });
};

const openNewDialog = () => {
  isEdit.value = false;
  editingId.value = null;
  form.value = emptyForm();
  tierDialog.value = true;
};

const editTier = (tier: any) => {
  isEdit.value = true;
  editingId.value = tier.id;
  form.value = {
    name: tier.name,
    monthly_price: Number(tier.monthly_price),
    yearly_price: Number(tier.yearly_price),
    color: (tier.color || "9CA3AF").replace("#", ""),
    grace_period_days: tier.grace_period_days,
    is_active: tier.is_active,
    services: (tier.services || []).map((s: any) => ({
      service_id: s.service_id,
      quota_per_month: s.quota_per_month,
    })),
  };
  tierDialog.value = true;
};

const saveTier = async () => {
  saving.value = true;
  try {
    const url = isEdit.value ? `/api/v1/membership-tiers/${editingId.value}` : "/api/v1/membership-tiers";
    const method = isEdit.value ? "PUT" : "POST";
    const payload = {
      ...form.value,
      color: `#${form.value.color}`,
      services: form.value.services.filter((s: any) => s.service_id),
    };
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to save tier");
    }
    toast.add({
      severity: "success",
      summary: t("common.success"),
      detail: isEdit.value ? t("membershipTiers.toast.updated") : t("membershipTiers.toast.created"),
      life: 3000,
    });
    tierDialog.value = false;
    await fetchTiers();
  } catch (e: any) {
    toast.add({ severity: "error", summary: t("common.error"), detail: e.message, life: 4000 });
  } finally {
    saving.value = false;
  }
};

const confirmDeleteTier = (tier: any) => {
  confirm.require({
    message: t("membershipTiers.confirmDelete", { name: tier.name }),
    header: t("common.confirmDelete"),
    icon: "pi pi-exclamation-triangle",
    acceptClass: "p-button-danger",
    accept: async () => {
      try {
        const res = await fetch(`/api/v1/membership-tiers/${tier.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token()}` },
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to delete");
        }
        tiers.value = tiers.value.filter((t) => t.id !== tier.id);
        toast.add({ severity: "success", summary: t("membershipTiers.toast.deleted"), life: 3000 });
      } catch (e: any) {
        toast.add({ severity: "error", summary: t("common.error"), detail: e.message, life: 4000 });
      }
    },
  });
};
</script>
