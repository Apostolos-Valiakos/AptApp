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

      // Add fetchProducts to the Promise.all
      const [staffRes, clientsRes, servicesRes, eventsRes, productsRes] =
        await Promise.all([
          fetch("/api/v1/staff", { headers }),
          fetch("/api/v1/clients", { headers }),
          fetch("/api/v1/services", { headers }),
          fetch("/api/v1/appointments", { headers }),
          fetch("/api/v1/products", { headers }),
        ]);

      resources.value = await staffRes.json();
      clients.value = await clientsRes.json();
      services.value = await servicesRes.json();
      events.value = await eventsRes.json();
      products.value = await productsRes.json();

      console.log("ALL DATA LOADED", {
        resources: resources,
        clients: clients,
        services: services,
        events: events,
        products: products,
      });
    } catch (err) {
      console.error("fetchAll failed", err);
    }
  };

  // Return products and fetchProducts
  return {
    resources,
    events,
    clients,
    services,
    products,
    fetchAll,
  };
});
