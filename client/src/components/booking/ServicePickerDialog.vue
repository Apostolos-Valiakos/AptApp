<template>
  <Dialog
    v-model:visible="visibleModel"
    modal
    :showHeader="false"
    :style="{ width: '32rem', maxWidth: '95vw' }"
    :contentStyle="{ padding: 0 }"
    @show="scrollToCurrent"
  >
    <div class="flex flex-col max-h-[85vh]">
      <div class="flex items-center justify-between px-5 pt-5 pb-3">
        <div class="flex items-center gap-3">
          <button
            type="button"
            class="text-gray-400 hover:text-gray-700"
            @click="visibleModel = false"
          >
            <i class="pi pi-arrow-left text-lg"></i>
          </button>
          <h3 class="text-xl font-bold text-gray-900">
            {{ t("servicePicker.title") }}
          </h3>
        </div>
        <button
          type="button"
          class="text-gray-400 hover:text-gray-700"
          @click="visibleModel = false"
        >
          <i class="pi pi-times text-lg"></i>
        </button>
      </div>

      <div class="px-5 pb-3">
        <span class="p-input-icon-left w-full block">
          <i class="pi pi-search"></i>
          <InputText
            v-model="search"
            :placeholder="t('servicePicker.searchPlaceholder')"
            class="w-full"
          />
        </span>
      </div>

      <div v-if="staffFilter" class="px-5 pb-3">
        <span
          class="inline-flex items-center gap-2 bg-[var(--p-primary-color)] text-white text-sm font-medium pl-3 pr-2 py-1.5 rounded-full"
        >
          {{ t("servicePicker.servicesFrom", { name: staffFilter.name }) }}
          <button
            type="button"
            class="hover:opacity-75"
            @click="staffFilterId = null"
          >
            <i class="pi pi-times text-xs"></i>
          </button>
        </span>
      </div>

      <div ref="listEl" class="flex-1 overflow-y-auto px-5 pb-5">
        <div v-if="groupedServices.length === 0" class="text-center text-gray-400 py-10 text-sm">
          {{ t("servicePicker.noResults") }}
        </div>
        <div v-for="group in groupedServices" :key="group.label" class="mb-6">
          <h4 class="text-xs font-extrabold text-gray-900 uppercase tracking-wide mb-2">
            {{ group.label }}
          </h4>
          <div class="space-y-2">
            <div
              v-for="svc in group.items"
              :key="svc.id"
              :data-service-id="svc.id"
              class="border rounded-xl overflow-hidden"
              :class="hasSelected(svc) ? 'border-[var(--p-primary-color)] ring-1 ring-[var(--p-primary-color)]' : 'border-gray-200'"
            >
              <!-- Flat, single-price service -->
              <button
                v-if="!svc.variations || svc.variations.length === 0"
                type="button"
                class="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                :aria-pressed="isSelected(svc, null)"
                @click="toggle(svc, null)"
              >
                <span class="text-sm font-semibold text-gray-900">{{ svc.name }}</span>
                <span class="flex items-center gap-3 flex-shrink-0">
                  <span class="text-sm text-gray-500 whitespace-nowrap">
                    {{ formatPrice(svc.price) }}
                  </span>
                  <span class="text-sm text-gray-400 whitespace-nowrap">
                    {{ formatDuration(svc.duration_minutes) }}
                  </span>
                  <span class="picker-check" :class="{ 'is-checked': isSelected(svc, null) }">
                    <template v-if="isSelected(svc, null)">{{ orderLabel(svc, null) }}</template>
                  </span>
                </span>
              </button>

              <!-- Service with multiple variations: each variation is ticked on its own -->
              <template v-else>
                <button
                  type="button"
                  class="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                  @click="toggleExpand(svc.id)"
                >
                  <span class="text-sm font-semibold text-gray-900">
                    {{ svc.name }}
                    <span v-if="selectedCountOf(svc)" class="ml-1 text-xs font-bold text-[var(--p-primary-700)]">· {{ selectedCountOf(svc) }}</span>
                  </span>
                  <i
                    class="pi text-gray-400 flex-shrink-0"
                    :class="expanded.has(svc.id) ? 'pi-chevron-up' : 'pi-chevron-down'"
                  ></i>
                </button>
                <div v-if="expanded.has(svc.id)" class="border-t border-gray-100 bg-gray-50/60">
                  <button
                    v-for="variation in svc.variations"
                    :key="variation.id"
                    type="button"
                    class="w-full flex items-center justify-between gap-3 pl-6 pr-4 py-2.5 text-left hover:bg-white transition-colors border-b last:border-b-0 border-gray-100"
                    :aria-pressed="isSelected(svc, variation)"
                    :data-variation-name="variation.name"
                    @click="toggle(svc, variation)"
                  >
                    <span class="text-sm text-gray-800">{{ variation.name }}</span>
                    <span class="flex items-center gap-3 flex-shrink-0">
                      <span class="text-sm text-gray-500 whitespace-nowrap">
                        {{ formatPrice(variation.price) }}
                      </span>
                      <span class="text-sm text-gray-400 whitespace-nowrap">
                        {{ formatDuration(variation.duration_minutes) }}
                      </span>
                      <span class="picker-check" :class="{ 'is-checked': isSelected(svc, variation) }">
                        <template v-if="isSelected(svc, variation)">{{ orderLabel(svc, variation) }}</template>
                      </span>
                    </span>
                  </button>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>

      <!-- Ticked services are added in the order they were ticked. -->
      <div class="flex items-center justify-between gap-3 px-5 py-3 border-t border-gray-100 bg-white">
        <span class="text-sm text-gray-500">
          {{ selected.length ? t("servicePicker.selectedCount", { n: selected.length }) : t("servicePicker.selectHint") }}
        </span>
        <Button
          :label="selected.length > 1 ? t('servicePicker.addCount', { n: selected.length }) : t('servicePicker.add')"
          :disabled="selected.length === 0"
          data-testid="service-picker-confirm"
          @click="confirm"
        />
      </div>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { formatMoney } from "../../utils/format";
import { ref, computed, watch, nextTick } from "vue";
import { useI18n } from "vue-i18n";
import { groupServicesByCategory } from "../../utils/serviceGroups";

const { t } = useI18n();

const props = defineProps<{
  visible: boolean;
  services: any[];
  staff: any[];
  currentStaffId?: string | null;
  // The service already on the row being edited, if any: the list opens
  // scrolled to it, with its variations expanded and the current one marked.
  currentServiceId?: string | null;
  currentVariationName?: string | null;
}>();

export type PickedService = {
  service_id: string;
  name: string;
  variation_name: string | null;
  duration_minutes: number;
  price: number;
};

const emit = defineEmits<{
  "update:visible": [boolean];
  // In the order they were ticked.
  picked: [PickedService[]];
}>();

const visibleModel = computed({
  get: () => props.visible,
  set: (v) => emit("update:visible", v),
});

const search = ref("");
const staffFilterId = ref<string | null>(null);
const expanded = ref(new Set<string>());

// What's ticked, in ticking order. A service with variations is ticked per
// variation; a plain one by itself.
const keyOf = (svc: any, variation: any | null) => `${svc.id}::${variation ? variation.name : ""}`;
const itemFor = (svc: any, variation: any | null): PickedService => ({
  service_id: svc.id,
  name: variation ? `${svc.name} — ${variation.name}` : svc.name,
  // Persisted separately (appointment_services.variation_name) so which
  // variation this row is stays known even after its price/duration are
  // later edited — see utils/serviceVariations.ts.
  variation_name: variation ? variation.name : null,
  duration_minutes: variation ? variation.duration_minutes : svc.duration_minutes,
  price: Number(variation ? variation.price : svc.price),
});
const selected = ref<{ key: string; item: PickedService }[]>([]);

watch(
  () => props.visible,
  (v) => {
    if (!v) return;
    search.value = "";
    staffFilterId.value = props.currentStaffId || null;
    selected.value = [];
    expanded.value = new Set();
    // Opened from a row that has a service: it starts ticked (Add without
    // changes keeps it), with its variations shown.
    const current = props.services.find((s: any) => s.id === props.currentServiceId);
    if (current) {
      const variation = current.variations?.length
        ? current.variations.find((x: any) => x.name === props.currentVariationName) || null
        : null;
      if (current.variations?.length) expanded.value.add(current.id);
      if (!current.variations?.length || variation) {
        selected.value = [{ key: keyOf(current, variation), item: itemFor(current, variation) }];
      }
    }
  },
);

const isSelected = (svc: any, variation: any | null) => selected.value.some((x) => x.key === keyOf(svc, variation));
const selectedCountOf = (svc: any) => selected.value.filter((x) => x.item.service_id === svc.id).length;
const hasSelected = (svc: any) => selectedCountOf(svc) > 0;
// The tick shows its place in the order once there's more than one.
const orderLabel = (svc: any, variation: any | null) =>
  selected.value.length > 1 ? String(selected.value.findIndex((x) => x.key === keyOf(svc, variation)) + 1) : "✓";

const toggle = (svc: any, variation: any | null) => {
  const key = keyOf(svc, variation);
  const at = selected.value.findIndex((x) => x.key === key);
  if (at >= 0) selected.value.splice(at, 1);
  else selected.value.push({ key, item: itemFor(svc, variation) });
};

const confirm = () => {
  if (selected.value.length === 0) return;
  emit("picked", selected.value.map((x) => x.item));
  visibleModel.value = false;
};

const listEl = ref<HTMLElement | null>(null);

// Runs once the dialog is shown, so the list is rendered and measurable.
const scrollToCurrent = async () => {
  if (!props.currentServiceId) return;
  await nextTick();
  const el = listEl.value?.querySelector<HTMLElement>(
    `[data-service-id="${CSS.escape(String(props.currentServiceId))}"]`,
  );
  el?.scrollIntoView({ block: "center" });
};

const staffFilter = computed(() =>
  staffFilterId.value ? props.staff.find((s) => s.id === staffFilterId.value) : null,
);

const filteredServices = computed(() => {
  let list = props.services;
  if (staffFilterId.value) {
    const staffMember = props.staff.find((s) => s.id === staffFilterId.value);
    const eligibleIds: string[] = staffMember?.service_ids || [];
    if (eligibleIds.length > 0) {
      list = list.filter((s: any) => eligibleIds.includes(s.id));
    }
  }
  const q = search.value.trim().toLowerCase();
  if (q) {
    list = list.filter((s: any) => s.name.toLowerCase().includes(q));
  }
  return list;
});

const groupedServices = computed(() =>
  groupServicesByCategory(filteredServices.value, t("services.table.uncategorized")),
);

const toggleExpand = (id: string) => {
  const next = new Set(expanded.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expanded.value = next;
};

const formatPrice = (price: number) => formatMoney(price, { compact: true });

const formatDuration = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? t("services.duration.hoursMinutes", { h, m }) : t("services.duration.minutes", { m });
};

</script>

<style scoped>
/* A square tick box; shows ✓, or the order number when several are ticked. */
.picker-check {
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 0.3rem;
  border: 2px solid rgb(209 213 219);
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  font-weight: 700;
  color: white;
}
.picker-check.is-checked {
  background: var(--p-primary-color);
  border-color: var(--p-primary-color);
}
</style>
