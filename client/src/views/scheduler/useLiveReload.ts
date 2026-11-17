// Other screens' changes: the calendar reloads shortly after one, and when the tab is shown again.
import { onMounted, onUnmounted } from "vue";
import type { useSchedulerCore } from "./useSchedulerCore";

export const useLiveReload = (ctx: ReturnType<typeof useSchedulerCore>) => {
  const {
    flags, calendarStore,
  } = ctx;

  // Live updates: bookings changed on another screen (see "appointments:changed"
  // in server.js). Reloads the visible range after a short pause, so a burst of
  // changes is one reload; not mid-drag, and not while the tab is hidden (then
  // on return).
  const LIVE_RELOAD_DELAY_MS = 700;
  let liveReloadTimer: ReturnType<typeof setTimeout> | null = null;
  let liveReloadPending = false;
  const liveReload = () => {
    if (liveReloadTimer) clearTimeout(liveReloadTimer);
    liveReloadTimer = setTimeout(() => {
      liveReloadTimer = null;
      if (flags.dragInProgress || document.hidden) {
        liveReloadPending = true;
        if (flags.dragInProgress) liveReload(); // try again once the drag is over
        return;
      }
      liveReloadPending = false;
      calendarStore.refreshVisibleRange();
    }, LIVE_RELOAD_DELAY_MS);
  };
  const onVisibleAgain = () => {
    if (!document.hidden && liveReloadPending) liveReload();
  };
  onMounted(() => {
    window.addEventListener("appointments-changed", liveReload);
    document.addEventListener("visibilitychange", onVisibleAgain);
  });

  onUnmounted(() => {
    window.removeEventListener("appointments-changed", liveReload);
    document.removeEventListener("visibilitychange", onVisibleAgain);
    if (liveReloadTimer) clearTimeout(liveReloadTimer);
  });

  return { LIVE_RELOAD_DELAY_MS, liveReloadTimer, liveReloadPending, liveReload, onVisibleAgain };
};
