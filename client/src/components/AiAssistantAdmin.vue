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
            {{ formatDate(doc.uploaded_at * 1000, locale) }}
          </div>
        </div>
        <Button
          icon="pi pi-trash"
          severity="danger"
          text
          size="small"
          :aria-label="t('profile.aiAssistant.deleteTitle')"
          @click="removeDocument(doc)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useConfirm } from "primevue/useconfirm";
import { api } from "../api/http";
import { askConfirm } from "../utils/confirm";
import { formatDate } from "../utils/format";
import { useNotify } from "../composables/useNotify";

const { t, locale } = useI18n();
const confirm = useConfirm();
const notify = useNotify();

const enabled = ref(false);
const saving = ref(false);
const documents = ref<any[]>([]);
const uploading = ref(false);
const unavailable = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

const fail = (detail: string) => notify.error(detail);

const loadDocuments = async () => {
  try {
    documents.value = await api.get("/ai/documents");
    unavailable.value = false;
  } catch {
    unavailable.value = true;
  }
};

onMounted(async () => {
  try {
    enabled.value = !!(await api.get("/api/v1/shop"))?.ai_assistant_enabled;
  } catch {}
  loadDocuments();
});

const saveEnabled = async (value: boolean) => {
  saving.value = true;
  try {
    await api.put("/api/v1/shop/ai-assistant", { ai_assistant_enabled: value });
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
    await api.upload("/ai/documents", body);
    await loadDocuments();
  } catch {
    fail(t("profile.aiAssistant.uploadFailed"));
  } finally {
    uploading.value = false;
  }
};

// The assistant stops answering from a document as soon as it's removed.
const removeDocument = async (doc: any) => {
  const yes = await askConfirm(confirm, {
    header: t("profile.aiAssistant.deleteTitle"),
    message: t("profile.aiAssistant.deleteMessage", { name: doc.filename }),
    icon: "pi pi-exclamation-triangle",
    acceptLabel: t("common.delete"),
    rejectLabel: t("common.cancel"),
  });
  if (!yes) return;
  try {
    await api.del(`/ai/documents/${encodeURIComponent(doc.id)}`);
    documents.value = documents.value.filter((d) => d.id !== doc.id);
  } catch {
    fail(t("profile.aiAssistant.deleteFailed"));
  }
};
</script>
