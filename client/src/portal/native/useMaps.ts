// Directions to the shop (N7). In the app, Google Maps opens with the route
// (AppLauncher hands the link to the Maps app); in a browser the link simply
// opens, as before.
import { AppLauncher } from "@capacitor/app-launcher";
import { usePortalShopStore } from "../stores/shop";
import { isNative, quietly } from "./platform";

/** Google Maps directions to `place` (an address, or the shop's name when it has none). */
export const directionsLink = (place: string) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(place)}`;

export const useMaps = () => {
  const shop = usePortalShopStore();
  const place = () => (shop.shop?.address as string) || shop.name;
  const url = () => directionsLink(place());
  return {
    url,
    /** Opens directions: the Maps app in the app, a new tab on the web. */
    open: async () => {
      if (isNative()) {
        await quietly(() => AppLauncher.openUrl({ url: url() }));
        return;
      }
      window.open(url(), "_blank", "noopener");
    },
    /**
     * For a directions link's click: in the app the Maps app opens instead of
     * the WebView following the link; in a browser the link does its job.
     */
    onLinkClick: (event: Event) => {
      if (!isNative()) return;
      event.preventDefault();
      void quietly(() => AppLauncher.openUrl({ url: url() }));
    },
  };
};
