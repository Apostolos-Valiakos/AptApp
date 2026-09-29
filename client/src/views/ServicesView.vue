<template>
  <div class="space-y-6">
    <!-- Page Header -->
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div class="flex justify-between items-center">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-[var(--p-primary-50)] flex items-center justify-center">
            <i class="pi pi-list-check text-[var(--p-primary-600)]"></i>
          </div>
          <div>
            <h1 class="text-2xl font-bold text-gray-900">{{ t('services.title') }}</h1>
            <p class="text-sm text-gray-500">{{ t('services.subtitle', { count: services.length }) }}</p>
          </div>
        </div>
        <Button
          :label="t('services.addNew')"
          icon="pi pi-plus"
          @click="openNew"
        />
      </div>
      <div class="mt-4">
        <span class="p-input-icon-left">
          <i class="pi pi-search mr-3" />
          <InputText
            v-model="search"
            :placeholder="t('services.search')"
            class="w-64"
          />
        </span>
      </div>
    </div>

    <div v-if="loading" class="bg-white rounded-2xl shadow-sm border border-gray-100 p-16 text-center">
      <i class="pi pi-spin pi-spinner text-3xl text-gray-300"></i>
    </div>

    <div v-else-if="!services.length" class="bg-white rounded-2xl shadow-sm border border-gray-100 py-16 text-center">
      <i class="pi pi-list text-5xl text-gray-200 mb-4"></i>
      <p class="text-gray-500 font-semibold text-lg">{{ t('services.empty.title') }}</p>
      <p class="text-gray-400 text-sm mt-1">{{ t('services.empty.subtitle') }}</p>
    </div>

    <!-- Search results: flat, non-draggable -->
    <div v-else-if="search" class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div v-if="!searchResults.length" class="py-16 text-center">
        <i class="pi pi-search text-4xl text-gray-200 mb-3"></i>
        <p class="text-gray-400 text-sm">{{ t('services.noSearchResults') }}</p>
      </div>
      <div
        v-for="service in searchResults"
        :key="service.id"
        class="flex items-center gap-3 px-5 py-3 border-b border-gray-50 last:border-b-0 hover:bg-gray-50"
      >
        <ServiceRowBody :service="service" @edit="editService(service)" @delete="confirmDelete(service)" />
      </div>
    </div>

    <!-- Grouped, draggable view -->
    <template v-else>
      <p class="text-xs text-gray-400 flex items-center gap-1.5 px-1">
        <i class="pi pi-info-circle"></i>
        {{ t('services.dragHint') }}
      </p>

      <draggable
        v-model="groupedServices"
        item-key="label"
        handle=".category-drag-handle"
        class="space-y-4"
        ghost-class="drag-ghost"
        @end="onCategoryDragEnd"
      >
        <template #item="{ element: group }">
          <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div class="flex items-center gap-3 px-5 py-4 border-b border-gray-100 bg-gray-50/60">
              <i class="pi pi-bars category-drag-handle cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500"></i>
              <h3 class="font-bold text-gray-900">{{ group.label }}</h3>
              <span class="text-xs text-gray-400">({{ group.items.length }})</span>
            </div>
            <draggable
              v-model="group.items"
              item-key="id"
              handle=".service-drag-handle"
              ghost-class="drag-ghost"
              @end="onServiceDragEnd(group)"
            >
              <template #item="{ element: service }">
                <div class="flex items-center gap-3 px-5 py-3 border-b border-gray-50 last:border-b-0 hover:bg-gray-50">
                  <i class="pi pi-bars service-drag-handle cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 text-sm"></i>
                  <ServiceRowBody :service="service" @edit="editService(service)" @delete="confirmDelete(service)" />
                </div>
              </template>
            </draggable>
          </div>
        </template>
      </draggable>

      <!-- Uncategorized — always last, service-level drag only (no category to reposition) -->
      <div v-if="uncategorizedGroup.items.length" class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mt-4">
        <div class="flex items-center gap-3 px-5 py-4 border-b border-gray-100 bg-gray-50/60">
          <h3 class="font-bold text-gray-900">{{ uncategorizedGroup.label }}</h3>
          <span class="text-xs text-gray-400">({{ uncategorizedGroup.items.length }})</span>
        </div>
        <draggable
          v-model="uncategorizedGroup.items"
          item-key="id"
          handle=".service-drag-handle"
          ghost-class="drag-ghost"
          @end="onServiceDragEnd(uncategorizedGroup)"
        >
          <template #item="{ element: service }">
            <div class="flex items-center gap-3 px-5 py-3 border-b border-gray-50 last:border-b-0 hover:bg-gray-50">
              <i class="pi pi-bars service-drag-handle cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 text-sm"></i>
              <ServiceRowBody :service="service" @edit="editService(service)" @delete="confirmDelete(service)" />
            </div>
          </template>
        </draggable>
      </div>
    </template>

    <!-- Edit / Add Dialog -->
    <Dialog
      v-model:visible="dialogVisible"
      :header="editingService?.id ? t('services.dialog.editService') : t('services.dialog.newService')"
      modal
      class="w-full max-w-2xl"
    >
      <div class="space-y-5 mt-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('services.dialog.serviceName') }}</label>
            <InputText
              v-model="editingService.name"
              :placeholder="t('services.dialog.serviceNamePlaceholder')"
              class="w-full"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('services.dialog.category') }}</label>
            <Dropdown
              v-model="editingService.category"
              :options="categoryOptions"
              editable
              :placeholder="t('services.dialog.selectCategory')"
              class="w-full"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('services.dialog.duration') }}</label>
            <InputNumber
              v-model="editingService.duration_minutes"
              :min="15"
              :max="360"
              showButtons
              class="w-full"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('services.dialog.price') }}</label>
            <InputNumber
              v-model="editingService.price"
              mode="decimal"
              :minFractionDigits="2"
              :maxFractionDigits="2"
              class="w-full"
            />
          </div>

          <!-- Color picker — full width with light gray background -->
          <div class="md:col-span-2 p-4 bg-gray-50 rounded-xl border border-gray-200">
            <label class="block text-sm font-medium text-gray-700 mb-3">{{ t('services.dialog.serviceColor') }}</label>
            <div class="flex items-start gap-6">
              <ColorPicker v-model="editingService.color_code" format="hex" />
              <div class="flex-grow">
                <p class="text-xs text-gray-500 mb-3">
                  {{ t('services.dialog.colorNote') }}
                </p>
                <div class="flex items-center gap-3">
                  <InputText
                    v-model="editingService.color_code"
                    class="p-inputtext-sm w-36"
                    placeholder="#000000"
                  />
                  <div
                    class="w-10 h-10 rounded-lg border border-gray-200 shadow-sm transition-colors flex-shrink-0"
                    :style="{ backgroundColor: editingService.color_code }"
                  ></div>
                  <span class="text-xs text-gray-400 font-mono">{{ editingService.color_code }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Online booking opt-in -->
          <div class="md:col-span-2 flex items-start gap-3 p-4 bg-gray-50 rounded-xl border border-gray-200">
            <Checkbox v-model="editingService.bookable_online" :binary="true" inputId="bookableOnline" />
            <label for="bookableOnline" class="cursor-pointer">
              <span class="block text-sm font-medium text-gray-700">{{ t('services.dialog.bookableOnline') }}</span>
              <span class="block text-xs text-gray-500 mt-0.5">{{ t('services.dialog.bookableOnlineNote') }}</span>
            </label>
          </div>

          <!-- Default staff for this service (used when this service appears as a combo component block) -->
          <div class="md:col-span-2">
            <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('services.dialog.defaultStaff') }}</label>
            <Dropdown
              v-model="editingService.default_staff_id"
              :options="staffList"
              optionLabel="name"
              optionValue="id"
              showClear
              filter
              :placeholder="t('services.dialog.defaultStaffPlaceholder')"
              class="w-full"
            />
            <p class="text-xs text-gray-400 mt-1">{{ t('services.dialog.defaultStaffNote') }}</p>
          </div>

          <!-- Staff eligibility -->
          <div class="md:col-span-2 p-4 bg-gray-50 rounded-xl border border-gray-200">
            <div class="flex items-center justify-between mb-3 gap-3">
              <div>
                <span class="block text-sm font-medium text-gray-700">{{ t('services.dialog.staffEligibility') }}</span>
                <span class="block text-xs text-gray-500 mt-0.5">{{ t('services.dialog.staffEligibilityNote') }}</span>
              </div>
              <button
                type="button"
                class="text-xs font-medium text-[var(--p-primary-600)] hover:underline whitespace-nowrap"
                @click="toggleAllStaff"
              >
                {{ allStaffChecked ? t('services.dialog.deselectAllStaff') : t('services.dialog.selectAllStaff') }}
              </button>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <label
                v-for="staff in staffList"
                :key="staff.id"
                class="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"
              >
                <Checkbox v-model="editingService.staff_ids" :value="staff.id" />
                {{ staff.name }}
              </label>
            </div>
          </div>

          <!-- Combination of services -->
          <div class="md:col-span-2 p-4 bg-gray-50 rounded-xl border border-gray-200">
            <div class="flex items-start gap-3">
              <Checkbox v-model="isCombo" :binary="true" inputId="isCombo" />
              <label for="isCombo" class="cursor-pointer">
                <span class="block text-sm font-medium text-gray-700">{{ t('services.dialog.isCombo') }}</span>
                <span class="block text-xs text-gray-500 mt-0.5">{{ t('services.dialog.isComboNote') }}</span>
              </label>
            </div>
            <div v-if="isCombo" class="mt-3">
              <MultiSelect
                v-model="editingService.combo_component_ids"
                :options="comboComponentOptions"
                optionLabel="name"
                optionValue="id"
                filter
                display="chip"
                :placeholder="t('services.dialog.comboComponentsPlaceholder')"
                class="w-full"
              />
              <p class="text-xs text-gray-400 mt-2" v-if="comboSummary">{{ comboSummary }}</p>
            </div>
          </div>

          <!-- Multiple variations (e.g. "30 min" / "60 min", each its own price) -->
          <div class="md:col-span-2 p-4 bg-gray-50 rounded-xl border border-gray-200">
            <div class="flex items-start gap-3">
              <Checkbox v-model="hasVariations" :binary="true" inputId="hasVariations" />
              <label for="hasVariations" class="cursor-pointer">
                <span class="block text-sm font-medium text-gray-700">{{ t('services.dialog.hasVariations') }}</span>
                <span class="block text-xs text-gray-500 mt-0.5">{{ t('services.dialog.hasVariationsNote') }}</span>
              </label>
            </div>
            <div v-if="hasVariations" class="mt-3 space-y-2">
              <div
                v-for="(variation, idx) in editingService.variations"
                :key="idx"
                class="flex flex-wrap items-center gap-2 bg-white p-2 rounded-lg border border-gray-200"
              >
                <InputText
                  v-model="variation.name"
                  :placeholder="t('services.dialog.variationNamePlaceholder')"
                  class="p-inputtext-sm flex-1 min-w-[10rem]"
                />
                <InputNumber
                  v-model="variation.duration_minutes"
                  :placeholder="t('services.dialog.duration')"
                  suffix=" min"
                  class="p-inputtext-sm w-32"
                />
                <InputNumber
                  v-model="variation.price"
                  mode="currency"
                  currency="EUR"
                  class="p-inputtext-sm w-32"
                />
                <Button
                  icon="pi pi-trash"
                  severity="danger"
                  text
                  size="small"
                  @click="editingService.variations.splice(idx, 1)"
                />
              </div>
              <Button
                :label="t('services.dialog.addVariation')"
                icon="pi pi-plus"
                text
                size="small"
                @click="editingService.variations.push({ name: '', duration_minutes: 30, price: 0 })"
              />
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <Button
          :label="t('common.cancel')"
          icon="pi pi-times"
          variant="text"
          @click="dialogVisible = false"
        />
        <Button
          :label="editingService?.id ? t('common.save') : t('common.save')"
          icon="pi pi-check"
          severity="success"
          @click="saveService"
        />
      </template>
    </Dialog>

    <!-- Delete Confirm Dialog -->
    <ConfirmDialog></ConfirmDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch, h } from "vue";
import { useI18n } from "vue-i18n";
import { useToast } from "primevue/usetoast";
import { useConfirm } from "primevue/useconfirm";
import Checkbox from "primevue/checkbox";
import MultiSelect from "primevue/multiselect";
import draggable from "vuedraggable";
import { groupServicesByCategory } from "../utils/serviceGroups";

const { t } = useI18n();

// Small reusable row body (name/duration/price/badges/actions), shared by the
// search-results list, each category group, and the uncategorized group —
// defined inline via the render function so it stays in this one file rather
// than a whole extra component just for a ~15-line row.
const ServiceRowBody = (props: { service: any }, { emit }: any) =>
  h("div", { class: "flex items-center gap-3 flex-1 min-w-0" }, [
    h("div", {
      class: "w-1 h-8 rounded-full flex-shrink-0",
      style: { backgroundColor: props.service.color_code || "var(--p-primary-300)" },
    }),
    h("div", { class: "flex-1 min-w-0" }, [
      h("div", { class: "flex items-center gap-2 flex-wrap" }, [
        h("span", { class: "font-semibold text-gray-900" }, props.service.name),
        props.service.combo_components?.length
          ? h(
              "span",
              {
                class:
                  "text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[var(--p-primary-50)] text-[var(--p-primary-600)]",
                title: props.service.combo_components.map((c: any) => c.name).join(" + "),
              },
              t("services.table.combo"),
            )
          : null,
        props.service.variations?.length
          ? h(
              "span",
              {
                class:
                  "text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-purple-50 text-purple-600",
              },
              t("services.table.hasOptions", { count: props.service.variations.length }),
            )
          : null,
      ]),
    ]),
    h("span", { class: "inline-flex items-center gap-1.5 text-sm text-gray-700 flex-shrink-0 w-24" }, [
      h("i", { class: "pi pi-clock text-gray-400 text-xs" }),
      formatDurationLabel(props.service.duration_minutes),
    ]),
    h("span", { class: "inline-flex items-center gap-1 text-sm font-medium text-gray-800 flex-shrink-0 w-20" }, [
      h("i", { class: "pi pi-euro text-gray-400 text-xs" }),
      Number(props.service.price).toFixed(2),
    ]),
    h("i", {
      class: props.service.bookable_online
        ? "pi pi-check-circle text-green-600 flex-shrink-0"
        : "pi pi-minus text-gray-300 flex-shrink-0",
      title: t("services.dialog.bookableOnline"),
    }),
    h("div", { class: "flex gap-1 items-center flex-shrink-0" }, [
      h(
        "button",
        {
          type: "button",
          class: "p-2 rounded-full hover:bg-gray-100 text-gray-500",
          title: t("common.edit"),
          onClick: () => emit("edit"),
        },
        h("i", { class: "pi pi-pencil text-sm" }),
      ),
      h(
        "button",
        {
          type: "button",
          class: "p-2 rounded-full hover:bg-red-50 text-red-500",
          title: t("common.delete"),
          onClick: () => emit("delete"),
        },
        h("i", { class: "pi pi-trash text-sm" }),
      ),
    ]),
  ]);
ServiceRowBody.props = ["service"];
ServiceRowBody.emits = ["edit", "delete"];

onMounted(() => {
  fetchServices();
  fetchStaff();
});

const toast = useToast();
const confirm = useConfirm();

const services = ref<any[]>([]);
const staffList = ref<any[]>([]);
const loading = ref(true);
const dialogVisible = ref(false);
const search = ref("");
const isCombo = ref(false);
const hasVariations = ref(false);

const groupedServices = ref<{ label: string; items: any[] }[]>([]);
const uncategorizedGroup = ref<{ label: string; items: any[] }>({ label: "", items: [] });

const rebuildGroups = () => {
  const uncategorizedLabel = t("services.table.uncategorized");
  const grouped = groupServicesByCategory(services.value, uncategorizedLabel);
  groupedServices.value = grouped.filter((g) => g.label !== uncategorizedLabel);
  uncategorizedGroup.value = grouped.find((g) => g.label === uncategorizedLabel) || {
    label: uncategorizedLabel,
    items: [],
  };
};

const searchResults = computed(() => {
  if (!search.value) return [];
  const q = search.value.toLowerCase();
  return services.value.filter(
    (s) => s.name.toLowerCase().includes(q) || s.category?.toLowerCase().includes(q),
  );
});

const editingService = ref<any>({
  id: null,
  name: "",
  category: "",
  duration_minutes: 60,
  price: 0.0,
  color_code: "var(--p-primary-100)",
  bookable_online: false,
  default_staff_id: null,
  combo_component_ids: [],
  variations: [],
  staff_ids: [],
});

const allStaffChecked = computed(
  () => staffList.value.length > 0 && editingService.value.staff_ids?.length === staffList.value.length,
);

const toggleAllStaff = () => {
  editingService.value.staff_ids = allStaffChecked.value ? [] : staffList.value.map((s: any) => s.id);
};

// Services this one could list as combo components — everything except
// itself (a combo can't include itself as a part of itself).
const comboComponentOptions = computed(() =>
  services.value.filter((s: any) => s.id !== editingService.value.id),
);

const comboSummary = computed(() => {
  if (!isCombo.value || !editingService.value.combo_component_ids?.length) return "";
  const picked = comboComponentOptions.value.filter((s: any) =>
    editingService.value.combo_component_ids.includes(s.id),
  );
  const minutes = picked.reduce((sum: number, s: any) => sum + (s.duration_minutes || 0), 0);
  const price = picked.reduce((sum: number, s: any) => sum + Number(s.price || 0), 0);
  return t("services.dialog.comboComponentsSummary", {
    minutes,
    price: price.toFixed(2),
  });
});

watch(isCombo, (val) => {
  if (!val) editingService.value.combo_component_ids = [];
});

watch(hasVariations, (val) => {
  if (!val) editingService.value.variations = [];
  else if (!editingService.value.variations?.length) {
    editingService.value.variations = [{ name: "", duration_minutes: 30, price: 0 }];
  }
});

const fetchStaff = async () => {
  const token = localStorage.getItem("token");
  try {
    const res = await fetch("/api/v1/staff", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) staffList.value = await res.json();
  } catch (err) {
    // Non-critical — the default-staff dropdown and eligibility grid just stay empty.
  }
};

const categories = [
  "Hair",
  "Nails",
  "Massage",
  "Facial",
  "Makeup",
  "Waxing",
  "Other",
];

const categoryOptions = computed(() =>
  [...new Set([...categories, ...services.value.map((s: any) => (s.category || "").trim()).filter(Boolean)])].sort(
    (a, b) => a.localeCompare(b),
  ),
);

const fetchServices = async () => {
  const token = localStorage.getItem("token");
  try {
    const res = await fetch("/api/v1/services", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      services.value = await res.json();
      rebuildGroups();
    } else if (res.status === 401) {
      console.error("Unauthorized");
    }
    loading.value = false;
  } catch (err) {
    toast.add({
      severity: "error",
      summary: t('common.error'),
      detail: t('services.toast.loadFailed'),
      life: 3000,
    });
  }
};

const token = () => localStorage.getItem("token");

const onCategoryDragEnd = async () => {
  try {
    const res = await fetch("/api/v1/service-categories/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ order: groupedServices.value.map((g) => g.label) }),
    });
    if (!res.ok) throw new Error();
  } catch (err) {
    toast.add({ severity: "error", summary: t("common.error"), detail: t("services.toast.reorderFailed"), life: 3000 });
    fetchServices();
  }
};

const onServiceDragEnd = async (group: { items: any[] }) => {
  try {
    const res = await fetch("/api/v1/services/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ order: group.items.map((s) => s.id) }),
    });
    if (!res.ok) throw new Error();
  } catch (err) {
    toast.add({ severity: "error", summary: t("common.error"), detail: t("services.toast.reorderFailed"), life: 3000 });
    fetchServices();
  }
};

const openNew = () => {
  editingService.value = {
    name: "",
    category: "",
    duration_minutes: 60,
    price: 0.0,
    color_code: "var(--p-primary-100)",
    bookable_online: false,
    default_staff_id: null,
    combo_component_ids: [],
    variations: [],
    staff_ids: staffList.value.map((s: any) => s.id),
  };
  isCombo.value = false;
  hasVariations.value = false;
  dialogVisible.value = true;
};

const editService = (service: any) => {
  editingService.value = {
    ...service,
    combo_component_ids: (service.combo_components || []).map((c: any) => c.id),
    variations: (service.variations || []).map((v: any) => ({ ...v, price: Number(v.price) })),
    staff_ids: [...(service.eligible_staff_ids || [])],
  };
  isCombo.value = (service.combo_components || []).length > 0;
  hasVariations.value = (service.variations || []).length > 0;
  dialogVisible.value = true;
};

const saveService = async () => {
  if (!editingService.value.name || !editingService.value.category) {
    toast.add({
      severity: "warn",
      summary: t('common.required'),
      detail: t('services.toast.validationError'),
      life: 3000,
    });
    return;
  }

  const payload = { ...editingService.value };
  delete payload.combo_components;
  delete payload.eligible_staff_ids;
  if (!isCombo.value) payload.combo_component_ids = [];
  if (!hasVariations.value) payload.variations = [];

  if (payload.color_code && !payload.color_code.startsWith("#")) {
    payload.color_code = `#${payload.color_code}`;
  }

  const url = editingService.value.id
    ? `/api/v1/services/${editingService.value.id}`
    : "/api/v1/services";

  const method = editingService.value.id ? "PUT" : "POST";

  try {
    await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token()}`,
      },
      body: JSON.stringify(payload),
    });
    toast.add({
      severity: "success",
      summary: t('common.success'),
      detail: t('services.toast.saved'),
      life: 3000,
    });
    dialogVisible.value = false;
    fetchServices();
  } catch (err) {
    toast.add({
      severity: "error",
      summary: t('common.error'),
      detail: t('services.toast.saveFailed'),
      life: 3000,
    });
  }
};

const confirmDelete = (service: any) => {
  confirm.require({
    message: t('services.confirmDelete', { name: service.name }),
    header: t('common.confirmDelete'),
    icon: "pi pi-exclamation-triangle",
    accept: () => deleteService(service),
    reject: () => {},
  });
};

const deleteService = async (service: any) => {
  try {
    await fetch(`/api/v1/services/${service.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token()}` },
    });
    toast.add({
      severity: "success",
      summary: t('common.success'),
      detail: t('services.toast.deleted', { name: service.name }),
      life: 3000,
    });
    fetchServices();
  } catch (err) {
    toast.add({
      severity: "error",
      summary: t('common.error'),
      detail: t('services.toast.deleteFailed'),
      life: 3000,
    });
  }
};

const formatDurationLabel = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0
    ? t('services.duration.hoursMinutes', { h, m })
    : t('services.duration.minutes', { m });
};
</script>

<style scoped>
.drag-ghost {
  opacity: 0.4;
  background: var(--p-primary-50);
}
</style>
