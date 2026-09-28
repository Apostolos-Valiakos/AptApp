<template>
  <Dialog
    v-model:visible="visibleModel"
    modal
    :showHeader="false"
    :style="{ width: '32rem', maxWidth: '95vw' }"
    :contentStyle="{ padding: 0 }"
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

      <div class="flex-1 overflow-y-auto px-5 pb-5">
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
              class="border border-gray-200 rounded-xl overflow-hidden"
            >
              <!-- Flat, single-price service -->
              <button
                v-if="!svc.variations || svc.variations.length === 0"
                type="button"
                class="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                @click="pick(svc, null)"
              >
                <span class="text-sm font-semibold text-gray-900">{{ svc.name }}</span>
                <span class="flex items-center gap-3 flex-shrink-0">
                  <span class="text-sm text-gray-500 whitespace-nowrap">
                    {{ formatPrice(svc.price) }}
                  </span>
                  <span class="text-sm text-gray-400 whitespace-nowrap">
                    {{ formatDuration(svc.duration_minutes) }}
                  </span>
                  <span class="w-5 h-5 rounded-full border-2 border-gray-300 flex-shrink-0"></span>
                </span>
              </button>

              <!-- Service with multiple variations -->
              <template v-else>
                <button
                  type="button"
                  class="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                  @click="toggleExpand(svc.id)"
                >
                  <span class="text-sm font-semibold text-gray-900">{{ svc.name }}</span>
                  <i
                    class="pi text-gray-400 flex-shrink-0"
                    :class="expandedId === svc.id ? 'pi-chevron-up' : 'pi-chevron-down'"
                  ></i>
                </button>
                <div v-if="expandedId === svc.id" class="border-t border-gray-100 bg-gray-50/60">
                  <button
                    v-for="variation in svc.variations"
                    :key="variation.id"
                    type="button"
                    class="w-full flex items-center justify-between gap-3 pl-6 pr-4 py-2.5 text-left hover:bg-white transition-colors border-b last:border-b-0 border-gray-100"
                    @click="pick(svc, variation)"
                  >
                    <span class="text-sm text-gray-800">{{ variation.name }}</span>
                    <span class="flex items-center gap-3 flex-shrink-0">
                      <span class="text-sm text-gray-500 whitespace-nowrap">
                        {{ formatPrice(variation.price) }}
                      </span>
                      <span class="text-sm text-gray-400 whitespace-nowrap">
                        {{ formatDuration(variation.duration_minutes) }}
                      </span>
                      <span class="w-5 h-5 rounded-full border-2 border-gray-300 flex-shrink-0"></span>
                    </span>
                  </button>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { groupServicesByCategory } from "../../utils/serviceGroups";

const { t } = useI18n();

const props = defineProps<{
  visible: boolean;
  services: any[];
  staff: any[];
  currentStaffId?: string | null;
}>();

const emit = defineEmits<{
  "update:visible": [boolean];
  picked: [{ service_id: string; name: string; duration_minutes: number; price: number }];
}>();

const visibleModel = computed({
  get: () => props.visible,
  set: (v) => emit("update:visible", v),
});

const search = ref("");
const staffFilterId = ref<string | null>(null);
const expandedId = ref<string | null>(null);

watch(
  () => props.visible,
  (v) => {
    if (!v) return;
    search.value = "";
    expandedId.value = null;
    staffFilterId.value = props.currentStaffId || null;
  },
);

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
  expandedId.value = expandedId.value === id ? null : id;
};

const formatPrice = (price: number) => `${Number(price).toFixed(2).replace(/\.00$/, "")} €`;

const formatDuration = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? t("services.duration.hoursMinutes", { h, m }) : t("services.duration.minutes", { m });
};

const pick = (svc: any, variation: any | null) => {
  emit("picked", {
    service_id: svc.id,
    name: variation ? `${svc.name} — ${variation.name}` : svc.name,
    duration_minutes: variation ? variation.duration_minutes : svc.duration_minutes,
    price: Number(variation ? variation.price : svc.price),
  });
  visibleModel.value = false;
};
</script>
