// Whether the portal runs inside the Android app (Capacitor) or in a browser.
// Every native composable asks this first: on the web each does what the
// portal did before, and never throws (docs/redesign/REDESIGN_SPEC.md §6.4).
import { Capacitor } from "@capacitor/core";

export const isNative = () => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

/** Runs a native call, ignoring a failure (a refused permission, a missing plugin). */
export const quietly = async <T>(call: () => Promise<T>): Promise<T | undefined> => {
  try {
    return await call();
  } catch {
    return undefined;
  }
};
