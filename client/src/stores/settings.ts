import { defineStore } from "pinia";
import { ref, watch } from "vue";

export const useSettingsStore = defineStore("settings", () => {
  // 1. Initialize from LocalStorage (default to 'all' if nothing saved)
  const savedFilter = localStorage.getItem("scheduler_resource_filter");
  const resourceFilter = ref<"all" | "me">(
    (savedFilter as "all" | "me") || "all"
  );

  const setResourceFilter = (mode: "all" | "me") => {
    resourceFilter.value = mode;
  };

  // 2. Watch for changes and save to LocalStorage automatically
  watch(resourceFilter, (newVal) => {
    localStorage.setItem("scheduler_resource_filter", newVal);
  });

  // 3. Shop settings (ergotherapia/physiotherapia/logotherapia flags etc.) —
  // shared/cached here so multiple components (ClientsView, ClientProfileDialog)
  // don't each fire their own /api/v1/shop request on mount.
  const shopSettings = ref<any>(null);
  let shopSettingsPromise: Promise<any> | null = null;

  const fetchShopSettings = async (force = false) => {
    if (shopSettings.value && !force) return shopSettings.value;
    if (shopSettingsPromise) return shopSettingsPromise;

    const token = localStorage.getItem("token");
    shopSettingsPromise = fetch("/api/v1/shop", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        shopSettings.value = data;
        return data;
      })
      .catch((e) => {
        console.error("Error loading shop settings", e);
        return null;
      })
      .finally(() => {
        shopSettingsPromise = null;
      });

    return shopSettingsPromise;
  };

  return {
    resourceFilter,
    setResourceFilter,
    shopSettings,
    fetchShopSettings,
  };
});
