<template>
  <div
    class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6"
  >
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2">
        <i class="pi pi-building text-[var(--p-primary-color)]"></i>
        <h3 class="font-bold text-gray-900 text-sm">{{ t('profile.clinicInfo.title') }}</h3>
      </div>
      <Button
        size="small"
        :label="t('common.save')"
        :loading="isSavingContact"
        @click="saveContact"
      />
    </div>
    <div class="space-y-3">
      <div>
        <label class="text-xs font-medium text-gray-500 block mb-1"
          >{{ t('common.phone') }}</label
        >
        <InputText
          v-model="contactForm.phone"
          class="w-full"
          placeholder="+30 210 000 0000"
        />
      </div>
      <div>
        <label class="text-xs font-medium text-gray-500 block mb-1"
          >{{ t('profile.clinicInfo.address') }}</label
        >
        <InputText
          v-model="contactForm.address"
          class="w-full"
          :placeholder="t('profile.clinicInfo.addressPlaceholder')"
        />
      </div>
      <div>
        <label class="text-xs font-medium text-gray-500 block mb-1"
          >{{ t('profile.clinicInfo.website') }}</label
        >
        <InputText
          v-model="contactForm.website"
          class="w-full"
          placeholder="https://..."
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// The shop's phone, address and website (shown to clients).
import { reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import { api, withMessage } from "../../api/http";
import { useNotify } from "../../composables/useNotify";

const props = defineProps<{ profile: any }>();
const { t } = useI18n();
const notify = useNotify();

const isSavingContact = ref(false);
const contactForm = reactive({ phone: "", address: "", website: "" });
watch(
  () => props.profile,
  (p) => {
    contactForm.phone = p?.shop_phone || "";
    contactForm.address = p?.shop_address || "";
    contactForm.website = p?.shop_website || "";
  },
  { immediate: true },
);

const saveContact = async () => {
  isSavingContact.value = true;
  try {
    await api
      .put("/api/v1/shop/contact", {
        phone: contactForm.phone,
        address: contactForm.address,
        website: contactForm.website,
      })
      .catch(withMessage(t("profile.toast.saveFailed")));
    notify.success(t("profile.clinicInfo.updated"));
  } catch (e: any) {
    notify.error(e.message);
  } finally {
    isSavingContact.value = false;
  }
};
</script>
