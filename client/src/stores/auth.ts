import { defineStore } from "pinia";
import { ref, computed } from "vue";

export const useAuthStore = defineStore("auth", () => {
  const user = ref(JSON.parse(localStorage.getItem("user") || "null"));
  const token = ref(localStorage.getItem("token") || "");

  const isAuthenticated = computed(() => !!token.value);

  // "Shop admin" means "full admin-equivalent access to one shop" — frontdesk gets
  // everything admin gets except analytics, so it's included here and excluded via
  // isAnalyticsAllowed. Not to be confused with isOwner below, which is the
  // separate, platform-wide "owner" role that isn't tied to any single shop.
  const isShopAdmin = computed(
    () =>
      user.value?.role === "admin" ||
      user.value?.role === "super_admin" ||
      user.value?.role === "frontdesk",
  );
  const isAnalyticsAllowed = computed(
    () => user.value?.role === "admin" || user.value?.role === "super_admin",
  );
  const clientId = computed(
    () => user.value?.clientId || user.value?.client_id,
  );

  const isClient = computed(() => user.value?.role === "client");

  const login = async (username: string, password: string) => {
    try {
      const res = await fetch("/api/v1/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (res.ok && data.token) {
        token.value = data.token;
        localStorage.setItem("token", data.token);

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
    token.value = "";
    user.value = null;
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  };

  return {
    token,
    user,
    isAuthenticated,
    isShopAdmin,
    isAnalyticsAllowed,
    isClient,
    clientId,
    login,
    logout,
  };
});
