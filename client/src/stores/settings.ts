import { defineStore } from "pinia";
import { api } from "../api/http";
import { readSavedJson } from "../utils/savedLogin";
import { ref, watch } from "vue";

export const useSettingsStore = defineStore("settings", () => {
  const user = readSavedJson("user");
  const isStaff = user?.role === "staff";

  // "me" is currently only ever a deliberate choice for the "staff" role —
  // the UI has no way for any other role to select it (ColorModelToggle only
  // renders for staff; see below). Reading a saved value for non-staff roles
  // let a stale "me" from an earlier staff login on a shared/reception
  // device silently carry over into e.g. a frontdesk session, whose own
  // staff profile is deliberately hidden from the calendar — leaving them
  // with an empty schedule. Non-staff always start on "all".
  const resourceFilter = ref<"all" | "me">(isStaff ? "me" : "all");

  const setResourceFilter = (mode: "all" | "me") => {
    if (isStaff) return;
    resourceFilter.value = mode;
  };

  watch(resourceFilter, (newVal) => {
    localStorage.setItem("scheduler_resource_filter", newVal);
  });

  // The old Ctrl+1 / Ctrl+8 cash and card filters are gone; drop what they
  // left on devices that used them.
  try {
    localStorage.removeItem("hideCashPaid");
    localStorage.removeItem("hideCardPaid");
  } catch {}

  // 3. Shop settings (ergotherapia/physiotherapia/logotherapia flags etc.) —
  // shared/cached here so multiple components (ClientsView, ClientProfileDialog)
  // don't each fire their own /api/v1/shop request on mount.
  const shopSettings = ref<any>(null);
  let shopSettingsPromise: Promise<any> | null = null;

  const fetchShopSettings = async (force = false) => {
    if (shopSettings.value && !force) return shopSettings.value;
    if (shopSettingsPromise) return shopSettingsPromise;

    shopSettingsPromise = api
      .get("/api/v1/shop")
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
    isStaff,
    resourceFilter,
    setResourceFilter,
    shopSettings,
    fetchShopSettings,
  };
});
