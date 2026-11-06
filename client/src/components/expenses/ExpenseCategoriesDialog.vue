<template>
  <Dialog v-model:visible="visibleModel" modal :header="t('expenses.categories.title')" :style="{ width: '28rem', maxWidth: '95vw' }">
    <div class="flex gap-2 mb-4">
      <InputText
        v-model="newName"
        maxlength="100"
        class="flex-1 min-w-0"
        :placeholder="t('expenses.categories.placeholder')"
        data-testid="category-new"
        @keyup.enter="add"
      />
      <Button icon="pi pi-plus" :label="t('expenses.categories.add')" :disabled="!newName.trim()" data-testid="category-add" @click="add" />
    </div>
    <p v-if="!categories.length" class="text-sm text-gray-400 py-2">{{ t("expenses.categories.none") }}</p>
    <div v-for="c in categories" :key="c.id" class="flex items-center gap-2 py-1.5 border-t border-gray-100 first:border-0" data-testid="category-row">
      <template v-if="editingId === c.id">
        <InputText v-model="editName" maxlength="100" class="flex-1 min-w-0" size="small" @keyup.enter="rename(c)" />
        <Button icon="pi pi-check" text rounded :aria-label="t('common.save')" :disabled="!editName.trim()" @click="rename(c)" />
        <Button icon="pi pi-times" text rounded severity="secondary" :aria-label="t('common.cancel')" @click="editingId = null" />
      </template>
      <template v-else>
        <span class="flex-1 min-w-0 text-sm text-gray-800 truncate">{{ c.name }}</span>
        <Button icon="pi pi-pencil" text rounded :aria-label="t('expenses.edit')" @click="startEdit(c)" />
        <Button icon="pi pi-trash" text rounded severity="danger" :aria-label="t('expenses.delete')" @click="remove(c)" />
      </template>
    </div>
    <p class="text-xs text-gray-400 mt-3">{{ t("expenses.categories.note") }}</p>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useToast } from "primevue/usetoast";
import { api, ApiError } from "../../api/http";

const props = defineProps<{ visible: boolean; categories: any[] }>();
const emit = defineEmits<{ "update:visible": [boolean]; changed: [] }>();
const { t } = useI18n();
const toast = useToast();

const visibleModel = computed({ get: () => props.visible, set: (v) => emit("update:visible", v) });
const newName = ref("");
const editingId = ref<string | null>(null);
const editName = ref("");

const run = async (request: Promise<any>) => {
  try {
    await request;
    emit("changed");
    return true;
  } catch (e) {
    const taken = e instanceof ApiError && e.data?.error === "name_taken";
    toast.add({ severity: "error", summary: t("common.error"), detail: t(taken ? "expenses.categories.taken" : "expenses.failed"), life: 3500 });
    return false;
  }
};
const add = async () => {
  const name = newName.value.trim();
  if (name && (await run(api.post("/api/v1/expense-categories", { name })))) newName.value = "";
};
const startEdit = (c: any) => {
  editingId.value = c.id;
  editName.value = c.name;
};
const rename = async (c: any) => {
  const name = editName.value.trim();
  if (name && (await run(api.request("PUT", `/api/v1/expense-categories/${c.id}`, { name })))) editingId.value = null;
};
const remove = (c: any) => run(api.del(`/api/v1/expense-categories/${c.id}`));
</script>
