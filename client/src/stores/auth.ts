import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { useSettingsStore } from "./settings";
import { onLoggedIn } from "../offline/queue";
import { SAVED_LOGIN_KEYS, readSavedJson } from "../utils/savedLogin";
import type { ModuleKey } from "../utils/modules";

export const useAuthStore = defineStore("auth", () => {
  // Damaged saved data: start logged out rather than half logged in.
  if (readSavedJson("user") === undefined || readSavedJson("originalUser") === undefined) {
    SAVED_LOGIN_KEYS.forEach((key) => localStorage.removeItem(key));
  }

  const user = ref(readSavedJson("user"));
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
  // Platform operator — manages shops/plans/admins across the whole app, has no shop of their own.
  const isOwner = computed(() => user.value?.role === "owner");

  const clientId = computed(
    () => user.value?.clientId || user.value?.client_id,
  );

  const isClient = computed(() => user.value?.role === "client");
  // Staff don't see prices or what clients owe.
  const canSeeMoney = computed(() => user.value?.role !== "staff");

  // Modules the owner switched off for this shop (utils/modules.ts): they
  // come with the login and are refreshed with the shop's settings.
  const disabledModules = computed<string[]>(() => user.value?.shop_disabled_modules || []);
  const moduleOn = (key: ModuleKey) => !disabledModules.value.includes(key);
  const setDisabledModules = (list: string[] | null | undefined) => {
    if (!user.value) return;
    const next = Array.isArray(list) ? list : [];
    if (next.join() === disabledModules.value.join()) return;
    user.value = { ...user.value, shop_disabled_modules: next };
    localStorage.setItem("user", JSON.stringify(user.value));
  };

  // While the owner is "viewing as" a shop, the real owner session is stashed here
  // so it can be restored exactly on exit, without ever losing it mid-impersonation.
  const originalToken = ref(localStorage.getItem("originalToken") || "");
  const originalUser = ref(readSavedJson("originalUser"));
  const isImpersonating = computed(() => !!originalToken.value);

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

        // Persisted, shop-wide Ctrl+1 lock — applies from first render, on any device.
        useSettingsStore().setCashLockedByShop(
          !!data.user?.shop_force_hide_cash,
          data.user?.shop_force_hide_cash_locked_by || null,
        );

        // Changes saved offline while the session was expired can sync now.
        onLoggedIn();

        return { success: true };
      } else {
        return { success: false, error: data.error, code: data.code };
      }
    } catch (e) {
      console.error(e);
      return { success: false, error: "Network error", code: "network" };
    }
  };

  // Swaps in a freshly re-issued token without touching `user` — used after
  // "Disconnect all users", which revokes every token for this shop (including
  // the calling admin's own) but hands back a fresh one so their session survives.
  const refreshToken = (newToken: string) => {
    token.value = newToken;
    localStorage.setItem("token", newToken);
  };

  const logout = () => {
    // Viewing a shop: logging out only leaves the shop, the owner stays logged in.
    if (originalToken.value) return exitImpersonation();

    token.value = "";
    user.value = null;
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    originalToken.value = "";
    originalUser.value = null;
    localStorage.removeItem("originalToken");
    localStorage.removeItem("originalUser");
  };

  // Swaps the active session for an impersonation token, stashing the owner's
  // real session first so exitImpersonation() can restore it exactly.
  const startImpersonation = (newToken: string, newUser: any) => {
    if (!originalToken.value) {
      originalToken.value = token.value;
      originalUser.value = user.value;
      localStorage.setItem("originalToken", token.value);
      localStorage.setItem("originalUser", JSON.stringify(user.value));
    }

    token.value = newToken;
    localStorage.setItem("token", newToken);
    user.value = newUser;
    localStorage.setItem("user", JSON.stringify(newUser));
    onLoggedIn();
  };

  const exitImpersonation = () => {
    if (!originalToken.value) return;

    token.value = originalToken.value;
    localStorage.setItem("token", originalToken.value);
    user.value = originalUser.value;
    localStorage.setItem("user", JSON.stringify(originalUser.value));

    originalToken.value = "";
    originalUser.value = null;
    localStorage.removeItem("originalToken");
    localStorage.removeItem("originalUser");
    onLoggedIn();
  };

  return {
    token,
    user,
    isAuthenticated,
    isOwner,
    isShopAdmin,
    isAnalyticsAllowed,
    isClient,
    canSeeMoney,
    isImpersonating,
    disabledModules,
    moduleOn,
    setDisabledModules,
    clientId,
    login,
    logout,
    refreshToken,
    startImpersonation,
    exitImpersonation,
  };
});
