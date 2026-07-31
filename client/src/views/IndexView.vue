<template>
  <div class="saas-landing">
    <!-- ═══════════════════════════════════════════════════════
         NAV
    ═══════════════════════════════════════════════════════ -->
    <nav
      class="fixed top-0 left-0 right-0 z-50 bg-white border-b border-[var(--p-primary-200)]/40 shadow-sm"
    >
      <div
        class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16"
      >
        <div class="flex items-center gap-2">
          <div
            class="w-8 h-8 rounded-full bg-[#F3E2DA] flex items-center justify-center"
          >
            <svg viewBox="0 0 100 100" class="w-5 h-5">
              <g fill="#7A1F44">
                <path d="M50,50 C40,35 40,15 50,8 C60,15 60,35 50,50 Z" />
                <path
                  d="M50,50 C40,35 40,15 50,8 C60,15 60,35 50,50 Z"
                  transform="rotate(90 50 50)"
                />
                <path
                  d="M50,50 C40,35 40,15 50,8 C60,15 60,35 50,50 Z"
                  transform="rotate(180 50 50)"
                />
                <path
                  d="M50,50 C40,35 40,15 50,8 C60,15 60,35 50,50 Z"
                  transform="rotate(270 50 50)"
                />
              </g>
              <circle cx="50" cy="50" r="6.5" fill="#C9A15A" />
            </svg>
          </div>
          <span
            class="text-xl font-semibold tracking-wide text-gray-800"
            style="font-family: &quot;Georgia&quot;, serif"
          >
            Book4<span class="text-[var(--p-primary-700)] font-bold"
              >Beauty</span
            >
          </span>
        </div>
        <div
          class="hidden md:flex items-center gap-8 text-sm font-medium text-gray-600"
        >
          <a
            href="#features"
            class="hover:text-[var(--p-primary-color)] transition-colors"
            >{{ t("landing.nav.features") }}</a
          >
          <a
            href="#how-it-works"
            class="hover:text-[var(--p-primary-color)] transition-colors"
            >{{ t("landing.nav.howItWorks") }}</a
          >
          <a
            href="#pricing"
            class="hover:text-[var(--p-primary-color)] transition-colors"
            >{{ t("landing.nav.pricing") }}</a
          >
          <a
            href="#contact"
            class="hover:text-[var(--p-primary-color)] transition-colors"
            >{{ t("landing.nav.contact") }}</a
          >
          <Button
            :label="t('landing.nav.signIn')"
            icon="pi pi-sign-in"
            size="small"
            class="!bg-[var(--p-primary-color)] border-none !text-white"
            @click="router.push('/login')"
          />
        </div>
        <Button
          :label="t('landing.nav.signIn')"
          icon="pi pi-sign-in"
          size="small"
          class="md:hidden !bg-[var(--p-primary-color)] border-none !text-white"
          @click="router.push('/login')"
        />
      </div>
    </nav>

    <!-- ═══════════════════════════════════════════════════════
         HERO
    ═══════════════════════════════════════════════════════ -->
    <section
      class="relative min-h-screen flex items-center justify-center overflow-hidden pt-16"
    >
      <div
        class="absolute inset-0 bg-gradient-to-br from-[var(--p-primary-950)] via-[var(--p-primary-900)] to-black"
      ></div>
      <!-- subtle grain overlay -->
      <div
        class="absolute inset-0 opacity-[0.04]"
        style="
          background-image: url(&quot;data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAMAAAAp4XiDAAAAUVBMVEWFhYWDg4N3d3dtbW17e3t1dXWBgYGHh4t5eXlzc3OLi4ubm5uVlZWPj4+NjY19fX2JiYl/f39ra2uRkZGZmZlpaWmXl5dvb29xcXGTk5NnZ2c8TV1mAAAAG3RSTlNAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAvEOwtAAAFVklEQVR4XpWWB67c2BUFb3g557T/hRo9/WUMZHlgr4Bg8Z4qQgQJlHI4A8SzFVrapvmTF9O7dmYRFZ60YiBhJRCgh1FYhiLAmdvX0CzTOpNE77ME0Zty/nWWzchDtiqrmQDeuv3powQ5ta2eN0FY0InkqDD73lT9c9lEzwUNqgFHs9VQce3TVClFCQrSTfOiYkVJQBmpbq2L6iZavPnAPcoU0dSw0SUTqz/GtrGuXfbyyBniKykOWQWGqwwMA7QiYAxi+IlPdqo+hYHnUt5ZPfnsHJyNiDtnpJyayNBkF6cWoYGAMY92ZBRzp3ghcQ==&quot;);
          background-size: 200px;
          background-repeat: repeat;
        "
      ></div>

      <div class="relative z-10 text-center px-4 max-w-4xl mx-auto">
        <p
          class="text-[var(--p-primary-300)] text-xs tracking-[0.4em] uppercase mb-6 font-light"
        >
          {{ t("landing.hero.eyebrow") }}
        </p>
        <h1
          class="text-5xl md:text-7xl font-light text-white mb-6 leading-tight"
          style="font-family: &quot;Georgia&quot;, serif"
        >
          {{ t("landing.hero.headline1") }}<br />
          <span class="text-[var(--p-primary-300)] italic">{{
            t("landing.hero.headline2")
          }}</span>
        </h1>
        <p
          class="text-gray-300 text-lg mb-10 max-w-2xl mx-auto leading-relaxed font-light"
        >
          {{ t("landing.hero.subheading") }}
        </p>
        <div class="flex flex-wrap justify-center gap-4">
          <Button
            :label="t('landing.hero.ctaPrimary')"
            icon="pi pi-arrow-down"
            class="!bg-[var(--p-primary-color)] border-none !py-3 !px-8 hover:!brightness-110 shadow-xl"
            @click="scrollToContact"
          />
          <Button
            :label="t('landing.hero.ctaSecondary')"
            icon="pi pi-sign-in"
            outlined
            class="!border-[var(--p-primary-300)] !text-[var(--p-primary-300)] !py-3 !px-8 hover:!bg-[var(--p-primary-300)]/10"
            @click="router.push('/login')"
          />
        </div>
      </div>

      <div
        class="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-[var(--p-primary-300)]/50"
      >
        <div class="w-px h-12 bg-[var(--p-primary-300)]/30"></div>
        <i class="pi pi-angle-down text-xs scroll-bounce"></i>
      </div>
    </section>

    <!-- ═══════════════════════════════════════════════════════
         HOW IT WORKS / VALUE
    ═══════════════════════════════════════════════════════ -->
    <section id="how-it-works" class="py-24 bg-[var(--p-primary-50)]">
      <div class="max-w-5xl mx-auto px-4 text-center">
        <p
          class="text-[var(--p-primary-color)] text-xs tracking-[0.3em] uppercase mb-4 font-semibold"
        >
          {{ t("landing.value.eyebrow") }}
        </p>
        <h2
          class="text-4xl font-light text-gray-800 mb-6"
          style="font-family: &quot;Georgia&quot;, serif"
        >
          {{ t("landing.value.title") }}
        </h2>
        <div class="w-16 h-0.5 bg-[var(--p-primary-300)] mx-auto mb-8"></div>

        <div class="grid md:grid-cols-3 gap-8 mt-16">
          <div v-for="item in valueItems" :key="item.key" class="text-center">
            <div
              class="w-14 h-14 bg-[var(--p-primary-100)] rounded-full flex items-center justify-center mx-auto mb-4"
            >
              <i
                :class="[item.icon, 'text-[var(--p-primary-600)] text-xl']"
              ></i>
            </div>
            <h4 class="font-semibold text-gray-800 mb-2">
              {{ t(`landing.value.items.${item.key}.title`) }}
            </h4>
            <p class="text-sm text-gray-500 leading-relaxed">
              {{ t(`landing.value.items.${item.key}.description`) }}
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══════════════════════════════════════════════════════
         FEATURES
    ═══════════════════════════════════════════════════════ -->
    <section id="features" class="py-24 bg-[var(--p-primary-100)]">
      <div class="max-w-7xl mx-auto px-4">
        <div class="text-center mb-16">
          <p
            class="text-[var(--p-primary-color)] text-xs tracking-[0.3em] uppercase mb-4 font-semibold"
          >
            {{ t("landing.features.eyebrow") }}
          </p>
          <h2
            class="text-4xl font-light text-gray-800 mb-4"
            style="font-family: &quot;Georgia&quot;, serif"
          >
            {{ t("landing.features.title") }}
          </h2>
          <div class="w-16 h-0.5 bg-[var(--p-primary-300)] mx-auto"></div>
        </div>

        <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div
            v-for="feature in featureItems"
            :key="feature.key"
            class="group bg-[var(--p-primary-50)] rounded-2xl overflow-hidden border border-[var(--p-primary-200)]/50 hover:border-[var(--p-primary-color)]/40 hover:shadow-xl transition-all duration-300"
          >
            <div
              class="h-1 w-full bg-gradient-to-r from-[var(--p-primary-300)] to-[var(--p-primary-color)]"
            ></div>
            <div class="p-7">
              <div
                class="w-12 h-12 rounded-full flex items-center justify-center mb-4 bg-[var(--p-primary-100)]"
              >
                <i
                  :class="[feature.icon, 'text-xl text-[var(--p-primary-600)]']"
                ></i>
              </div>
              <h3 class="font-semibold text-gray-800 mb-2 text-lg">
                {{ t(`landing.features.items.${feature.key}.title`) }}
              </h3>
              <p class="text-sm text-gray-500 leading-relaxed">
                {{ t(`landing.features.items.${feature.key}.description`) }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══════════════════════════════════════════════════════
         PRICING
    ═══════════════════════════════════════════════════════ -->
    <section id="pricing" class="py-24 bg-[var(--p-primary-50)]">
      <div class="max-w-7xl mx-auto px-4">
        <div class="text-center mb-16">
          <p
            class="text-[var(--p-primary-color)] text-xs tracking-[0.3em] uppercase mb-4 font-semibold"
          >
            {{ t("landing.pricing.eyebrow") }}
          </p>
          <h2
            class="text-4xl font-light text-gray-800 mb-4"
            style="font-family: &quot;Georgia&quot;, serif"
          >
            {{ t("landing.pricing.title") }}
          </h2>
          <div class="w-16 h-0.5 bg-[var(--p-primary-300)] mx-auto mb-4"></div>
          <p class="text-gray-500 text-sm max-w-xl mx-auto">
            {{ t("landing.pricing.subtitle") }}
          </p>
        </div>

        <div class="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          <div
            v-for="tier in pricingTiers"
            :key="tier.key"
            class="rounded-2xl p-7 border transition-all duration-300"
            :class="
              tier.highlight
                ? 'bg-[var(--p-primary-color)] border-[var(--p-primary-color)] text-white shadow-xl scale-105'
                : 'bg-white border-[var(--p-primary-200)]/50 hover:shadow-lg'
            "
          >
            <h3
              class="font-semibold text-lg mb-1"
              :class="tier.highlight ? 'text-white' : 'text-gray-800'"
            >
              {{ t(`landing.pricing.tiers.${tier.key}.name`) }}
            </h3>
            <p
              class="text-sm mb-6"
              :class="tier.highlight ? 'text-white/80' : 'text-gray-500'"
            >
              {{ t(`landing.pricing.tiers.${tier.key}.description`) }}
            </p>
            <ul class="space-y-2 mb-8 text-sm">
              <li v-for="n in 3" :key="n" class="flex items-start gap-2">
                <i
                  class="pi pi-check text-xs mt-1"
                  :class="
                    tier.highlight
                      ? 'text-white'
                      : 'text-[var(--p-primary-color)]'
                  "
                ></i>
                <span
                  :class="tier.highlight ? 'text-white/90' : 'text-gray-600'"
                >
                  {{ t(`landing.pricing.tiers.${tier.key}.feature${n}`) }}
                </span>
              </li>
            </ul>
            <Button
              :label="t(`landing.pricing.tiers.${tier.key}.cta`)"
              class="w-full border-none justify-center"
              :class="
                tier.highlight
                  ? '!bg-white !text-[var(--p-primary-color)]'
                  : '!bg-[var(--p-primary-color)] !text-white'
              "
              @click="scrollToContact"
            />
          </div>
        </div>
      </div>
    </section>

    <!-- ═══════════════════════════════════════════════════════
         CONTACT / DEMO REQUEST
    ═══════════════════════════════════════════════════════ -->
    <section id="contact" class="py-24 bg-[var(--p-primary-950)]">
      <div class="max-w-3xl mx-auto px-4">
        <div class="text-center mb-12">
          <p
            class="text-[var(--p-primary-300)] text-xs tracking-[0.3em] uppercase mb-4 font-semibold"
          >
            {{ t("landing.contact.eyebrow") }}
          </p>
          <h2
            class="text-4xl font-light text-white mb-4"
            style="font-family: &quot;Georgia&quot;, serif"
          >
            {{ t("landing.contact.title") }}
          </h2>
          <div class="w-16 h-0.5 bg-[var(--p-primary-300)] mx-auto mb-4"></div>
          <p class="text-gray-400 text-sm max-w-xl mx-auto">
            {{ t("landing.contact.subtitle") }}
          </p>
        </div>

        <div class="bg-white rounded-2xl shadow-xl p-8 sm:p-10">
          <div v-if="submitted" class="text-center py-8">
            <div
              class="w-14 h-14 bg-[var(--p-primary-100)] rounded-full flex items-center justify-center mx-auto mb-4"
            >
              <i class="pi pi-check text-[var(--p-primary-600)] text-2xl"></i>
            </div>
            <h3 class="text-xl font-semibold text-gray-800 mb-2">
              {{ t("landing.contact.success.title") }}
            </h3>
            <p class="text-gray-500 text-sm">
              {{ t("landing.contact.success.subtitle") }}
            </p>
          </div>

          <form v-else @submit.prevent="submitDemoRequest" class="space-y-4">
            <div class="grid sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">{{
                  t("landing.contact.form.name")
                }}</label>
                <InputText v-model="form.name" class="w-full" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">{{
                  t("landing.contact.form.email")
                }}</label>
                <InputText v-model="form.email" type="email" class="w-full" />
              </div>
            </div>
            <div class="grid sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">{{
                  t("landing.contact.form.shopName")
                }}</label>
                <InputText v-model="form.shop_name" class="w-full" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">{{
                  t("landing.contact.form.phone")
                }}</label>
                <InputText v-model="form.phone" class="w-full" />
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">{{
                t("landing.contact.form.message")
              }}</label>
              <Textarea v-model="form.message" class="w-full" rows="3" />
            </div>

            <p v-if="errorMsg" class="text-sm text-red-500">{{ errorMsg }}</p>

            <Button
              type="submit"
              :label="
                submitting
                  ? t('landing.contact.form.submitting')
                  : t('landing.contact.form.submit')
              "
              icon="pi pi-send"
              class="w-full !bg-[var(--p-primary-color)] border-none justify-center !py-3"
              :loading="submitting"
            />
          </form>
        </div>
      </div>
    </section>

    <!-- ═══════════════════════════════════════════════════════
         FOOTER
    ═══════════════════════════════════════════════════════ -->
    <footer class="py-10 bg-black text-center">
      <div class="max-w-7xl mx-auto px-4">
        <div
          class="text-xl font-light text-white mb-2"
          style="font-family: &quot;Georgia&quot;, serif"
        >
          Book4<span class="text-[var(--p-primary-300)]">Beauty</span>
        </div>
        <p class="text-gray-500 text-xs mb-6">
          {{ t("landing.footer.tagline") }}
        </p>
        <div class="border-t border-gray-800 pt-6 text-xs text-gray-600">
          {{ t("landing.footer.rights") }}
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import Button from "primevue/button";

const router = useRouter();
const { t } = useI18n();

const valueItems = [
  { key: "scheduling", icon: "pi pi-calendar" },
  { key: "clients", icon: "pi pi-heart" },
  { key: "financials", icon: "pi pi-chart-line" },
];

const featureItems = [
  { key: "scheduling", icon: "pi pi-calendar" },
  { key: "staff", icon: "pi pi-users" },
  { key: "portal", icon: "pi pi-user" },
  { key: "giftcards", icon: "pi pi-ticket" },
  { key: "reports", icon: "pi pi-chart-bar" },
  { key: "multilocation", icon: "pi pi-building" },
];

const pricingTiers = [
  { key: "trial", highlight: false },
  { key: "basic", highlight: false },
  { key: "pro", highlight: true },
];

const form = ref({
  name: "",
  email: "",
  shop_name: "",
  phone: "",
  message: "",
});
const submitting = ref(false);
const submitted = ref(false);
const errorMsg = ref("");

const submitDemoRequest = async () => {
  errorMsg.value = "";

  if (!form.value.name || !form.value.email || !form.value.shop_name) {
    errorMsg.value = t("landing.contact.validation");
    return;
  }

  submitting.value = true;
  try {
    const res = await fetch("/api/v1/demo-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form.value),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed");

    submitted.value = true;
  } catch (err) {
    errorMsg.value = t("landing.contact.error");
  } finally {
    submitting.value = false;
  }
};

const scrollToContact = () => {
  document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" });
};
</script>

<style scoped>
.saas-landing {
  font-family: "Inter", "Helvetica Neue", Arial, sans-serif;
}

@keyframes scroll-bounce {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(6px);
  }
}
.scroll-bounce {
  animation: scroll-bounce 1.5s ease-in-out infinite;
}
</style>
