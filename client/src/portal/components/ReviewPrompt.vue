<template>
  <!-- "How was it?" after a visit (P12, N10): asked once per visit. Five
       stars opens the shop's review page; fewer just say thank you. Nothing
       but "asked" is stored. -->
  <div v-if="!answered" class="w-full space-y-2" data-testid="review-prompt">
    <div class="flex gap-1" role="radiogroup" :aria-label="t('portal.v2.upNext.howWasIt')">
      <button
        v-for="n in 5"
        :key="n"
        type="button"
        role="radio"
        :aria-checked="rating === n"
        :aria-label="t('portal.v2.review.stars', { n }, n)"
        class="portal-target text-2xl"
        :class="n <= rating ? 'text-amber-500' : 'opacity-30'"
        @click="rate(n)"
      >
        <i class="pi" :class="n <= rating ? 'pi-star-fill' : 'pi-star'"></i>
      </button>
    </div>
  </div>
  <p v-else class="w-full portal-small" data-testid="review-thanks">{{ rating === 5 && reviewUrl ? t("portal.v2.review.thanksReview") : t("portal.v2.review.thanks") }}</p>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { api } from "../../api/http";
import { useFeedback } from "../composables/useFeedback";

const props = defineProps<{ bookingId: string; reviewUrl: string | null }>();
const emit = defineEmits<{ answered: [] }>();
const { t } = useI18n();
const feedback = useFeedback();
const rating = ref(0);
const answered = ref(false);

const rate = (n: number) => {
  rating.value = n;
  answered.value = true;
  feedback.success();
  // Opened in the same tap, or the browser blocks it.
  if (n === 5 && props.reviewUrl) window.open(props.reviewUrl, "_blank", "noopener");
  api.post(`/api/v1/portal/appointments/${encodeURIComponent(props.bookingId)}/review-prompted`).catch(() => {});
  emit("answered");
};
</script>
