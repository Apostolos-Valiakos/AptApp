import { defineStore } from "pinia";
import { ref } from "vue";

export const useCalendarStore = defineStore("calendar", () => {
  const resources = ref<any[]>([]);
  const events = ref<any[]>([]);
  const clients = ref<any[]>([]);
  const services = ref<any[]>([]);
  const products = ref<any[]>([]); // Move inside

  const fetchProducts = async () => {
    const token = localStorage.getItem("token");
    const res = await fetch("/api/v1/products", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    // Flatten variations so the dropdown shows "Shampoo (250ml)"
    products.value = data.flatMap((p: any) =>
      p.variations.map((v: any) => ({
        id: v.id,
        name: `${p.name} ${
          v.variation_name ? "(" + v.variation_name + ")" : ""
        }`,
        price: v.price,
      }))
    );
  };

  const fetchAll = async () => {
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
      const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };

      // Add fetchProducts to the Promise.all
      const [staffRes, clientsRes, servicesRes, eventsRes] = await Promise.all([
        fetch("/api/v1/staff", { headers }),
        fetch("/api/v1/clients", { headers }),
        fetch("/api/v1/services", { headers }),
        fetch("/api/v1/appointments", { headers }),
      ]);

      resources.value = await staffRes.json();
      clients.value = await clientsRes.json();
      services.value = await servicesRes.json();
      events.value = await eventsRes.json();

      // Also fetch products
      await fetchProducts();

      console.log("ALL DATA LOADED");
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
    fetchProducts,
  };
});
