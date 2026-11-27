<template>
  <!-- "Book again" (P3, N1, client-portal-prototype.html): the last few
       treatments with the same therapist, one tap from the time picker. -->
  <section v-if="pairs.length" data-testid="book-again">
    <h2 class="pp-h2">{{ t("portal.v2.home.bookAgain") }} <router-link to="/portal/bookings?tab=past">{{ t("portal.v2.home.seeAll") }}</router-link></h2>
    <div class="pp-hscroll -mx-4 px-4">
      <router-link
        v-for="p in pairs"
        :key="`${p.service_id}-${p.staff_id}`"
        :to="{ path: '/portal/book', query: { service: p.service_id, ...(p.staff_id ? { staff: p.staff_id } : {}) } }"
        class="pp-card w-[210px] p-4 flex flex-col gap-2.5 text-left"
      >
        <span class="pp-chip self-start !text-[11.5px]">{{ t("portal.v2.home.sameAsLast") }}</span>
        <span class="font-semibold leading-tight line-clamp-2">{{ p.service_name }}</span>
        <span class="flex items-center gap-2.5 mt-auto">
          <span class="pp-avatar">{{ initial(p.staff_name) }}</span>
          <span class="flex-1 min-w-0 pp-small pp-muted leading-snug">
            <span class="block truncate">{{ p.staff_name || t("portal.v2.home.anyone") }}</span>
            <span class="block">{{ p.duration_minutes }}′ · {{ formatMoney(p.price) }}</span>
          </span>
          <i class="pi pi-arrow-right text-[var(--portal-accent-text)]"></i>
        </span>
      </router-link>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { formatMoney } from "../../utils/format";
import { bookAgainPairs } from "../utils/upNext";
import type { PortalBooking } from "../stores/bookings";

const props = defineProps<{ past: PortalBooking[] }>();
const { t } = useI18n();
const pairs = computed(() => bookAgainPairs(props.past));
const initial = (name: string | null) => (name ? [...name.trim()][0]?.toUpperCase() : "·");
</script>
