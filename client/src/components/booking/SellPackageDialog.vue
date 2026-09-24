<template>
  <Dialog
    v-model:visible="visibleModel"
    modal
    :header="immediate ? t('packages.sell.title') : t('packages.sell.addTitle')"
    :style="{ width: '26rem' }"
  >
    <div class="space-y-4">
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">{{
          t("packages.sell.type")
        }}</label>
        <Dropdown
          v-model="typeId"
          :options="types"
          optionLabel="label"
          optionValue="id"
          :placeholder="t('packages.sell.selectType')"
          :emptyMessage="t('packages.sell.noTypes')"
          class="w-full"
        />
      </div>
      <div v-if="immediate">
        <label class="block text-sm font-medium text-gray-700 mb-1">{{
          t("packages.sell.paymentMethod")
        }}</label>
        <Dropdown
          v-model="method"
          :options="['cash', 'card', 'bank-transfer']"
          class="w-full"
        />
      </div>
      <div v-if="selected" class="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
        {{ selected.visits }} × {{ selected.service_name }} —
        <b>€{{ Number(selected.price).toFixed(2) }}</b>
        <span v-if="selected.validity_days">
          · {{ t("packages.validFor", { n: selected.validity_days }) }}</span
        >
      </div>
    </div>
    <template #footer>
      <Button
        :label="t('packages.sell.cancel')"
        text
        @click="visibleModel = false"
      />
      <Button
        :label="immediate ? t('packages.sell.sell') : t('packages.sell.add')"
        icon="pi pi-check"
        :loading="saving"
        :disabled="!typeId"
        @click="confirm"
      />
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useToast } from "primevue/usetoast";

const { t } = useI18n();
const toast = useToast();
const props = withDefaults(
  defineProps<{ visible: boolean; clientId: string | null; immediate?: boolean }>(),
  { immediate: true },
);
const emit = defineEmits<{
  "update:visible": [boolean];
  sold: [];
  picked: [{ package_type_id: string; name: string; price: number }];
}>();

const visibleModel = computed({
  get: () => props.visible,
  set: (v) => emit("update:visible", v),
});

const rawTypes = ref<any[]>([]);
const typeId = ref<string | null>(null);
const method = ref("cash");
const saving = ref(false);

const types = computed(() =>
  rawTypes.value.map((p) => ({
    ...p,
    label: `${p.name} — €${Number(p.price).toFixed(2)}`,
  })),
);
const selected = computed(() => types.value.find((p) => p.id === typeId.value));

const headers = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

watch(
  () => props.visible,
  async (v) => {
    if (!v) return;
    typeId.value = null;
    method.value = "cash";
    try {
      const res = await fetch("/api/v1/package-types", { headers: headers() });
      if (res.ok) rawTypes.value = (await res.json()).filter((p: any) => p.is_active);
    } catch {
      rawTypes.value = [];
    }
  },
);

const confirm = async () => {
  if (!props.clientId || !typeId.value || !selected.value) return;
  if (!props.immediate) {
    emit("picked", {
      package_type_id: typeId.value,
      name: selected.value.name,
      price: Number(selected.value.price),
    });
    visibleModel.value = false;
    return;
  }
  saving.value = true;
  try {
    const res = await fetch(`/api/v1/clients/${props.clientId}/packages`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ package_type_id: typeId.value, payment_method: method.value }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || t("packages.failed"));
    toast.add({ severity: "success", summary: t("packages.sell.sold"), life: 2500 });
    visibleModel.value = false;
    emit("sold");
  } catch (e: any) {
    toast.add({ severity: "error", summary: t("common.error"), detail: e.message, life: 3500 });
  } finally {
    saving.value = false;
  }
};
</script>
