import { defineStore } from "pinia";
import { ref, watch } from "vue";

export const useSettingsStore = defineStore("settings", () => {
  const user = JSON.parse(localStorage.getItem("user") || "null");
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

  // Ctrl+1 "hide cash/gift-card revenue" macro — shared across every page
  // (scheduler, financials, client profile, gift cards), not just the scheduler.
  const hideCashPaid = ref(localStorage.getItem("hideCashPaid") === "true");

  const setHideCashPaid = (value: boolean) => {
    hideCashPaid.value = value;
  };
  const toggleHideCashPaid = () => {
    hideCashPaid.value = !hideCashPaid.value;
  };

  watch(hideCashPaid, (newVal) => {
    localStorage.setItem("hideCashPaid", String(newVal));
  });

  // Persisted, shop-wide Ctrl+1 lock (set via "Disconnect all users" in Shop
  // Settings) — unlike hideCashPaid/hideCardPaid above, this isn't something
  // the user chose; it applies from the very first render on any device,
  // seeded from the user object the login response already carries.
  const cashLockedByShop = ref(!!user?.shop_force_hide_cash);
  if (cashLockedByShop.value) hideCashPaid.value = true;

  const setCashLockedByShop = (locked: boolean) => {
    cashLockedByShop.value = locked;
    if (locked) hideCashPaid.value = true;
  };

  // Ctrl+8 "hide card-paid revenue" macro — independent of the cash one, same mechanics.
  const hideCardPaid = ref(localStorage.getItem("hideCardPaid") === "true");

  const setHideCardPaid = (value: boolean) => {
    hideCardPaid.value = value;
  };
  const toggleHideCardPaid = () => {
    hideCardPaid.value = !hideCardPaid.value;
  };

  watch(hideCardPaid, (newVal) => {
    localStorage.setItem("hideCardPaid", String(newVal));
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
    hideCashPaid,
    setHideCashPaid,
    toggleHideCashPaid,
    cashLockedByShop,
    setCashLockedByShop,
    hideCardPaid,
    setHideCardPaid,
    toggleHideCardPaid,
    shopSettings,
    fetchShopSettings,
    isStaff,
  };
});
