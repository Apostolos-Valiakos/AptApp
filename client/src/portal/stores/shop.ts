// The client's shop as the portal needs it (name, phone, address, colour,
// whether the assistant and online booking are on), loaded once and shared
// by the shell and the screens.
import { defineStore } from "pinia";
import { api } from "../../api/http";

export const usePortalShopStore = defineStore("portalShop", {
  state: () => ({
    shop: null as Record<string, any> | null,
    loading: null as Promise<void> | null,
  }),
  getters: {
    name: (s) => (s.shop?.name as string) || "",
    phone: (s) => (s.shop?.phone as string) || "",
    aiEnabled: (s) => !!s.shop?.ai_assistant_enabled,
  },
  actions: {
    /** Loads it the first time; later calls wait for the same request. */
    load() {
      this.loading ||= api
        .get("/api/v1/shop")
        .then((data) => void (this.shop = data))
        .catch(() => void (this.loading = null));
      return this.loading;
    },
  },
});
