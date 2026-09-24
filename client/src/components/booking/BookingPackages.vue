<template>
  <div v-if="clientId" class="bg-white border border-gray-200 rounded-xl p-4 mb-6">
    <div class="flex items-center justify-between mb-3">
      <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider">
        {{ t("packages.title") }}
      </h4>
      <Button
        v-if="canSell"
        size="small"
        text
        icon="pi pi-plus"
        :label="t('packages.card.sell')"
        @click="showSell = true"
      />
    </div>

    <p v-if="!packages.length" class="text-sm text-gray-400">
      {{ t("packages.card.none") }}
    </p>

    <div v-for="p in packages" :key="p.id" class="py-3 border-t border-gray-100 first:border-0 first:pt-0">
      <div class="flex items-center justify-between gap-2">
        <div class="min-w-0">
          <div class="font-semibold text-gray-900 text-sm truncate">{{ p.name }}</div>
          <div class="text-xs text-gray-500">
            {{ t("packages.card.left", { n: p.remaining, total: p.total_visits }) }}
            <template v-if="p.expires_at"> · {{ t("packages.card.expires") }} {{ fmtDate(p.expires_at) }}</template>
          </div>
        </div>
        <span
          v-if="p.state !== 'active'"
          class="text-[10px] px-2 py-0.5 rounded uppercase font-bold bg-gray-100 text-gray-600"
        >
          {{ t(`packages.card.state.${p.state}`) }}
        </span>
        <Button
          v-else-if="coverable(p)"
          size="small"
          icon="pi pi-check"
          :label="t('packages.card.useVisit')"
          :loading="busyId === p.id"
          @click="redeem(p)"
        />
      </div>

      <div class="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-2">
        <div
          class="h-full bg-[var(--p-primary-color)]"
          :style="{ width: `${p.total_visits ? (p.used / p.total_visits) * 100 : 0}%` }"
        ></div>
      </div>

      <div v-for="u in usedHere(p)" :key="u.id" class="mt-2 flex items-center justify-between text-xs bg-emerald-50 text-emerald-800 rounded-lg px-2 py-1">
        <span>{{ t("packages.card.usedHere") }}</span>
        <button type="button" class="underline font-semibold" @click="undo(u)">
          {{ t("packages.card.undo") }}
        </button>
      </div>
    </div>

    <div
      v-for="(p, idx) in pendingPackages"
      :key="'pending-' + idx"
      class="mt-2 flex items-center justify-between gap-2 text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"
    >
      <div class="min-w-0">
        <div class="font-semibold text-amber-900 truncate">{{ p.name }}</div>
        <div class="text-xs text-amber-700">{{ t("packages.pending.label") }}</div>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        <span class="font-bold text-amber-900">€{{ Number(p.price).toFixed(2) }}</span>
        <button type="button" class="text-amber-500 hover:text-amber-700" @click="removePending(idx)">
          <i class="pi pi-times"></i>
        </button>
      </div>
    </div>

    <SellPackageDialog
      v-model:visible="showSell"
      :clientId="clientId"
      :immediate="false"
      @picked="onPicked"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useToast } from "primevue/usetoast";
import { useAuthStore } from "../../stores/auth";
import SellPackageDialog from "./SellPackageDialog.vue";

const { t, locale } = useI18n();
const toast = useToast();
const authStore = useAuthStore();

const props = defineProps<{
  clientId: string | null;
  appointmentId: string | null;
  servicesList: any[];
  pendingPackages: { package_type_id: string; name: string; price: number }[];
  // Saves the appointment first (so it exists with its current service lines); resolves its id or null.
  ensureSaved: () => Promise<string | null>;
}>();
const emit = defineEmits<{
  changed: [payload: { new_balance?: number; amount?: number; status?: string; payment_status?: string }];
  "update:pendingPackages": [{ package_type_id: string; name: string; price: number }[]];
}>();

const onPicked = (pkg: { package_type_id: string; name: string; price: number }) => {
  emit("update:pendingPackages", [...props.pendingPackages, pkg]);
};
const removePending = (idx: number) => {
  const list = [...props.pendingPackages];
  list.splice(idx, 1);
  emit("update:pendingPackages", list);
};

const role = computed(() => authStore.user?.role);
const canSell = computed(() => ["admin", "super_admin", "frontdesk"].includes(role.value));

const packages = ref<any[]>([]);
const showSell = ref(false);
const busyId = ref<string | null>(null);

const headers = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

const load = async () => {
  if (!props.clientId) {
    packages.value = [];
    return;
  }
  try {
    const res = await fetch(`/api/v1/clients/${props.clientId}/packages`, { headers: headers() });
    packages.value = res.ok ? await res.json() : [];
  } catch {
    packages.value = [];
  }
};

// Show every package that is usable, or has visits used in this appointment (so it can be undone).
watch(() => [props.clientId, props.appointmentId], load);
onMounted(load);

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString(locale.value, { day: "2-digit", month: "short", year: "numeric" });

const lineCount = (serviceId: string) =>
  props.servicesList.filter((s) => s.service_id === serviceId).length;

const usedHere = (p: any) =>
  props.appointmentId ? p.usage.filter((u: any) => u.appointment_id === props.appointmentId) : [];

const usedHereForService = (serviceId: string) =>
  packages.value
    .filter((p) => p.service_id === serviceId)
    .reduce((n, p) => n + usedHere(p).length, 0);

const coverable = (p: any) =>
  lineCount(p.service_id) > 0 && usedHereForService(p.service_id) < lineCount(p.service_id);

const redeem = async (p: any) => {
  busyId.value = p.id;
  try {
    const apptId = await props.ensureSaved();
    if (!apptId) return;
    const res = await fetch(`/api/v1/appointments/${apptId}/package-redemptions`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ client_package_id: p.id }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || t("packages.failed"));
    toast.add({ severity: "success", summary: t("packages.card.redeemed"), life: 2500 });
    emit("changed", data);
    await load();
  } catch (e: any) {
    toast.add({ severity: "error", summary: t("common.error"), detail: e.message, life: 3500 });
  } finally {
    busyId.value = null;
  }
};

const undo = async (u: any) => {
  try {
    const res = await fetch(`/api/v1/package-usage/${u.id}`, { method: "DELETE", headers: headers() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || t("packages.failed"));
    emit("changed", { ...data, amount: -Number(u.amount || 0), undo: true } as any);
    await load();
  } catch (e: any) {
    toast.add({ severity: "error", summary: t("common.error"), detail: e.message, life: 3500 });
  }
};

defineExpose({ load });
</script>
