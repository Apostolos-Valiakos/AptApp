<template>
  <!-- PrimeVue's Dialog: closes with Esc, keeps the focus inside, and is
       announced as a dialog, like the app's other dialogs. -->
  <Dialog
    v-model:visible="visible"
    modal
    :header="t('scheduler.reorder.title')"
    :style="{ width: '28rem', maxWidth: '95vw' }"
    :contentStyle="{ maxHeight: '70vh' }"
    data-testid="staff-reorder"
  >
    <p class="text-sm text-gray-500 mb-4">{{ t("scheduler.reorder.hint") }}</p>

    <ul class="space-y-2">
      <li
        v-for="(staff, index) in localStaff"
        :key="staff.id"
        draggable="true"
        @dragstart="onDragStart($event, index)"
        @dragover.prevent
        @dragenter.prevent
        @drop="onDrop($event, index)"
        class="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-xl cursor-move hover:border-indigo-300 hover:shadow-md transition-all active:scale-[0.99]"
        :class="{ 'opacity-50 dashed-border': draggedIndex === index }"
        data-testid="staff-reorder-row"
      >
        <div class="text-gray-300 cursor-move">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h16M4 16h16"></path>
          </svg>
        </div>

        <div
          class="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden border border-gray-100 shrink-0"
        >
          <span class="font-bold text-xs text-gray-500">{{ initials(staff.name) }}</span>
        </div>

        <span class="font-medium text-gray-700 select-none">{{ staff.name }}</span>
      </li>
    </ul>

    <template #footer>
      <Button :label="t('common.cancel')" text @click="visible = false" />
      <Button :label="t('scheduler.reorder.save')" data-testid="staff-reorder-save" @click="saveOrder" />
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { initials } from "../utils/avatar";
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const props = defineProps<{
  staffList: any[];
}>();

const emit = defineEmits(["save"]);
const visible = defineModel<boolean>("visible", { default: false });

const localStaff = ref<any[]>([]);
const draggedIndex = ref<number | null>(null);

// Sync local state when modal opens
watch(
  () => visible.value,
  (newVal) => {
    if (newVal) {
      localStaff.value = [...props.staffList];
    }
  },
);


// --- Drag & Drop Logic ---
const onDragStart = (e: DragEvent, index: number) => {
  draggedIndex.value = index;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.dropEffect = "move";
  }
};

const onDrop = (e: DragEvent, index: number) => {
  if (draggedIndex.value === null) return;

  const itemToMove = localStaff.value[draggedIndex.value];
  localStaff.value.splice(draggedIndex.value, 1); // Remove from old pos
  localStaff.value.splice(index, 0, itemToMove); // Insert at new pos

  draggedIndex.value = null;
};

const saveOrder = () => {
  emit("save", localStaff.value);
  visible.value = false;
};
</script>

<style scoped>
.dashed-border {
  border-style: dashed;
  background-color: #f9fafb;
}
</style>
