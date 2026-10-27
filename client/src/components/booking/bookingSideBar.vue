<template>
  <div class="flex flex-col h-full border-l border-gray-200 overflow-y-auto overflow-x-hidden">
    <div v-if="client" class="p-8 text-center">
      <!-- Avatar -->
      <div
        class="w-20 h-20 bg-[var(--p-primary-100)] text-[var(--p-primary-600)] rounded-full flex items-center justify-center mx-auto text-2xl font-bold mb-4"
      >
        {{ client.first_name?.[0] || "?" }}{{ client.last_name?.[0] || "?" }}
      </div>
      <h3 class="text-xl font-bold">{{ client.full_name }}</h3>
      <p class="text-gray-500 text-sm">{{ client.email }}</p>

      <p class="text-gray-500 text-sm">
        {{ client.phone }}
      </p>

      <!-- Balance badge -->
      <div
        v-if="calculatedBalance > 0 && authStore.isShopAdmin"
        class="inline-flex items-center bg-red-100 text-red-800 text-xs font-bold px-3 py-1 rounded-full mb-6"
      >
        <i class="pi pi-exclamation-circle mr-1"></i>
        {{ t("bookingSidebar.balance") }}: {{ formatMoney(calculatedBalance) }}
      </div>

      <!-- ΕΟΠΠΥ breakdown card -->
      <!-- <div
        v-if="
          client.eoppy_breakdown?.total > 0 ||
          client.non_eoppy_breakdown?.total > 0
        "
        class="text-left bg-white p-4 rounded-xl shadow-sm border border-gray-100 mt-3"
      >
        <div v-if="client.eoppy_breakdown?.total > 0" class="mb-4">
          <h4
            class="text-xs font-bold text-gray-400 uppercase mb-2 border-l-2 border-[var(--p-primary-300)] pl-2"
          >
            {{
              t("bookingSidebar.eoppyAppts", {
                n: client.eoppy_breakdown.total,
              })
            }}
          </h4>
          <ul class="text-sm">
            <li
              v-for="(count, name) in client.eoppy_breakdown?.services || {}"
              :key="name"
              class="flex justify-between py-0.5"
            >
              <span class="text-gray-600">{{ name }}</span>
              <span class="font-semibold">{{ count }}</span>
            </li>
          </ul>
        </div>
      </div> -->

      <!-- Custom fields card -->
      <div
        v-if="client.custom_fields && client.custom_fields.length"
        class="text-left bg-white p-4 rounded-xl shadow-sm border border-gray-100 mt-3"
      >
        <h4
          class="text-xs font-bold text-gray-400 uppercase mb-3 border-l-2 border-[var(--p-primary-300)] pl-2"
        >
          {{ t("bookingSidebar.details") }}
        </h4>
        <div
          v-for="(field, i) in client.custom_fields"
          :key="i"
          class="flex justify-between text-sm mb-2 border-b border-gray-50 pb-1 last:border-0"
        >
          <span class="text-gray-600">{{ field.title }}</span>
          <span class="font-medium text-gray-900">{{ field.value }}</span>
        </div>
      </div>

      <!-- Appointment notes — same field a client can set when self-booking
           through the portal, edited here by staff; staff-only screen, so
           this is never shown to any client. -->
      <div
        class="text-left bg-white p-4 rounded-xl shadow-sm border border-gray-100 mt-3"
      >
        <h4
          class="text-xs font-bold text-gray-400 uppercase mb-3 border-l-2 border-[var(--p-primary-300)] pl-2"
        >
          {{ t("bookingSidebar.appointmentNotes") }}
        </h4>
        <Textarea
          :modelValue="bookingNotes"
          @update:modelValue="emit('update:bookingNotes', $event)"
          rows="3"
          class="w-full text-sm"
          :placeholder="t('booking.notes.bookingPlaceholder')"
        />
      </div>

      <!-- Past appointments card -->
      <div
        v-if="hasHistory"
        class="text-left bg-white p-4 rounded-xl shadow-sm border border-gray-100 mt-3"
      >
        <h4
          class="text-xs font-bold text-gray-400 uppercase mb-3 border-l-2 border-[var(--p-primary-300)] pl-2"
        >
          {{ t("bookingSidebar.pastAppointments") }}
        </h4>
        <div class="flex flex-wrap gap-1.5 mb-3">
          <button
            v-for="f in historyFilters"
            :key="f.value"
            type="button"
            class="px-2.5 py-1 rounded-full text-xs font-medium border transition-colors"
            :class="
              historyFilter === f.value
                ? 'bg-[var(--p-primary-color)] border-transparent text-white'
                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            "
            @click="historyFilter = f.value"
          >
            {{ f.label }}
          </button>
        </div>
        <p v-if="!loadingHistory && !pastAppointments.length" class="text-xs text-gray-400 py-2">
          {{ t("bookingSidebar.noMatchingAppointments") }}
        </p>
        <div
          v-for="appt in pastAppointments"
          :key="appt.id"
          class="flex justify-between items-start gap-2 text-sm mb-2 border-b border-gray-50 pb-1.5 last:border-0 last:mb-0"
        >
          <span class="flex flex-col items-start gap-0.5 whitespace-nowrap">
            <span class="text-gray-500" :class="{ 'line-through opacity-60': isVoided(appt.status) }">
              {{ formatApptDate(appt.start_time) }}
            </span>
            <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded" :class="statusLabel(appt).cls">
              {{ statusLabel(appt).text }}
            </span>
          </span>
          <span
            class="text-right truncate"
            :class="isVoided(appt.status) ? 'line-through text-red-400' : 'text-gray-900'"
            :title="appt.service_names || ''"
          >
            <span class="font-medium">{{ appt.service_names || "—" }}</span>
            <span v-if="appt.staff_names" class="block text-xs text-gray-400 truncate">{{ appt.staff_names }}</span>
            <button
              v-if="canManageDebt && appt.status !== 'cancelled' && Number(appt.owed) > 0"
              type="button"
              class="mt-1 text-xs font-semibold text-[var(--p-primary-700)] hover:underline"
              @click="openResolve({ kind: 'appointment', id: appt.id, amount: Number(appt.owed), label: `${formatApptDate(appt.start_time)} · ${appt.service_names || ''}` })"
            >
              {{ t("bookingSidebar.debt.resolve") }}
            </button>
          </span>
        </div>
      </div>

      <!-- Manual debts (admin, super admin, frontdesk) -->
      <div
        v-if="canManageDebt"
        class="text-left bg-white p-4 rounded-xl shadow-sm border border-gray-100 mt-3"
      >
        <div class="flex items-center justify-between mb-2 gap-2">
          <h4 class="text-xs font-bold text-gray-400 uppercase border-l-2 border-[var(--p-primary-300)] pl-2">
            {{ t("bookingSidebar.debt.manualTitle") }}
          </h4>
          <button type="button" class="text-xs font-semibold text-[var(--p-primary-700)] hover:underline" @click="openAddDebt">
            + {{ t("bookingSidebar.debt.add") }}
          </button>
        </div>
        <p v-if="!openDebts.length" class="text-xs text-gray-400">{{ t("bookingSidebar.debt.none") }}</p>
        <div
          v-for="d in openDebts"
          :key="d.id"
          class="flex justify-between items-start gap-2 text-sm py-1.5 border-b border-gray-50 last:border-0"
        >
          <span class="min-w-0">
            <span class="block text-gray-900 break-words">{{ d.note }}</span>
            <span class="block text-xs text-gray-400">{{ formatApptDate(d.debt_date) }}</span>
          </span>
          <span class="flex flex-col items-end flex-shrink-0">
            <span class="font-semibold text-amber-800 tabular-nums">{{ formatMoney(d.remaining) }}</span>
            <button
              type="button"
              class="text-xs font-semibold text-[var(--p-primary-700)] hover:underline"
              @click="openResolve({ kind: 'debt', id: d.id, amount: Number(d.remaining), label: d.note })"
            >
              {{ t("bookingSidebar.debt.resolve") }}
            </button>
          </span>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div
      v-else
      class="h-full flex flex-col items-center justify-center text-gray-300 p-8 text-center"
    >
      <div
        class="w-20 h-20 rounded-full bg-gray-50 flex items-center justify-center mb-4"
      >
        <i class="pi pi-user text-4xl text-gray-200"></i>
      </div>
      <h3 class="text-sm font-medium text-gray-400">
        {{ t("bookingSidebar.noClient") }}
      </h3>
      <p class="text-xs text-gray-300 mt-1">
        {{ t("bookingSidebar.noClientSub") }}
      </p>
    </div>

    <!-- Resolve a debt: payment or write-off -->
    <Dialog v-model:visible="resolveVisible" modal :header="t('bookingSidebar.debt.resolveTitle')" :style="{ width: '24rem', maxWidth: '95vw' }">
      <div v-if="resolveTarget" class="space-y-4">
        <div class="text-sm text-gray-600">
          <div class="truncate">{{ resolveTarget.label }}</div>
          <div class="text-lg font-bold text-gray-900 tabular-nums">{{ formatMoney(resolveTarget.amount) }}</div>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <button
            v-for="m in RESOLVE_MODES"
            :key="m"
            type="button"
            class="px-3 py-2 rounded-lg border text-sm font-medium"
            :class="resolveMode === m ? 'bg-[var(--p-primary-color)] border-transparent text-white' : 'bg-white border-gray-200 text-gray-700'"
            @click="resolveMode = m"
          >
            {{ t(m === "payment" ? "bookingSidebar.debt.modePayment" : "bookingSidebar.debt.modeWriteOff") }}
          </button>
        </div>
        <div v-if="resolveMode === 'payment'">
          <label class="block text-xs font-medium text-gray-500 mb-1">{{ t("payment.paymentMethod") }}</label>
          <Dropdown v-model="resolveMethod" :options="methodOptions" optionLabel="label" optionValue="value" class="w-full" />
        </div>
        <p v-else class="text-xs text-gray-500">{{ t("bookingSidebar.debt.writeOffNote") }}</p>
      </div>
      <template #footer>
        <Button :label="t('common.cancel')" text @click="resolveVisible = false" />
        <Button :label="t('bookingSidebar.debt.confirm')" icon="pi pi-check" :loading="debtSaving" @click="confirmResolve" />
      </template>
    </Dialog>

    <!-- Add a manual debt -->
    <Dialog v-model:visible="addDebtVisible" modal :header="t('bookingSidebar.debt.addTitle')" :style="{ width: '24rem', maxWidth: '95vw' }">
      <div class="space-y-4">
        <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
          <div class="min-w-0">
            <label class="block text-xs font-medium text-gray-500 mb-1">{{ t("expenses.amount") }}</label>
            <InputNumber v-model="newDebt.amount" mode="currency" currency="EUR" locale="el-GR" :min="0" class="w-full" inputClass="w-full" />
          </div>
          <div class="min-w-0">
            <label class="block text-xs font-medium text-gray-500 mb-1">{{ t("expenses.date") }}</label>
            <Calendar v-model="newDebt.date" dateFormat="dd/mm/yy" class="w-full" inputClass="w-full" />
          </div>
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-500 mb-1">{{ t("bookingSidebar.debt.note") }}</label>
          <Textarea v-model="newDebt.note" rows="2" maxlength="500" class="w-full" :placeholder="t('bookingSidebar.debt.notePlaceholder')" />
        </div>
      </div>
      <template #footer>
        <Button :label="t('common.cancel')" text @click="addDebtVisible = false" />
        <Button
          :label="t('common.save')"
          icon="pi pi-check"
          :loading="debtSaving"
          :disabled="!newDebt.amount || newDebt.amount <= 0 || !newDebt.date || !newDebt.note.trim()"
          @click="saveDebt"
        />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { api, ApiError } from "../../api/http";
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useAuthStore } from "../../stores/auth";
import { useToast } from "primevue/usetoast";
import { formatMoney } from "../../utils/format";
const { t } = useI18n();
const authStore = useAuthStore();

const props = defineProps({
  client: {
    type: Object,
    default: null,
  },
  calculatedBalance: {
    type: Number,
    default: 0,
  },
  bookingNotes: {
    type: String,
    default: "",
  },
});
const emit = defineEmits(["update:bookingNotes", "debt-changed"]);
const toast = useToast();

// --- Debt: resolve (payment / write-off) and manual debts ---
const canManageDebt = computed(() => authStore.isShopAdmin);
const manualDebts = ref<any[]>([]);
const openDebts = computed(() => manualDebts.value.filter((d) => Number(d.remaining) > 0));
const debtSaving = ref(false);
const methodOptions = computed(() =>
  ["cash", "card", "bank-transfer"].map((m) => ({ value: m, label: t(`common.paymentMethod.${m}`) })),
);

type ResolveTarget = { kind: "appointment" | "debt"; id: string; amount: number; label: string };
const resolveVisible = ref(false);
const resolveTarget = ref<ResolveTarget | null>(null);
const RESOLVE_MODES = ["payment", "write_off"] as const;
const resolveMode = ref<"payment" | "write_off">("payment");
const resolveMethod = ref("cash");

const addDebtVisible = ref(false);
const newDebt = ref<{ amount: number | null; date: Date | null; note: string }>({ amount: null, date: new Date(), note: "" });


const loadDebts = async (clientId: string) => {
  if (!canManageDebt.value) return;
  try {
    const debts = await api.get(`/api/v1/clients/${clientId}/debts`);
    if (props.client?.id === clientId) manualDebts.value = debts;
  } catch {
    // sidebar extra — fail silently
  }
};

const openResolve = (target: ResolveTarget) => {
  resolveTarget.value = target;
  resolveMode.value = "payment";
  resolveMethod.value = "cash";
  resolveVisible.value = true;
};

const openAddDebt = () => {
  newDebt.value = { amount: null, date: new Date(), note: "" };
  addDebtVisible.value = true;
};

const afterDebtChange = async (data: any, appointmentId?: string) => {
  emit("debt-changed", { appointmentId, amount: Number(data.amount || 0), newBalance: Number(data.new_balance || 0) });
  if (props.client?.id) await Promise.all([loadHistory(props.client.id), loadDebts(props.client.id)]);
};

const failDebt = (e: any) =>
  toast.add({ severity: "error", summary: t("common.error"), detail: e?.message || t("bookingSidebar.debt.failed"), life: 3500 });

const confirmResolve = async () => {
  const target = resolveTarget.value;
  if (!target) return;
  debtSaving.value = true;
  try {
    const url =
      target.kind === "appointment"
        ? `/api/v1/appointments/${target.id}/resolve-debt`
        : `/api/v1/client-debts/${target.id}/resolve`;
    const data = await api
      .post(url, { mode: resolveMode.value, payment_method: resolveMethod.value })
      .catch((e: ApiError) => {
        throw new Error(e.data?.error === "nothing_owed" ? t("bookingSidebar.debt.nothingOwed") : t("bookingSidebar.debt.failed"));
      });
    resolveVisible.value = false;
    toast.add(
      resolveMode.value === "write_off"
        ? { severity: "success", summary: t("bookingSidebar.debt.writtenOffToast"), detail: formatMoney(data.amount), life: 4000 }
        : {
            severity: "success",
            summary: t("bookingSidebar.debt.paidToast"),
            detail: t("bookingSidebar.debt.paidToastDetail", {
              amount: formatMoney(data.amount),
              method: t(`payment.methodLabels.${resolveMethod.value}`),
            }),
            life: 4000,
          },
    );
    await afterDebtChange(data, target.kind === "appointment" ? target.id : undefined);
  } catch (e: any) {
    failDebt(e);
  } finally {
    debtSaving.value = false;
  }
};

const saveDebt = async () => {
  if (!props.client?.id || !newDebt.value.date) return;
  debtSaving.value = true;
  try {
    const d = newDebt.value.date;
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const data = await api
      .post(`/api/v1/clients/${props.client.id}/debts`, { amount: newDebt.value.amount, debt_date: date, note: newDebt.value.note.trim() })
      .catch(() => {
        throw new Error(t("bookingSidebar.debt.failed"));
      });
    addDebtVisible.value = false;
    await afterDebtChange(data);
  } catch (e: any) {
    failDebt(e);
  } finally {
    debtSaving.value = false;
  }
};

// --- Past appointments ---
const pastAppointments = ref<any[]>([]);
const historyFilter = ref<"all" | "completed" | "cancelled" | "no-show" | "unpaid">("all");
const hasHistory = ref(false);
const loadingHistory = ref(false);

const historyFilters = computed(() => [
  { value: "all", label: t("bookingSidebar.filters.all") },
  { value: "completed", label: t("common.status.completed") },
  { value: "cancelled", label: t("common.status.cancelled") },
  { value: "no-show", label: t("common.status.noShow") },
  { value: "unpaid", label: t("bookingSidebar.filters.unpaid") },
] as const);

const STATUS_STYLE: Record<string, { key: string; cls: string }> = {
  completed: { key: "completed", cls: "bg-green-50 text-green-700" },
  new: { key: "completed", cls: "bg-green-50 text-green-700" },
  confirmed: { key: "completed", cls: "bg-green-50 text-green-700" },
  arrived: { key: "completed", cls: "bg-green-50 text-green-700" },
  started: { key: "completed", cls: "bg-green-50 text-green-700" },
  cancelled: { key: "cancelled", cls: "bg-red-50 text-red-600" },
  "no-show": { key: "noShow", cls: "bg-red-100 text-red-800" },
  "no-response": { key: "noResponse", cls: "bg-amber-50 text-amber-700" },
};

// Past visits count as completed even if never marked so; a visit that still
// owes money says so with the amount.
const statusLabel = (appt: any) => {
  const style = STATUS_STYLE[appt.status] || { key: "", cls: "bg-gray-100 text-gray-600" };
  const base = style.key ? t(`common.status.${style.key}`) : appt.status;
  if (appt.status !== "cancelled" && Number(appt.owed) > 0) {
    return {
      text: `${base} · ${t("bookingSidebar.owes", { amount: formatMoney(appt.owed) })}`,
      cls: "bg-amber-50 text-amber-800",
    };
  }
  return { text: base, cls: style.cls };
};

const isVoided = (status: string) =>
  status === "cancelled" || status === "no-show";

const formatApptDate = (d: string) =>
  new Date(d).toLocaleDateString("el-GR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });

const loadHistory = async (clientId: string) => {
  const filter = historyFilter.value;
  loadingHistory.value = true;
  try {
    const rows = await api.get(`/api/v1/clients/${clientId}/past-appointments?limit=10&status=${encodeURIComponent(filter)}`);
    // Ignore a reply for a client or filter the user has already moved on from.
    if (props.client?.id !== clientId || historyFilter.value !== filter) return;
    pastAppointments.value = rows;
    if (filter === "all") hasHistory.value = pastAppointments.value.length > 0;
  } catch {
    // sidebar extra — fail silently
  } finally {
    loadingHistory.value = false;
  }
};

watch(historyFilter, () => {
  if (props.client?.id) loadHistory(props.client.id);
});

watch(
  () => props.client?.id,
  async (clientId) => {
    pastAppointments.value = [];
    manualDebts.value = [];
    hasHistory.value = false;
    historyFilter.value = "all";
    if (!clientId) return;
    await Promise.all([loadHistory(clientId), loadDebts(clientId)]);
  },
  { immediate: true },
);
</script>
