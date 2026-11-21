// What the client feels and sees when something is done: a toast and, on a
// phone, a short vibration (the app build will use native haptics instead;
// see docs/redesign/REDESIGN_SPEC.md §6.4). Every portal action goes through
// here, so a booking feels the same from the screens and from the assistant.
import { useNotify } from "../../composables/useNotify";

const PATTERNS = { tick: 8, success: [12, 60, 24], warning: [30, 50, 30] } as const;

// Browsers without vibration (desktop, iOS Safari) or that refuse it simply
// do nothing.
const vibrate = (pattern: number | readonly number[]) => {
  try {
    navigator.vibrate?.(pattern as number | number[]);
  } catch {}
};

export const useFeedback = () => {
  const notify = useNotify();
  return {
    /** A light touch: a time picked, a tab changed. */
    tick: () => vibrate(PATTERNS.tick),
    /** Done: booked, moved, confirmed. Without a text, only the vibration. */
    success: (text?: string) => {
      vibrate(PATTERNS.success);
      if (text) notify.success(undefined, text);
    },
    /** Before something that can't be undone (cancelling). */
    warning: () => vibrate(PATTERNS.warning),
    /** Refused or failed. */
    error: (text: string) => {
      vibrate(PATTERNS.warning);
      notify.error(text);
    },
  };
};
