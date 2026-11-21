// What logging out of the portal clears on this device, besides the login:
// the kept pass, the assistant's conversation, the loaded bookings.
import { usePortalWalletStore } from "./stores/wallet";
import { useAssistantStore } from "./stores/assistant";
import { usePortalBookingsStore } from "./stores/bookings";
import { usePortalShopStore } from "./stores/shop";

export const forgetPortal = () => {
  usePortalWalletStore().forget();
  useAssistantStore().$reset();
  usePortalBookingsStore().list = [];
  usePortalShopStore().$reset();
};
