<template>
  <!-- "Book again" (P3, N1): the last few treatments with the same therapist,
       one tap from the time picker. -->
  <section v-if="pairs.length" class="space-y-2" data-testid="book-again">
    <h3 class="portal-display portal-h3 px-1">{{ t("portal.v2.home.bookAgain") }}</h3>
    <div class="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x">
      <router-link
        v-for="(p, i) in pairs"
        :key="`${p.service_id}-${p.staff_id}`"
        :to="{ path: '/portal/book', query: { service: p.service_id, ...(p.staff_id ? { staff: p.staff_id } : {}) } }"
        class="portal-card snap-start flex-shrink-0 w-48 p-4 flex flex-col gap-1 portal-target"
      >
        <span v-if="i === 0" class="portal-micro font-semibold uppercase tracking-wide text-[var(--portal-accent-text)]">{{ t("portal.v2.home.sameAsLast") }}</span>
        <span class="font-semibold leading-tight">{{ p.service_name }}</span>
        <span class="portal-caption">{{ p.staff_name || t("portal.v2.home.anyone") }}</span>
        <span class="portal-caption mt-auto">{{ formatDuration(p.duration_minutes, t) }} · {{ formatMoney(p.price) }}</span>
      </router-link>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { formatDuration, formatMoney } from "../../utils/format";
import { bookAgainPairs } from "../utils/upNext";
import type { PortalBooking } from "../stores/bookings";

const props = defineProps<{ past: PortalBooking[] }>();
const { t } = useI18n();
const pairs = computed(() => bookAgainPairs(props.past));
</script>
