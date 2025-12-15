<template>
  <div
    v-if="!isLoggedIn"
    class="d-flex align-center justify-center fill-height bg-grey-lighten-4"
  >
    <LoginView />
  </div>
  <Layout v-else />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useAuthStore } from "./stores/auth";
import Layout from "./components/Layout.vue";
import LoginView from "./views/LoginView.vue";

const authStore = useAuthStore();
const isLoggedIn = computed(() => authStore.isAuthenticated);
</script>
