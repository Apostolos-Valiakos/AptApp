<template>
  <Dialog v-model:visible="visibleModel" modal :header="t(supplier?.id ? 'expenses.suppliers.edit' : 'expenses.suppliers.add')" :style="{ width: '28rem', maxWidth: '95vw' }">
    <div class="space-y-4">
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1" for="supplier-name">{{ t("expenses.suppliers.name") }}</label>
        <InputText id="supplier-name" v-model="form.name" maxlength="150" class="w-full" :invalid="taken" data-testid="supplier-name" @input="taken = false" />
        <p v-if="taken" class="text-xs text-red-600 mt-1">{{ t("expenses.suppliers.taken") }}</p>
      </div>
      <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
        <div class="min-w-0">
          <label class="block text-sm font-medium text-gray-700 mb-1" for="supplier-phone">{{ t("expenses.suppliers.phone") }}</label>
          <InputText id="supplier-phone" v-model="form.phone" maxlength="30" inputmode="tel" class="w-full" data-testid="supplier-phone" />
        </div>
        <div class="min-w-0">
          <label class="block text-sm font-medium text-gray-700 mb-1" for="supplier-vat">{{ t("expenses.suppliers.vat") }}</label>
          <InputText id="supplier-vat" v-model="form.vat_number" maxlength="20" class="w-full" data-testid="supplier-vat" />
        </div>
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1" for="supplier-notes">{{ t("expenses.suppliers.notes") }}</label>
        <Textarea id="supplier-notes" v-model="form.notes" rows="3" maxlength="1000" class="w-full" data-testid="supplier-notes" />
      </div>
      <p class="text-xs text-gray-400">{{ t("expenses.suppliers.optionalNote") }}</p>
    </div>
    <template #footer>
      <Button :label="t('common.cancel')" text @click="visibleModel = false" />
      <Button :label="t('common.save')" icon="pi pi-check" :loading="saving" :disabled="!form.name.trim()" data-testid="supplier-save" @click="save" />
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { api, ApiError } from "../../api/http";
import { useNotify } from "../../composables/useNotify";

// The supplier to change; none adds a new one.
const props = defineProps<{ supplier: any | null }>();
const emit = defineEmits<{ saved: [] }>();
const { t } = useI18n();
const notify = useNotify();

const visibleModel = defineModel<boolean>("visible", { default: false });
const form = reactive({ name: "", phone: "", vat_number: "", notes: "" });
const saving = ref(false);
const taken = ref(false);

watch(visibleModel, (open) => {
  if (!open) return;
  const s = props.supplier || {};
  Object.assign(form, { name: s.name || "", phone: s.phone || "", vat_number: s.vat_number || "", notes: s.notes || "" });
  taken.value = false;
});

const save = async () => {
  saving.value = true;
  try {
    const body = { ...form, name: form.name.trim() };
    if (props.supplier?.id) await api.request("PUT", `/api/v1/suppliers/${props.supplier.id}`, body);
    else await api.post("/api/v1/suppliers", body);
    visibleModel.value = false;
    notify.success(t("expenses.suppliers.saved"));
    emit("saved");
  } catch (e) {
    if (e instanceof ApiError && e.data?.error === "name_taken") taken.value = true;
    else notify.error(t("expenses.failed"));
  } finally {
    saving.value = false;
  }
};
</script>
