<template>
  <div class="h-full flex flex-col">
    <div class="flex justify-between items-center mb-4 px-1">
      <h3 class="font-bold text-gray-700">Exercise Progress</h3>
      <Button
        label="New Exercise"
        icon="pi pi-plus"
        size="small"
        text
        @click="showAddDialog = true"
      />
    </div>

    <div v-if="loading" class="text-center py-4 text-gray-400">
      <i class="pi pi-spin pi-spinner text-xl"></i>
    </div>

    <div v-else class="flex-1 overflow-y-auto space-y-6 pr-2">
      <div v-for="(group, category) in groupedExercises" :key="category">
        <h4
          class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 border-b border-gray-100 pb-1"
        >
          {{ category }}
        </h4>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div
            v-for="ex in group"
            :key="ex.id"
            class="group rounded-lg border transition-all duration-200 overflow-hidden"
            :class="
              isCompleted(ex.id)
                ? 'bg-green-50 border-green-200'
                : 'bg-white border-gray-200 hover:border-indigo-300'
            "
          >
            <div
              class="flex items-center gap-3 p-2 cursor-pointer select-none"
              @click="toggleExercise(ex.id)"
            >
              <div
                class="w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 transition-colors"
                :class="
                  isCompleted(ex.id)
                    ? 'bg-green-500 border-green-500'
                    : 'bg-white border-gray-300'
                "
              >
                <i
                  v-if="isCompleted(ex.id)"
                  class="pi pi-check text-white text-xs font-bold"
                ></i>
              </div>

              <div class="flex-1 min-w-0">
                <div
                  class="text-sm font-medium text-gray-900 truncate"
                  style="text-wrap: auto"
                >
                  {{ ex.name }}
                </div>
              </div>

              <div class="flex items-center gap-1">
                <Button
                  v-if="ex.description"
                  :icon="
                    isExpanded(ex.id)
                      ? 'pi pi-chevron-up'
                      : 'pi pi-chevron-down'
                  "
                  class="p-button-rounded p-button-text p-button-sm w-7 h-7 text-gray-400"
                  @click.stop="toggleExpand(ex.id)"
                />

                <Button
                  v-if="authStore.isOwner"
                  icon="pi pi-trash"
                  class="p-button-rounded p-button-danger p-button-text p-button-sm w-7 h-7 opacity-0 group-hover:opacity-100 transition-opacity"
                  @click.stop="deleteExercise(ex.id)"
                />
              </div>
            </div>

            <div
              v-if="isExpanded(ex.id) && ex.description"
              class="px-10 pb-3 text-xs text-gray-500 animate-fade-in"
            >
              {{ ex.description }}
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="exercises.length === 0"
        class="text-center py-8 text-gray-400 italic"
      >
        No exercises found. Add one to get started.
      </div>
    </div>

    <Dialog
      v-model:visible="showAddDialog"
      header="Add New Exercise"
      modal
      class="w-96"
    >
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-bold text-gray-700 mb-1">Name</label>
          <InputText
            v-model="newExercise.name"
            class="w-full"
            placeholder="e.g. Squat"
          />
        </div>
        <div>
          <label class="block text-sm font-bold text-gray-700 mb-1"
            >Category</label
          >
          <Dropdown
            v-model="newExercise.category"
            :options="categoryOptions"
            editable
            class="w-full"
            placeholder="Select existing or type new..."
          />
        </div>
        <div>
          <label class="block text-sm font-bold text-gray-700 mb-1"
            >Description (Optional)</label
          >
          <InputText
            v-model="newExercise.description"
            class="w-full"
            placeholder="Brief instructions..."
          />
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" text @click="showAddDialog = false" />
        <Button
          label="Save"
          @click="createExercise"
          :disabled="!newExercise.name"
        />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import Dropdown from "primevue/dropdown";
import { useAuthStore } from "../stores/auth";

const props = defineProps(["clientId"]);
const authStore = useAuthStore();

const exercises = ref<any[]>([]);
const completedIds = ref<Set<string>>(new Set());
// CHANGED: New state to track which descriptions are open
const expandedIds = ref<Set<string>>(new Set());

const loading = ref(false);
const showAddDialog = ref(false);
const newExercise = ref({ name: "", category: "", description: "" });

// ... [Existing loadData function remains exactly the same] ...
const loadData = async () => {
  if (!props.clientId) return;
  loading.value = true;
  const token = localStorage.getItem("token");

  try {
    const resList = await fetch("/api/v1/exercises", {
      headers: { Authorization: `Bearer ${token}` },
    });
    exercises.value = await resList.json();

    const resStatus = await fetch(
      `/api/v1/clients/${props.clientId}/exercises`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const ids = await resStatus.json();
    completedIds.value = new Set(ids);
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
};

onMounted(loadData);
watch(() => props.clientId, loadData);

// Helpers
const isCompleted = (id: string) => completedIds.value.has(id);
// CHANGED: New Helper for expansion
const isExpanded = (id: string) => expandedIds.value.has(id);

const groupedExercises = computed(() => {
  const groups: any = {};
  exercises.value.forEach((ex) => {
    const cat = ex.category || "General";
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(ex);
  });
  return groups;
});

const categoryOptions = computed(() => {
  const categories = Object.keys(groupedExercises.value);
  return categories.sort();
});

// Actions
const toggleExercise = async (exerciseId: string) => {
  const isCurrentlyDone = completedIds.value.has(exerciseId);
  const newState = !isCurrentlyDone;

  if (newState) completedIds.value.add(exerciseId);
  else completedIds.value.delete(exerciseId);

  try {
    const token = localStorage.getItem("token");
    await fetch(`/api/v1/clients/${props.clientId}/exercises/toggle`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ exerciseId, completed: newState }),
    });
  } catch (e) {
    console.error("Failed to toggle", e);
    if (newState) completedIds.value.delete(exerciseId);
    else completedIds.value.add(exerciseId);
  }
};

// CHANGED: New Action to toggle description visibility
const toggleExpand = (id: string) => {
  if (expandedIds.value.has(id)) {
    expandedIds.value.delete(id);
  } else {
    expandedIds.value.add(id);
  }
};

const createExercise = async () => {
  const token = localStorage.getItem("token");
  const payload = {
    ...newExercise.value,
    category: newExercise.value.category || "General",
  };

  try {
    const res = await fetch("/api/v1/exercises", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const added = await res.json();
      exercises.value.push(added);
      showAddDialog.value = false;
      newExercise.value = { name: "", category: "", description: "" };
    }
  } catch (e) {
    console.error(e);
  }
};

const deleteExercise = async (id: string) => {
  if (
    !confirm(
      "Are you sure you want to delete this exercise? This will remove it for ALL clients."
    )
  ) {
    return;
  }

  const token = localStorage.getItem("token");
  try {
    const res = await fetch(`/api/v1/exercises/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      exercises.value = exercises.value.filter((ex) => ex.id !== id);
      completedIds.value.delete(id);
    } else {
      alert("Failed to delete exercise");
    }
  } catch (e) {
    console.error("Delete failed", e);
  }
};
</script>

<style scoped>
/* Optional: Simple animation for the description appearing */
.animate-fade-in {
  animation: fadeIn 0.2s ease-in-out;
}
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
