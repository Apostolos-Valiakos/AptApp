<template>
  <div class="flex gap-2">
    <AutoComplete
      :modelValue="pickerValue"
      :suggestions="clientSuggestions"
      optionLabel="full_name"
      :placeholder="t('booking.searchClient')"
      :loading="searchingClients"
      forceSelection
      data-testid="client-search"
      class="w-full"
      inputClass="w-full"
      @complete="searchClients"
      @update:modelValue="onPicked"
    >
      <!-- Same as the scheduler's client search: phone (or email) under the
           name, so clients with the same name can be told apart. -->
      <template #option="{ option }">
        <div class="flex items-center gap-3 py-1 min-w-0">
          <div
            class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
            :style="{ backgroundColor: avatarColor(option.full_name) }"
          >
            {{ initials(option.full_name) }}
          </div>
          <div class="min-w-0">
            <div lang="el" class="font-semibold text-gray-900 truncate uppercase">{{ option.full_name }}</div>
            <div class="text-xs text-gray-500 truncate">{{ option.phone || option.email || "" }}</div>
          </div>
        </div>
      </template>
    </AutoComplete>
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
      data-testid="client-new"
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
          <InputText v-model="newClient.first_name" class="w-full" data-testid="client-new-first" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{{
            t("booking.quickAdd.lastName")
          }}</label>
          <InputText v-model="newClient.last_name" class="w-full" data-testid="client-new-last" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{{
            t("booking.quickAdd.mobile")
          }}</label>
          <InputText v-model="newClient.phone" class="w-full" data-testid="client-new-phone" />
        </div>
      </div>
      <template #footer>
        <Button
          :label="t('booking.quickAdd.saveClient')"
          data-testid="client-new-save"
          @click="saveNewClient"
          :loading="savingNewClient"
          class="w-full"
        />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { api, ApiError } from "../api/http";
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { useToast } from "primevue/usetoast";
import { avatarColor, initials } from "../utils/avatar";
import { fetchOrQueue, isOnline } from "../offline/queue";
import { addCachedClient, searchCachedClients } from "../offline/localData";

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
      // Offline (or the server doesn't answer): search the client list kept
      // in the browser instead (see offline/localData.ts).
      if (!isOnline.value) {
        clientSuggestions.value = await searchCachedClients(q, 10);
        return;
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      try {
        clientSuggestions.value = await api.get(`/api/v1/clients?slim=true&search=${encodeURIComponent(q)}&limit=10`, {
          signal: controller.signal,
        });
      } catch (err) {
        // Refused by the server: no results. Not reached: the saved list.
        clientSuggestions.value = err instanceof ApiError ? [] : await searchCachedClients(q, 10);
      } finally {
        clearTimeout(timer);
      }
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
    const walkIn = await api.get("/api/v1/clients/walk-in");
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
  // Checked here too: offline, a missing name would only be refused when it
  // syncs (as a conflict), long after the client left.
  if (!newClient.value.first_name.trim() || !newClient.value.last_name.trim()) {
    toast.add({ severity: "error", summary: t("booking.toast.saveFailed"), detail: t("booking.quickAdd.nameRequired"), life: 4000 });
    return;
  }
  savingNewClient.value = true;
  try {
    // Offline the new client is queued with a temporary id: it can be booked
    // (and paid for) straight away, and everything links up when it syncs.
    const result = await fetchOrQueue("/api/v1/clients", "POST", { ...newClient.value }, {
      kind: "client",
      label: `${t("booking.newClientBtn")} · ${newClient.value.first_name} ${newClient.value.last_name}`.trim(),
      createsId: "client.id",
    });
    let client: any;
    if (result.queued) {
      client = { id: result.tempId, ...newClient.value, outstanding_balance: 0, _offline: "pending" };
      toast.add({
        severity: "warn",
        summary: t("booking.toast.savedOffline"),
        detail: t("booking.toast.savedOfflineDetail"),
        life: 4000,
      });
    } else {
      const res = result.response;
      const data = await res.json();
      if (!res.ok || !(data.success || data.client)) {
        throw new Error("Request failed");
      }
      client = data.client || data;
    }
    addCachedClient(client).catch(() => {});
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
