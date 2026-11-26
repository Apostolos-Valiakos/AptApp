<template>
  <!-- Profile (REDESIGN_SPEC.md §5.5): account, notifications, appearance,
       language, activity and logging out. -->
  <div class="p-4 space-y-5">
    <h1 class="portal-display portal-h2">{{ t("portal.nav.profile") }}</h1>

    <section class="portal-card divide-y divide-[var(--portal-border)]" data-testid="account">
      <button type="button" class="w-full p-4 flex items-center gap-3 text-left portal-target" data-testid="edit-account" @click="openAccount">
        <span class="w-11 h-11 rounded-full bg-[var(--p-primary-100)] text-[var(--portal-accent-text)] flex items-center justify-center font-semibold">{{ initials }}</span>
        <span class="flex-1 min-w-0">
          <span class="block font-semibold truncate">{{ fullName }}</span>
          <span class="portal-caption truncate block">{{ wallet.client?.email || wallet.client?.phone }}</span>
        </span>
        <i class="pi pi-chevron-right opacity-40"></i>
      </button>
      <button type="button" class="w-full p-4 flex items-center gap-3 text-left portal-target" data-testid="edit-password" @click="passwordOpen = true">
        <i class="pi pi-lock w-11 text-center opacity-70"></i>
        <span class="flex-1">{{ t("portal.more.changePassword") }}</span>
        <i class="pi pi-chevron-right opacity-40"></i>
      </button>
    </section>

    <section class="space-y-2">
      <h2 class="portal-micro font-semibold uppercase tracking-wider px-1">{{ t("portal.v2.profile.notifications") }}</h2>
      <div class="portal-card divide-y divide-[var(--portal-border)]">
        <label class="p-4 flex items-center gap-3">
          <span class="flex-1">
            <span class="block">{{ t("portal.more.emailReminders") }}</span>
            <span class="portal-caption">{{ t("portal.more.emailRemindersNote") }}</span>
          </span>
          <ToggleSwitch v-model="receiveEmails" data-testid="email-reminders" @update:modelValue="saveNotifications" />
        </label>
        <div v-if="pushAvailable" class="p-4 flex items-center gap-3">
          <span class="flex-1">{{ t("portal.notifications.title") }}</span>
          <Button v-if="pushPermission !== 'granted'" :label="t('portal.notifications.button')" size="small" outlined @click="enablePush" />
          <i v-else class="pi pi-check text-green-600"></i>
        </div>
        <div class="p-4 space-y-2" data-testid="reminder-timing">
          <span class="block">{{ t("portal.v2.profile.remindMe") }}</span>
          <div class="flex gap-2">
            <ToggleButton
              v-for="o in REMINDER_CHOICES"
              :key="`${o}-${redraw}`"
              :modelValue="offsets.includes(o)"
              :onLabel="t(`portal.v2.profile.before.${o}`)"
              :offLabel="t(`portal.v2.profile.before.${o}`)"
              class="flex-1"
              :data-offset="o"
              @update:modelValue="(on: boolean) => toggleOffset(o, on)"
            />
          </div>
        </div>
        <button type="button" class="w-full p-4 flex items-center gap-3 text-left portal-target" data-testid="open-activity" @click="activity.open">
          <span class="flex-1">{{ t("portal.v2.profile.activity") }}</span>
          <Badge v-if="activity.unreadCount.value" :value="activity.unreadCount.value" />
          <i class="pi pi-chevron-right opacity-40"></i>
        </button>
      </div>
    </section>

    <!-- The Android app only, on a phone with a fingerprint (or face) enrolled. -->
    <section v-if="biometric.available.value" class="space-y-2" data-testid="security">
      <h2 class="portal-micro font-semibold uppercase tracking-wider px-1">{{ t("portal.v2.native.security") }}</h2>
      <div class="portal-card flex items-center justify-between gap-3 p-4">
        <label for="biometric-unlock" class="min-w-0">
          <span class="block font-medium">{{ t("portal.v2.native.unlockToggle") }}</span>
          <span class="block text-sm opacity-70">{{ t("portal.v2.native.unlockNote") }}</span>
        </label>
        <ToggleSwitch inputId="biometric-unlock" :modelValue="biometric.enabled.value" data-testid="biometric-unlock" @update:modelValue="toggleBiometric" />
      </div>
    </section>

    <section class="space-y-2">
      <h2 class="portal-micro font-semibold uppercase tracking-wider px-1">{{ t("portal.v2.profile.appearance") }}</h2>
      <SelectButton :modelValue="appearance" :options="appearances" optionLabel="label" optionValue="value" :allowEmpty="false" class="w-full" data-testid="appearance" @update:modelValue="setAppearance" />
    </section>

    <section class="space-y-2">
      <h2 class="portal-micro font-semibold uppercase tracking-wider px-1">{{ t("portal.nav.language") }}</h2>
      <SelectButton :modelValue="locale" :options="languages" optionLabel="label" optionValue="value" :allowEmpty="false" class="w-full" data-testid="language" @update:modelValue="switchLanguage" />
    </section>

    <Button :label="t('portal.more.logout')" icon="pi pi-sign-out" severity="secondary" outlined class="w-full" data-testid="logout" @click="logout" />

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
import Badge from "primevue/badge";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import Password from "primevue/password";
import SelectButton from "primevue/selectbutton";
import ToggleSwitch from "primevue/toggleswitch";
import ToggleButton from "primevue/togglebutton";
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
const redraw = ref(0);
watch(
  () => [wallet.client?.reminder_offsets_minutes, shop.shop?.reminder_hours_before] as const,
  ([own, shopHours]) => (offsets.value = own?.length ? [...own] : [Number(shopHours ?? 24) * 60].filter((m) => (REMINDER_CHOICES as readonly number[]).includes(m))),
  { immediate: true },
);
const toggleOffset = async (minutes: number, on: boolean) => {
  const next = on ? [...offsets.value, minutes] : offsets.value.filter((m) => m !== minutes);
  // At least one reminder: the button that was pressed is drawn back on (it
  // keeps its own pressed state).
  if (!next.length) return void redraw.value++;
  const previous = offsets.value;
  offsets.value = next;
  try {
    await api.put("/api/v1/portal/notifications", { reminder_offsets_minutes: next });
    if (wallet.client) wallet.client.reminder_offsets_minutes = next;
  } catch {
    offsets.value = previous;
    redraw.value++;
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
  shop.load();
  wallet.load(auth.clientId);
});
</script>
