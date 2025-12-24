import { defineStore } from "pinia";
import { ref } from "vue";

export const useProductStore = defineStore("products", () => {
  const products = ref([]);

  const fetchProducts = async () => {
    const token = localStorage.getItem("token");
    const res = await fetch("/api/v1/products", {
      headers: { Authorization: `Bearer ${token}` },
    });
    products.value = await res.json();
  };

  const updateStock = async (inventoryId: string, change: number) => {
    const token = localStorage.getItem("token");
    await fetch(`/api/v1/inventory/${inventoryId}/stock`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ quantity: change }),
    });
    await fetchProducts(); // Refresh UI
  };

  return { products, fetchProducts, updateStock };
});
