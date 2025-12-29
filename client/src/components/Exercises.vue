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
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div
            v-for="ex in group"
            :key="ex.id"
            class="group relative flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer"
            :class="
              isCompleted(ex.id)
                ? 'bg-green-50 border-green-200'
                : 'bg-white border-gray-200 hover:border-indigo-300'
            "
            @click="toggleExercise(ex.id)"
          >
            <div
              class="w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors"
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
              <div class="text-sm font-medium text-gray-900">
                {{ ex.name }}
              </div>
              <div
                v-if="ex.description"
                class="text-xs text-gray-500 mt-0.5 truncate"
              >
                {{ ex.description }}
              </div>
            </div>

            <Button
              v-if="authStore.isOwner"
              icon="pi pi-trash"
              class="p-button-rounded p-button-danger p-button-text p-button-sm opacity-0 group-hover:opacity-100 transition-opacity absolute top-1 right-1 h-8 w-8"
              @click.stop="deleteExercise(ex.id)"
            />
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
// 1. Import Auth Store
import { useAuthStore } from "../stores/auth";

const props = defineProps(["clientId"]);
// 2. Init Auth Store
const authStore = useAuthStore();

const exercises = ref<any[]>([]);
const completedIds = ref<Set<string>>(new Set());
const loading = ref(false);
const showAddDialog = ref(false);
const newExercise = ref({ name: "", category: "", description: "" });

// Fetch Data
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

// 3. New Delete Action
const deleteExercise = async (id: string) => {
  // Simple browser confirm (or replace with PrimeVue ConfirmDialog if preferred)
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
      // Remove locally from the list
      exercises.value = exercises.value.filter((ex) => ex.id !== id);
      // Remove from completed set if it was there
      completedIds.value.delete(id);
    } else {
      alert("Failed to delete exercise");
    }
  } catch (e) {
    console.error("Delete failed", e);
  }
};
</script>
