<template>
  <div class="space-y-4">
    <div v-if="loading" class="text-center py-6">
      <i class="pi pi-spin pi-spinner text-2xl text-gray-300"></i>
    </div>

    <template v-else>
      <div v-if="canSell" class="flex justify-end">
        <Button
          size="small"
          icon="pi pi-plus"
          :label="t('packages.card.sell')"
          @click="showSell = true"
        />
      </div>

      <div v-if="!packages.length" class="text-sm text-gray-400 text-center py-6">
        {{ t("packages.card.none") }}
      </div>

      <div
        v-for="p in packages"
        :key="p.id"
        class="rounded-xl border border-gray-100 p-4 bg-white"
        :class="p.state !== 'active' ? 'opacity-70' : ''"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="font-bold text-gray-900 truncate">{{ p.name }}</div>
            <div class="text-xs text-gray-500">{{ p.service_name }}</div>
          </div>
          <span
            class="text-[10px] px-2 py-0.5 rounded uppercase font-bold whitespace-nowrap"
            :class="stateClass(p.state)"
          >
            {{ t(`packages.card.state.${p.state}`) }}
          </span>
        </div>

        <div class="mt-3">
          <div class="flex justify-between text-sm mb-1">
            <span class="font-semibold text-gray-800">{{
              t("packages.card.left", { n: p.remaining, total: p.total_visits })
            }}</span>
            <span class="text-gray-500">{{ t("packages.card.usedN", { n: p.used }) }}</span>
          </div>
          <div class="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              class="h-full bg-[var(--p-primary-color)]"
              :style="{ width: `${p.total_visits ? (p.used / p.total_visits) * 100 : 0}%` }"
            ></div>
          </div>
        </div>

        <div class="mt-2 text-xs text-gray-500 flex flex-wrap gap-x-4 gap-y-1">
          <span>{{ t("packages.card.bought") }}: {{ fmtDate(p.purchased_at) }}</span>
          <span v-if="p.expires_at">{{ t("packages.card.expires") }}: {{ fmtDate(p.expires_at) }}</span>
          <span v-else>{{ t("packages.neverExpires") }}</span>
          <span>€{{ Number(p.price_paid).toFixed(2) }}</span>
        </div>
        <p v-if="p.note && !portal" class="text-xs text-gray-500 mt-1 italic">{{ p.note }}</p>

        <details v-if="p.usage.length" class="mt-2">
          <summary class="text-xs text-gray-500 cursor-pointer">
            {{ t("packages.card.history") }} ({{ p.usage.length }})
          </summary>
          <ul class="mt-1 text-xs text-gray-600 space-y-0.5">
            <li v-for="u in p.usage" :key="u.id">
              {{ fmtDate(u.appointment_start || u.used_at, true) }}
            </li>
          </ul>
        </details>

        <div v-if="isAdmin && !portal" class="mt-3 flex gap-2">
          <Button size="small" text :label="t('packages.card.adjust')" @click="openAdjust(p)" />
        </div>
      </div>
    </template>

    <SellPackageDialog v-model:visible="showSell" :clientId="clientId" @sold="load" />

    <Dialog
      v-model:visible="showAdjust"
      modal
      :header="t('packages.adjust.title')"
      :style="{ width: '24rem' }"
    >
      <div class="space-y-4" v-if="adjusting">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{{ t("packages.adjust.totalVisits") }}</label>
          <InputNumber v-model="adjustForm.total_visits" :min="adjusting.used" class="w-full" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{{ t("packages.adjust.expires") }}</label>
          <DatePicker v-model="adjustForm.expires_at" showIcon class="w-full" dateFormat="dd/mm/yy" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{{ t("packages.adjust.note") }}</label>
          <Textarea v-model="adjustForm.note" rows="2" class="w-full" />
        </div>
      </div>
      <template #footer>
        <Button
          v-if="adjusting"
          :label="adjusting.status === 'cancelled' ? t('packages.adjust.reactivate') : t('packages.adjust.cancelPackage')"
          :severity="adjusting.status === 'cancelled' ? 'secondary' : 'danger'"
          text
          @click="toggleCancel"
        />
        <Button :label="t('packages.adjust.save')" icon="pi pi-check" :loading="saving" @click="saveAdjust" />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useToast } from "primevue/usetoast";
import { useAuthStore } from "../stores/auth";
import SellPackageDialog from "./booking/SellPackageDialog.vue";

const { t, locale } = useI18n();
const toast = useToast();
const authStore = useAuthStore();

const props = defineProps<{ clientId: string | null; portal?: boolean }>();

const role = computed(() => authStore.user?.role);
const isAdmin = computed(() => role.value === "admin" || role.value === "super_admin");
const canSell = computed(
  () => !props.portal && (isAdmin.value || role.value === "frontdesk"),
);

const packages = ref<any[]>([]);
const loading = ref(false);
const showSell = ref(false);
const showAdjust = ref(false);
const saving = ref(false);
const adjusting = ref<any>(null);
const adjustForm = reactive<{ total_visits: number; expires_at: Date | null; note: string }>({
  total_visits: 0,
  expires_at: null,
  note: "",
});

const headers = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

const load = async () => {
  if (!props.clientId) return;
  loading.value = true;
  try {
    const res = await fetch(`/api/v1/clients/${props.clientId}/packages`, { headers: headers() });
    packages.value = res.ok ? await res.json() : [];
  } catch {
    packages.value = [];
  } finally {
    loading.value = false;
  }
};

const fmtDate = (d: string, withTime = false) =>
  new Date(d).toLocaleString(
    locale.value,
    withTime
      ? { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
      : { day: "2-digit", month: "short", year: "numeric" },
  );

const stateClass = (s: string) =>
  ({
    active: "bg-green-100 text-green-800",
    used_up: "bg-gray-200 text-gray-700",
    expired: "bg-amber-100 text-amber-800",
    cancelled: "bg-red-100 text-red-800",
  })[s] || "bg-gray-100";

const openAdjust = (p: any) => {
  adjusting.value = p;
  adjustForm.total_visits = p.total_visits;
  adjustForm.expires_at = p.expires_at ? new Date(p.expires_at) : null;
  adjustForm.note = p.note || "";
  showAdjust.value = true;
};

const patch = async (body: any) => {
  saving.value = true;
  try {
    const res = await fetch(`/api/v1/client-packages/${adjusting.value.id}`, {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || t("packages.failed"));
    showAdjust.value = false;
    await load();
  } catch (e: any) {
    toast.add({ severity: "error", summary: t("common.error"), detail: e.message, life: 3500 });
  } finally {
    saving.value = false;
  }
};

const saveAdjust = () =>
  patch({
    total_visits: adjustForm.total_visits,
    expires_at: adjustForm.expires_at ? adjustForm.expires_at.toISOString() : null,
    note: adjustForm.note,
  });
const toggleCancel = () =>
  patch({ status: adjusting.value.status === "cancelled" ? "active" : "cancelled" });

onMounted(load);
watch(() => props.clientId, load);
defineExpose({ load });
</script>
