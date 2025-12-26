import { defineStore } from "pinia";
import { ref, computed } from "vue";

export const useAuthStore = defineStore("auth", () => {
  // 1. Initialize user from localStorage so it survives page refreshes
  const user = ref(JSON.parse(localStorage.getItem("user") || "null"));
  const token = ref(localStorage.getItem("token") || "");

  const isAuthenticated = computed(() => !!token.value);

  // Helper to check role (Matches server.js logic for super_admin/admin)
  const isOwner = computed(
    () => user.value?.role === "admin" || user.value?.role === "super_admin"
  );

  const login = async (username: string, password: string) => {
    try {
      // FIX: Changed endpoint to match server.js (/api/v1/login)
      const res = await fetch("/api/v1/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (res.ok && data.token) {
        // 2. Save Token
        token.value = data.token;
        localStorage.setItem("token", data.token);

        // 3. Save User
        user.value = data.user;
        localStorage.setItem("user", JSON.stringify(data.user));

        return { success: true };
      } else {
        return { success: false, error: data.error };
      }
    } catch (e) {
      console.error(e);
      return { success: false, error: "Network error" };
    }
  };

  const logout = () => {
    // 4. Clear Token AND User on logout
    token.value = "";
    user.value = null;
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  };

  return {
    token,
    user,
    isAuthenticated,
    isOwner,
    login,
    logout,
  };
});
