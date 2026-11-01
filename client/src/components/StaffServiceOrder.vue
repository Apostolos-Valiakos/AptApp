<template>
  <div class="mt-3 rounded-lg border border-gray-200 p-3" data-testid="staff-service-order">
    <div class="text-sm font-medium text-gray-700">{{ t("staff.dialog.serviceOrder") }}</div>
    <div class="text-xs text-gray-400 mb-2">{{ t("staff.dialog.serviceOrderNote") }}</div>
    <div class="max-h-72 overflow-y-auto space-y-2">
      <draggable
        :modelValue="categories"
        item-key="label"
        handle=".order-category-handle"
        class="space-y-2"
        ghost-class="order-ghost"
        @update:modelValue="save($event, uncategorized)"
      >
        <template #item="{ element: group }">
          <div data-testid="order-category">
            <div class="flex items-center gap-2 py-1 text-xs font-extrabold text-gray-900 uppercase tracking-wide">
              <i class="pi pi-bars order-category-handle cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500"></i>
              {{ group.label }}
            </div>
            <draggable
              :modelValue="group.items"
              item-key="id"
              handle=".order-service-handle"
              ghost-class="order-ghost"
              @update:modelValue="setItems(group, $event)"
            >
              <template #item="{ element: service }">
                <div class="flex items-center gap-2 ml-4 px-2 py-1.5 text-sm text-gray-800 border-b border-gray-50 last:border-b-0" data-testid="order-service">
                  <i class="pi pi-bars order-service-handle cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 text-xs"></i>
                  {{ service.name }}
                </div>
              </template>
            </draggable>
          </div>
        </template>
      </draggable>
      <!-- Services with no category always come last, as in the picker. -->
      <div v-if="uncategorized" data-testid="order-category">
        <div class="py-1 pl-5 text-xs font-extrabold text-gray-900 uppercase tracking-wide">{{ uncategorized.label }}</div>
        <draggable
          :modelValue="uncategorized.items"
          item-key="id"
          handle=".order-service-handle"
          ghost-class="order-ghost"
          @update:modelValue="setItems(uncategorized, $event)"
        >
          <template #item="{ element: service }">
            <div class="flex items-center gap-2 ml-4 px-2 py-1.5 text-sm text-gray-800 border-b border-gray-50 last:border-b-0" data-testid="order-service">
              <i class="pi pi-bars order-service-handle cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 text-xs"></i>
              {{ service.name }}
            </div>
          </template>
        </draggable>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import draggable from "vuedraggable";
import { groupServicesByCategory, servicesInStaffOrder } from "../utils/serviceGroups";

const props = defineProps<{ modelValue: string[]; services: any[] }>();
const emit = defineEmits(["update:modelValue"]);
const { t } = useI18n();

const groups = computed(() =>
  groupServicesByCategory(servicesInStaffOrder(props.services, props.modelValue), t("services.table.uncategorized")),
);
const isUncategorized = (group: any) => !(group.items[0].category || "").trim();
const categories = computed(() => groups.value.filter((g) => !isUncategorized(g)));
const uncategorized = computed(() => groups.value.find(isUncategorized) || null);

// The order is one list of ids. Assigned services that aren't listed here (an
// archived one, say) stay assigned, at the end.
const save = (ordered: any[], last: any) => {
  const ids = [...ordered, ...(last ? [last] : [])].flatMap((g) => g.items.map((s: any) => s.id));
  emit("update:modelValue", [...ids, ...props.modelValue.filter((id) => !ids.includes(id))]);
};
const setItems = (group: any, items: any[]) => {
  const replace = (g: any) => (g.label === group.label ? { ...g, items } : g);
  save(categories.value.map(replace), uncategorized.value && replace(uncategorized.value));
};
</script>

<style scoped>
.order-ghost {
  opacity: 0.4;
}
</style>
