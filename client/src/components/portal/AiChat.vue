<template>
  <!-- The assistant's conversation: messages, the cards it proposes and the
       box to write in. Shown in a dialog (AiChatPanel), a bottom sheet or the
       desktop's side panel (portal/PortalShell.vue). -->
  <div class="flex flex-col h-full min-h-0" data-testid="assistant-chat">
    <div ref="listRef" class="flex-1 overflow-y-auto px-4 py-3 space-y-3">
      <div class="text-sm text-gray-600 bg-gray-50 rounded-2xl rounded-tl-sm px-3 py-2 max-w-[85%]">
        {{ t("portal.ai.greeting") }}
      </div>
      <div v-if="!visibleMessages.length" class="flex flex-wrap gap-2">
        <button
          v-for="s in suggestions"
          :key="s"
          type="button"
          class="text-xs px-3 py-1.5 rounded-full border border-[var(--p-primary-200)] text-[var(--p-primary-600)] hover:bg-[var(--p-primary-50)]"
          @click="send(s)"
        >
          {{ s }}
        </button>
      </div>

      <template v-for="(m, i) in visibleMessages" :key="i">
        <div
          v-if="m.content"
          class="text-sm px-3 py-2 rounded-2xl max-w-[85%] whitespace-pre-wrap break-words"
          :class="
            m.role === 'user'
              ? 'ml-auto bg-[var(--p-primary-color)] text-white rounded-tr-sm'
              : 'bg-gray-50 text-gray-800 rounded-tl-sm'
          "
        >
          {{ m.content }}
        </div>

        <div
          v-for="(card, c) in m.actions || []"
          :key="`${i}-${c}`"
          class="border border-gray-200 rounded-2xl p-3 max-w-[92%] bg-white shadow-sm"
        >
          <div class="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">
            {{ t(`portal.ai.card.${card.action.type}`) }}
          </div>
          <div class="text-sm font-semibold text-gray-900">{{ card.action.service_name }}</div>
          <div v-if="card.action.staff_name" class="text-xs text-gray-500">
            {{ card.action.staff_name }}
          </div>
          <div
            v-if="card.action.type === 'reschedule'"
            class="text-xs text-gray-400 line-through mt-1"
          >
            {{ formatWhen(card.action.old_start_time) }}
          </div>
          <div class="text-sm text-gray-800 mt-1">{{ formatWhen(card.action.start_time) }}</div>
          <div
            v-if="card.action.type === 'booking' && card.action.price != null"
            class="text-xs text-gray-500 mt-1"
          >
            {{ formatDuration(card.action.duration_minutes || 0, t) }} · {{ formatMoney(card.action.price) }}
          </div>

          <div v-if="card.status === 'pending' || card.status === 'working'" class="flex gap-2 mt-3">
            <Button
              :label="t('portal.ai.card.confirm')"
              size="small"
              :loading="card.status === 'working'"
              :severity="card.action.type === 'cancel' ? 'danger' : undefined"
              @click="confirmCard(card)"
            />
            <Button
              :label="t('portal.ai.card.dismiss')"
              size="small"
              text
              :disabled="card.status === 'working'"
              @click="dismissCard(card)"
            />
          </div>
          <div
            v-else
            class="text-xs font-semibold mt-3"
            :class="{
              'text-green-600': card.status === 'done',
              'text-gray-400': card.status === 'dismissed',
              'text-red-500': card.status === 'failed',
            }"
          >
            {{ (card.status === "failed" && card.error) || t(`portal.ai.card.${card.status}`) }}
          </div>
        </div>
      </template>

      <div v-if="busy" class="text-xs text-gray-400 flex items-center gap-2">
        <i class="pi pi-spin pi-spinner"></i>
        {{ statusText || t("portal.ai.thinking") }}
      </div>
      <div v-if="errorText" class="text-xs text-red-500">{{ errorText }}</div>
    </div>

    <form class="border-t border-gray-100 p-3 flex gap-2" @submit.prevent="send()">
      <InputText
        v-model="input"
        class="flex-1"
        maxlength="2000"
        :placeholder="t('portal.ai.placeholder')"
        :disabled="busy"
      />
      <Button type="submit" icon="pi pi-send" :disabled="busy || !input.trim()" />
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from "vue";
import { storeToRefs } from "pinia";
import { useI18n } from "vue-i18n";
import { useAuthStore } from "../../stores/auth";
import { newIdempotencyKey, PortalActionError, usePortalBookingActions } from "../../portal/composables/usePortalBookingActions";
import { formatDate, formatDuration, formatMoney } from "../../utils/format";

import { useBookingSuccessStore } from "../../portal/stores/success";
import { portalV2 } from "../../portal/flag";
import { useAssistantStore, type AssistantCard as Card, type AssistantMessage as Message } from "../../portal/stores/assistant";

const { t, locale } = useI18n();
const authStore = useAuthStore();
const actions = usePortalBookingActions();
const success = useBookingSuccessStore();

// The conversation outlives the panel (closing it, changing tab).
const { messages, draft: input } = storeToRefs(useAssistantStore());
const busy = ref(false);
const statusText = ref("");
const errorText = ref("");
const listRef = ref<HTMLElement | null>(null);

const visibleMessages = computed(() => messages.value.filter((m) => !m.hidden));
const suggestions = computed(() => [
  t("portal.ai.suggestions.book"),
  t("portal.ai.suggestions.cancelPolicy"),
  t("portal.ai.suggestions.myAppointments"),
]);

const formatWhen = (iso: string) => formatDate(iso, locale.value, "weekdayTime");

const scrollDown = () =>
  nextTick(() => listRef.value?.scrollTo({ top: listRef.value.scrollHeight }));

// The assistant only ever sees plain text turns; cards are a UI concern.
const historyForRequest = () =>
  messages.value
    .filter((m) => m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));

const httpError = (status: number) =>
  status === 429
    ? t("portal.ai.errors.rateLimited")
    : status === 403
      ? t("portal.ai.errors.disabled")
      : t("portal.ai.errors.generic");

const send = async (preset?: string) => {
  const question = (preset ?? input.value).trim();
  if (!question || busy.value) return;
  const history = historyForRequest();
  messages.value.push({ role: "user", content: question });
  const reply: Message = { role: "assistant", content: "", actions: [] };
  messages.value.push(reply);
  const live = messages.value[messages.value.length - 1];
  input.value = "";
  busy.value = true;
  statusText.value = "";
  errorText.value = "";
  scrollDown();

  try {
    const res = await fetch("/ai/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authStore.token}`,
      },
      body: JSON.stringify({ question, history, locale: locale.value }),
    });
    if (!res.ok || !res.body) {
      errorText.value = httpError(res.status);
      return;
    }

    // Text written before a tool call is withdrawn by a "reset" event; this is
    // what the reply held before the current step started.
    let kept = "";
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const event = frame.match(/^event: (.+)$/m)?.[1];
        const data = JSON.parse(frame.match(/^data: (.+)$/m)?.[1] || "{}");
        if (event === "text") {
          live.content += data.text;
          statusText.value = "";
        } else if (event === "reset") {
          live.content = kept;
        } else if (event === "status") {
          kept = live.content;
          statusText.value = t("portal.ai.working");
        } else if (event === "action") {
          live.actions!.push({ action: data, status: "pending" });
        } else if (event === "error") {
          errorText.value =
            data.code === "busy" ? t("portal.ai.errors.busy") : t("portal.ai.errors.generic");
        }
        scrollDown();
      }
    }
  } catch {
    errorText.value = t("portal.ai.errors.generic");
  } finally {
    busy.value = false;
    statusText.value = "";
    scrollDown();
  }
};

// Tells the assistant what happened to a card, without showing it in the chat.
const note = (text: string) => messages.value.push({ role: "user", content: text, hidden: true });

const describe = (a: any) =>
  `${a.service_name}${a.staff_name ? `, ${a.staff_name}` : ""}, ${a.when}`;

// The same actions the portal's own screens use (usePortalBookingActions), so
// the server applies the same rules to both and the client gets the same
// vibration, texts and refreshed lists. The card shows the outcome, so no toast.
const confirmCard = async (card: Card) => {
  const a = card.action;
  card.status = "working";
  card.error = "";
  try {
    if (a.type === "booking") {
      // One key per card: pressing Confirm again after a lost answer can't
      // book twice.
      a.idempotency_key ||= newIdempotencyKey();
      const done = await actions.book({ service_id: a.service_id, staff_id: a.staff_id, start_time: a.start_time }, { key: a.idempotency_key, quiet: true });
      // The same "done" sheet as booking from the screen (Add to calendar, Share).
      if (portalV2.value) success.show(done.id, "booked");
    } else if (a.type === "cancel") {
      await actions.cancel(a.appointment_id, { quiet: true });
    } else {
      await actions.reschedule(a.appointment_id, { start_time: a.start_time, staff_id: a.staff_id }, { quiet: true });
      if (portalV2.value) success.show(a.appointment_id, "moved");
    }
    card.status = "done";
    note(`[Portal note: the client pressed Confirm and the ${a.type} succeeded: ${describe(a)}.]`);
  } catch (err) {
    card.status = "failed";
    card.error = err instanceof PortalActionError ? err.message : "";
    const reason = err instanceof PortalActionError ? err.reason : "unknown";
    note(`[Portal note: the client pressed Confirm but the ${a.type} failed (${describe(a)}); the spa's system said: ${reason}. Nothing was changed.]`);
  }
};

const dismissCard = (card: Card) => {
  card.status = "dismissed";
  note(`[Portal note: the client dismissed the ${card.action.type} card (${describe(card.action)}). Nothing was changed.]`);
};
</script>
