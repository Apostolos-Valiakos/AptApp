// The client's visit packages and membership, for Home's wallet strip and
// the Wallet screen; the pass's token is kept on the device too, so the pass
// opens without a connection (N13).
import { defineStore } from "pinia";
import { api } from "../../api/http";

const PASS_KEY = "portal.passToken";

export const readCachedPass = () => {
  try {
    return localStorage.getItem(PASS_KEY);
  } catch {
    return null;
  }
};

export const usePortalWalletStore = defineStore("portalWallet", {
  state: () => ({
    packages: [] as any[],
    membership: null as any,
    usage: [] as any[],
    client: null as any,
    passToken: readCachedPass() as string | null,
    loaded: false,
  }),
  getters: {
    activePackages: (s) => s.packages.filter((p) => p.state === "active"),
  },
  actions: {
    async load(clientId: string | null) {
      if (!clientId) return;
      const [packages, membership, full] = await Promise.all([
        api.get(`/api/v1/clients/${clientId}/packages`).catch(() => null),
        api.get(`/api/v1/clients/${clientId}/membership`).catch(() => null),
        api.get(`/api/v1/clients/${clientId}/full`).catch(() => null),
      ]);
      if (packages) this.packages = packages;
      if (membership) {
        this.membership = membership.membership;
        this.usage = membership.usage || [];
      }
      if (full?.client) {
        this.client = full.client;
        this.passToken = full.client.qr_token || null;
        try {
          if (this.passToken) localStorage.setItem(PASS_KEY, this.passToken);
        } catch {}
      }
      this.loaded = true;
    },
    /** Forgets everything on this device (logging out). */
    forget() {
      this.$reset();
      this.passToken = null;
      try {
        localStorage.removeItem(PASS_KEY);
      } catch {}
    },
  },
});
