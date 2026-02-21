<template>
  <router-view />

  <Toast />
</template>

<script setup lang="ts">
import Toast from "primevue/toast";
</script>

<style>
/* Προαιρετικά: Reset κάποιων βασικών styles */
body {
  margin: 0;
  padding: 0;
}
</style>
