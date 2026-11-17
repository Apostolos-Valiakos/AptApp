<template>
  <div class="space-y-3 pt-4 border-t border-gray-100">
    <!-- Section header -->
    <div class="flex items-center gap-2 mb-3">
      <i class="pi pi-shopping-bag text-gray-400"></i>
      <label class="text-xs font-bold text-gray-500 uppercase tracking-wider">{{ t('bookingProducts.label') }}</label>
    </div>

    <!-- Product rows -->
    <div
      v-for="(product, index) in modelValue"
      :key="'prod-' + index"
      class="relative p-4 border border-gray-100 rounded-xl bg-white shadow-sm group hover:border-emerald-300 transition-colors"
    >
      <button
        @click="removeProduct(index)"
        class="absolute -right-2 -top-2 bg-white p-1 rounded-full shadow border border-gray-200 text-gray-400 hover:text-red-600 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity z-10"
      >
        <i class="pi pi-times text-xs"></i>
      </button>

      <!-- The product column takes what's left and never grows with a long
           name (min-w-0): the name is cut with "…" so quantity and price stay
           inside the dialog. -->
      <div class="flex flex-col sm:flex-row gap-3">
        <div class="w-full min-w-0 sm:flex-1">
          <label class="text-xs text-gray-500 block mb-1">{{ t('bookingProducts.product') }}</label>
          <Dropdown
            v-model="product.product_id"
            :options="flatProducts"
            optionLabel="name"
            optionValue="id"
            :placeholder="t('bookingProducts.selectProduct')"
            class="w-full min-w-0 p-inputtext-sm"
            labelClass="truncate"
            overlayClass="max-w-[min(36rem,calc(100vw-2rem))]"
            :title="productLabel(product.product_id)"
            data-testid="product-pick"
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
                  {{ t('bookingProducts.stock') }}: {{ slotProps.option.stock }}
                </span>
              </div>
            </template>
          </Dropdown>
        </div>

        <div class="flex gap-3 w-full sm:w-auto sm:shrink-0">
          <div class="w-1/2 sm:w-24">
            <label class="text-xs text-gray-500 block mb-1">{{ t('bookingProducts.qty') }}</label>
            <InputNumber
              v-model="product.quantity"
              class="w-full"
              inputClass="p-inputtext-sm w-full"
              :min="1"
            />
          </div>

          <div class="w-1/2 sm:w-32">
            <label class="text-xs text-gray-500 block mb-1">{{ t('bookingProducts.price') }}</label>
            <InputNumber
              v-model="product.price"
              mode="currency"
              currency="EUR"
              class="w-full"
              inputClass="p-inputtext-sm w-full"
            />
          </div>
        </div>
      </div>

      <!-- Who sold it: only when someone can earn product commission (or one was already picked). -->
      <div v-if="sellerOptions(product).length" class="mt-3">
        <label class="text-xs text-gray-500 block mb-1">{{ t('bookingProducts.soldBy') }}</label>
        <Dropdown
          v-model="product.staff_id"
          :options="sellerOptions(product)"
          optionLabel="name"
          optionValue="id"
          showClear
          :placeholder="t('bookingProducts.noSeller')"
          class="w-full min-w-0 p-inputtext-sm"
          labelClass="truncate"
          data-testid="product-seller"
          @change="emit('update:modelValue', [...props.modelValue])"
        />
      </div>
    </div>

    <!-- Add product button -->
    <button
      @click="addProduct"
      class="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center gap-2 text-gray-400 font-medium hover:border-emerald-300 hover:text-emerald-600 hover:bg-emerald-50 transition-all duration-200 mt-2"
    >
      <i class="pi pi-plus-circle"></i>
      <span>{{ t('bookingProducts.addProduct') }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { api } from "../../api/http";
import { useCalendarStore } from "../../stores/calendar";
const { t } = useI18n();
const calendarStore = useCalendarStore();

const props = defineProps({
  modelValue: {
    type: Array as () => any[],
    required: true,
  },
  allProducts: {
    type: Array as () => any[],
    default: () => [],
  },
  // The booking's therapist: filled in as a new product's seller when they
  // earn product commission.
  defaultSellerId: {
    type: String as () => string | null,
    default: null,
  },
});

// Staff with product commission on. Offline or refused: none to pick, and a
// seller already picked stays.
const sellers = ref<{ id: string; name: string }[]>([]);
const sellersKnown = ref(false);
onMounted(async () => {
  try {
    sellers.value = await api.get("/api/v1/product-sellers");
    sellersKnown.value = true;
  } catch {
    sellers.value = [];
  }
});
const staffName = (id: string) => calendarStore.resources.find((r: any) => r.id === id)?.name || "—";
const sellerOptions = (product: any) =>
  product.staff_id && !sellers.value.some((s) => s.id === product.staff_id)
    ? [...sellers.value, { id: product.staff_id, name: staffName(product.staff_id) }]
    : sellers.value;

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
// The full name on hover, since a long one is cut in the field.
const productLabel = (id: string | null) => flatProducts.value.find((p) => p.id === id)?.name;

const addProduct = () => {
  // Without the list (offline), no seller is sent and the server keeps the
  // booking's therapist, as before sellers could be picked.
  const seller = sellersKnown.value
    ? { staff_id: sellers.value.some((s) => s.id === props.defaultSellerId) ? props.defaultSellerId : null }
    : {};
  const newList = [
    ...props.modelValue,
    {
      product_id: null,
      ...seller,
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
