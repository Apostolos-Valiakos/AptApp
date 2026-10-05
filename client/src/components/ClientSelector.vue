<template>
  <div class="flex gap-2">
    <AutoComplete
      :modelValue="pickerValue"
      :suggestions="clientSuggestions"
      optionLabel="full_name"
      :placeholder="t('booking.searchClient')"
      :loading="searchingClients"
      forceSelection
      class="w-full"
      inputClass="w-full"
      @complete="searchClients"
      @update:modelValue="onPicked"
    />
    <Button
      v-if="allowWalkIn"
      icon="pi pi-user"
      class="p-button-outlined"
      v-tooltip="t('booking.walkInBtn')"
      :loading="loadingWalkIn"
      @click="pickWalkIn"
    />
    <Button
      icon="pi pi-plus"
      class="p-button-outlined"
      v-tooltip="t('booking.newClientBtn')"
      @click="showQuickAdd = true"
    />

    <Dialog
      v-model:visible="showQuickAdd"
      :header="t('booking.quickAdd.title')"
      modal
      :style="{ width: '400px', maxWidth: '90vw' }"
    >
      <div class="space-y-4 pt-2">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{{
            t("booking.quickAdd.firstName")
          }}</label>
          <InputText v-model="newClient.first_name" class="w-full" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{{
            t("booking.quickAdd.lastName")
          }}</label>
          <InputText v-model="newClient.last_name" class="w-full" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{{
            t("booking.quickAdd.mobile")
          }}</label>
          <InputText v-model="newClient.phone" class="w-full" />
        </div>
      </div>
      <template #footer>
        <Button
          :label="t('booking.quickAdd.saveClient')"
          @click="saveNewClient"
          :loading="savingNewClient"
          class="w-full"
        />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { useToast } from "primevue/usetoast";

const props = defineProps({
  allowWalkIn: { type: Boolean, default: false },
});

const emit = defineEmits<{ select: [client: any] }>();

const { t } = useI18n();
const toast = useToast();

const pickerValue = ref<any>(null);
const clientSuggestions = ref<any[]>([]);
const searchingClients = ref(false);
let clientSearchTimeout: ReturnType<typeof setTimeout> | null = null;

const searchClients = (event: { query: string }) => {
  const q = event.query.trim();
  if (clientSearchTimeout) clearTimeout(clientSearchTimeout);
  if (!q) {
    clientSuggestions.value = [];
    return;
  }
  searchingClients.value = true;
  clientSearchTimeout = setTimeout(async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `/api/v1/clients?slim=true&search=${encodeURIComponent(q)}&limit=10`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      clientSuggestions.value = res.ok ? await res.json() : [];
    } finally {
      searchingClients.value = false;
    }
  }, 300);
};

const onPicked = (client: any) => {
  if (client && typeof client === "object") {
    pickerValue.value = null;
    clientSuggestions.value = [];
    emit("select", client);
  }
};

const loadingWalkIn = ref(false);
const pickWalkIn = async () => {
  loadingWalkIn.value = true;
  try {
    const token = localStorage.getItem("token");
    const res = await fetch("/api/v1/clients/walk-in", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Walk-in lookup failed");
    const walkIn = await res.json();
    walkIn.full_name =
      walkIn.full_name || `${walkIn.first_name || ""} ${walkIn.last_name || ""}`.trim();
    emit("select", walkIn);
  } catch {
    toast.add({
      severity: "error",
      summary: t("booking.toast.saveFailed"),
      detail: t("booking.toast.quickAddFailedDetail"),
      life: 4000,
    });
  } finally {
    loadingWalkIn.value = false;
  }
};

const showQuickAdd = ref(false);
const newClient = ref({ first_name: "", last_name: "", phone: "" });
const savingNewClient = ref(false);
const saveNewClient = async () => {
  savingNewClient.value = true;
  try {
    const token = localStorage.getItem("token");
    const res = await fetch("/api/v1/clients", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(newClient.value),
    });
    const data = await res.json();

    if (!res.ok || !(data.success || data.client)) {
      throw new Error("Request failed");
    }

    const client = data.client || data;
    client.full_name = `${client.first_name} ${client.last_name}`;
    client.eoppy_breakdown = { total: 0, services: {} };
    client.non_eoppy_breakdown = { total: 0, services: {} };
    client.outstanding_balance = 0;

    emit("select", client);
    showQuickAdd.value = false;
    newClient.value = { first_name: "", last_name: "", phone: "" };
  } catch (e) {
    console.error(e);
    toast.add({
      severity: "error",
      summary: t("booking.toast.saveFailed"),
      detail: t("booking.toast.quickAddFailedDetail"),
      life: 4000,
    });
  } finally {
    savingNewClient.value = false;
  }
};
</script>
