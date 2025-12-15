<template>
  <div
    class="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-100 to-purple-100"
  >
    <div class="max-w-md w-full bg-white rounded-xl shadow-2xl p-8">
      <div class="text-center mb-8">
        <h1 class="text-4xl font-bold text-indigo-600">Fresha Clone</h1>
        <p class="text-gray-600 mt-2">Business Scheduling System</p>
      </div>
      <form @submit.prevent="login" class="space-y-6">
        <div>
          <label class="block text-sm font-medium text-gray-700"
            >Username</label
          >
          <input
            v-model="username"
            type="text"
            required
            class="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            placeholder="admin"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700"
            >Password</label
          >
          <input
            v-model="password"
            type="password"
            required
            class="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            placeholder="••••••••"
          />
        </div>
        <button
          type="submit"
          class="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition duration-200"
        >
          Sign In
        </button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useAuthStore } from "../stores/auth";
import { useRouter } from "vue-router";

const username = ref("admin");
const password = ref("fresha2025");
const authStore = useAuthStore();
const router = useRouter();

const login = async () => {
  const res = await authStore.login(username.value, password.value);
  if (authStore.isAuthenticated) {
    router.push("/scheduler");
  } else {
    alert("Invalid credentials");
  }
};
</script>
