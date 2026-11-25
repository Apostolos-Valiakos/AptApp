// What the client feels and sees when something is done: a toast and the
// phone's haptics (native in the app, a short vibration in a browser; see
// native/useHaptics.ts). Every portal action goes through here, so a booking
// feels the same from the screens and from the assistant.
import { useNotify } from "../../composables/useNotify";
import { useHaptics } from "../native/useHaptics";

export const useFeedback = () => {
  const notify = useNotify();
  const haptics = useHaptics();
  return {
    /** A light touch: a time picked, a tab changed. */
    tick: () => haptics.tick(),
    /** Done: booked, moved, confirmed. Without a text, only the haptic. */
    success: (text?: string) => {
      haptics.success();
      if (text) notify.success(undefined, text);
    },
    /** Before something that can't be undone (cancelling). */
    warning: () => haptics.warning(),
    /** Refused or failed. */
    error: (text: string) => {
      haptics.error();
      notify.error(text);
    },
  };
};
