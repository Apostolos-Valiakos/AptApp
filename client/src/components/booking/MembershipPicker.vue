<template>
  <div>
    <div v-if="loading" class="text-xs text-gray-400 py-2">
      <i class="pi pi-spin pi-spinner mr-1"></i> {{ t('payment.membership.loading') }}
    </div>

    <div v-else-if="!membership || membership.status !== 'active'" class="text-xs text-gray-400 py-2">
      {{ t('payment.membership.none') }}
    </div>

    <div v-else-if="redeemableLines.length === 0" class="text-xs text-gray-400 py-2">
      {{ t('payment.membership.nothingCovered') }}
    </div>

    <div v-else class="space-y-2">
      <div
        v-for="line in redeemableLines"
        :key="line.service_id"
        class="flex items-center justify-between p-2.5 border border-gray-200 rounded-lg"
        :class="line.redeemable === 0 ? 'opacity-60' : ''"
      >
        <div class="flex items-center gap-2">
          <Checkbox
            v-model="checkedServiceIds"
            :value="line.service_id"
            :binary="false"
            :disabled="line.redeemable === 0"
          />
          <div>
            <div class="text-sm font-medium text-gray-900">
              {{ line.service_name }} <span v-if="line.countInAppointment > 1">×{{ line.countInAppointment }}</span>
            </div>
            <div class="text-xs text-gray-400">
              {{ line.quotaPerMonth === null
                ? t('payment.membership.unlimitedRemaining')
                : t('payment.membership.remaining', { remaining: line.remaining, quota: line.quotaPerMonth }) }}
            </div>
          </div>
        </div>
        <span class="text-sm font-semibold text-gray-700">€{{ line.price.toFixed(2) }}</span>
      </div>

      <!-- Warn but allow — client can still pay the rest via cash/card/etc. -->
      <p v-if="hasUncoveredLines" class="text-xs text-amber-600 flex items-start gap-1.5 pt-1">
        <i class="pi pi-exclamation-triangle mt-0.5"></i>
        {{ t('payment.membership.someUncoveredWarning') }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { useI18n } from "vue-i18n";
const { t } = useI18n();

const props = defineProps({
  clientId: { type: String, default: null },
  catalogServices: { type: Array as () => any[], default: () => [] },
  appointmentServices: { type: Array as () => any[], default: () => [] },
});

const emit = defineEmits(["update:redemptions", "update:amount"]);

const loading = ref(false);
const membership = ref<any>(null);
const usage = ref<any[]>([]);
const checkedServiceIds = ref<any[]>([]);

const token = () => localStorage.getItem("token");

const fetchMembership = async () => {
  if (!props.clientId) {
    membership.value = null;
    usage.value = [];
    return;
  }
  loading.value = true;
  try {
    const res = await fetch(`/api/v1/clients/${props.clientId}/membership`, {
      headers: { Authorization: `Bearer ${token()}` },
    });
    const data = res.ok ? await res.json() : { membership: null, usage: [] };
    membership.value = data.membership;
    usage.value = data.usage || [];
  } finally {
    loading.value = false;
  }
};

watch(() => props.clientId, fetchMembership);
onMounted(fetchMembership);

// One line per distinct service_id present in this appointment that the
// tier covers — countInAppointment is how many times it appears here,
// remaining is what's left this calendar month regardless of that.
const redeemableLines = computed(() => {
  if (!membership.value || membership.value.status !== "active") return [];

  const counts = new Map<string, number>();
  for (const s of props.appointmentServices) {
    if (!s.service_id) continue;
    counts.set(s.service_id, (counts.get(s.service_id) || 0) + 1);
  }

  const lines: any[] = [];
  for (const u of usage.value) {
    const countInAppointment = counts.get(u.service_id) || 0;
    if (countInAppointment === 0) continue;

    const catalogEntry = props.catalogServices.find((c: any) => c.id === u.service_id);
    const unitPrice = Number(catalogEntry?.price || 0);
    const remaining = u.quota_per_month === null ? Infinity : u.remaining;
    const redeemableCount = Math.min(countInAppointment, remaining);

    lines.push({
      service_id: u.service_id,
      service_name: u.service_name,
      countInAppointment,
      quotaPerMonth: u.quota_per_month,
      remaining: u.quota_per_month === null ? null : u.remaining,
      redeemable: redeemableCount,
      price: unitPrice * redeemableCount,
    });
  }
  return lines;
});

const hasUncoveredLines = computed(() => {
  const coveredIds = new Set(redeemableLines.value.map((l) => l.service_id));
  const totalAppointmentLines = props.appointmentServices.filter((s: any) => s.service_id).length;
  const totalCovered = redeemableLines.value.reduce((sum, l) => sum + l.redeemable, 0);
  return totalAppointmentLines > totalCovered || props.appointmentServices.some((s: any) => s.service_id && !coveredIds.has(s.service_id));
});

const emitState = () => {
  const redemptions = redeemableLines.value
    .filter((l) => checkedServiceIds.value.includes(l.service_id) && l.redeemable > 0)
    .map((l) => ({ service_id: l.service_id, count: l.redeemable }));
  const amount = redeemableLines.value
    .filter((l) => checkedServiceIds.value.includes(l.service_id))
    .reduce((sum, l) => sum + l.price, 0);
  emit("update:redemptions", redemptions);
  emit("update:amount", amount);
};

watch(redeemableLines, (lines) => {
  // Default to all redeemable lines checked, mirroring how the gift-card
  // amount auto-suggests the full owed total.
  checkedServiceIds.value = lines.filter((l) => l.redeemable > 0).map((l) => l.service_id);
  emitState();
});

watch(checkedServiceIds, emitState);

const clear = () => {
  checkedServiceIds.value = [];
  emit("update:redemptions", []);
  emit("update:amount", 0);
};

defineExpose({ clear });
</script>
