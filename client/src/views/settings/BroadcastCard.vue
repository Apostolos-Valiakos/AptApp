<template>
  <div
    class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8"
  >
    <div class="mb-6">
      <h3 class="text-lg font-bold text-gray-900">
        {{ t('profile.broadcast.title') }}
      </h3>
      <p class="text-sm text-gray-500 max-w-xl">
        {{ t('profile.broadcast.description') }}
      </p>
    </div>
    <div class="space-y-4">
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1"
          >{{ t('profile.broadcast.notificationTitle') }}</label
        >
        <InputText
          v-model="broadcastForm.title"
          class="w-full"
          :placeholder="t('profile.broadcast.notificationTitlePlaceholder')"
          maxlength="80"
        />
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1"
          >{{ t('profile.broadcast.message') }}</label
        >
        <Textarea
          v-model="broadcastForm.body"
          class="w-full"
          rows="3"
          autoResize
          :placeholder="t('profile.broadcast.messagePlaceholder')"
          maxlength="300"
        />
      </div>
      <div class="flex justify-end">
        <Button
          :label="t('profile.broadcast.send')"
          icon="pi pi-send"
          :loading="isSendingBroadcast"
          :disabled="!broadcastForm.title.trim() || !broadcastForm.body.trim()"
          @click="sendBroadcast"
        />
      </div>
    </div>

    <div v-if="recentBroadcasts.length" class="mt-6 pt-6 border-t border-gray-100">
      <p class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
        {{ t('profile.broadcast.recentlySent') }}
      </p>
      <div
        v-for="b in recentBroadcasts"
        :key="b.id"
        class="flex items-start justify-between gap-3 py-2 text-sm"
      >
        <div class="min-w-0">
          <p class="font-medium text-gray-800 truncate">{{ b.title }}</p>
          <p class="text-xs text-gray-400 truncate">{{ b.body }}</p>
        </div>
        <span class="text-xs text-gray-400 flex-shrink-0"
          >{{ t('profile.broadcast.sentCount', { n: b.recipient_count }) }}</span
        >
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// A push message to every client with notifications on, and the last ones sent.
import { onMounted, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useToast } from "primevue/usetoast";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Textarea from "primevue/textarea";
import { api, ifRefused, withMessage } from "../../api/http";
import { useNotify } from "../../composables/useNotify";

const { t } = useI18n();
const toast = useToast();
const notify = useNotify();

const isSendingBroadcast = ref(false);
const broadcastForm = reactive({ title: "", body: "" });
const recentBroadcasts = ref<any[]>([]);

const fetchRecentBroadcasts = async () => {
  try {
    recentBroadcasts.value = await api.get("/api/v1/broadcasts").catch(ifRefused(recentBroadcasts.value));
  } catch {}
};
onMounted(fetchRecentBroadcasts);

const sendBroadcast = async () => {
  isSendingBroadcast.value = true;
  try {
    const data = await api.post("/api/v1/broadcasts", broadcastForm).catch(withMessage(t("profile.toast.saveFailed")));
    toast.add({
      severity: "success",
      summary: t("profile.broadcast.sent"),
      detail: t("profile.broadcast.deliveredDetail", { n: data.recipient_count }),
      life: 3000,
    });
    broadcastForm.title = "";
    broadcastForm.body = "";
    fetchRecentBroadcasts();
  } catch (e: any) {
    notify.error(e.message);
  } finally {
    isSendingBroadcast.value = false;
  }
};
</script>
