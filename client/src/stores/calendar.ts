import { defineStore } from "pinia";
import { ref } from "vue";

export const useCalendarStore = defineStore("calendar", () => {
  const resources = ref<any[]>([]);
  const events = ref<any[]>([]);
  const clients = ref<any[]>([]);
  const services = ref<any[]>([]);
  const products = ref<any[]>([]);

  const fetchAll = async () => {
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
      const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };

      const [staffRes, clientsRes, servicesRes, eventsRes, productsRes] =
        await Promise.all([
          fetch("/api/v1/staff", { headers }),
          fetch("/api/v1/clients", { headers }),
          fetch("/api/v1/services", { headers }),
          fetch("/api/v1/appointments", { headers }),
          fetch("/api/v1/products", { headers }),
        ]);

      const staffData = await staffRes.json();
      resources.value = staffData.sort(
        (a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0),
      );

      clients.value = await clientsRes.json();
      services.value = await servicesRes.json();
      events.value = await eventsRes.json();
      products.value = await productsRes.json();

      console.log("ALL DATA LOADED", {
        resources: resources.value,
        clients: clients.value,
        services: services.value,
        events: events.value,
        products: products.value,
      });
    } catch (err) {
      console.error("fetchAll failed", err);
    }
  };

  const updateResourceOrder = async (reorderedStaff: any[]) => {
    resources.value = reorderedStaff;

    const token = localStorage.getItem("token");
    try {
      await fetch("/api/v1/staff/reorder", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orders: reorderedStaff.map((s, index) => ({
            id: s.id,
            sort_order: index,
          })),
        }),
      });
    } catch (err) {
      console.error("Failed to save staff order", err);
    }
  };

  // Don't forget to return it
  return {
    resources,
    events,
    clients,
    services,
    products,
    fetchAll,
    updateResourceOrder,
  };
});
