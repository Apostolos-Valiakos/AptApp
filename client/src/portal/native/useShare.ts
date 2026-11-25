// Sharing a booking or the shop (N6): the phone's share sheet in the app; in a
// browser its own share sheet where there is one, else the text is copied.
import { Share } from "@capacitor/share";
import { isNative } from "./platform";

export type ShareContent = { title: string; text: string; url: string };
export type ShareResult = "shared" | "copied" | "closed" | "failed";

/**
 * The address a shared link points to: the public site. In the app the page
 * itself is https://localhost, which means nothing to whoever receives it.
 */
export const publicUrl = (path: string) =>
  `${((import.meta.env.VITE_API_BASE_URL as string | undefined) || window.location.origin).replace(/\/+$/, "")}${path}`;

export const useShare = () => ({
  share: async ({ title, text, url }: ShareContent): Promise<ShareResult> => {
    if (isNative()) {
      try {
        await Share.share({ title, text, url, dialogTitle: title });
        return "shared";
      } catch {
        // Closed by the client, or no app to share to.
        return "closed";
      }
    }
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url });
        return "shared";
      } catch (err: any) {
        if (err?.name === "AbortError") return "closed";
      }
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      return "copied";
    } catch {
      return "failed";
    }
  },
});
