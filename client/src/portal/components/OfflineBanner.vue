<template>
  <!-- No connection, or the last load failed: what's shown may be old. -->
  <Message v-if="!online || stale" severity="warn" :closable="false" icon="pi pi-wifi" data-testid="offline-banner">
    {{ t("portal.v2.home.offline") }}
  </Message>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import Message from "primevue/message";
import { useNetwork } from "../composables/useNetwork";

defineProps<{ stale?: boolean }>();
const { t } = useI18n();
const { online } = useNetwork();
</script>
