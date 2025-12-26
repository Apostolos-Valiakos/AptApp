<template>
  <div class="p-4">
    <div class="flex justify-between items-center mb-4">
      <h1 class="text-2xl font-bold text-white">Inventory Management</h1>
      <Button
        label="Add New Product"
        icon="pi pi-plus"
        @click="openNewProductDialog"
      />
    </div>

    <DataTable
      :value="productStore.products"
      responsiveLayout="scroll"
      class="p-datatable-sm shadow-sm border rounded"
    >
      <Column
        field="name"
        header="Product Name"
        sortable
        class="font-semibold"
      ></Column>
      <Column field="description" header="Description"></Column>

      <Column header="Variations & Stock">
        <template #body="slotProps">
          <div class="space-y-2">
            <div
              v-for="variation in slotProps.data.variations"
              :key="variation.id"
              class="flex items-center justify-between p-2 bg-gray-50 rounded border border-gray-100"
            >
              <div class="flex flex-col">
                <span class="text-sm font-medium">{{
                  variation.variation_name || "Standard"
                }}</span>
                <span class="text-xs text-gray-500"
                  >Price: {{ variation.price }}€</span
                >
              </div>

              <div class="flex items-center gap-3">
                <Tag
                  :value="variation.stock_quantity"
                  :severity="getStockSeverity(variation.stock_quantity)"
                />

                <div class="flex gap-1">
                  <Button
                    icon="pi pi-minus"
                    class="p-button-rounded p-button-text p-button-danger p-button-sm"
                    @click="adjustStock(variation.id, -1)"
                    :disabled="variation.stock_quantity <= 0"
                  />
                  <Button
                    icon="pi pi-plus"
                    class="p-button-rounded p-button-text p-button-success p-button-sm"
                    @click="adjustStock(variation.id, 1)"
                  />
                  <Button
                    icon="pi pi-pencil"
                    class="p-button-rounded p-button-outlined mr-2"
                    @click="editProduct(slotProps.data)"
                  />
                  <Button
                    icon="pi pi-trash"
                    class="p-button-rounded p-button-outlined p-button-danger"
                    @click="confirmDeleteProduct(slotProps.data)"
                  />
                </div>
              </div>
            </div>
          </div>
        </template>
      </Column>
    </DataTable>

    <Dialog
      v-model:visible="productDialog"
      header="Create New Product"
      modal
      :style="{ width: '50vw' }"
    >
      <div class="flex flex-col gap-4">
        <div class="field">
          <label for="name" class="font-bold block mb-2">Product Name</label>
          <InputText
            id="name"
            v-model="newProduct.name"
            class="w-full"
            placeholder="e.g., Shampoo"
          />
        </div>
        <div class="field">
          <label for="desc" class="font-bold block mb-2">Description</label>
          <Textarea
            id="desc"
            v-model="newProduct.description"
            class="w-full"
            rows="2"
          />
        </div>

        <div class="border-t pt-4">
          <div class="flex justify-between items-center mb-3">
            <span class="font-bold">Variations (Price & Stock per Type)</span>
            <Button
              label="Add Variation"
              icon="pi pi-plus"
              size="small"
              text
              @click="addVariationRow"
            />
          </div>

          <div
            v-for="(v, index) in newProduct.variations"
            :key="index"
            class="flex gap-2 mb-2 items-end bg-gray-50 p-2 rounded"
          >
            <div class="flex-1">
              <label class="text-xs font-semibold">Variation Name</label>
              <InputText
                v-model="v.variation_name"
                class="w-full p-inputtext-sm"
                placeholder="e.g., 250ml"
              />
            </div>
            <div class="flex-1">
              <label class="text-xs font-semibold">Price (€)</label>
              <InputNumber
                v-model="v.price"
                mode="decimal"
                :minFractionDigits="2"
                class="p-inputtext-sm"
              />
            </div>
            <div class="flex-1">
              <label class="text-xs font-semibold">Initial Stock</label>
              <InputNumber
                v-model="v.stock_quantity"
                class="p-inputtext-sm"
                :min="0"
              />
            </div>
            <Button
              icon="pi pi-trash"
              severity="danger"
              text
              @click="removeVariationRow(index)"
              v-if="newProduct.variations.length > 1"
            />
          </div>
        </div>
      </div>

      <template #footer>
        <Button
          label="Cancel"
          icon="pi pi-times"
          text
          @click="productDialog = false"
        />
        <Button
          label="Save Product"
          icon="pi pi-check"
          @click="saveProduct"
          :disabled="!newProduct.name || newProduct.variations.length === 0"
        />
      </template>
    </Dialog>
    <Dialog
      v-model:visible="stockDialog"
      header="Adjust Stock"
      modal
      :style="{ width: '300px' }"
    >
      <div class="flex flex-col gap-3">
        <label class="font-bold">{{ selectedVariation?.variation_name }}</label>
        <InputNumber
          v-model="stockAdjustment"
          showButtons
          buttonLayout="horizontal"
          incrementButtonIcon="pi pi-plus"
          decrementButtonIcon="pi pi-minus"
          class="w-full"
        />
      </div>
      <template #footer>
        <Button label="Cancel" text @click="stockDialog = false" />
        <Button label="Update" @click="confirmStockAdjustment" />
      </template>
    </Dialog>
    <ConfirmDialog></ConfirmDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useProductStore } from "../stores/products";
import { useToast } from "primevue/usetoast";
import { useConfirm } from "primevue/useconfirm";
import ConfirmationService from "primevue/confirmationservice";
import ConfirmDialog from "primevue/confirmdialog";

const productStore = useProductStore();
const toast = useToast();

const stockDialog = ref(false);
const selectedVariation = ref<any>(null);
const stockAdjustment = ref(0);
const productDialog = ref(false);
const newProduct = ref({
  name: "",
  description: "",
  variations: [{ variation_name: "Standard", price: 0, stock_quantity: 0 }],
});

onMounted(() => {
  productStore.fetchProducts();
});

const isEdit = ref(false);

// Open dialog for Editing
const editProduct = (product: any) => {
  isEdit.value = true;
  // Use a deep copy to avoid modifying the table data before saving
  newProduct.value = JSON.parse(JSON.stringify(product));
  productDialog.value = true;
};

const getStockSeverity = (qty: number) => {
  if (qty === 0) return "danger";
  if (qty < 5) return "warning";
  return "success";
};

const adjustStock = async (inventoryId: string, amount: number) => {
  try {
    await productStore.updateStock(inventoryId, amount);
    toast.add({
      severity: "success",
      summary: "Success",
      detail: "Stock updated",
      life: 3000,
    });
  } catch (err) {
    toast.add({
      severity: "error",
      summary: "Error",
      detail: "Update failed",
      life: 3000,
    });
  }
};

const confirmStockAdjustment = async () => {
  if (selectedVariation.value && stockAdjustment.value !== 0) {
    await adjustStock(selectedVariation.value.id, stockAdjustment.value);
    stockDialog.value = false;
  }
};

const openNewProductDialog = () => {
  newProduct.value = {
    name: "",
    description: "",
    variations: [{ variation_name: "Standard", price: 0, stock_quantity: 0 }],
  };
  productDialog.value = true;
};

// Adds a new row for product variations
const addVariationRow = () => {
  newProduct.value.variations.push({
    variation_name: "",
    price: 0,
    stock_quantity: 0,
  });
};

// Removes a variation row
const removeVariationRow = (index: number) => {
  newProduct.value.variations.splice(index, 1);
};

// Submits the product and its variations to the server
const saveProduct = async () => {
  try {
    const token = localStorage.getItem("token");

    // Determine if we are updating or creating
    const method = isEdit.value ? "PUT" : "POST";
    const url = isEdit.value
      ? `/api/v1/products/${newProduct.value.id}`
      : "/api/v1/products";

    const res = await fetch(url, {
      method: method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(newProduct.value),
    });

    if (res.ok) {
      toast.add({
        severity: "success",
        summary: "Success",
        detail: isEdit.value ? "Product updated" : "Product created",
        life: 3000,
      });
      productDialog.value = false;
      await productStore.fetchProducts();
    } else {
      const errorData = await res.json();
      toast.add({
        severity: "error",
        summary: "Error",
        detail: errorData.error || "Operation failed",
        life: 3000,
      });
    }
  } catch (err) {
    toast.add({
      severity: "error",
      summary: "Error",
      detail: "Network error",
      life: 3000,
    });
  }
};
const confirm = useConfirm(); //

const confirmDeleteProduct = (product: any) => {
  confirm.require({
    message: `Are you sure you want to delete "${product.name}"? This will also remove all stock and variations.`,
    header: "Danger Zone",
    icon: "pi pi-exclamation-triangle",
    acceptClass: "p-button-danger",
    accept: async () => {
      try {
        const token = localStorage.getItem("token"); //
        const res = await fetch(`/api/v1/products/${product.id}`, {
          method: "DELETE", //
          headers: { Authorization: `Bearer ${token}` }, //
        });

        if (res.ok) {
          toast.add({
            severity: "success",
            summary: "Deleted",
            detail: "Product removed",
            life: 3000,
          }); //
          await productStore.fetchProducts(); //
        } else {
          throw new Error("Failed to delete");
        }
      } catch (err) {
        toast.add({
          severity: "error",
          summary: "Error",
          detail: "Could not delete product",
          life: 3000,
        }); //
      }
    },
  });
};
</script>

<style scoped>
:deep(.p-datatable .p-datatable-tbody > tr > td) {
  padding: 1rem;
}
</style>
