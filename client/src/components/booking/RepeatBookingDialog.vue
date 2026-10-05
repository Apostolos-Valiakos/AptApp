<template>
  <Dialog
    v-model:visible="visibleModel"
    modal
    :header="t('booking.repeat.title')"
    :style="{ width: '34rem', maxWidth: '95vw' }"
  >
    <p class="text-sm text-gray-500 mb-4">{{ t('booking.repeat.hint') }}</p>

    <div class="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
      <div
        v-for="(row, idx) in rows"
        :key="idx"
        class="p-3 bg-gray-50 rounded-xl border border-gray-100"
      >
        <div class="flex items-center gap-2">
          <Calendar
            v-model="row.date"
            dateFormat="dd/mm/yy"
            class="flex-1 min-w-0"
            inputClass="w-full"
          />
          <div class="w-32 flex-shrink-0">
            <TimeDropdown v-model="row.time" :minTime="shopMinTime" :maxTime="shopMaxTime" />
          </div>
          <Button
            icon="pi pi-trash"
            class="p-button-rounded p-button-text p-button-sm p-button-danger flex-shrink-0"
            @click="removeRow(idx)"
          />
        </div>
        <p v-if="warningsFor(row).length" class="text-xs text-amber-600 mt-2 space-y-0.5">
          <span v-for="w in warningsFor(row)" :key="w" class="block">
            <i class="pi pi-exclamation-triangle text-[10px]"></i> {{ w }}
          </span>
        </p>
      </div>
    </div>

    <Button
      :label="t('booking.repeat.addDate')"
      icon="pi pi-plus"
      text
      size="small"
      class="mt-3"
      @click="addRow"
    />

    <template #footer>
      <Button :label="t('common.cancel')" text @click="visibleModel = false" />
      <Button
        :label="t('booking.repeat.save', { count: rows.length })"
        :loading="saving"
        :disabled="!rows.length"
        @click="save"
      />
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useToast } from "primevue/usetoast";
import TimeDropdown from "./TimeDropdown.vue";
import { isStaffAvailable } from "../../utils/staffAvailability";

const { t } = useI18n();
const toast = useToast();

const props = defineProps<{
  visible: boolean;
  services: any[];
  clientId: string | null;
  staff: any[];
  workingHours: any[];
  timeOff: any[];
  shopMinTime?: string;
  shopMaxTime?: string;
}>();

const emit = defineEmits<{
  "update:visible": [boolean];
  created: [];
}>();

const visibleModel = computed({
  get: () => props.visible,
  set: (v) => emit("update:visible", v),
});

type Row = { date: Date; time: string };
const rows = ref<Row[]>([]);
const saving = ref(false);

const formatTime = (d: Date) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

const firstStart = computed(() => new Date(props.services[0]?.start_time));

const defaultRow = (): Row => {
  const date = new Date(firstStart.value);
  date.setDate(date.getDate() + 7);
  return { date, time: formatTime(firstStart.value) };
};

watch(
  () => props.visible,
  (v) => {
    if (v) rows.value = [defaultRow()];
  },
);

const rowStart = (row: Row) => {
  const d = new Date(row.date);
  const [h, m] = row.time.split(":").map(Number);
  d.setHours(h, m, 0, 0);
  return d;
};

// Each service keeps its offset from the first one, so a multi-service
// booking keeps its sequence on every repeat.
const serviceStartFor = (svc: any, row: Row) => {
  const offset = new Date(svc.start_time).getTime() - firstStart.value.getTime();
  return new Date(rowStart(row).getTime() + offset);
};

const warningsFor = (row: Row): string[] => {
  const warnings = new Set<string>();
  for (const svc of props.services) {
    const start = serviceStartFor(svc, row);
    const end = new Date(start.getTime() + (svc.duration_override || 60) * 60000);
    const { available, reason } = isStaffAvailable({
      staffList: props.staff,
      workingHours: props.workingHours,
      timeOff: props.timeOff,
      staffId: svc.staff_id,
      start,
      end,
    });
    if (!available) {
      warnings.add(
        reason === "time_off"
          ? t("booking.repeat.warnTimeOff")
          : t("booking.repeat.warnOutsideHours"),
      );
    }
  }
  return [...warnings];
};

const addRow = () => {
  const last = rows.value[rows.value.length - 1];
  rows.value.push(last ? { date: new Date(last.date.getTime() + 7 * 86400000), time: last.time } : defaultRow());
};

const removeRow = (idx: number) => {
  rows.value.splice(idx, 1);
};

const save = async () => {
  saving.value = true;
  try {
    const token = localStorage.getItem("token");
    const res = await fetch("/api/v1/appointments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      },
      body: JSON.stringify({
        client_id: props.clientId,
        status: "new",
        save_receipt: true,
        services: props.services.map((s) => ({
          service_id: s.service_id,
          staff_id: s.staff_id,
          start_time: s.start_time,
          duration_override: s.duration_override,
          price_override: Number(s.price_override) || 0,
          variation_name: s.variation_name || null,
        })),
        instance_starts: rows.value.map((r) => rowStart(r).toISOString()),
        allow_unavailable: true,
      }),
    });
    if (!res.ok) throw new Error("Repeat failed");
    toast.add({
      severity: "success",
      summary: t("common.success"),
      detail: t("booking.repeat.created", { count: rows.value.length }),
      life: 3000,
    });
    emit("created");
    visibleModel.value = false;
  } catch {
    toast.add({
      severity: "error",
      summary: t("common.error"),
      detail: t("booking.repeat.failed"),
      life: 4000,
    });
  } finally {
    saving.value = false;
  }
};
</script>
