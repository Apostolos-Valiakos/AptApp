<template>
  <!-- Profile (REDESIGN_SPEC.md §5.5, client-portal-prototype.html): who,
       account, security, notifications, appearance, language, logging out. -->
  <div class="px-4 pt-2 pb-4">
    <div class="flex items-center gap-3.5 mt-2 mb-[18px]" data-testid="account">
      <span class="pp-avatar !w-14 !h-14 !text-xl">{{ initials }}</span>
      <div class="min-w-0">
        <div class="portal-display !font-medium text-[22px] leading-tight truncate">{{ fullName }}</div>
        <div class="pp-small pp-muted truncate">{{ [wallet.client?.email, wallet.client?.phone].filter(Boolean).join(" · ") }}</div>
      </div>
    </div>

    <h2 class="pp-h2 !mt-2">{{ t("portal.v2.profile.account") }}</h2>
    <section class="pp-card overflow-hidden">
      <button type="button" class="pp-set-row" data-testid="edit-account" @click="openAccount">
        <span class="pp-set-icon"><i class="pi pi-user"></i></span><span class="flex-1">{{ t("portal.v2.profile.info") }}</span><i class="pi pi-angle-right pp-muted"></i>
      </button>
      <button type="button" class="pp-set-row" data-testid="edit-password" @click="passwordOpen = true">
        <span class="pp-set-icon"><i class="pi pi-key"></i></span><span class="flex-1">{{ t("portal.v2.profile.password") }}</span><i class="pi pi-angle-right pp-muted"></i>
      </button>
    </section>

    <!-- The Android app only, on a phone with a fingerprint (or face) enrolled. -->
    <template v-if="biometric.available.value">
      <h2 class="pp-h2">{{ t("portal.v2.native.security") }}</h2>
      <section class="pp-card overflow-hidden" data-testid="security">
        <label class="pp-set-row cursor-pointer" data-testid="biometric-unlock">
          <span class="pp-set-icon"><i class="pi pi-shield"></i></span>
          <span class="flex-1 min-w-0">
            <span class="block">{{ t("portal.v2.native.unlockToggle") }}</span>
            <span class="block pp-small pp-muted">{{ t("portal.v2.native.unlockNote") }}</span>
          </span>
          <input type="checkbox" role="switch" class="sr-only" :checked="biometric.enabled.value" @change="toggleBiometric(($event.target as HTMLInputElement).checked)" />
          <span class="pp-toggle" :class="{ on: biometric.enabled.value }" aria-hidden="true"></span>
        </label>
      </section>
    </template>

    <h2 class="pp-h2">{{ t("portal.v2.profile.notifications") }}</h2>
    <section class="pp-card overflow-hidden">
      <!-- In the app: the phone's own notifications (reminders and the shop's
           announcements); on the web, web push where the browser has it.
           Once allowed, only the phone's or browser's settings turn it off. -->
      <div v-if="native || pushAvailable" class="pp-set-row" data-testid="push-row">
        <span class="pp-set-icon"><i class="pi pi-bell"></i></span>
        <span class="flex-1">{{ t("portal.v2.profile.push") }}</span>
        <button v-if="!pushOn" type="button" role="switch" aria-checked="false" class="pp-toggle" :aria-label="t('portal.v2.profile.push')" @click="turnOnPush"></button>
        <span v-else class="pp-toggle on" role="switch" aria-checked="true" :aria-label="t('portal.v2.profile.push')"></span>
      </div>
      <label class="pp-set-row cursor-pointer" data-testid="email-reminders">
        <span class="pp-set-icon"><i class="pi pi-envelope"></i></span>
        <span class="flex-1">{{ t("portal.v2.profile.email") }}</span>
        <input v-model="receiveEmails" type="checkbox" role="switch" class="sr-only" @change="saveNotifications" />
        <span class="pp-toggle" :class="{ on: receiveEmails }" aria-hidden="true"></span>
      </label>
      <div class="pp-set-row" data-testid="reminder-timing">
        <span class="pp-set-icon"><i class="pi pi-clock"></i></span>
        <span class="flex-1">{{ t("portal.v2.profile.remindMe") }}</span>
        <span class="flex gap-1.5">
          <button
            v-for="o in REMINDER_CHOICES"
            :key="o"
            type="button"
            class="pp-chip !font-semibold"
            :aria-pressed="offsets.includes(o)"
            :aria-label="t(`portal.v2.profile.before.${o}`)"
            :data-offset="o"
            @click="toggleOffset(o, !offsets.includes(o))"
          >{{ t(`portal.v2.profile.chip.${o}`) }}</button>
        </span>
      </div>
      <button type="button" class="pp-set-row" data-testid="open-activity" @click="activity.open">
        <span class="pp-set-icon"><i class="pi pi-history"></i></span>
        <span class="flex-1">{{ t("portal.v2.profile.activity") }}</span>
        <span v-if="activity.unreadCount.value" class="min-w-5 h-5 px-1.5 rounded-full bg-[var(--pp-danger)] text-white text-[11px] font-bold grid place-items-center">{{ activity.unreadCount.value }}</span>
        <i class="pi pi-angle-right pp-muted"></i>
      </button>
    </section>

    <h2 class="pp-h2">{{ t("portal.v2.profile.appearance") }}</h2>
    <div class="pp-segmented" role="group" data-testid="appearance">
      <button v-for="a in appearances" :key="a.value" type="button" :aria-pressed="appearance === a.value" @click="setAppearance(a.value)">{{ a.label }}</button>
    </div>

    <h2 class="pp-h2 !mt-3.5">{{ t("portal.v2.profile.language") }}</h2>
    <div class="pp-segmented" role="group" data-testid="language">
      <button v-for="l in languages" :key="l.value" type="button" :aria-pressed="locale === l.value" @click="switchLanguage(l.value)">{{ l.label }}</button>
    </div>

    <button type="button" class="pp-btn pp-btn-ghost w-full mt-5 !text-[var(--pp-danger)]" data-testid="logout" @click="logout"><i class="pi pi-sign-out"></i>{{ t("portal.v2.profile.logout") }}</button>

    <Dialog v-model:visible="accountOpen" modal :header="t('portal.more.myInformation')" :style="{ width: '440px', maxWidth: '94vw' }">
      <form class="space-y-3" data-testid="account-form" @submit.prevent="saveAccount">
        <label v-for="f in accountFields" :key="f.key" class="block space-y-1">
          <span class="portal-caption">{{ t(f.label) }}</span>
          <InputText v-model="form[f.key]" :type="f.type" class="w-full" :name="f.key" />
        </label>
        <Button type="submit" :label="t('portal.account.saveChanges')" :loading="saving" class="w-full" />
      </form>
    </Dialog>

    <Dialog v-model:visible="passwordOpen" modal :header="t('portal.more.changePassword')" :style="{ width: '440px', maxWidth: '94vw' }">
      <form class="space-y-3" data-testid="password-form" @submit.prevent="savePassword">
        <label class="block space-y-1">
          <span class="portal-caption">{{ t("portal.account.currentPassword") }}</span>
          <Password v-model="pw.current" :feedback="false" toggleMask class="w-full" inputClass="w-full" />
        </label>
        <label class="block space-y-1">
          <span class="portal-caption">{{ t("portal.account.newPassword") }}</span>
          <Password v-model="pw.next" :feedback="false" toggleMask class="w-full" inputClass="w-full" />
          <small class="block" :class="pw.next && !passwordOk(pw.next) ? 'text-red-500' : 'opacity-70'" data-testid="password-rule">{{ t("common.passwordRule") }}</small>
        </label>
        <label class="block space-y-1">
          <span class="portal-caption">{{ t("portal.account.confirmPassword") }}</span>
          <Password v-model="pw.again" :feedback="false" toggleMask class="w-full" inputClass="w-full" />
          <small v-if="pw.again && pw.again !== pw.next" class="text-red-500">{{ t("portal.account.passwordMismatch") }}</small>
        </label>
        <Button type="submit" :label="t('portal.account.updatePassword')" :loading="saving" :disabled="!pw.current || !passwordOk(pw.next) || pw.next !== pw.again" class="w-full" data-testid="password-save" />
      </form>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import Password from "primevue/password";
import { api, withMessage } from "../../api/http";
import { setLocale } from "../../i18n";
import { passwordOk } from "../../utils/password";
import { useAuthStore } from "../../stores/auth";
import { useNotify } from "../../composables/useNotify";
import { usePushNotifications } from "../../composables/usePushNotifications";
import { useAppearance, type Appearance } from "../composables/usePortalTheme";
import { usePortalNotifications } from "../composables/usePortalNotifications";
import { forgetPortal } from "../logout";
import { useBiometricUnlock } from "../native/useSecureSession";
import { isNative } from "../native/platform";
import { useReminders } from "../native/useReminders";
import { usePush } from "../native/usePush";
import { usePortalWalletStore } from "../stores/wallet";
import { usePortalShopStore } from "../stores/shop";

const { t, locale } = useI18n();
const router = useRouter();
const auth = useAuthStore();
const wallet = usePortalWalletStore();
const shop = usePortalShopStore();
const notify = useNotify();
const activity = usePortalNotifications({ watchPushes: false });
const { appearance, setAppearance } = useAppearance();
const { isSupported, availableHere, permission: pushPermission, enable: enablePush } = usePushNotifications();
const pushAvailable = computed(() => isSupported && availableHere);
const native = isNative();
const reminders = useReminders();
const pushOn = computed(() => (native ? reminders.permission.value === "granted" : pushPermission.value === "granted"));
const turnOnPush = async () => {
  if (!native) return enablePush();
  if (await reminders.requestPermission()) void usePush().register(router);
};

const fullName = computed(() => [wallet.client?.first_name, wallet.client?.last_name].filter(Boolean).join(" "));
const initials = computed(() => [wallet.client?.first_name, wallet.client?.last_name].map((n) => n?.[0] || "").join(""));

const appearances = computed(() => [
  { label: t("portal.v2.profile.system"), value: "system" as Appearance },
  { label: t("portal.v2.profile.light"), value: "light" as Appearance },
  { label: t("portal.v2.profile.dark"), value: "dark" as Appearance },
]);
const languages = [
  { label: "Ελληνικά", value: "el" },
  { label: "English", value: "en" },
];
const switchLanguage = async (lang: string) => {
  await setLocale(lang);
  try {
    localStorage.setItem("locale", lang);
  } catch {}
};

// --- Account ---
type Field = "first_name" | "last_name" | "email" | "phone";
const accountFields: { key: Field; label: string; type: string }[] = [
  { key: "first_name", label: "portal.account.firstName", type: "text" },
  { key: "last_name", label: "portal.account.lastName", type: "text" },
  { key: "email", label: "portal.account.email", type: "email" },
  { key: "phone", label: "portal.account.phone", type: "tel" },
];
const accountOpen = ref(false);
const saving = ref(false);
const form = reactive<Record<Field, string>>({ first_name: "", last_name: "", email: "", phone: "" });
const openAccount = () => {
  for (const f of accountFields) form[f.key] = wallet.client?.[f.key] || "";
  accountOpen.value = true;
};
const saveAccount = async () => {
  if (!form.first_name.trim() || !form.last_name.trim()) return notify.error(t("portal.toast.nameRequired"));
  saving.value = true;
  try {
    await api.put("/api/v1/portal/profile", { ...form }).catch(withMessage(t("portal.toast.failed")));
    wallet.client = { ...wallet.client, ...form };
    notify.success(t("portal.toast.profileUpdated"), t("portal.toast.saved"));
    accountOpen.value = false;
  } catch (e: any) {
    notify.error(e.message);
  } finally {
    saving.value = false;
  }
};

// --- Password ---
const passwordOpen = ref(false);
const pw = reactive({ current: "", next: "", again: "" });
const savePassword = async () => {
  saving.value = true;
  try {
    await api.put("/api/v1/portal/password", { currentPassword: pw.current, newPassword: pw.next }).catch(withMessage(t("portal.toast.failed")));
    notify.success(undefined, t("portal.toast.passwordUpdated"));
    Object.assign(pw, { current: "", next: "", again: "" });
    passwordOpen.value = false;
  } catch (e: any) {
    notify.error(e.message);
  } finally {
    saving.value = false;
  }
};

// --- Notifications ---
const receiveEmails = ref(true);
watch(() => wallet.client?.receive_emails, (v) => (receiveEmails.value = v ?? true), { immediate: true });
// When to be reminded: any of 24 h, 2 h and 1 h before (at least one). With
// no choice of their own, the shop's time is shown as chosen.
const REMINDER_CHOICES = [1440, 120, 60] as const;
const offsets = ref<number[]>([]);
watch(
  () => [wallet.client?.reminder_offsets_minutes, shop.shop?.reminder_hours_before] as const,
  ([own, shopHours]) => (offsets.value = own?.length ? [...own] : [Number(shopHours ?? 24) * 60].filter((m) => (REMINDER_CHOICES as readonly number[]).includes(m))),
  { immediate: true },
);
const toggleOffset = async (minutes: number, on: boolean) => {
  const next = on ? [...offsets.value, minutes] : offsets.value.filter((m) => m !== minutes);
  // At least one reminder stays on.
  if (!next.length) return;
  const previous = offsets.value;
  offsets.value = next;
  try {
    await api.put("/api/v1/portal/notifications", { reminder_offsets_minutes: next });
    if (wallet.client) wallet.client.reminder_offsets_minutes = next;
  } catch {
    offsets.value = previous;
    notify.error(t("portal.toast.failed"));
  }
};

const saveNotifications = async () => {
  try {
    await api.put("/api/v1/portal/notifications", { receive_emails: receiveEmails.value });
  } catch {
    notify.error(t("portal.toast.failed"));
  }
};

// Unlock with fingerprint: turned on only after one successful unlock.
const biometric = useBiometricUnlock();
const toggleBiometric = async (on: boolean) => {
  if (on) await biometric.enable();
  else biometric.disable();
};

const logout = async () => {
  await forgetPortal();
  auth.logout();
  router.push("/");
};

onMounted(() => {
  void biometric.check();
  if (native) void reminders.readPermission();
  shop.load();
  wallet.load(auth.clientId);
});
</script>
