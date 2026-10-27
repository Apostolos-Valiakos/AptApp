import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useAuthStore } from "../stores/auth";
import { clearOfflineData, isOnline, syncBeforeLogout } from "../offline/queue";

/**
 * A deliberate logout (menu, profile page): sends what's waiting to sync,
 * warns if some changes still can't be sent, then deletes the data kept on
 * this device for offline use before logging out.
 * Returns false if the user chose to stay.
 */
export const useLogout = () => {
  const router = useRouter();
  const { t } = useI18n();
  const authStore = useAuthStore();

  return async (to = "/") => {
    const unsynced = await syncBeforeLogout().catch(() => 0);
    if (unsynced > 0 && !window.confirm(t("offline.logoutUnsynced", { count: unsynced }))) return false;
    await clearOfflineData().catch((err) => console.error("Could not clear offline data", err));
    authStore.logout();
    // Offline, the public home page ("/", a full page load) can't load and the
    // browser would show its "no internet" page: stay in the app instead.
    router.push(isOnline.value ? to : "/login");
    return true;
  };
};
