<template>
  <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
    <!-- Page Header -->
    <div class="flex justify-between items-center mb-6">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-[var(--p-primary-50)] flex items-center justify-center">
          <i class="pi pi-box text-[var(--p-primary-600)]"></i>
        </div>
        <div>
          <h1 class="text-2xl font-bold text-gray-900">{{ t('products.title') }}</h1>
          <p class="text-sm text-gray-500 mt-0.5">{{ t('products.subtitle') }}</p>
        </div>
      </div>
      <Button
        :label="t('products.addNew')"
        icon="pi pi-plus"
        @click="openNewProductDialog"
      />
    </div>

    <DataTable
      :value="productStore.products"
      responsiveLayout="scroll"
      class="p-datatable-sm"
      :rowHover="true"
    >
      <template #empty>
        <div class="flex flex-col items-center justify-center py-16 text-center">
          <i class="pi pi-box text-4xl text-gray-300 mb-3"></i>
          <h3 class="text-base font-medium text-gray-400">{{ t('products.empty.title') }}</h3>
          <p class="text-sm text-gray-400 mt-1">{{ t('products.empty.subtitle') }}</p>
        </div>
      </template>

      <Column
        field="name"
        :header="t('products.table.productName')"
        sortable
        class="font-semibold"
      ></Column>

      <Column
        field="description"
        :header="t('products.table.description')"
      ></Column>

      <Column :header="t('products.table.variationsAndStock')">
        <template #body="slotProps">
          <div class="space-y-1.5">
            <div
              v-for="variation in slotProps.data.variations"
              :key="variation.id"
              class="flex items-center justify-between p-1.5 bg-[#fff5f9] rounded border border-gray-100"
            >
              <div class="flex flex-col">
                <span class="text-xs font-medium">
                  {{ variation.variation_name || t('products.table.standard') }}
                </span>
                <span class="text-xs text-gray-500">
                  {{ t('products.table.price') }}: {{ variation.price }}€
                </span>
              </div>

              <div class="flex items-center gap-2">
                <Tag
                  :value="variation.stock_quantity"
                  :severity="getStockSeverity(variation.stock_quantity)"
                />

                <div class="flex gap-1">
                  <Button
                    icon="pi pi-minus"
                    class="p-button-rounded p-button-text p-button-sm"
                    severity="danger"
                    @click="adjustStock(variation.id, -1)"
                    :disabled="variation.stock_quantity <= 0"
                  />
                  <Button
                    icon="pi pi-plus"
                    class="p-button-rounded p-button-text p-button-sm"
                    severity="success"
                    @click="adjustStock(variation.id, 1)"
                  />
                </div>
              </div>
            </div>
          </div>
        </template>
      </Column>

      <Column :header="t('common.actions')" headerClass="text-center">
        <template #body="slotProps">
          <div class="flex gap-2">
            <Button
              icon="pi pi-pencil"
              class="p-button-rounded p-button-text p-button-sm"
              v-tooltip.top="t('products.tooltips.edit')"
              @click="editProduct(slotProps.data)"
            />
            <Button
              icon="pi pi-trash"
              class="p-button-rounded p-button-text p-button-sm"
              severity="danger"
              v-tooltip.top="t('products.tooltips.delete')"
              @click="confirmDeleteProduct(slotProps.data)"
            />
          </div>
        </template>
      </Column>
    </DataTable>

    <!-- Product Dialog -->
    <Dialog
      v-model:visible="productDialog"
      :header="isEdit ? t('products.dialog.editProduct') : t('products.dialog.createProduct')"
      modal
      :style="{ width: '50vw' }"
    >
      <div class="space-y-4">
        <div>
          <label for="name" class="block text-sm font-medium text-gray-700 mb-1">{{ t('products.dialog.productName') }}</label>
          <InputText
            id="name"
            v-model="newProduct.name"
            class="w-full"
            :placeholder="t('products.dialog.productNamePlaceholder')"
          />
        </div>
        <div>
          <label for="desc" class="block text-sm font-medium text-gray-700 mb-1">{{ t('products.dialog.description') }}</label>
          <Textarea
            id="desc"
            v-model="newProduct.description"
            class="w-full"
            rows="2"
          />
        </div>

        <div class="border-t pt-4">
          <div class="flex justify-between items-center mb-3">
            <span class="text-sm font-semibold text-gray-700">{{ t('products.dialog.variations') }}</span>
            <Button
              :label="t('products.dialog.addVariation')"
              icon="pi pi-plus"
              size="small"
              text
              @click="addVariationRow"
            />
          </div>

          <div
            v-for="(v, index) in newProduct.variations"
            :key="index"
            class="flex gap-2 mb-2 items-start bg-gray-50 border border-gray-100 p-3 rounded-lg"
          >
            <div class="flex-1">
              <label class="block text-xs font-medium text-gray-600 mb-1">{{ t('products.dialog.variationName') }}</label>
              <InputText
                v-model="v.variation_name"
                class="w-full h-full p-inputtext-sm"
                :placeholder="t('products.dialog.variationNamePlaceholder')"
              />
            </div>
            <div class="flex-1">
              <label class="block text-xs font-medium text-gray-600 mb-1">{{ t('products.dialog.price') }}</label>
              <InputNumber
                v-model="v.price"
                mode="decimal"
                :minFractionDigits="2"
                class="p-inputtext-sm"
              />
            </div>
            <div class="flex-1">
              <label class="block text-xs font-medium text-gray-600 mb-1">{{ t('products.dialog.initialStock') }}</label>
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
              class="mt-5"
            />
          </div>
        </div>
      </div>

      <template #footer>
        <Button
          :label="t('common.cancel')"
          icon="pi pi-times"
          text
          @click="productDialog = false"
        />
        <Button
          :label="t('products.dialog.saveProduct')"
          icon="pi pi-check"
          @click="saveProduct"
          :disabled="!newProduct.name || newProduct.variations.length === 0"
        />
      </template>
    </Dialog>

    <!-- Stock Adjust Dialog -->
    <Dialog
      v-model:visible="stockDialog"
      :header="t('products.adjustStock')"
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
        <Button :label="t('common.cancel')" text @click="stockDialog = false" />
        <Button :label="t('common.save')" @click="confirmStockAdjustment" />
      </template>
    </Dialog>

    <ConfirmDialog></ConfirmDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useProductStore } from "../stores/products";
import { useToast } from "primevue/usetoast";
import { useConfirm } from "primevue/useconfirm";

const { t } = useI18n();

// --- Type Definitions to fix errors ---
interface Variation {
  id?: number | string;
  variation_name: string;
  price: number;
  stock_quantity: number;
}

interface Product {
  id?: number | string;
  name: string;
  description: string;
  variations: Variation[];
}

const productStore = useProductStore();
const toast = useToast();
const confirm = useConfirm();

const stockDialog = ref(false);
const selectedVariation = ref<Variation | null>(null);
const stockAdjustment = ref(0);
const productDialog = ref(false);
const isEdit = ref(false);

const newProduct = ref<Product>({
  name: "",
  description: "",
  variations: [{ variation_name: "Standard", price: 0, stock_quantity: 0 }],
});

onMounted(() => {
  productStore.fetchProducts();
});

const openNewProductDialog = () => {
  isEdit.value = false;
  newProduct.value = {
    name: "",
    description: "",
    variations: [{ variation_name: "Standard", price: 0, stock_quantity: 0 }],
  };
  productDialog.value = true;
};

const editProduct = (product: Product) => {
  isEdit.value = true;
  newProduct.value = JSON.parse(JSON.stringify(product));
  productDialog.value = true;
};

const getStockSeverity = (qty: number) => {
  if (qty === 0) return "danger";
  if (qty < 5) return "warning";
  return "success";
};

const adjustStock = async (inventoryId: any, amount: number) => {
  try {
    await productStore.updateStock(inventoryId, amount);
    toast.add({
      severity: "success",
      summary: t('common.success'),
      detail: t('products.toast.stockUpdated'),
      life: 3000,
    });
  } catch (err) {
    toast.add({
      severity: "error",
      summary: t('common.error'),
      detail: t('products.toast.stockFailed'),
      life: 3000,
    });
  }
};

const confirmStockAdjustment = async () => {
  if (selectedVariation.value?.id && stockAdjustment.value !== 0) {
    await adjustStock(selectedVariation.value.id, stockAdjustment.value);
    stockDialog.value = false;
  }
};

const addVariationRow = () => {
  newProduct.value.variations.push({
    variation_name: "",
    price: 0,
    stock_quantity: 0,
  });
};

const removeVariationRow = (index: number) => {
  newProduct.value.variations.splice(index, 1);
};

const saveProduct = async () => {
  try {
    const token = localStorage.getItem("token");
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
        summary: t('common.success'),
        detail: isEdit.value ? t('products.toast.updated') : t('products.toast.created'),
        life: 3000,
      });
      productDialog.value = false;
      await productStore.fetchProducts();
    } else {
      const errorData = await res.json();
      toast.add({
        severity: "error",
        summary: t('common.error'),
        detail: errorData.error || t('products.toast.saveFailed'),
        life: 3000,
      });
    }
  } catch (err) {
    toast.add({
      severity: "error",
      summary: t('common.error'),
      detail: t('products.toast.saveFailed'),
      life: 3000,
    });
  }
};

const confirmDeleteProduct = (product: Product) => {
  confirm.require({
    message: t('products.confirmDelete', { name: product.name }),
    header: t('common.confirmDelete'),
    icon: "pi pi-exclamation-triangle",
    acceptClass: "p-button-danger",
    accept: async () => {
      if (!product.id) return;
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`/api/v1/products/${product.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          toast.add({
            severity: "success",
            summary: t('common.success'),
            detail: t('products.toast.deleted'),
            life: 3000,
          });
          await productStore.fetchProducts();
        } else {
          throw new Error("Failed to delete");
        }
      } catch (err) {
        toast.add({
          severity: "error",
          summary: t('common.error'),
          detail: t('products.toast.deleteFailed'),
          life: 3000,
        });
      }
    },
  });
};
</script>

<style scoped>
:deep(.p-datatable .p-datatable-tbody > tr > td) {
  padding: 1rem;
  vertical-align: top;
}
</style>
