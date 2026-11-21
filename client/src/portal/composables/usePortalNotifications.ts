// The client's notifications (reminders, the shop's messages): the unread
// count for the bell and the list, kept up to date when a push arrives while
// the portal is open. Used by both portal shells.
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { api } from "../../api/http";

// One list for the whole portal, so Profile's "Activity" opens the same
// sheet as the bell.
const items = ref<any[]>([]);
const unreadCount = ref(0);
const visible = ref(false);
const loading = ref(false);

export const usePortalNotifications = ({ watchPushes = true } = {}) => {
  const router = useRouter();

  const fetchAll = async () => {
    try {
      const data = await api.get("/api/v1/portal/notifications");
      items.value = data.items || [];
      unreadCount.value = data.unread_count || 0;
    } catch {}
  };

  const open = async () => {
    visible.value = true;
    loading.value = true;
    await fetchAll();
    loading.value = false;
  };

  const markAllRead = async () => {
    try {
      await api.put("/api/v1/portal/notifications/read-all");
      items.value = items.value.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() }));
      unreadCount.value = 0;
    } catch {}
  };

  const openItem = async (n: any) => {
    if (!n.read_at) {
      try {
        await api.put(`/api/v1/portal/notifications/${n.id}/read`);
        n.read_at = new Date().toISOString();
        unreadCount.value = Math.max(0, unreadCount.value - 1);
      } catch {}
    }
    if (n.url) {
      visible.value = false;
      router.push(n.url);
    }
  };

  onMounted(() => {
    if (!watchPushes) return;
    fetchAll();
    // The service worker posts this when a push arrives while a tab is open,
    // so the bell updates at once instead of on the next load.
    navigator.serviceWorker?.addEventListener("message", (event) => {
      if (event.data?.type === "push-received") fetchAll();
    });
  });

  return { items, unreadCount, visible, loading, open, markAllRead, openItem };
};
