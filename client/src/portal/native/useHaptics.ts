// The phone's haptics (REDESIGN_SPEC.md §6.4, "haptics map"): in the app, the
// system's own feedback; in a browser, a short vibration where allowed, else
// nothing. Used through useFeedback(), which pairs them with the toasts.
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { isNative, quietly } from "./platform";

const PATTERNS = { tick: 8, light: 10, success: [12, 60, 24], warning: [30, 50, 30] } as const;

// Browsers without vibration (desktop, iOS Safari) or that refuse it simply
// do nothing.
const vibrate = (pattern: number | readonly number[]) => {
  try {
    navigator.vibrate?.(pattern as number | number[]);
  } catch {}
};

export const useHaptics = () => {
  const native = isNative();
  return {
    /** A choice made: a time picked, a slot scrubbed. */
    tick: () => (native ? void quietly(() => Haptics.selectionChanged()) : vibrate(PATTERNS.tick)),
    /** A tab changed, a list refreshed. */
    light: () => (native ? void quietly(() => Haptics.impact({ style: ImpactStyle.Light })) : vibrate(PATTERNS.light)),
    /** Done: booked, moved, confirmed. */
    success: () => (native ? void quietly(() => Haptics.notification({ type: NotificationType.Success })) : vibrate(PATTERNS.success)),
    /** Before something that can't be undone (cancelling). */
    warning: () => (native ? void quietly(() => Haptics.notification({ type: NotificationType.Warning })) : vibrate(PATTERNS.warning)),
    /** Refused or failed. */
    error: () => (native ? void quietly(() => Haptics.notification({ type: NotificationType.Error })) : vibrate(PATTERNS.warning)),
  };
};
