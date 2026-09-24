<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">{{ t("dailyReport.title") }}</h1>
        <p class="text-sm text-gray-500">{{ todayLabel }}</p>
      </div>
      <Button icon="pi pi-refresh" :label="t('dailyReport.refresh')" :loading="loading" @click="load" />
    </div>

    <div v-if="data" class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div class="bg-gradient-to-br from-gray-900 to-gray-800 text-white rounded-2xl p-6 sm:col-span-1">
        <div class="text-xs uppercase tracking-wider opacity-70 font-bold">{{ t("dailyReport.collected") }}</div>
        <div class="text-4xl font-extrabold mt-1">€{{ data.total_collected.toFixed(2) }}</div>
      </div>
      <div class="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
        <div class="text-xs uppercase tracking-wider text-gray-400 font-bold mb-2">{{ t("dailyReport.byMethod") }}</div>
        <div v-if="!data.by_method.length" class="text-sm text-gray-400">—</div>
        <div v-for="m in data.by_method" :key="m.method" class="flex justify-between text-sm py-0.5">
          <span class="text-gray-600 capitalize">{{ m.method }}</span>
          <span class="font-semibold">€{{ m.amount.toFixed(2) }}</span>
        </div>
      </div>
      <div class="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
        <div class="text-xs uppercase tracking-wider text-gray-400 font-bold mb-2">{{ t("dailyReport.appointments") }}</div>
        <div class="text-3xl font-extrabold text-gray-900">{{ data.appointment_count }}</div>
        <div class="flex flex-wrap gap-1 mt-2">
          <span
            v-for="(n, status) in data.by_status"
            :key="status"
            class="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-700"
          >
            {{ statusLabel(String(status)) }}: {{ n }}
          </span>
        </div>
      </div>
    </div>

    <div v-if="data" class="bg-white border border-gray-100 rounded-2xl shadow-sm p-6">
      <h2 class="font-bold text-gray-800 mb-3">{{ t("dailyReport.appointmentsToday") }}</h2>
      <p v-if="!data.appointments.length" class="text-sm text-gray-400">{{ t("dailyReport.noAppointments") }}</p>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="text-xs text-gray-400 uppercase">
            <tr>
              <th class="text-left py-2 pr-3">{{ t("dailyReport.time") }}</th>
              <th class="text-left py-2 pr-3">{{ t("dailyReport.client") }}</th>
              <th class="text-left py-2 pr-3">{{ t("dailyReport.services") }}</th>
              <th class="text-left py-2 pr-3">{{ t("dailyReport.status") }}</th>
              <th class="text-right py-2 pr-3">{{ t("dailyReport.total") }}</th>
              <th class="text-right py-2">{{ t("dailyReport.paid") }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="a in data.appointments" :key="a.id">
              <td class="py-2 pr-3 whitespace-nowrap font-medium">{{ fmtTime(a.start_time) }}</td>
              <td class="py-2 pr-3">{{ [a.first_name, a.last_name].filter(Boolean).join(" ") || "—" }}</td>
              <td class="py-2 pr-3">
                <div v-for="(s, i) in a.services" :key="i" class="text-gray-700">
                  {{ s.name }}<span v-if="s.staff" class="text-gray-400"> · {{ s.staff }}</span>
                </div>
              </td>
              <td class="py-2 pr-3">{{ statusLabel(a.status) }}</td>
              <td class="py-2 pr-3 text-right">€{{ a.total_cost.toFixed(2) }}</td>
              <td class="py-2 text-right" :class="a.paid + 0.01 < a.total_cost ? 'text-amber-600 font-semibold' : 'text-emerald-600'">
                €{{ a.paid.toFixed(2) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="data" class="bg-white border border-gray-100 rounded-2xl shadow-sm p-6">
      <h2 class="font-bold text-gray-800 mb-3">{{ t("dailyReport.paymentsToday") }}</h2>
      <p v-if="!data.payments.length" class="text-sm text-gray-400">{{ t("dailyReport.noPayments") }}</p>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="text-xs text-gray-400 uppercase">
            <tr>
              <th class="text-left py-2 pr-3">{{ t("dailyReport.time") }}</th>
              <th class="text-left py-2 pr-3">{{ t("dailyReport.client") }}</th>
              <th class="text-left py-2 pr-3">{{ t("dailyReport.method") }}</th>
              <th class="text-right py-2">{{ t("dailyReport.amount") }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="p in data.payments" :key="p.id">
              <td class="py-2 pr-3 whitespace-nowrap">{{ fmtTime(p.created_at) }}</td>
              <td class="py-2 pr-3">{{ [p.first_name, p.last_name].filter(Boolean).join(" ") || "—" }}</td>
              <td class="py-2 pr-3 capitalize">{{ p.payment_method }}<span v-if="p.transaction_type && p.transaction_type.endsWith('_sale')" class="text-gray-400"> · {{ p.transaction_type.replace("_", " ") }}</span></td>
              <td class="py-2 text-right font-semibold">€{{ Number(p.amount).toFixed(2) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useToast } from "primevue/usetoast";
import { useSettingsStore } from "../stores/settings";

const { t, locale } = useI18n();
const toast = useToast();
const settingsStore = useSettingsStore();
const data = ref<any>(null);
const loading = ref(false);

const todayLabel = computed(() =>
  new Date().toLocaleDateString(locale.value, { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
);
const fmtTime = (d: string) =>
  new Date(d).toLocaleTimeString(locale.value, { hour: "2-digit", minute: "2-digit" });

const STATUS_KEYS: Record<string, string> = { "no-show": "noShow", "no-response": "noResponse" };
const statusLabel = (s: string) => t(`common.status.${STATUS_KEYS[s] || s}`);

const load = async () => {
  loading.value = true;
  try {
    const params = new URLSearchParams();
    if (settingsStore.hideCashPaid) params.append("excludeCash", "true");
    if (settingsStore.hideCardPaid) params.append("excludeCard", "true");
    const res = await fetch(`/api/v1/reports/daily?${params}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
    data.value = await res.json();
  } catch (e: any) {
    toast.add({ severity: "error", summary: t("common.error"), detail: e.message, life: 3500 });
  } finally {
    loading.value = false;
  }
};

onMounted(load);
watch(() => [settingsStore.hideCashPaid, settingsStore.hideCardPaid], load);
</script>
