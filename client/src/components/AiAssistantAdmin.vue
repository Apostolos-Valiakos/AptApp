<template>
  <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
    <div class="flex justify-between items-center">
      <div>
        <h3 class="text-lg font-bold text-gray-900">{{ t("profile.aiAssistant.title") }}</h3>
        <p class="text-sm text-gray-500 max-w-xl">{{ t("profile.aiAssistant.description") }}</p>
      </div>
      <ToggleSwitch :modelValue="enabled" :disabled="saving" @update:modelValue="saveEnabled" />
    </div>

    <div class="border-t border-gray-100 mt-6 pt-5">
      <div class="flex justify-between items-center gap-3 mb-1">
        <h4 class="text-sm font-bold text-gray-800">{{ t("profile.aiAssistant.documents") }}</h4>
        <Button
          :label="t('profile.aiAssistant.upload')"
          icon="pi pi-upload"
          size="small"
          outlined
          :loading="uploading"
          @click="fileInput?.click()"
        />
        <input
          ref="fileInput"
          type="file"
          class="hidden"
          accept=".pdf,.docx,.md,.txt"
          @change="onFilePicked"
        />
      </div>
      <p class="text-xs text-gray-400 mb-3">{{ t("profile.aiAssistant.documentsHint") }}</p>

      <p v-if="unavailable" class="text-sm text-amber-600">
        {{ t("profile.aiAssistant.unavailable") }}
      </p>
      <p v-else-if="!documents.length" class="text-sm text-gray-400">
        {{ t("profile.aiAssistant.noDocuments") }}
      </p>
      <div
        v-for="doc in documents"
        :key="doc.id"
        class="flex items-center justify-between gap-3 py-2 border-b border-gray-50 last:border-b-0"
      >
        <div class="min-w-0">
          <div class="text-sm font-medium text-gray-800 truncate">{{ doc.filename }}</div>
          <div class="text-xs text-gray-400">
            {{ (doc.size / 1024).toFixed(0) }} KB ·
            {{ new Date(doc.uploaded_at * 1000).toLocaleDateString() }}
          </div>
        </div>
        <Button
          icon="pi pi-trash"
          severity="danger"
          text
          size="small"
          @click="removeDocument(doc)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useToast } from "primevue/usetoast";

const { t } = useI18n();
const toast = useToast();

const enabled = ref(false);
const saving = ref(false);
const documents = ref<any[]>([]);
const uploading = ref(false);
const unavailable = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

const auth = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

const fail = (detail: string) =>
  toast.add({ severity: "error", summary: t("common.error"), detail, life: 4000 });

const loadDocuments = async () => {
  try {
    const res = await fetch("/ai/documents", { headers: auth() });
    if (!res.ok) throw new Error();
    documents.value = await res.json();
    unavailable.value = false;
  } catch {
    unavailable.value = true;
  }
};

onMounted(async () => {
  try {
    const res = await fetch("/api/v1/shop", { headers: auth() });
    if (res.ok) enabled.value = !!(await res.json()).ai_assistant_enabled;
  } catch {}
  loadDocuments();
});

const saveEnabled = async (value: boolean) => {
  saving.value = true;
  try {
    const res = await fetch("/api/v1/shop/ai-assistant", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...auth() },
      body: JSON.stringify({ ai_assistant_enabled: value }),
    });
    if (!res.ok) throw new Error();
    enabled.value = value;
  } catch {
    fail(t("profile.toast.saveFailed"));
  } finally {
    saving.value = false;
  }
};

const onFilePicked = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  target.value = "";
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) return fail(t("profile.aiAssistant.tooLarge"));
  uploading.value = true;
  try {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/ai/documents", { method: "POST", headers: auth(), body });
    if (!res.ok) throw new Error();
    await loadDocuments();
  } catch {
    fail(t("profile.aiAssistant.uploadFailed"));
  } finally {
    uploading.value = false;
  }
};

const removeDocument = async (doc: any) => {
  try {
    const res = await fetch(`/ai/documents/${doc.id}`, { method: "DELETE", headers: auth() });
    if (!res.ok) throw new Error();
    documents.value = documents.value.filter((d) => d.id !== doc.id);
  } catch {
    fail(t("profile.aiAssistant.deleteFailed"));
  }
};
</script>
