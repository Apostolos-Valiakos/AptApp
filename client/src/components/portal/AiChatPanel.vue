<template>
  <Dialog
    v-model:visible="visibleModel"
    modal
    :header="t('portal.ai.title')"
    :style="{ width: '440px', maxWidth: '96vw' }"
    :contentStyle="{ padding: 0 }"
  >
    <div class="flex flex-col h-[70vh]">
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
              {{ t(`portal.ai.card.${card.status}`) }}
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
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from "vue";
import { useI18n } from "vue-i18n";
import Dialog from "primevue/dialog";
import { useAuthStore } from "../../stores/auth";
import { api, ApiError } from "../../api/http";
import { formatDate, formatDuration, formatMoney } from "../../utils/format";

type Card = { action: any; status: "pending" | "working" | "done" | "dismissed" | "failed" };
type Message = { role: "user" | "assistant"; content: string; hidden?: boolean; actions?: Card[] };

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ "update:visible": [boolean] }>();
const visibleModel = computed({
  get: () => props.visible,
  set: (v) => emit("update:visible", v),
});

const { t, locale } = useI18n();
const authStore = useAuthStore();

const messages = ref<Message[]>([]);
const input = ref("");
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

// The same requests the portal's own screens make, so the server applies the
// same rules (only offered times, only future bookings) to both.
const performAction = (a: any) => {
  if (a.type === "booking") {
    // One key per card: pressing Confirm again after a lost answer can't
    // book twice.
    a.idempotency_key ||= typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    return api.post(
      "/api/v1/appointments",
      { services: [{ service_id: a.service_id, staff_id: a.staff_id, start_time: a.start_time }] },
      { headers: { "Idempotency-Key": a.idempotency_key } },
    );
  }
  if (a.type === "cancel") return api.post(`/api/v1/portal/appointments/${a.appointment_id}/cancel`);
  return api.post(`/api/v1/portal/appointments/${a.appointment_id}/reschedule`, { start_time: a.start_time, staff_id: a.staff_id });
};

const confirmCard = async (card: Card) => {
  card.status = "working";
  try {
    await performAction(card.action);
    card.status = "done";
    note(`[Portal note: the client pressed Confirm and the ${card.action.type} succeeded: ${describe(card.action)}.]`);
    // The portal's lists (next booking, bookings) show the change at once.
    window.dispatchEvent(new CustomEvent("appointments-changed"));
  } catch (err) {
    card.status = "failed";
    const reason = err instanceof ApiError ? err.data?.reason || err.data?.error || `HTTP ${err.status}` : "no connection";
    note(`[Portal note: the client pressed Confirm but the ${card.action.type} failed (${describe(card.action)}); the spa's system said: ${reason}. Nothing was changed.]`);
  }
};

const dismissCard = (card: Card) => {
  card.status = "dismissed";
  note(`[Portal note: the client dismissed the ${card.action.type} card (${describe(card.action)}). Nothing was changed.]`);
};
</script>
