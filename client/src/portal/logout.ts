// What logging out of the portal clears on this device, besides the login:
// the kept pass, the assistant's conversation, the loaded bookings; and in the
// Android app the phone's reminders, its place on the shop's announcement
// list, and the login kept in secure storage. Run before the login goes: the
// announcement token is removed from the server with the client's own login.
import { usePortalWalletStore } from "./stores/wallet";
import { useAssistantStore } from "./stores/assistant";
import { clearBookingsCache, usePortalBookingsStore } from "./stores/bookings";
import { usePortalShopStore } from "./stores/shop";
import { useReminders } from "./native/useReminders";
import { usePush } from "./native/usePush";
import { forgetSecureSession } from "./native/useSecureSession";

export const forgetPortal = async () => {
  // Native first (each a no-op on the web), while the login still works.
  await usePush().unregister();
  await useReminders().cancelAll();
  await forgetSecureSession();
  usePortalWalletStore().forget();
  useAssistantStore().$reset();
  usePortalBookingsStore().list = [];
  clearBookingsCache();
  usePortalShopStore().$reset();
};
