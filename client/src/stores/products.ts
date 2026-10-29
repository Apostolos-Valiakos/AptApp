import { api } from "../api/http";
import { defineStore } from "pinia";
import { ref } from "vue";

export const useProductStore = defineStore("products", () => {
  const products = ref([]);

  const fetchProducts = async () => {
    products.value = await api.get("/api/v1/products");
  };

  const updateStock = async (inventoryId: string, change: number) => {
    await api.patch(`/api/v1/inventory/${inventoryId}/stock`, { quantity: change });
    await fetchProducts(); // Refresh UI
  };

  return { products, fetchProducts, updateStock };
});
