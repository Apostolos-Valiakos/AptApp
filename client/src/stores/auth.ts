import { defineStore } from "pinia";
import { ref, computed } from "vue";

export const useAuthStore = defineStore("auth", () => {
  // 1. Initialize user from localStorage so it survives page refreshes
  const user = ref(JSON.parse(localStorage.getItem("user") || "null"));
  const token = ref(localStorage.getItem("token") || "");

  const isAuthenticated = computed(() => !!token.value);

  // Optional helper to check role directly in store
  const isOwner = computed(
    () => user.value?.role === "admin" || user.value?.role === "manager"
  );

  const login = async (username: string, password: string) => {
    try {
      const res = await fetch("http://192.168.68.58:3000/api/auth/login", {
        // Ensure full URL if not proxied
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (res.ok && data.token) {
        // 2. Save Token
        token.value = data.token;
        localStorage.setItem("token", data.token);

        // 3. Save User (This is the missing part you need)
        user.value = data.user;
        localStorage.setItem("user", JSON.stringify(data.user));

        return { success: true };
      } else {
        return { success: false, error: data.error };
      }
    } catch (e) {
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
    user, // <-- Export this so Layout.vue can use it
    isAuthenticated,
    isOwner, // <-- Optional convenience
    login,
    logout,
  };
});
