<template>
  <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
    <div class="flex justify-between items-center mb-6">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-[var(--p-primary-50)] flex items-center justify-center">
          <i class="pi pi-clone text-[var(--p-primary-600)]"></i>
        </div>
        <div>
          <h1 class="text-2xl font-bold text-gray-900">{{ t("packages.title") }}</h1>
          <p class="text-sm text-gray-500 mt-0.5">{{ t("packages.subtitle") }}</p>
        </div>
      </div>
      <Button :label="t('packages.addNew')" icon="pi pi-plus" @click="openNew" />
    </div>

    <DataTable :value="types" :loading="loading" class="p-datatable-sm" :rowHover="true" responsiveLayout="scroll">
      <template #empty>
        <div class="text-center py-12 text-gray-400">{{ t("packages.empty") }}</div>
      </template>
      <Column :header="t('packages.name')">
        <template #body="{ data }">
          <span class="font-semibold">{{ data.name }}</span>
          <Tag v-if="!data.is_active" :value="t('packages.inactive')" severity="secondary" class="ml-2" />
        </template>
      </Column>
      <Column field="service_name" :header="t('packages.service')" />
      <Column :header="t('packages.visits')">
        <template #body="{ data }">{{ data.visits }}</template>
      </Column>
      <Column :header="t('packages.price')">
        <template #body="{ data }">€{{ Number(data.price).toFixed(2) }}</template>
      </Column>
      <Column :header="t('packages.validity')">
        <template #body="{ data }">
          {{ data.validity_days ? t("packages.validFor", { n: data.validity_days }) : t("packages.neverExpires") }}
        </template>
      </Column>
      <Column :header="t('packages.active')">
        <template #body="{ data }">
          <ToggleSwitch :modelValue="data.is_active" @update:modelValue="(v: boolean) => toggle(data, v)" />
        </template>
      </Column>
      <Column>
        <template #body="{ data }">
          <div class="flex justify-end gap-1">
            <Button icon="pi pi-pencil" text rounded @click="openEdit(data)" />
            <Button icon="pi pi-trash" text rounded severity="danger" @click="remove(data)" />
          </div>
        </template>
      </Column>
    </DataTable>

    <Dialog v-model:visible="showDialog" modal :header="form.id ? t('packages.edit') : t('packages.addNew')" :style="{ width: '28rem' }">
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{{ t("packages.name") }}</label>
          <InputText v-model="form.name" class="w-full" maxlength="100" :placeholder="t('packages.namePlaceholder')" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{{ t("packages.service") }}</label>
          <Dropdown
            v-model="form.service_id"
            :options="services"
            optionLabel="name"
            optionValue="id"
            optionGroupLabel="label"
            optionGroupChildren="items"
            filter
            class="w-full"
          />
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">{{ t("packages.visits") }}</label>
            <InputNumber v-model="form.visits" :min="1" class="w-full" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">{{ t("packages.price") }}</label>
            <InputNumber v-model="form.price" mode="currency" currency="EUR" locale="el-GR" :min="0" class="w-full" />
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{{ t("packages.validityDays") }}</label>
          <InputNumber v-model="form.validity_days" :min="1" class="w-full" :placeholder="t('packages.neverExpires')" />
        </div>
      </div>
      <template #footer>
        <Button :label="t('packages.sell.cancel')" text @click="showDialog = false" />
        <Button :label="t('packages.adjust.save')" icon="pi pi-check" :loading="saving" :disabled="!canSave" @click="save" />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useToast } from "primevue/usetoast";
import { useConfirm } from "primevue/useconfirm";
import { groupServicesByCategory } from "../utils/serviceGroups";

const { t } = useI18n();
const toast = useToast();
const confirm = useConfirm();

const types = ref<any[]>([]);
const services = ref<any[]>([]);
const loading = ref(false);
const saving = ref(false);
const showDialog = ref(false);
const form = reactive<any>({ id: null, name: "", service_id: null, visits: 5, price: 0, validity_days: null });

const canSave = computed(() => form.name.trim() && form.service_id && form.visits > 0 && form.price >= 0);

const api = async (url: string, method = "GET", body?: any) => {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || t("packages.failed"));
  return data;
};

const load = async () => {
  loading.value = true;
  try {
    const [pt, sv] = await Promise.all([api("/api/v1/package-types"), api("/api/v1/services")]);
    types.value = pt;
    services.value = groupServicesByCategory(sv.filter((s: any) => s.is_active !== false), t("services.table.uncategorized"));
  } catch (e: any) {
    toast.add({ severity: "error", summary: t("common.error"), detail: e.message, life: 3500 });
  } finally {
    loading.value = false;
  }
};

const openNew = () => {
  Object.assign(form, { id: null, name: "", service_id: null, visits: 5, price: 0, validity_days: null });
  showDialog.value = true;
};
const openEdit = (p: any) => {
  Object.assign(form, { id: p.id, name: p.name, service_id: p.service_id, visits: p.visits, price: Number(p.price), validity_days: p.validity_days });
  showDialog.value = true;
};

const run = async (fn: () => Promise<any>) => {
  try {
    await fn();
    await load();
  } catch (e: any) {
    toast.add({ severity: "error", summary: t("common.error"), detail: e.message, life: 3500 });
  }
};

const save = async () => {
  saving.value = true;
  await run(async () => {
    const body = { name: form.name, service_id: form.service_id, visits: form.visits, price: form.price, validity_days: form.validity_days };
    if (form.id) await api(`/api/v1/package-types/${form.id}`, "PUT", body);
    else await api("/api/v1/package-types", "POST", body);
    showDialog.value = false;
  });
  saving.value = false;
};

const toggle = (p: any, is_active: boolean) =>
  run(() =>
    api(`/api/v1/package-types/${p.id}`, "PUT", {
      name: p.name, service_id: p.service_id, visits: p.visits, price: p.price, validity_days: p.validity_days, is_active,
    }),
  );

const remove = (p: any) =>
  confirm.require({
    header: p.name,
    message: t("packages.deleteConfirm"),
    icon: "pi pi-exclamation-triangle",
    acceptClass: "p-button-danger",
    accept: () => run(() => api(`/api/v1/package-types/${p.id}`, "DELETE")),
  });

onMounted(load);
</script>
