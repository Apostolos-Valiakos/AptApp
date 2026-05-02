import { defineStore } from "pinia";
import { ref } from "vue";

export const useCalendarStore = defineStore("calendar", () => {
  const resources = ref<any[]>([]);
  const events = ref<any[]>([]);
  const clients = ref<any[]>([]);
  const services = ref<any[]>([]);
  const products = ref<any[]>([]);

  // 1. Fetch only the static/base data needed to populate dropdowns and UI
  const fetchBaseResources = async () => {
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
      const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };

      // Removed appointments from this Promise.all
      const [staffRes, clientsRes, servicesRes] = //productsRes
        await Promise.all([
          fetch("/api/v1/staff", { headers }),
          fetch("/api/v1/clients", { headers }),
          fetch("/api/v1/services", { headers }),
          // fetch("/api/v1/products", { headers }),
        ]);

      const staffData = await staffRes.json();
      resources.value = staffData.sort(
        (a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0),
      );

      clients.value = await clientsRes.json();
      services.value = await servicesRes.json();
      // products.value = await productsRes.json();

      console.log("BASE RESOURCES LOADED", {
        resources: resources.value,
        clients: clients.value,
        services: services.value,
        products: products.value,
      });
    } catch (err) {
      console.error("fetchBaseResources failed", err);
    }
  };

  // 2. Fetch only the appointments for the specific date range
  // 2. Fetch only the appointments for the specific date range
  const fetchAppointments = async (start: string, end: string) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
      const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };

      // Use URLSearchParams to safely encode the '+' in the timezone offset
      const params = new URLSearchParams({ start, end });

      const eventsRes = await fetch(
        `/api/v1/appointments?${params.toString()}`,
        { headers },
      );

      // Safety check: If the server returns an error, don't save it to events.value
      if (!eventsRes.ok) {
        const errorData = await eventsRes.json();
        throw new Error(errorData.error || "Server error");
      }

      events.value = await eventsRes.json();

      console.log(
        `APPOINTMENTS LOADED FOR RANGE: ${start} to ${end}`,
        events.value,
      );
    } catch (err) {
      console.error("fetchAppointments failed", err);
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
  return {
    resources,
    events,
    clients,
    services,
    products,
    fetchBaseResources,
    fetchAppointments,
    updateResourceOrder,
  };
});
