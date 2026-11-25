// Reminders scheduled on the phone itself (docs/redesign/ANDROID_HANDOFF.md
// §1, step 7.4): they need no server and no connection. The server's own
// reminders don't go to the app (pushService.js), so each comes once.
//
// - What: one per upcoming booking and per offset the client chose in Profile
//   (24 h / 2 h / 1 h before), else the shop's reminder time.
// - When: every time the bookings load (portal/stores/bookings.ts), which every
//   change triggers ("appointments-changed"). Ids come from the booking and the
//   offset, so a new sync replaces the old reminders; a cancelled or moved
//   booking's old ones are removed.
// - Permission: asked only after the client's first booking, with a line of
//   explanation first (BookingSuccessSheet.vue).
// - Actions: Confirm (confirmAttendance) and Directions, plus a tap opening
//   the booking (listenForActions, from PortalShell.vue).
// In a browser all of this does nothing: web push keeps doing the reminders.
import { computed, ref, shallowRef, watch } from "vue";
import { LocalNotifications, type ActionPerformed } from "@capacitor/local-notifications";
import type { Router } from "vue-router";
import { i18n } from "../../i18n";
import { formatDate } from "../../utils/format";
import { isActive, type PortalBooking } from "../stores/bookings";
import { usePortalShopStore } from "../stores/shop";
import { usePortalWalletStore } from "../stores/wallet";
import { isNative, quietly } from "./platform";
import { useMaps } from "./useMaps";

export const REMINDER_OFFSETS = [1440, 120, 60] as const;
export const REMINDER_ACTION_TYPE = "appt";
const ASKED_KEY = "portal.remindersAsked";
// A reminder due within this much from now isn't worth scheduling.
const TOO_SOON_MS = 60_000;

/** A positive 31-bit id from the booking and the offset: the same every sync. */
export const reminderId = (bookingId: string, offset: number) => {
  let hash = 0x811c9dc5; // FNV-1a
  for (const ch of `${bookingId}:${offset}`) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 1) || 1;
};

/** The client's offsets (minutes before), else the shop's hours; only the ones Profile offers. */
export const reminderOffsets = (clientOffsets?: number[] | null, shopHours?: number | null): number[] => {
  const chosen = clientOffsets?.length ? clientOffsets : [Number(shopHours ?? 24) * 60];
  return [...new Set(chosen.filter((m) => (REMINDER_OFFSETS as readonly number[]).includes(m)))];
};

export type PlannedReminder = { id: number; bookingId: string; offset: number; at: Date };

/** The reminders for `bookings`: active ones still to come, one per offset, none in the past. */
export const planReminders = (bookings: PortalBooking[], offsets: number[], now = Date.now()): PlannedReminder[] =>
  bookings
    .filter((b) => isActive(b) && new Date(b.start_time).getTime() > now)
    .flatMap((b) =>
      offsets.map((offset) => ({
        id: reminderId(b.id, offset),
        bookingId: b.id,
        offset,
        at: new Date(new Date(b.start_time).getTime() - offset * 60_000),
      })),
    )
    .filter((r) => r.at.getTime() > now + TOO_SOON_MS);

// Shared by every caller: the permission state, the last bookings synced (to
// sync again when the offsets change), and whether the actions are set up.
const permission = ref<"granted" | "denied" | "prompt" | "unknown">("unknown");
const asked = ref(readAsked());
const lastBookings = shallowRef<PortalBooking[]>([]);
let actionTypesReady = false;
let watching = false;

function readAsked() {
  try {
    return localStorage.getItem(ASKED_KEY) === "1";
  } catch {
    return false;
  }
}
const markAsked = () => {
  asked.value = true;
  try {
    localStorage.setItem(ASKED_KEY, "1");
  } catch {}
};

// Outside any screen, so the global translator (loosely typed: its full typing
// is too deep for TypeScript here).
const t = (key: string, values?: Record<string, unknown>): string => (i18n.global as any).t(key, values ?? {});

export const useReminders = () => {
  const native = isNative();
  const shop = usePortalShopStore();
  const wallet = usePortalWalletStore();

  const offsets = () => reminderOffsets(wallet.client?.reminder_offsets_minutes, shop.shop?.reminder_hours_before);

  const readPermission = async () => {
    const state = await quietly(() => LocalNotifications.checkPermissions());
    permission.value = (state?.display as any) === "granted" ? "granted" : (state?.display as any) === "denied" ? "denied" : "prompt";
    return permission.value;
  };

  const registerActions = async () => {
    if (actionTypesReady) return;
    await quietly(() =>
      LocalNotifications.registerActionTypes({
        types: [
          {
            id: REMINDER_ACTION_TYPE,
            actions: [
              { id: "confirm", title: t("portal.v2.native.confirm") },
              { id: "directions", title: t("portal.v2.native.directions") },
            ],
          },
        ],
      }),
    );
    actionTypesReady = true;
  };

  /** Schedules the reminders of `bookings` (the upcoming ones), replacing the last sync's. */
  const syncAll = async (bookings: PortalBooking[]) => {
    if (!native) return;
    lastBookings.value = bookings;
    // The offsets can change in Profile without the bookings reloading.
    if (!watching) {
      watching = true;
      watch(
        () => [wallet.client?.reminder_offsets_minutes, shop.shop?.reminder_hours_before],
        () => void syncAll(lastBookings.value),
        { deep: true },
      );
    }
    if ((await readPermission()) !== "granted") return;
    await registerActions();
    const plan = planReminders(bookings, offsets());
    const wanted = new Set(plan.map((r) => r.id));
    // Old reminders this sync doesn't keep: cancelled or moved bookings, offsets switched off.
    const pending = await quietly(() => LocalNotifications.getPending());
    const stale = (pending?.notifications || []).filter((n) => n.extra?.kind === "reminder" && !wanted.has(n.id));
    if (stale.length) await quietly(() => LocalNotifications.cancel({ notifications: stale.map((n) => ({ id: n.id })) }));
    if (!plan.length) return;
    const byId = new Map(bookings.map((b) => [b.id, b]));
    await quietly(() =>
      LocalNotifications.schedule({
        notifications: plan.map((r) => ({
          id: r.id,
          // Kept short, no treatment names: what and where are in the app.
          title: t("portal.v2.native.reminderTitle"),
          body: t("portal.v2.native.reminderBody", {
            when: formatDate(byId.get(r.bookingId)!.start_time, i18n.global.locale.value, "weekdayTime"),
            shop: shop.name,
          }),
          schedule: { at: r.at, allowWhileIdle: true },
          actionTypeId: REMINDER_ACTION_TYPE,
          smallIcon: "ic_stat_icon",
          extra: { kind: "reminder", bookingId: r.bookingId, url: `/portal/bookings/${r.bookingId}` },
        })),
      }),
    );
  };

  /** Cancels every scheduled reminder (logout). */
  const cancelAll = async () => {
    if (!native) return;
    const pending = await quietly(() => LocalNotifications.getPending());
    const ours = (pending?.notifications || []).filter((n) => n.extra?.kind === "reminder");
    if (ours.length) await quietly(() => LocalNotifications.cancel({ notifications: ours.map((n) => ({ id: n.id })) }));
    lastBookings.value = [];
  };

  /** Asks for the notification permission, then schedules (after the explanation line). */
  const requestPermission = async () => {
    if (!native) return false;
    markAsked();
    const result = await quietly(() => LocalNotifications.requestPermissions());
    permission.value = (result?.display as any) === "granted" ? "granted" : "denied";
    if (permission.value === "granted") await syncAll(lastBookings.value);
    return permission.value === "granted";
  };

  /** Whether to show the explanation line: in the app, once there's a booking, never asked yet. */
  const shouldAsk = computed(() => native && !asked.value && permission.value === "prompt" && planReminders(lastBookings.value, [...REMINDER_OFFSETS]).length > 0);

  /** Confirm / Directions / a tap on a reminder (set up once, by the portal shell). */
  const listenForActions = (router: Router, confirmAttendance: (id: string) => Promise<unknown>) => {
    if (!native) return;
    const maps = useMaps();
    void quietly(() =>
      LocalNotifications.addListener("localNotificationActionPerformed", (event: ActionPerformed) => {
        const extra = event.notification.extra || {};
        if (extra.kind !== "reminder") return;
        if (event.actionId === "confirm") void confirmAttendance(extra.bookingId).catch(() => {});
        else if (event.actionId === "directions") void maps.open();
        else router.push(extra.url);
      }),
    );
  };

  return { syncAll, cancelAll, requestPermission, shouldAsk, permission, listenForActions, readPermission };
};
