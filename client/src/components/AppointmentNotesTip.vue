<template>
  <!-- An appointment's notes in a list: an info icon that shows them on
       hover, or on focus/tap on a phone. Both kinds, each labelled: the
       appointment notes and the internal (staff-only) note. -->
  <button
    v-if="text"
    type="button"
    class="inline-flex items-center justify-center w-5 h-5 rounded-full text-amber-600 hover:bg-amber-50 flex-shrink-0"
    v-tooltip.top="{ value: text, class: 'appointment-notes-tip' }"
    :aria-label="text"
    data-testid="appointment-notes-tip"
    @click.stop
  >
    <i class="pi pi-info-circle text-xs"></i>
  </button>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";

const props = defineProps<{ appointment: { booking_notes?: string | null; internal_notes?: string | null } | null | undefined }>();
const { t } = useI18n();
const text = computed(() => {
  const booking = (props.appointment?.booking_notes || "").trim();
  const internal = (props.appointment?.internal_notes || "").trim();
  return [
    booking && `${t("common.appointmentNotes")}: ${booking}`,
    internal && `${t("common.internalNote")}: ${internal}`,
  ].filter(Boolean).join("\n\n");
});
</script>

<style>
/* Long notes keep their line breaks and wrap inside a readable width. */
.appointment-notes-tip .p-tooltip-text {
  white-space: pre-line;
  max-width: 18rem;
}
</style>
