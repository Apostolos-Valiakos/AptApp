<template>
  <slot v-if="!required || reauthToken" />
  <div v-else class="flex justify-center py-12 px-4" data-testid="sensitive-gate">
    <form class="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4" @submit.prevent="unlock">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-[var(--p-primary-50)] flex items-center justify-center flex-shrink-0">
          <i class="pi pi-lock text-[var(--p-primary-600)]"></i>
        </div>
        <h2 class="text-lg font-bold text-gray-900">{{ t("sensitive.title") }}</h2>
      </div>
      <p class="text-sm text-gray-500">{{ t("sensitive.note") }}</p>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1" for="sensitive-password">{{ t("sensitive.password") }}</label>
        <InputText
          ref="field"
          id="sensitive-password"
          v-model="password"
          type="password"
          autocomplete="current-password"
          class="w-full"
          :invalid="!!error"
          data-testid="sensitive-password"
        />
        <p v-if="error" class="text-xs text-red-600 mt-1" data-testid="sensitive-error">{{ error }}</p>
      </div>
      <div class="flex justify-end gap-2">
        <Button type="button" :label="t('common.cancel')" text data-testid="sensitive-cancel" @click="router.push('/app/scheduler')" />
        <Button
          type="submit"
          :label="t('sensitive.open')"
          icon="pi pi-unlock"
          :loading="busy"
          :disabled="!password"
          data-testid="sensitive-submit"
        />
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { api, ApiError } from "../api/http";
import { reauthToken } from "../utils/reauth";

const props = withDefaults(defineProps<{ required?: boolean }>(), { required: true });
const emit = defineEmits<{ unlocked: [] }>();
const { t } = useI18n();
const router = useRouter();

const password = ref("");
const busy = ref(false);
const error = ref("");
const field = ref<any>(null);

const focusField = () => nextTick(() => field.value?.$el?.focus?.());

const unlock = async () => {
  if (!password.value || busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    const { token } = await api.post("/api/v1/reauth", { password: password.value });
    reauthToken.value = token;
    await nextTick();
    emit("unlocked");
  } catch (e) {
    const code = e instanceof ApiError ? e.data?.error : null;
    error.value = t(code === "wrong_password" ? "sensitive.wrong" : code === "too_many_attempts" ? "sensitive.tooMany" : "sensitive.failed");
    focusField();
  } finally {
    password.value = "";
    busy.value = false;
  }
};

onMounted(focusField);
// The server can also ask again, when the proof has expired.
watch(reauthToken, (token) => {
  if (!token) focusField();
});
// Asked again each time the page is opened.
onUnmounted(() => {
  if (props.required) reauthToken.value = null;
});
</script>
