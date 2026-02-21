<template>
  <div
    v-if="visible"
    class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
  >
    <div
      class="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]"
    >
      <div
        class="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50"
      >
        <h3 class="font-bold text-gray-800 text-lg">Reorder Staff</h3>
        <button
          @click="$emit('update:visible', false)"
          class="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <i class="pi pi-times text-xl"></i>
        </button>
      </div>

      <div class="p-4 overflow-y-auto">
        <p class="text-sm text-gray-500 mb-4">
          Drag and drop to change column order.
        </p>

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
          >
            <div class="text-gray-300 cursor-move">
              <svg
                class="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M4 8h16M4 16h16"
                ></path>
              </svg>
            </div>

            <div
              class="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden border border-gray-100 shrink-0"
            >
              <span class="font-bold text-xs text-gray-500">{{
                getInitials(staff.name)
              }}</span>
            </div>

            <span class="font-medium text-gray-700 select-none">{{
              staff.name
            }}</span>
          </li>
        </ul>
      </div>

      <div
        class="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3"
      >
        <button
          @click="$emit('update:visible', false)"
          class="px-4 py-2 text-gray-600 font-medium hover:bg-gray-200 rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          @click="saveOrder"
          class="px-6 py-2 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 shadow-lg shadow-primary-200 transition-all active:scale-95"
        >
          Save Order
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";

const props = defineProps<{
  visible: boolean;
  staffList: any[];
}>();

const emit = defineEmits(["update:visible", "save"]);

const localStaff = ref<any[]>([]);
const draggedIndex = ref<number | null>(null);

// Sync local state when modal opens
watch(
  () => props.visible,
  (newVal) => {
    if (newVal) {
      localStaff.value = [...props.staffList];
    }
  },
);

const getInitials = (name: string) => {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();
};

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
  emit("update:visible", false);
};
</script>

<style scoped>
.dashed-border {
  border-style: dashed;
  background-color: #f9fafb;
}
</style>
