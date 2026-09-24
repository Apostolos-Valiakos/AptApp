<template>
  <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
    <div class="mb-6">
      <h3 class="text-lg font-bold text-gray-900">
        {{ t("discount.admin.title") }}
      </h3>
      <p class="text-sm text-gray-500 max-w-xl">
        {{ t("discount.admin.subtitle") }}
      </p>
    </div>

    <form
      class="flex flex-col sm:flex-row gap-3 sm:items-end mb-6"
      @submit.prevent="createCode"
    >
      <div class="flex-1">
        <label class="block text-sm font-medium text-gray-700 mb-1">{{
          t("discount.admin.name")
        }}</label>
        <InputText
          v-model="form.name"
          class="w-full"
          maxlength="100"
          placeholder="SUMMER10"
        />
      </div>
      <div class="sm:w-40">
        <label class="block text-sm font-medium text-gray-700 mb-1">{{
          t("discount.admin.percentage")
        }}</label>
        <InputNumber
          v-model="form.percentage"
          suffix=" %"
          :min="0.01"
          :max="100"
          :maxFractionDigits="2"
          class="w-full"
        />
      </div>
      <Button
        type="submit"
        icon="pi pi-plus"
        :label="t('discount.admin.add')"
        :loading="saving"
        :disabled="!form.name.trim() || !form.percentage"
      />
    </form>

    <div v-if="codes.length" class="divide-y divide-gray-100 border border-gray-100 rounded-xl">
      <div
        v-for="c in codes"
        :key="c.id"
        class="flex items-center gap-3 px-4 py-3"
      >
        <div class="flex-1 min-w-0">
          <div class="font-semibold text-gray-900 truncate">{{ c.name }}</div>
          <div class="text-xs text-gray-500">
            {{ Number(c.percentage) }}% · {{ t("discount.admin.used") }}:
            {{ c.usage_count }}
          </div>
        </div>
        <span class="text-xs text-gray-500">{{ t("discount.admin.active") }}</span>
        <ToggleSwitch
          :modelValue="c.is_active"
          @update:modelValue="(v: boolean) => toggle(c, v)"
        />
        <Button
          icon="pi pi-trash"
          severity="danger"
          text
          rounded
          @click="remove(c)"
        />
      </div>
    </div>

    <div class="mt-8">
      <h4 class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
        {{ t("discount.admin.usageTitle") }}
      </h4>
      <p v-if="!usage.length" class="text-sm text-gray-500">
        {{ t("discount.admin.usageEmpty") }}
      </p>
      <div v-else class="overflow-x-auto max-h-80 overflow-y-auto border border-gray-100 rounded-xl">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 text-xs text-gray-500 uppercase sticky top-0">
            <tr>
              <th class="text-left px-3 py-2">{{ t("discount.admin.date") }}</th>
              <th class="text-left px-3 py-2">{{ t("discount.admin.client") }}</th>
              <th class="text-left px-3 py-2">{{ t("discount.admin.type") }}</th>
              <th class="text-right px-3 py-2">{{ t("discount.admin.amount") }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="u in usage" :key="u.id">
              <td class="px-3 py-2 whitespace-nowrap">{{ fmtDate(u.start_time) }}</td>
              <td class="px-3 py-2">
                {{ [u.first_name, u.last_name].filter(Boolean).join(" ") || "—" }}
              </td>
              <td class="px-3 py-2">{{ describe(u) }}</td>
              <td class="px-3 py-2 text-right font-semibold">
                €{{ Number(u.discount_amount).toFixed(2) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useToast } from "primevue/usetoast";
import { useConfirm } from "primevue/useconfirm";

const { t, locale } = useI18n();
const toast = useToast();
const confirm = useConfirm();

const codes = ref<any[]>([]);
const usage = ref<any[]>([]);
const saving = ref(false);
const form = reactive<{ name: string; percentage: number | null }>({
  name: "",
  percentage: null,
});

const api = async (url: string, method = "GET", body?: any) => {
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${localStorage.getItem("token")}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || t("discount.admin.failed"));
  return data;
};

const load = async () => {
  try {
    [codes.value, usage.value] = await Promise.all([
      api("/api/v1/discount-codes"),
      api("/api/v1/discounts/usage"),
    ]);
  } catch (e: any) {
    toast.add({ severity: "error", summary: t("common.error"), detail: e.message, life: 3000 });
  }
};

const run = async (fn: () => Promise<any>) => {
  try {
    await fn();
    await load();
  } catch (e: any) {
    toast.add({ severity: "error", summary: t("common.error"), detail: e.message, life: 3500 });
  }
};

const createCode = async () => {
  saving.value = true;
  await run(async () => {
    await api("/api/v1/discount-codes", "POST", {
      name: form.name,
      percentage: form.percentage,
    });
    form.name = "";
    form.percentage = null;
    toast.add({ severity: "success", summary: t("discount.admin.saved"), life: 2000 });
  });
  saving.value = false;
};

const toggle = (c: any, is_active: boolean) =>
  run(() => api(`/api/v1/discount-codes/${c.id}`, "PUT", { is_active }));

const remove = (c: any) =>
  confirm.require({
    header: c.name,
    message: t("discount.admin.deleteConfirm"),
    icon: "pi pi-exclamation-triangle",
    acceptClass: "p-button-danger",
    accept: () => run(() => api(`/api/v1/discount-codes/${c.id}`, "DELETE")),
  });

const fmtDate = (d: string | null) =>
  d
    ? new Date(d).toLocaleString(locale.value, {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

const describe = (u: any) => {
  const v = Number(u.discount_value);
  if (u.discount_type === "code") return `${u.discount_code_name || t("discount.code")} (${v}%)`;
  if (u.discount_type === "percent") return `${v}%`;
  return `€${v.toFixed(2)}`;
};

onMounted(load);
</script>
