<template>
  <router-view />

  <Toast />
</template>

<script setup lang="ts">
import Toast from "primevue/toast";
</script>

<style>
/* Προαιρετικά: Reset κάποιων βασικών styles */
html,
body {
  margin: 0;
  padding: 0;
  font-family:
    "Manrope",
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    Roboto,
    "Helvetica Neue",
    Arial,
    sans-serif;
}
</style>
