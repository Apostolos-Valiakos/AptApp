<template>
  <!-- The assistant in a dialog (the portal before the redesign). -->
  <Dialog
    v-model:visible="visible"
    modal
    :header="t('portal.ai.title')"
    :style="{ width: '440px', maxWidth: '96vw' }"
    :contentStyle="{ padding: 0 }"
  >
    <div class="h-[70vh]">
      <AiChat />
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import Dialog from "primevue/dialog";
import AiChat from "./AiChat.vue";

const visible = defineModel<boolean>("visible", { default: false });
const { t } = useI18n();
</script>
