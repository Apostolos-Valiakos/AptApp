# Client Portal Redesign — Specification

Status: **proposal, for approval**. Nothing in the app has been changed. The clickable prototype is
[`client-portal-prototype.html`](./client-portal-prototype.html) (open it in a browser; see §9).

Scope: the **client portal only** (`/portal/*`, the `client` role) on web and in the Capacitor app.
The staff/admin app (`/app/*`) is not touched.

---

## 0. What exists today (audit)

| Area | Today | Files |
|---|---|---|
| Shell | Header (shop name, notification bell, EL/EN switch), bottom tab bar: **Home · Appointments · More**; a commented-out chat button | `components/ClientLayout.vue` |
| Home | Greeting, next appointment ("today / tomorrow / in N days"), Book now, Call us, active contest banner, enable push | `views/portal/ClientHomeView.vue` |
| Appointments | Upcoming list with **Confirm** / **Cancel**, past list, 4-step booking (service → staff → time → confirm) on `/availability`, "self-booking off" state | `views/portal/ClientAppointmentsView.vue` |
| More | My information (name, email, phone), change password, email reminders toggle, push toggle, **membership card with QR** (`qr_token`, scanned by staff at `/qr/scan`), packages panel, log out | `views/portal/ClientMoreView.vue`, `components/ClientPackagesPanel.vue` |
| Notifications | History dialog, mark read / read all, web push (VAPID, `pushService.js`) | `ClientLayout.vue`, `composables/usePushNotifications.ts` |
| Server | `/portal/profile`, `/portal/password`, `/portal/notifications*`, `/portal/services`, `/portal/staff`, `/availability`, `/portal/appointments/:id/cancel` and `/confirm`, `/portal/push-subscription`, `/contests/active` | `server/routes/portal.js`, `contests.js` |
| Theme | Aura preset (`definePreset(Aura, { primary: palette("#8B6F4E") })`), **each shop's primary colour applied at runtime** (`stores/themes.ts`), dark mode class `.my-app-dark` | `main.ts`, `stores/themes.ts` |
| Native | **Capacitor 7.6.5 already installed** with an Android project (`com.interventio.app`, icons/splash). `webDir: client/dist` → the APK currently ships the **whole app, admin included**. No iOS project. `main.ts` already prefixes `/api` with `VITE_API_BASE_URL` in native builds | `capacitor.config.json`, `android/` |

Gaps that shape the redesign: no reschedule (only cancel + rebook), no calendar export, no share, no
appointment detail view, passes and memberships live under "More", no offline access to the QR, the
portal is not a PWA (the service worker is scoped to `/app/`), native push is not wired (web push only).

---

## 1. Executive vision & benchmark matrix

**Vision.** The portal becomes the client's calm, one-handed companion for their spa: *what's next,
get me in, book the same again* — fast enough that rebooking happens in the chair, warm enough to
feel like the spa itself. Every mechanic below is adopted only where it serves that; nothing is
gamified for its own sake (it's a wellness business, not a game).

| # | Pattern (popularised by) | Why it retains / converts | In this portal | Native lift |
|---|---|---|---|---|
| P1 | **Live "Up Next" card** (Uber trip card, Airline apps) | One glance answers "when, where, with whom"; the card's state changes with time (tomorrow → today → leave now → you're here → enjoy → rate) | Home hero card with live countdown and the one action that fits the moment | Local notifications at 24 h / 1 h; deep link opens the card |
| P2 | **Wallet pass** (Apple Wallet, Eventbrite) | The ticket is always one tap away, works with no signal, no hunting in email | Full-screen check-in pass with the client's QR (`qr_token`, already scanned by staff) | Brightness to 100 %, cached offline (Preferences), optional Wallet export (phase 4) |
| P3 | **"Same again" one-tap rebook** (Booksy, Fresha, Uber "rides again") | Most visits are repeats; removing 3 steps is the single biggest rebooking lever | "Book again" carousel from past visits: service + therapist pre-filled, opens straight on the time picker | — |
| P4 | **Slot-first booking with honest scarcity** (Resy, OpenTable) | Time is what clients decide on; showing it early and showing real scarcity ("2 left") speeds decisions | Date strip with availability dots, time grid grouped morning/afternoon/evening, "few left" only from real `/availability` counts | `Haptics.selectionChanged()` while scrubbing |
| P5 | **Sticky summary + single CTA** (Airbnb "Reserve" bar) | The commitment is always visible and one tap away; reduces drop-off on long pages | Bottom summary bar in booking (service · time · price · Book) | Success haptic on confirm |
| P6 | **Bottom sheets with detents** (Apple Maps, Uber) | Details without losing context; thumb-reachable | Appointment detail, cancel flow, receipt, reschedule are sheets on mobile, side panel on desktop | Light impact on open |
| P7 | **Visible progress** (Duolingo progress, Starbucks stars) — *without streak pressure* | Seeing "3 of 5 visits used" or "2 visits to Gold" motivates the next booking honestly | Package rings and membership progress from data that already exists | — |
| P8 | **Haptic punctuation at commit moments** (Apple Pay, Revolut) | Makes the important moment feel done and trustworthy | Booked, cancelled (warning), pass opened, slot picked | `@capacitor/haptics` map in §6 |
| P9 | **Actionable reminders** (Calendar, airline apps) | Confirming from the lock screen cuts no-shows without opening the app | "Confirm · Directions" buttons on the reminder (uses the existing `/confirm` endpoint) | Local notification actions |
| P10 | **Instant, optimistic, offline-tolerant UI** (Linear) | Feels faster than it is; never blank | Skeletons, optimistic confirm/cancel with rollback, cached upcoming list and pass | `@capacitor/network` banner |
| P11 | **Share the plan** (Airbnb trip share, Eventbrite) | Organic reach: "I'm booked at Pure on Friday" with the shop's link | Share a booking or the shop's booking link | Native share sheet, clipboard on web |
| P12 | **The ask at the right moment** (Uber rating, app-store prompts) | Asking for a review right after a good visit gets far more reviews | After a completed visit: "How was it?" → 5 stars opens the shop's Google review link | — |

Sources consulted: Booksy and Fresha client-app material (one-tap rebook, rebooking and loyalty),
general booking-flow research (slot picker before details), Capacitor 8 release notes and plugin
docs. Links at the end.

---

## 2. Information architecture & navigation

### Today → Redesigned

| Today | Redesigned |
|---|---|
| Home · Appointments · More (3 tabs) | **Home · Bookings · Book (centre) · Wallet · Profile** (5 tabs on mobile) |
| Booking is a tab inside Appointments | **Book** is its own primary action (centre tab / desktop button) |
| Membership, packages under "More" | **Wallet**: check-in pass, membership, packages |
| Profile, password, reminders, push, logout under "More" | **Profile**: account, security (biometrics), notifications & reminders, appearance, language, log out |
| Bell in the header | **Activity** sheet from the bell (kept), unread badge kept |

### Layouts

- **Mobile (web & app):** top bar (shop logo/name, bell) · content · bottom tab bar with the centre
  **Book** button raised; safe areas respected (`env(safe-area-inset-*)`). Details open as bottom
  sheets with two detents (half / full).
- **Desktop / tablet (≥ 1024 px):** left **rail** (same 5 destinations, labels shown) · main column ·
  right **context panel** that keeps the *Up Next* card and the active sheet (detail, receipt,
  reschedule) side by side — no modal covers the page.

### Route map (portal only)

| Route | Screen | Notes |
|---|---|---|
| `/portal/home` | Home ("Up Next") | default |
| `/portal/book` | Booking flow | `?service=&staff=` pre-fills (rebook, deep links) |
| `/portal/book/reschedule/:id` | Reschedule (same flow, "moving" mode) | needs server (§3, N2) |
| `/portal/bookings` | Upcoming / Past | `?tab=past` |
| `/portal/bookings/:id` | Detail sheet over the list | deep-link target from reminders / emails |
| `/portal/wallet` | Pass, membership, packages | `/portal/wallet/pass` opens the pass |
| `/portal/profile` | Profile & settings | sub-sheets for edit, password, notifications |
| Old routes | `/portal/appointments` → `/portal/bookings`, `/portal/more` → `/portal/profile` | redirects so emailed links keep working |

---

## 3. Proposed feature changes — **requires your approval**

Nothing existing is dropped silently. Each row needs a ✔ / ✘ from you.

### Keep & elevate (no loss of function)

| ID | Feature | Change |
|---|---|---|
| K1 | Next appointment on Home | Becomes the live *Up Next* card (P1) with context actions |
| K2 | Book now (4 steps) | 3 steps: service → time (with therapist chips incl. "Anyone") → confirm; sticky summary (P4, P5) |
| K3 | Confirm attendance | On the card, the detail sheet and the reminder notification (P9) |
| K4 | Cancel | In the detail sheet, with a clear warning and the shop's cancellation note |
| K5 | Past appointments | Timeline with **Book again** on each (P3) and the paid amount (already returned) |
| K6 | Membership card + QR | Moves to **Wallet**, becomes the check-in pass (P2), cached offline |
| K7 | Packages panel | Moves to **Wallet** with progress rings (P7) |
| K8 | My information, password | **Profile**, unchanged fields |
| K9 | Email reminders, push toggle | **Profile → Notifications**, plus reminder timing (24 h / 2 h / 1 h) |
| K10 | Notification history, mark read | Bell → **Activity** sheet |
| K11 | EL / EN switch | **Profile → Language** (and a compact switch in the desktop rail) |
| K12 | Call us | On Home and in every booking's detail (`tel:`) |
| K13 | Contest banner | A card in the Home feed while a contest is active |
| K14 | "Self-booking off" state | Kept: Book shows the shop's phone instead of the flow |

### New additions

| ID | Addition | Server work | Native |
|---|---|---|---|
| N1 | **Book again** (one-tap rebook from history) | none (uses `/portal/services`, `/portal/staff`, `/availability`) | — |
| N2 | **Reschedule** (move a booking instead of cancel + rebook) | **new** `POST /portal/appointments/:id/reschedule` (same checks as booking: self-booking on, availability, notice period) | — |
| N3 | **Appointment detail** (sheet / panel) | none | — |
| N4 | **Check-in pass** (full screen QR, brightness, offline) | none (reuses `qr_token` and `/qr/scan`) | screen-brightness, preferences |
| N5 | **Add to calendar** (.ics on web, native calendar in app) | optional `GET /portal/appointments/:id.ics` (otherwise generated in the browser) | calendar plugin |
| N6 | **Share** a booking / the shop's booking link | none | share |
| N7 | **Directions** (open Maps at the shop) | needs the shop's address/coordinates in `/shop` (address exists; coordinates new, optional) | app-launcher |
| N8 | **Biometric unlock** in the app | none (unlocks the stored session; never stores the password) | biometric-auth, secure storage |
| N9 | **Actionable reminders** (24 h / 1 h, Confirm / Directions) | native push needs **FCM/APNs sending** next to web push (`pushService.js`) | local- & push-notifications |
| N10 | **Post-visit review prompt** (→ shop's Google review link) | shop setting for the review URL (new, small) | — |
| N11 | **Dark mode** for the portal | none | status-bar colours |
| N12 | **Deep links** from SMS/email reminders into the booking | `.well-known/assetlinks.json` and `apple-app-site-association` served by the server | app (App Links / Universal Links) |
| N13 | **Offline cache** of upcoming bookings and the pass | none | network |

### Proposed removal / consolidation

| ID | Item | Proposal | Why |
|---|---|---|---|
| R1 | **"More" tab** | Split into **Wallet** and **Profile** | "More" hides the two things clients need most (pass, packages) |
| R2 | Commented-out **chat button** in the tab bar | Remove the dead markup | It does nothing; a chat feature would be its own proposal |
| R3 | **Booking inside the Appointments tab** | Move to its own **Book** destination | Booking is the primary action, not a sub-tab |
| R4 | Language switch in the **header** | Move to Profile (desktop keeps a compact switch) | Header space goes to the shop name and Activity |
| R5 | **Loyalty streaks** (Duolingo-style "don't break your streak") | **Not adopted** | Pressure mechanics don't fit a wellness brand; progress (P7) only |

---

## 4. Theme evolution (PrimeVue 4.5.0, styled, Aura)

Principles: **no global `pt`**; Aura semantic tokens; component-level `:dt` for the few portal-specific
components; scoped `<style>`; PrimeVue components stay auto-imported. **The portal is always in Pure's
bronze** `#8B6F4E` (`#c49a6c` in the dark), whatever colour a shop set for the staff app: changed
on the owner's request in Nov 2026 (it used to take the shop's colour). Names and logos still come
from `/shop`.

### Portal preset (applied by the portal shell only)

```ts
// client/src/portal/theme/portalPreset.ts
import Aura from "@primevue/themes/aura";
import { definePreset, palette } from "@primeuix/themes";

export const portalPreset = (primaryHex = "#8B6F4E") =>
  definePreset(Aura, {
    primitive: { borderRadius: { none: "0", xs: "6px", sm: "10px", md: "14px", lg: "20px", xl: "28px" } },
    semantic: {
      primary: palette(primaryHex),
      focusRing: { width: "2px", style: "solid", color: "{primary.400}", offset: "2px" },
      colorScheme: {
        light: {
          surface: { 0: "#ffffff", 50: "#faf7f2", 100: "#f4eee6", 200: "#e9e0d4", 300: "#d6c8b6", 400: "#b8a690",
                     500: "#94826d", 600: "#6f604f", 700: "#4f4337", 800: "#352c24", 900: "#211a14", 950: "#140f0b" },
          text: { color: "{surface.900}", mutedColor: "{surface.600}" },
          content: { background: "{surface.0}", borderColor: "{surface.200}" },
        },
        dark: {
          surface: { 0: "#ffffff", 50: "#f4eee6", 100: "#e2d8cc", 200: "#c6b8a8", 300: "#a08f7c", 400: "#7a6b5b",
                     500: "#5a4e42", 600: "#423930", 700: "#302a23", 800: "#231e19", 900: "#1a1612", 950: "#110e0b" },
          text: { color: "{surface.50}", mutedColor: "{surface.300}" },
          content: { background: "{surface.900}", borderColor: "{surface.700}" },
        },
      },
    },
  });
```

- **Typography:** display/headings in **Noto Serif Display** (already a dependency, used by the home
  page), UI text in the system sans stack. Scale: 34 / 26 / 20 / 17 (body) / 15 / 13 / 11.
- **Radii:** cards 20 px, sheets 28 px top corners, buttons 14 px, chips fully round.
- **Elevation:** three levels only — `0 1px 2px rgb(33 26 20 / .06)`, `0 8px 24px rgb(33 26 20 / .08)`,
  `0 24px 48px rgb(33 26 20 / .16)`; dark mode uses borders (`surface.700`) instead of shadows.
- **Dark mode parity:** the existing `.my-app-dark` selector; follows the device by default, overridable
  in Profile → Appearance; status bar colour follows (native).
- **Scoped `dt` examples (no global `pt`):**

```vue
<Button label="Book" :dt="{ root: { borderRadius: '14px', paddingY: '0.875rem' } }" />
<SelectButton :dt="{ root: { borderRadius: '999px' } }" />
<Drawer position="bottom" :dt="{ root: { borderRadius: '28px 28px 0 0' } }" />
```

- **Applying it without touching admin:** the portal shell calls `usePreset(portalPreset(shopColor))`
  on mount. Only `client` logins ever reach the portal, so the staff app never sees it; the native
  build (§6) boots the portal entry with this preset from the start.

---

## 5. Screen-by-screen

### 5.1 Home — "Up Next" command centre

- **Greeting** in the serif face: "Καλησπέρα, Μαρία" (time of day aware).
- **Up Next card** (P1), states driven by time and status:
  | When | Card says | Primary action | Secondary |
  |---|---|---|---|
  | > 24 h | "Παρασκευή 18:30 · Holistic · Άννα" + countdown in days | Confirm (if not confirmed) | Add to calendar · Reschedule |
  | ≤ 24 h | Countdown hh:mm | Check-in pass | Directions · Call |
  | ≤ 60 min | "Time to head over" | Directions | Pass |
  | started | "Enjoy your treatment" | — | — |
  | completed today | "How was it?" (N10) | Rate | Book again |
- **Book again carousel** (P3): last 5 distinct service + therapist pairs, "Same as last time" chip.
- **Wallet strip:** package ring ("3 / 5 visits"), membership tier and renewal date.
- **Contest card** when active (K13). **Call us** chip (K12).
- Empty state: a warm illustration + "Book your first visit" (or the phone if self-booking is off).

### 5.2 Booking & rescheduling

1. **Service** — category pills (from service categories), cards with duration, price, short description;
   search on desktop. "Book again" lands directly on step 2.
2. **Time** — therapist chips (*Anyone* first; only staff who do the service, as `/portal/staff`
   already filters), **14-day date strip** with availability dots (none / few / many), time grid
   grouped Morning / Afternoon / Evening; "2 left" only from the real count. Haptic tick per slot.
   *Anyone* queries each eligible therapist's `/availability` and merges (shows who in the confirm step).
3. **Confirm** — summary, notes for the spa, the shop's cancellation note, **Book**. Success sheet:
   check animation, **Add to calendar**, **Share**, **Done**.
- **Sticky summary bar** (P5) from step 2: service · time · price · CTA.
- **Reschedule** (N2) reuses steps 2–3 with "Moving from Fri 18:30" and keeps the service/therapist.

### 5.3 Bookings hub

- Segmented **Upcoming / Past**. Upcoming: status chip (confirmed / needs confirmation), swipe or
  buttons for Confirm. Past: date, service, therapist, **paid amount** (only what was paid, as staff
  see it), **Book again**.
- **Detail sheet / panel** (N3): when, where (map snippet + Directions), with whom, what, price and
  paid, notes; actions: Confirm · Reschedule · Cancel · Add to calendar · Share · Call.
- **Cancel** flow: warning haptic, the shop's policy text, explicit "Cancel booking" (destructive),
  then optimistic removal with undo window only if the server allows (otherwise straight confirm).

### 5.4 Wallet & check-in pass

- **Pass** (P2, N4): a white card with a bronze header, client name, membership tier, large QR
  (`qr_token`, error-correction M, quiet zone), "Show this at reception". Opening it sets brightness to
  100 % and restores it on close; it works offline (cached token).
- **Membership** card (K6) with renewal date; **Packages** (K7) with rings and expiry.
- Phase 4: "Add to Apple Wallet / Google Wallet" (needs server-signed passes — separate approval).

### 5.5 Profile & native settings

- **Account**: name, email, phone (edit sheet), password (the 8+ with a digit rule already in the app).
- **Security** (app only): *Unlock with Face ID / fingerprint* toggle (N8).
- **Notifications**: push on/off, email reminders (K9), reminder timing chips **24 h · 2 h · 1 h**.
- **Appearance**: System / Light / Dark. **Language**: Ελληνικά / English.
- **Activity** (bell) and **Log out**.

---

## 6. Capacitor architecture

### 6.1 Upgrade and plugins

Capacitor **8** is current (8.0 Dec 2025, 8.5 Jul 2026); the repo is on 7.6.5. Upgrade first
(`npx cap migrate`), then add plugins whose peer range includes `@capacitor/core@^8`:

```bash
npm i @capacitor/core@^8 @capacitor/android@^8 @capacitor/ios@^8
npm i -D @capacitor/cli@^8
npx cap migrate
npx cap add ios

npm i @capacitor/haptics @capacitor/local-notifications @capacitor/push-notifications \
      @capacitor/share @capacitor/preferences @capacitor/status-bar @capacitor/splash-screen \
      @capacitor/app @capacitor/network @capacitor/browser @capacitor/app-launcher
npm i @ebarooni/capacitor-calendar@^8          # native calendar (no official @capacitor/calendar exists)
npm i @aparajita/capacitor-biometric-auth@^10   # v10 = Capacitor 8 (v9 if we stay on 7)
npm i @capacitor-community/screen-brightness    # or @capawesome/capacitor-screen-brightness
# secure token storage (pick one): @capawesome-team/capacitor-secure-preferences | capacitor-secure-storage-plugin
npx cap sync
```

Check each plugin's `peerDependencies` before installing; some community plugins lag a major version.

### 6.2 Portal-only native build (isolation)

The APK today packages `client/dist` — the whole app, admin screens included. Proposal:

- New entry **`client/portal.html` → `client/src/portal/main.ts`** with a router that has only
  `/login`, `/signup`, `/portal/*`, and the portal preset. Built with `vite build --mode portal`
  into **`client/dist-portal`**.
- `capacitor.config.ts` → `webDir: "client/dist-portal"`. The web deployment keeps serving the full
  app from `client/dist` (portal included), so nothing changes for staff or for web clients.
- Redesigned code lives under **`client/src/portal/`** (views, components, native composables,
  theme). Old `views/portal/*` stay until the switch, then are removed (the redirects in §2 keep
  links working). Admin files are not edited.

```ts
// capacitor.config.ts
import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "com.interventio.app",        // keep: changing it means a new store listing (ask first)
  appName: "Interventio Booking",
  webDir: "client/dist-portal",
  server: { androidScheme: "https" },
  plugins: {
    SplashScreen: { launchAutoHide: false, backgroundColor: "#faf7f2" },
    LocalNotifications: { smallIcon: "ic_stat_icon", iconColor: "#8B6F4E" },
    PushNotifications: { presentationOptions: ["badge", "sound", "alert"] },
  },
};
export default config;
```

### 6.3 Server changes the app needs

| Need | Change |
|---|---|
| API from the app | CORS: allow `https://localhost` (Android) and `capacitor://localhost` (iOS) for `/api` and Socket.IO; `VITE_API_BASE_URL` (already read by `main.ts`) |
| Native push | FCM (Android) / APNs (iOS) sending next to web push in `pushService.js`; device tokens in a new table (migration) |
| Reschedule | `POST /portal/appointments/:id/reschedule` (N2) |
| Deep links | serve `/.well-known/assetlinks.json` and `/.well-known/apple-app-site-association` |
| Review prompt | shop setting for the Google review URL (N10) |

### 6.4 Native composables (`client/src/portal/native/*`) — contracts and web fallbacks

Every composable checks `Capacitor.isNativePlatform()` and falls back on the web; none throws on web.

| Composable | API | Native | Web fallback |
|---|---|---|---|
| `useHaptics()` | `tick()`, `select()`, `success()`, `warning()`, `light()` | `Haptics.selectionChanged()`, `notification({ type })`, `impact({ style: Light })` | `navigator.vibrate?.(…)` where allowed, else no-op |
| `useReminders()` | `schedule(appts, offsets)`, `cancel(apptId)`, `syncAll()` | `LocalNotifications.schedule` with action type `appt` (Confirm, Directions); ids derived from appt id + offset; re-synced on every bookings load, cancelled on cancel/reschedule | Web push (existing) |
| `usePush()` | `register()`, `onAction(cb)` | `PushNotifications.register()` → token to server; action → route | existing `usePushNotifications` |
| `useCalendarSync()` | `add(appt)` | `CapacitorCalendar.createEvent({ title, startDate, endDate, location, alerts })` after permission | download `.ics` + Google Calendar link |
| `useShare()` | `share({ title, text, url })` | `Share.share` | `navigator.share` → clipboard + toast |
| `useBiometricUnlock()` | `available()`, `enable()`, `unlock()` | `BiometricAuth.authenticate()` gates the token kept in secure storage | hidden on web |
| `useBrightness()` | `boost()`, `restore()` | `ScreenBrightness.getBrightness/setBrightness(1)` | full-white pass background only |
| `useMaps()` | `directions(shop)` | `AppLauncher.openUrl` → Apple/Google Maps | `https://maps.google.com/?q=` |
| `useNetwork()` | `online` ref | `Network.addListener` | `navigator.onLine` events |
| `useDeepLinks()` | (setup) | `App.addListener('appUrlOpen')` → `router.push` | normal routing |
| `useNativeChrome()` | `applyTheme(dark, colour)` | `StatusBar.setStyle/setBackgroundColor`, `SplashScreen.hide()` after first paint | `<meta name="theme-color">` |

**Haptics map:** slot scrub → `selectionChanged`; tab change / pull-to-refresh → `impact(Light)`;
booking confirmed, confirm attendance → `notification(Success)`; cancel sheet opened / destructive
confirm → `notification(Warning)`; pass opened → `impact(Medium)`. Toasts and confirmations
(`ToastService`, `ConfirmationService`) call the matching haptic in one wrapper (`useFeedback()`).

### 6.5 Permissions

- **Android (`AndroidManifest.xml`):** `INTERNET` (exists), `POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM`
  (exact reminders; fall back to inexact if refused), `VIBRATE`, `USE_BIOMETRIC`, `READ_CALENDAR` /
  `WRITE_CALENDAR`; App Links `intent-filter` with `android:autoVerify="true"` for the shop domain.
- **iOS (`Info.plist`):** `NSFaceIDUsageDescription`, `NSCalendarsWriteOnlyAccessUsageDescription`
  (iOS 17+) / `NSCalendarsUsageDescription`, push capability + `aps-environment`, Associated Domains
  (`applinks:<shop domain>`).
- Permission prompts are **just-in-time** (calendar on first "Add to calendar", notifications after the
  first booking), each with a one-line explanation sheet before the system prompt.

### 6.6 Auth in the app

The login token stays out of URLs (as today). In the app it is stored in secure storage; with
biometrics on, opening the app asks Face ID / fingerprint before the stored token is used. The password
is never stored. Logout clears secure storage, scheduled reminders and the cached pass.

---

## 7. Implementation roadmap (after approval)

1. **Foundations** — portal entry + `client/src/portal/` skeleton, portal preset (white-label), shell
   (tabs / rail), redirects; requirement tests for every kept feature (K1–K14) written first, against
   today's behaviour, so nothing is lost.
2. **Screens** — Home (Up Next, Book again), Booking (3 steps, sticky bar), Bookings hub + detail sheet,
   Wallet + pass, Profile. Web first, behind a feature flag (`?portal=v2`) for side-by-side checks.
3. **Native** — Capacitor 8 upgrade, iOS project, portal-only `webDir`, composables (§6.4), status bar /
   splash, deep links, local reminders, calendar, share, brightness, biometrics.
4. **Server** — reschedule endpoint, native push (FCM/APNs), `.well-known` files, review URL setting;
   server tests for each.
5. **Polish & launch** — dark mode pass, accessibility (contrast, focus, screen readers, 44 px targets),
   Stryker on the new composables, staged rollout (web flag → all web → app stores).
6. **Later (separate approvals)** — Apple/Google Wallet passes, in-app payments (`@capacitor/browser`
   checkout), referrals.

---

## 8. Open questions for you

1. Approve / reject each row in §3 (K, N, R).
2. Keep `appId com.interventio.app` (one app, every shop white-labelled after login), or one app per shop?
3. Upgrade to Capacitor 8 now (recommended), or stay on 7 with the 7.x plugin lines?
4. iOS: is an Apple developer account available (needed for Face ID testing, push, Universal Links)?

## 9. Opening the prototype

Open `docs/redesign/client-portal-prototype.html` in Chrome, Safari or Firefox (double-click, or
`xdg-open docs/redesign/client-portal-prototype.html`). It loads Vue, PrimeIcons, fonts and a QR
library from public CDNs, so it needs a connection. Use the top bar to switch **Mobile / Desktop**,
**Light / Dark** and **EL / EN**. Every native action shows the Capacitor call it would make in a
small pill at the top. All data is invented sample data.

---

Sources: [Capacitor 8 announcement](https://ionic.io/blog/announcing-capacitor-8) ·
[Capacitor 8.5](https://ionic.io/blog/capacitor-8-5-released) ·
[Capacitor 8 plugin upgrade notes (Capgo)](https://capgo.app/blog/upgrade-capacitor-app-to-capacitor-8/) ·
[@ebarooni/capacitor-calendar](https://github.com/ebarooni/capacitor-calendar) ·
[@aparajita/capacitor-biometric-auth](https://npmjs.com/package/@aparajita/capacitor-biometric-auth) ·
[@capacitor-community/screen-brightness](https://www.npmjs.com/package/@capacitor-community/screen-brightness) ·
[Capawesome screen brightness](https://capawesome.io/docs/sdks/capacitor/screen-brightness/) ·
[Booksy customer app](https://biz.booksy.com/en-us/features/customer-app) ·
[Fresha features](https://www.fresha.com/for-business/features) ·
[Booking flow UX patterns (Appy Pie)](https://www.appypie.com/blog/booking-app-ux-patterns)
