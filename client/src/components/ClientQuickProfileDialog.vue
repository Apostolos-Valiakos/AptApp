<template>
  <Dialog
    v-model:visible="visibleModel"
    modal
    :draggable="false"
    :style="{ width: '32rem', maxWidth: '95vw', maxHeight: '90vh' }"
    :contentStyle="{ maxHeight: '80vh', overflowY: 'auto' }"
  >
    <template #header>
      <div v-if="client" class="flex items-center gap-3">
        <div
          class="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
          :style="{ backgroundColor: avatarColor(fullName) }"
        >
          {{ initials(fullName) }}
        </div>
        <div class="min-w-0">
          <div class="font-bold text-gray-900 text-lg leading-tight truncate">{{ fullName }}</div>
          <span
            v-if="isShopAdmin && Number(client.outstanding_balance) > 0"
            class="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full inline-block mt-0.5"
          >
            {{ t("clientQuickProfile.balanceDue", { amount: Number(client.outstanding_balance).toFixed(2) }) }}
          </span>
        </div>
      </div>
    </template>

    <div v-if="loading" class="py-12 text-center">
      <i class="pi pi-spin pi-spinner text-3xl text-gray-300"></i>
    </div>

    <div v-else-if="client" class="space-y-6">
      <div>
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wide">
            {{ t("clientQuickProfile.details") }}
          </h3>
          <button class="text-xs font-semibold text-[var(--p-primary-color)]" @click="openFull('Info')">
            {{ t("clientQuickProfile.viewAll") }}
          </button>
        </div>
        <div class="border border-gray-100 rounded-xl p-3 space-y-1.5 text-sm">
          <div class="flex items-center gap-2 text-gray-700">
            <i class="pi pi-phone text-gray-400 w-4"></i>{{ client.phone || t("clientQuickProfile.noPhone") }}
          </div>
          <div class="flex items-center gap-2 text-gray-700">
            <i class="pi pi-envelope text-gray-400 w-4"></i>{{ client.email || t("clientQuickProfile.noEmail") }}
          </div>
        </div>
      </div>

      <div>
        <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">
          {{ t("clientQuickProfile.notes") }}
        </h3>
        <div v-if="!editingNotes">
          <div v-if="client.notes" class="border border-gray-100 rounded-xl p-3 text-sm text-gray-700 whitespace-pre-line">
            {{ client.notes }}
            <button class="block mt-2 text-xs font-semibold text-[var(--p-primary-color)]" @click="startEditNotes">
              {{ t("clientQuickProfile.editNote") }}
            </button>
          </div>
          <div v-else class="text-center py-4 border border-dashed border-gray-200 rounded-xl">
            <i class="pi pi-file-edit text-xl text-gray-300"></i>
            <p class="text-sm text-gray-400 mt-1">{{ t("clientQuickProfile.noNotes") }}</p>
            <button class="text-xs font-semibold text-[var(--p-primary-color)] mt-1" @click="startEditNotes">
              + {{ t("clientQuickProfile.addNote") }}
            </button>
          </div>
        </div>
        <div v-else class="space-y-2">
          <Textarea v-model="notesDraft" rows="3" class="w-full" autofocus />
          <div class="flex justify-end gap-2">
            <Button size="small" text :label="t('clientQuickProfile.cancel')" @click="editingNotes = false" />
            <Button size="small" :label="t('clientQuickProfile.save')" :loading="savingNotes" @click="saveNotes" />
          </div>
        </div>
      </div>

      <div>
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wide">
            {{ t("clientQuickProfile.appointments") }} ({{ history.length }})
          </h3>
          <button class="text-xs font-semibold text-[var(--p-primary-color)]" @click="openFull('History')">
            {{ t("clientQuickProfile.viewAll") }}
          </button>
        </div>
        <p v-if="!history.length" class="text-sm text-gray-400 text-center py-4">
          {{ t("clientQuickProfile.noAppointments") }}
        </p>
        <div v-else class="space-y-2">
          <div
            v-for="a in history.slice(0, 5)"
            :key="a.id"
            class="flex items-start justify-between gap-2 border border-gray-100 rounded-xl p-3 text-sm"
          >
            <div class="min-w-0">
              <div class="font-semibold text-gray-900">
                {{ new Date(a.start_time).toLocaleDateString(locale, { weekday: "short", day: "2-digit", month: "short" }) }}
                <span class="text-gray-400 font-normal">
                  · {{ new Date(a.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }}
                </span>
              </div>
              <div class="text-gray-600 truncate">{{ a.service_names || "—" }}</div>
              <div v-if="a.staff_names" class="text-xs text-gray-400 truncate">{{ t("clientQuickProfile.with") }} {{ a.staff_names }}</div>
            </div>
            <span class="text-[10px] px-2 py-0.5 rounded uppercase font-bold flex-shrink-0" :class="statusClass(a.status)">
              {{ t(`common.status.${statusKey(a.status)}`) }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex items-center justify-between w-full">
        <Button
          type="button"
          :label="t('clientQuickProfile.moreActions')"
          text
          icon="pi pi-angle-down"
          iconPos="right"
          @click="toggleActions"
          aria-haspopup="true"
        />
        <Menu ref="actionsMenu" :model="actionItems" :popup="true" />
        <Button
          :label="t('clientQuickProfile.book')"
          icon="pi pi-calendar-plus"
          @click="book"
        />
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useToast } from "primevue/usetoast";
import { useConfirm } from "primevue/useconfirm";
import { useAuthStore } from "../stores/auth";
import { avatarColor, initials } from "../utils/avatar";
import Menu from "primevue/menu";

const { t, locale } = useI18n();
const toast = useToast();
const confirm = useConfirm();
const authStore = useAuthStore();
const isShopAdmin = authStore.isShopAdmin;

const props = defineProps<{ visible: boolean; clientId: string | null }>();
const emit = defineEmits<{
  "update:visible": [boolean];
  book: [any];
  openFull: [{ clientId: string; tab: string }];
  changed: [void];
}>();

const visibleModel = computed({
  get: () => props.visible,
  set: (v) => emit("update:visible", v),
});

const loading = ref(false);
const client = ref<any>(null);
const history = ref<any[]>([]);
const editingNotes = ref(false);
const notesDraft = ref("");
const savingNotes = ref(false);
const actionsMenu = ref<any>(null);

const fullName = computed(() =>
  client.value ? `${client.value.first_name || ""} ${client.value.last_name || ""}`.trim() : "",
);

const headers = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

const load = async () => {
  if (!props.clientId) return;
  loading.value = true;
  editingNotes.value = false;
  try {
    const res = await fetch(`/api/v1/clients/${props.clientId}/full`, { headers: headers() });
    if (!res.ok) throw new Error();
    const data = await res.json();
    client.value = data.client;
    history.value = (data.history || []).slice().sort(
      (a: any, b: any) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime(),
    );
  } catch {
    toast.add({ severity: "error", summary: t("common.error"), detail: t("clientQuickProfile.loadFailed"), life: 3500 });
    visibleModel.value = false;
  } finally {
    loading.value = false;
  }
};

watch(
  () => [props.visible, props.clientId],
  ([v]) => {
    if (v) load();
  },
);

const startEditNotes = () => {
  notesDraft.value = client.value?.notes || "";
  editingNotes.value = true;
};

const saveNotes = async () => {
  savingNotes.value = true;
  try {
    const c = client.value;
    const res = await fetch(`/api/v1/clients/${props.clientId}`, {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify({
        first_name: c.first_name,
        last_name: c.last_name,
        email: c.email,
        phone: c.phone,
        notes: notesDraft.value,
        custom_fields: c.custom_fields || [],
        ergotherapia: c.ergotherapia,
        physiotherapia: c.physiotherapia,
        logotherapia: c.logotherapia,
        date_of_birth: c.date_of_birth,
      }),
    });
    if (!res.ok) throw new Error();
    client.value.notes = notesDraft.value;
    editingNotes.value = false;
  } catch {
    toast.add({ severity: "error", summary: t("common.error"), detail: t("clientQuickProfile.saveFailed"), life: 3500 });
  } finally {
    savingNotes.value = false;
  }
};

const STATUS_KEYS: Record<string, string> = {
  new: "new", confirmed: "confirmed", started: "started", arrived: "arrived",
  completed: "completed", cancelled: "cancelled", "no-show": "noShow", "no-response": "noResponse",
};
const statusKey = (s: string) => STATUS_KEYS[s] || s;
const statusClass = (s: string) => {
  const map: Record<string, string> = {
    new: "bg-blue-100 text-blue-800",
    confirmed: "bg-purple-100 text-purple-800",
    completed: "bg-green-100 text-green-800",
    cancelled: "bg-red-100 text-red-800",
    "no-show": "bg-red-200 text-red-900",
    "no-response": "bg-amber-100 text-amber-800",
  };
  return map[s] || "bg-gray-100 text-gray-700";
};

const upcoming = computed(() =>
  history.value
    .filter((a) => new Date(a.start_time) > new Date() && a.status !== "cancelled")
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())[0] || null,
);

const actionItems = computed(() => {
  const items: any[] = [
    { label: t("clientQuickProfile.editDetails"), icon: "pi pi-pencil", command: () => openFull("Info") },
    { label: t("clientQuickProfile.viewHistory"), icon: "pi pi-history", command: () => openFull("History") },
    { label: t("clientQuickProfile.viewMembership"), icon: "pi pi-id-card", command: () => openFull("Membership") },
    { label: t("clientQuickProfile.viewPackages"), icon: "pi pi-clone", command: () => openFull("Packages") },
  ];
  if (upcoming.value) {
    items.push({
      label: t("clientQuickProfile.cancelNext"),
      icon: "pi pi-times-circle",
      command: cancelNextAppointment,
    });
  }
  return items;
});

const toggleActions = (e: Event) => actionsMenu.value?.toggle(e);

const openFull = (tab: string) => {
  if (!props.clientId) return;
  emit("openFull", { clientId: props.clientId, tab });
  visibleModel.value = false;
};

const book = () => {
  if (!client.value) return;
  emit("book", {
    client_id: props.clientId,
    first_name: client.value.first_name,
    last_name: client.value.last_name,
    phone: client.value.phone,
    outstanding_balance: client.value.outstanding_balance,
  });
  visibleModel.value = false;
};

const cancelNextAppointment = () => {
  if (!upcoming.value) return;
  const appt = upcoming.value;
  confirm.require({
    header: t("clientQuickProfile.cancelNext"),
    message: t("clientQuickProfile.cancelNextConfirm", {
      date: new Date(appt.start_time).toLocaleString(locale.value, {
        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
      }),
    }),
    icon: "pi pi-exclamation-triangle",
    acceptClass: "p-button-danger",
    accept: async () => {
      try {
        const res = await fetch(`/api/v1/appointments/${appt.id}/cancel`, { method: "POST", headers: headers() });
        if (!res.ok) throw new Error();
        toast.add({ severity: "success", summary: t("clientQuickProfile.cancelled"), life: 2500 });
        emit("changed");
        await load();
      } catch {
        toast.add({ severity: "error", summary: t("common.error"), detail: t("clientQuickProfile.saveFailed"), life: 3500 });
      }
    },
  });
};
</script>
