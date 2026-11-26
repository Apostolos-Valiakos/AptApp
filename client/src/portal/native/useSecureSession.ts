// Signing in within the app (docs/redesign/ANDROID_HANDOFF.md step 7.5,
// REDESIGN_SPEC.md §6.6):
// - the login (token and user) is kept in secure storage, Android's Keystore,
//   besides localStorage, where api/http.ts reads it;
// - when the app starts it's put back into localStorage before the app mounts,
//   so a cleared WebView doesn't sign the client out;
// - with "Unlock with fingerprint" on (Profile → Security), the localStorage
//   copy is dropped at every start and put back only after the fingerprint (or
//   the phone's PIN); a failure or cancel leaves the app on the login page.
// The password is never stored. In a browser none of this runs: the login
// stays in localStorage as before.
import { ref } from "vue";
import { BiometricAuth } from "@aparajita/capacitor-biometric-auth";
import { SecureStoragePlugin } from "capacitor-secure-storage-plugin";
import { i18n } from "../../i18n";
import { isNative, quietly } from "./platform";

const SESSION_KEY = "portal.session";
const UNLOCK_KEY = "portal.biometricUnlock";
const LOGIN_KEYS = ["token", "user"];

const t = (key: string): string => (i18n.global as any).t(key);
const storage = {
  get: (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {}
  },
  remove: (key: string) => {
    try {
      localStorage.removeItem(key);
    } catch {}
  },
};

/** Whether "Unlock with fingerprint" is on (a per-device choice, not a secret). */
export const unlockWithBiometrics = () => storage.get(UNLOCK_KEY) === "1";

/** Keeps the login in secure storage (after a login, or when the token changes). */
export const saveSession = async (token: string, user: unknown) => {
  if (!isNative() || !token) return;
  await quietly(() => SecureStoragePlugin.set({ key: SESSION_KEY, value: JSON.stringify({ token, user }) }));
};

/** Forgets the kept login (an expired session, a logout). */
export const dropSession = async () => {
  if (!isNative()) return;
  await quietly(() => SecureStoragePlugin.remove({ key: SESSION_KEY }));
};

export type RestoreResult = "restored" | "none" | "locked";

/**
 * At start, before the app mounts: the kept login back into localStorage,
 * after the fingerprint when that's on. "locked" when it failed or was
 * cancelled: the app then opens on the login page.
 */
export const restoreSession = async (): Promise<RestoreResult> => {
  if (!isNative()) return "none";
  const locked = unlockWithBiometrics();
  // Nothing usable without the fingerprint, even what the WebView kept.
  if (locked) LOGIN_KEYS.forEach(storage.remove);
  const kept = await quietly(() => SecureStoragePlugin.get({ key: SESSION_KEY }));
  let session: { token?: string; user?: unknown } | null = null;
  try {
    session = kept?.value ? JSON.parse(kept.value) : null;
  } catch {}
  if (!session?.token) return "none";
  if (locked) {
    try {
      await BiometricAuth.authenticate({
        reason: t("portal.v2.native.unlockReason"),
        androidTitle: t("portal.v2.native.unlockTitle"),
        cancelTitle: t("common.cancel"),
        allowDeviceCredential: true,
      });
    } catch {
      return "locked";
    }
  }
  storage.set("token", session.token);
  storage.set("user", JSON.stringify(session.user ?? null));
  return "restored";
};

// Profile's switch, shared by the screen and the tests.
const available = ref(false);
const enabled = ref(unlockWithBiometrics());

export const useBiometricUnlock = () => ({
  /** Shown only in the app, on a phone with a fingerprint (or face) enrolled. */
  available,
  enabled,
  check: async () => {
    if (!isNative()) return (available.value = false);
    const result = await quietly(() => BiometricAuth.checkBiometry());
    available.value = !!result?.isAvailable;
    enabled.value = unlockWithBiometrics();
    return available.value;
  },
  /** On only after one successful unlock, so it's the phone's owner turning it on. */
  enable: async () => {
    if (!isNative()) return false;
    try {
      await BiometricAuth.authenticate({ reason: t("portal.v2.native.unlockReason"), androidTitle: t("portal.v2.native.unlockTitle"), cancelTitle: t("common.cancel"), allowDeviceCredential: true });
    } catch {
      enabled.value = false;
      return false;
    }
    storage.set(UNLOCK_KEY, "1");
    enabled.value = true;
    return true;
  },
  disable: () => {
    storage.remove(UNLOCK_KEY);
    enabled.value = false;
  },
});

/** Logout: the kept login and the fingerprint choice go (the next person starts fresh). */
export const forgetSecureSession = async () => {
  storage.remove(UNLOCK_KEY);
  enabled.value = false;
  await dropSession();
};
