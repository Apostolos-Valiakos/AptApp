// Makes the portal installable on a phone's home screen: the web manifest
// (first a generic one, then the shop's own name and colour) and the portal's
// service worker. Only the portal shells call this; staff pages never do.
import { onMounted } from "vue";

const manifestLink = (): HTMLLinkElement => {
  let link = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.rel = "manifest";
    document.head.appendChild(link);
  }
  return link;
};

/** Points the manifest at the shop's own name and colour once it's known. */
export const setShopManifest = (shopId: string) => {
  manifestLink().href = `/manifest.webmanifest?shop_id=${encodeURIComponent(shopId)}`;
};

export const usePortalInstall = () => {
  onMounted(() => {
    // Synchronously, before any request: Chrome's installability check can
    // run before an awaited answer arrives, and some builds never check again.
    manifestLink().href = "/manifest.webmanifest";
    navigator.serviceWorker?.register("/sw.js", { scope: "/portal/" }).catch(() => {});
  });
};
