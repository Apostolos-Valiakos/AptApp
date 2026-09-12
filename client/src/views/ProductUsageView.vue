<template>
  <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
    <div class="flex items-center gap-3 mb-6">
      <Button
        icon="pi pi-arrow-left"
        text
        rounded
        @click="router.push('/app/products')"
        :aria-label="t('common.back')"
      />
      <div class="w-10 h-10 rounded-xl bg-[var(--p-primary-50)] flex items-center justify-center">
        <i class="pi pi-chart-line text-[var(--p-primary-600)]"></i>
      </div>
      <div>
        <h1 class="text-2xl font-bold text-gray-900">{{ t('productUsage.title') }}</h1>
        <p class="text-sm text-gray-500 mt-0.5">{{ t('productUsage.subtitle') }}</p>
      </div>
    </div>

    <TabView>
      <!-- ===== Recipes tab ===== -->
      <TabPanel :header="t('productUsage.tabs.recipes')">
        <div class="max-w-xl mb-6">
          <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('productUsage.selectService') }}</label>
          <Dropdown
            v-model="selectedServiceId"
            :options="services"
            optionLabel="name"
            optionValue="id"
            filter
            :placeholder="t('productUsage.selectServicePlaceholder')"
            class="w-full"
            @change="loadRecipesForService"
          />
        </div>

        <div v-if="selectedServiceId">
          <div
            v-for="(row, index) in recipeRows"
            :key="index"
            class="flex flex-col sm:flex-row gap-3 mb-3 items-start bg-gray-50 border border-gray-100 p-3 rounded-lg"
          >
            <div class="flex-1 w-full min-w-0">
              <label class="block text-xs font-medium text-gray-600 mb-1">{{ t('productUsage.product') }}</label>
              <Dropdown
                v-model="row.product_inventory_id"
                :options="productVariationOptions"
                optionLabel="label"
                optionValue="id"
                filter
                class="w-full p-inputtext-sm"
                :placeholder="t('productUsage.selectProductPlaceholder')"
              />
            </div>
            <div class="w-full sm:w-40 sm:flex-shrink-0 min-w-0">
              <label class="block text-xs font-medium text-gray-600 mb-1">{{ t('productUsage.amountType') }}</label>
              <Dropdown
                v-model="row.amount_type"
                :options="amountTypeOptions"
                optionLabel="label"
                optionValue="value"
                class="w-full p-inputtext-sm"
              />
            </div>

            <template v-if="row.amount_type === 'exact'">
              <div class="w-full sm:w-32 sm:flex-shrink-0 min-w-0">
                <label class="block text-xs font-medium text-gray-600 mb-1">{{ t('productUsage.amountMl') }}</label>
                <InputNumber v-model="row.amount_value" class="w-full p-inputtext-sm" inputClass="w-full" :min="0" :maxFractionDigits="2" />
              </div>
            </template>
            <template v-else-if="row.amount_type === 'range'">
              <div class="w-full sm:w-28 sm:flex-shrink-0 min-w-0">
                <label class="block text-xs font-medium text-gray-600 mb-1">{{ t('productUsage.minMl') }}</label>
                <InputNumber v-model="row.amount_min" class="w-full p-inputtext-sm" inputClass="w-full" :min="0" :maxFractionDigits="2" />
              </div>
              <div class="w-full sm:w-28 sm:flex-shrink-0 min-w-0">
                <label class="block text-xs font-medium text-gray-600 mb-1">{{ t('productUsage.maxMl') }}</label>
                <InputNumber v-model="row.amount_max" class="w-full p-inputtext-sm" inputClass="w-full" :min="0" :maxFractionDigits="2" />
              </div>
            </template>
            <template v-else-if="row.amount_type === 'bottle'">
              <div class="w-full sm:w-32 sm:flex-shrink-0 min-w-0">
                <label class="block text-xs font-medium text-gray-600 mb-1">{{ t('productUsage.bottleCount') }}</label>
                <InputNumber v-model="row.amount_value" class="w-full p-inputtext-sm" inputClass="w-full" :min="0" :maxFractionDigits="2" />
              </div>
            </template>

            <Button
              icon="pi pi-trash"
              severity="danger"
              text
              @click="recipeRows.splice(index, 1)"
              class="sm:mt-5 flex-shrink-0"
              :aria-label="t('productUsage.removeRow')"
            />
          </div>

          <div class="flex items-center gap-2 mt-2">
            <Button
              :label="t('productUsage.addProduct')"
              icon="pi pi-plus"
              text
              size="small"
              @click="addRecipeRow"
            />
          </div>

          <div class="mt-6 flex justify-end">
            <Button :label="t('common.save')" icon="pi pi-check" @click="saveRecipes" :loading="savingRecipes" />
          </div>
        </div>
        <div v-else class="text-center py-12 text-gray-400">
          <i class="pi pi-arrow-up text-3xl mb-2"></i>
          <p>{{ t('productUsage.pickServiceHint') }}</p>
        </div>
      </TabPanel>

      <!-- ===== Stocktakes tab ===== -->
      <TabPanel :header="t('productUsage.tabs.stocktakes')">
        <div class="max-w-xl mb-6">
          <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('productUsage.product') }}</label>
          <Dropdown
            v-model="selectedInventoryId"
            :options="productVariationOptions"
            optionLabel="label"
            optionValue="id"
            filter
            :placeholder="t('productUsage.selectProductPlaceholder')"
            class="w-full"
            @change="loadStocktakeHistory"
          />
        </div>

        <div v-if="selectedInventoryId" class="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div class="bg-gray-50 border border-gray-100 rounded-lg p-4">
            <h3 class="font-semibold text-gray-800 mb-3">{{ t('productUsage.newStocktake') }}</h3>
            <div class="space-y-3">
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">{{ t('productUsage.remainingMl') }}</label>
                <InputNumber v-model="stocktakeForm.remaining_amount_ml" class="w-full" :min="0" :maxFractionDigits="2" />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">{{ t('productUsage.restockedMl') }}</label>
                <InputNumber v-model="stocktakeForm.restocked_amount_ml" class="w-full" :min="0" :maxFractionDigits="2" />
                <p class="text-xs text-gray-400 mt-1">{{ t('productUsage.restockedHint') }}</p>
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">{{ t('common.notes') }}</label>
                <Textarea v-model="stocktakeForm.notes" class="w-full" rows="2" />
              </div>
              <Button
                :label="t('productUsage.recordStocktake')"
                icon="pi pi-check"
                @click="submitStocktake"
                :loading="savingStocktake"
                :disabled="stocktakeForm.remaining_amount_ml === null"
              />
            </div>
          </div>

          <div>
            <h3 class="font-semibold text-gray-800 mb-3">{{ t('productUsage.history') }}</h3>
            <DataTable :value="stocktakeHistory" class="p-datatable-sm" :rowHover="true">
              <template #empty>
                <div class="text-center py-6 text-gray-400 text-sm">{{ t('productUsage.noStocktakes') }}</div>
              </template>
              <Column field="recorded_at" :header="t('productUsage.date')">
                <template #body="slotProps">{{ formatDate(slotProps.data.recorded_at) }}</template>
              </Column>
              <Column field="remaining_amount_ml" :header="t('productUsage.remainingMl')"></Column>
              <Column field="restocked_amount_ml" :header="t('productUsage.restockedMl')"></Column>
              <Column field="notes" :header="t('common.notes')"></Column>
            </DataTable>
          </div>
        </div>
        <div v-else class="text-center py-12 text-gray-400">
          <i class="pi pi-arrow-up text-3xl mb-2"></i>
          <p>{{ t('productUsage.pickProductHint') }}</p>
        </div>
      </TabPanel>
    </TabView>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useToast } from "primevue/usetoast";
import TabView from "primevue/tabview";
import TabPanel from "primevue/tabpanel";

const { t } = useI18n();
const router = useRouter();
const toast = useToast();

const token = () => localStorage.getItem("token");
const authHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });

interface RecipeRow {
  product_inventory_id: string | null;
  amount_type: "exact" | "range" | "bottle";
  amount_value: number | null;
  amount_min: number | null;
  amount_max: number | null;
}

const services = ref<any[]>([]);
const products = ref<any[]>([]);
const selectedServiceId = ref<string | null>(null);
const recipeRows = ref<RecipeRow[]>([]);
const savingRecipes = ref(false);

const selectedInventoryId = ref<string | null>(null);
const stocktakeForm = ref<{ remaining_amount_ml: number | null; restocked_amount_ml: number | null; notes: string }>({
  remaining_amount_ml: null,
  restocked_amount_ml: 0,
  notes: "",
});
const savingStocktake = ref(false);
const stocktakeHistory = ref<any[]>([]);

const amountTypeOptions = computed(() => [
  { label: t("productUsage.types.exact"), value: "exact" },
  { label: t("productUsage.types.range"), value: "range" },
  { label: t("productUsage.types.bottle"), value: "bottle" },
]);

const productVariationOptions = computed(() =>
  products.value.flatMap((p: any) =>
    (p.variations || []).map((v: any) => ({
      id: v.id,
      label: `${p.name} — ${v.variation_name || t("products.table.standard")}`,
    })),
  ),
);

const formatDate = (v: string) => new Date(v).toLocaleString();

const fetchServices = async () => {
  const res = await fetch("/api/v1/services", { headers: authHeaders() });
  services.value = res.ok ? await res.json() : [];
};

const fetchProducts = async () => {
  const res = await fetch("/api/v1/products", { headers: authHeaders() });
  products.value = res.ok ? await res.json() : [];
};

const addRecipeRow = () => {
  recipeRows.value.push({
    product_inventory_id: null,
    amount_type: "exact",
    amount_value: null,
    amount_min: null,
    amount_max: null,
  });
};

const loadRecipesForService = async () => {
  if (!selectedServiceId.value) return;
  const res = await fetch("/api/v1/product-usage/recipes", { headers: authHeaders() });
  const all = res.ok ? await res.json() : [];
  recipeRows.value = all
    .filter((r: any) => r.service_id === selectedServiceId.value)
    .map((r: any) => ({
      product_inventory_id: r.product_inventory_id,
      amount_type: r.amount_type,
      amount_value: r.amount_value != null ? Number(r.amount_value) : null,
      amount_min: r.amount_min != null ? Number(r.amount_min) : null,
      amount_max: r.amount_max != null ? Number(r.amount_max) : null,
    }));
};

const saveRecipes = async () => {
  if (!selectedServiceId.value) return;
  for (const r of recipeRows.value) {
    if (!r.product_inventory_id) {
      toast.add({ severity: "error", summary: t("common.error"), detail: t("productUsage.toast.missingProduct"), life: 3000 });
      return;
    }
    if (r.amount_type === "range" && !(Number(r.amount_min) < Number(r.amount_max))) {
      toast.add({ severity: "error", summary: t("common.error"), detail: t("productUsage.toast.invalidRange"), life: 3000 });
      return;
    }
  }
  savingRecipes.value = true;
  try {
    const res = await fetch(`/api/v1/services/${selectedServiceId.value}/recipes`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ recipes: recipeRows.value }),
    });
    if (!res.ok) throw new Error();
    toast.add({ severity: "success", summary: t("common.success"), detail: t("productUsage.toast.saved"), life: 3000 });
  } catch {
    toast.add({ severity: "error", summary: t("common.error"), detail: t("productUsage.toast.saveFailed"), life: 3000 });
  } finally {
    savingRecipes.value = false;
  }
};

const loadStocktakeHistory = async () => {
  if (!selectedInventoryId.value) return;
  const res = await fetch(`/api/v1/product-inventory/${selectedInventoryId.value}/stocktakes`, { headers: authHeaders() });
  stocktakeHistory.value = res.ok ? await res.json() : [];
};

const submitStocktake = async () => {
  if (!selectedInventoryId.value || stocktakeForm.value.remaining_amount_ml === null) return;
  savingStocktake.value = true;
  try {
    const res = await fetch(`/api/v1/product-inventory/${selectedInventoryId.value}/stocktake`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(stocktakeForm.value),
    });
    if (!res.ok) throw new Error();
    toast.add({ severity: "success", summary: t("common.success"), detail: t("productUsage.toast.stocktakeSaved"), life: 3000 });
    stocktakeForm.value = { remaining_amount_ml: null, restocked_amount_ml: 0, notes: "" };
    await loadStocktakeHistory();
  } catch {
    toast.add({ severity: "error", summary: t("common.error"), detail: t("productUsage.toast.stocktakeFailed"), life: 3000 });
  } finally {
    savingStocktake.value = false;
  }
};

onMounted(async () => {
  await Promise.all([fetchServices(), fetchProducts()]);
});
</script>
