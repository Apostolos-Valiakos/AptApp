<template>
  <div class="space-y-3 pt-4 border-t border-gray-100">
    <label class="text-xs font-bold text-gray-500 uppercase tracking-wider">
      Products
    </label>

    <div
      v-for="(product, index) in modelValue"
      :key="'prod-' + index"
      class="relative p-4 border border-gray-200 rounded-lg bg-white group hover:border-emerald-300 transition-colors"
    >
      <button
        @click="removeProduct(index)"
        class="absolute -right-2 -top-2 bg-white p-1 rounded-full shadow border border-gray-200 text-gray-400 hover:text-red-600 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity z-10"
      >
        <i class="pi pi-times text-xs"></i>
      </button>

      <div class="flex flex-col sm:flex-row gap-3">
        <div class="w-full sm:flex-grow">
          <label class="text-xs text-gray-500 block mb-1">Product</label>
          <Dropdown
            v-model="product.product_id"
            :options="flatProducts"
            optionLabel="name"
            optionValue="id"
            placeholder="Select Product"
            class="w-full p-inputtext-sm"
            filter
            @change="() => updateProductDetails(index)"
          >
            <template #option="slotProps">
              <div class="flex justify-between items-center w-full gap-2">
                <span class="truncate">{{ slotProps.option.name }}</span>
                <span
                  class="text-xs whitespace-nowrap"
                  :class="
                    slotProps.option.stock < 5
                      ? 'text-red-500 font-bold'
                      : 'text-gray-400'
                  "
                >
                  Stock: {{ slotProps.option.stock }}
                </span>
              </div>
            </template>
          </Dropdown>
        </div>

        <div class="flex gap-3 w-full sm:w-auto">
          <div class="w-1/2 sm:w-24">
            <label class="text-xs text-gray-500 block mb-1">Qty</label>
            <InputNumber
              v-model="product.quantity"
              class="w-full p-inputtext-sm"
              inputClass="w-full"
              :min="1"
            />
          </div>

          <div class="w-1/2 sm:w-32">
            <label class="text-xs text-gray-500 block mb-1">Price</label>
            <InputNumber
              v-model="product.price"
              mode="currency"
              currency="EUR"
              class="w-full p-inputtext-sm"
              inputClass="w-full"
            />
          </div>
        </div>
      </div>
    </div>

    <button
      @click="addProduct"
      class="text-emerald-600 text-sm font-semibold hover:underline flex items-center gap-1 mt-2 w-full sm:w-auto justify-center sm:justify-start p-2 sm:p-0"
    >
      <i class="pi pi-plus-circle"></i> Add a product
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps({
  modelValue: {
    type: Array as () => any[],
    required: true,
  },
  allProducts: {
    type: Array as () => any[],
    default: () => [],
  },
});

const emit = defineEmits(["update:modelValue"]);

const flatProducts = computed(() => {
  if (!props.allProducts) return [];
  const list: any[] = [];

  props.allProducts.forEach((p: any) => {
    if (p.variations && p.variations.length > 0) {
      p.variations.forEach((v: any) => {
        list.push({
          id: v.id,
          name: `${p.name} (${v.variation_name || "Standard"})`,
          price: v.price,
          stock: v.stock_quantity,
        });
      });
    }
  });

  return list;
});

const addProduct = () => {
  const newList = [
    ...props.modelValue,
    {
      product_id: null,
      quantity: 1,
      price: 0,
    },
  ];
  emit("update:modelValue", newList);
};

const removeProduct = (index: number) => {
  const newList = [...props.modelValue];
  newList.splice(index, 1);
  emit("update:modelValue", newList);
};

const updateProductDetails = (index: number) => {
  const newList = [...props.modelValue];
  const item = newList[index];
  const found = flatProducts.value.find((p: any) => p.id === item.product_id);

  if (found) {
    item.price = Number(found.price);
  }
  emit("update:modelValue", newList);
};
</script>
