# Android app — handoff for the build machine

For whoever builds the Android app on a computer that has Java and Android Studio: Claude Code,
or a developer. Read this whole file first, then `CLAUDE.md`, then `REDESIGN_SPEC.md` §6
(Capacitor architecture) and `IMPLEMENTATION_PLAN.md` (what is built and how).

The portal redesign (phases 0–6) is finished and merged on branch **`ai-assistant`**. What is
left is **phase 7: the native app, Android only**.

---

## 1. Decisions already taken — don't ask again

| Topic | Decision |
|---|---|
| Platform | **Android now, iOS later.** Don't add `@capacitor/ios` or an `ios/` folder. |
| App id | **`com.purespaexperience.app`**: one app for every shop, white-labelled after login (each shop's colour, name and logo come from `/shop`). |
| App name | `Pure Spa Experience` (change only if the owner says so) |
| Capacitor | **Upgrade 7.6.5 → 8.** Every plugin on its Capacitor-8 line (check each one's `peerDependencies` before installing). |
| What the app contains | **The client portal only**: login, signup and `/portal/*`. Staff and admin screens must not be in the APK (spec §6.2). The web keeps serving the full app from `client/dist`. |
| Push notifications | **Two layers.** (1) Reminders are **scheduled on the phone** (local notifications, 24 h / 2 h / 1 h, as the client chose in Profile). They work with no server and no connection. (2) **Firebase Cloud Messaging** for shop announcements, wired in but **off until the owner adds the keys** (`google-services.json` in the app, `FIREBASE_SERVICE_ACCOUNT` on the server). With no keys, everything else works. Push text stays minimal (no treatment names); the app shows the details. |
| Server address | One build setting, `VITE_API_BASE_URL`, in `client/.env.portal`. Ask the owner for the production domain if it isn't filled in. |
| Login token | Never in a URL (project rule). In the app it lives in secure storage. With biometrics on, it's read only after Face/fingerprint unlock. The password is never stored. |
| Language and style | Every visible text through vue-i18n (Greek first; portal texts under `portal.v2.*` in `client/src/i18n/locales/portal.el.ts` / `portal.en.ts`). Comments explain why, in plain sentences. Commit messages are one short imperative sentence. **One commit per finished step, with its tests.** |

---

## 2. Set up the build machine

1. **Tools:**
   - Node 22 or newer;
   - **JDK 21** (Android Studio's bundled JBR is fine: set `JAVA_HOME` to it);
   - Android Studio (current), with SDK **Platform 36** and **Build-Tools 36** installed;
   - an emulator (API 34+) or a phone with USB debugging.
2. **Code:** `git fetch AptApp && git checkout ai-assistant` (the owner pushes the branch from the
   first computer), then `npm ci` (one lockfile at the root covers the client too), and
   `cd ai && python -m venv .venv && .venv/bin/pip install -r requirements.txt` for the assistant's
   tests.
3. **Database:** only for server tests and running the API locally.
   - **Postgres:** install PostgreSQL 17 locally.
   - **Dev data:** restore the dev dump the owner brings, which the server tests copy (`createTestDb`).
   - **.env:** copy `.env` from the first machine (it has `POSTGRES_URI`, `JWT_SECRET`; **never commit it**).
4. **Check everything is green before changing anything:**
   - `npm test`
   - `node --test tests/server/portal.test.mjs tests/server/aiAssistant.test.mjs`
   - `cd ai && .venv/bin/python -m pytest`

---

## 3. The steps, in order (commit each)

### Step 7.1 — Capacitor 8 and the new app id

- In `package.json`: `@capacitor/core`, `@capacitor/android`, `@capacitor/cli` → `^8`. Run `npx cap migrate`.
- Replace `capacitor.config.json` with **`capacitor.config.ts`** (spec §6.2):

  ```ts
  appId: "com.purespaexperience.app",
  appName: "Pure Spa Experience",
  webDir: "client/dist-portal",
  server: { androidScheme: "https" },
  // plugins: SplashScreen, LocalNotifications, PushNotifications as in spec §6.2
  ```

- **Changing the app id:** the old project is `com.interventio.app`. The cleanest way is to
  regenerate `android/` (`npx cap add android`), then carry the icons and splash screens over from
  the old `android/app/src/main/res` (made in commit `4d2b567`). Afterwards check:
  - `applicationId` and `namespace` in `android/app/build.gradle`;
  - the `MainActivity` package path.
- `minSdkVersion`, `compileSdk` and `targetSdk` as Capacitor 8 sets them (compile/target 36).

**Check:** `cd android && ./gradlew assembleDebug` builds.

### Step 7.2 — A portal-only build

- New entry **`client/portal.html` → `client/src/portal/main.ts`**:
  - the same set-up as `client/src/main.ts` (Pinia, i18n, PrimeVue with `darkModeSelector: ".my-app-dark"`, ToastService, ConfirmationService);
  - its own router, with only `/login`, `/signup` and the `/portal` routes from `client/src/router/index.ts` (copy the client parts of its guard);
  - the portal theme from the first paint.
- Build with `vite build --mode portal` into **`client/dist-portal`**. Add the scripts
  `build:portal` and `app:sync` (`npm run build:portal && npx cap sync android`).
  Git-ignore `client/dist-portal`.
- **The API from the app:** `main.ts` patches `fetch` so `/api`, `/socket.io` and `/health` go to
  `VITE_API_BASE_URL`.
  - Move that patch into a small shared module, used by both entries.
  - **Add `/ai`**: the assistant streams from `/ai/chat` (`client/src/portal/components/AiChat.vue`).
  - Socket.IO's address (`client/src/stores/chat.ts`) already reads `VITE_API_BASE_URL`.
- `client/.env.portal`: `VITE_API_BASE_URL=` (the production domain).

**Tests:** a spec test that the portal router has no `/app` routes, and that the fetch patch
prefixes `/api` and `/ai` only.

### Step 7.3 — What the server must allow

- **CORS:** let `https://localhost` (Android's WebView) through, for both Express and Socket.IO in
  `server/server.js`. `capacitor://localhost` is for iOS later.
  - Keep `ALLOWED_ORIGINS` working as it is.
  - Add `PATCH` to the CORS methods if any portal call uses it.
- **App Links:** serve `/.well-known/assetlinks.json`, built from env `ANDROID_APP_SHA256` (the
  signing key's fingerprint) and the package `com.purespaexperience.app`. Send 404 when the env is
  unset.
- **Device tokens:**
  - **Migration** (next free number in `server/migrations/`): `push_devices (id, client_id, shop_id, token UNIQUE, platform, created_at, last_seen_at)`.
  - **Routes:** `POST /api/v1/portal/push-device` and `DELETE` (client only, their own).
  - **Logout** removes the device's token.
- **FCM sending** in `server/pushService.js`, beside web push:
  - use `firebase-admin` (HTTP v1), only when `FIREBASE_SERVICE_ACCOUNT` is set; otherwise skip silently;
  - send to every device of the client;
  - drop tokens FCM says are invalid;
  - keep the data payload minimal: `title`, `body` and `url`, e.g. `/portal/bookings/<id>`, which the app opens.
  - `sendPushToClient` already exists and is called by reminders and broadcasts: extend it, don't
    duplicate.
  - **Server reminders aren't sent to app devices:** the phone schedules those itself (no double
    reminders). Server **announcements** go to app devices.

**Tests:** `tests/server/` with a new DB name and port (check the free ones as CLAUDE.md says):
- token register/unregister;
- assetlinks with and without the env;
- `sendPushToClient` with a fake FCM sender (inject it, don't call Google).

List the new file in CLAUDE.md's "run by hand" list.

### Step 7.4 — Native composables (`client/src/portal/native/*`, spec §6.4)

**Rules for every composable:**
- Each checks `Capacitor.isNativePlatform()`.
- On the web it does what the portal does today, and **never throws**.
- Plug each into the seam that already exists; don't add new call sites in screens.

| Composable | Native | Plug into (already exists) |
|---|---|---|
| `useHaptics` | `@capacitor/haptics` (spec's haptics map) | `client/src/portal/composables/useFeedback.ts`: its `tick` / `success` / `warning` / `error` call haptics instead of `navigator.vibrate` on native |
| `useReminders` | `@capacitor/local-notifications`, action type `appt` with **Confirm** and **Directions** | `client/src/portal/stores/bookings.ts` `load()` → `syncAll(upcoming, offsets)`. Offsets come from the client's `reminder_offsets_minutes` (else the shop's `reminder_hours_before`). Notification ids are derived from the booking id + offset, so re-syncing replaces them. A cancelled or moved booking's reminders go on the next sync (every action fires `appointments-changed`, which reloads bookings). The Confirm action calls `usePortalBookingActions().confirmAttendance`; Directions opens maps. Asked for permission **after the first booking**, with a one-line explanation first. |
| `usePush` | `@capacitor/push-notifications`: register → `POST /portal/push-device`; tapping one → `router.push(url)` | Only when `google-services.json` is present (otherwise not registered at all) |
| `useCalendarSync` | `@ebarooni/capacitor-calendar` `createEvent` (permission asked the first time) | `client/src/portal/composables/useBookingExtras.ts` `addToCalendar` (the web keeps the `.ics` download) |
| `useShare` | `@capacitor/share` | `useBookingExtras.share` |
| `useMaps` | `@capacitor/app-launcher` → Google Maps | `useBookingExtras.directionsUrl` and the links in `UpNextCard.vue` / `BookingDetailSheet.vue` |
| `useBrightness` | screen-brightness plugin on its Capacitor-8 line: `boost()` on open, `restore()` on close | `client/src/portal/views/PassView.vue` |
| `useNetwork` | `@capacitor/network` | `client/src/portal/composables/useNetwork.ts` (the offline banner) |
| `useDeepLinks` | `@capacitor/app` `appUrlOpen` → router; the Android **back button** goes back / closes sheets | `client/src/portal/main.ts` |
| `useNativeChrome` | `@capacitor/status-bar` (colour and style follow light/dark and the shop's colour), `@capacitor/splash-screen` hidden after first paint | `client/src/portal/composables/usePortalTheme.ts` |
| `useBiometricUnlock` + secure storage | biometric-auth plugin (Capacitor-8 line) + a secure-storage plugin | see 7.5 |

**Tests:**
- Spec tests mock `@capacitor/*` with `vi.mock`: native plugins count as browser/device APIs, which the testing conventions allow mocking.
- Per composable: one native case and one web case.
- Reminders: ids are stable, re-syncing replaces them, cancelled bookings get none, offsets are honoured, and permission is asked only after the first booking.

### Step 7.5 — Sign-in in the app

- On login, keep the token in secure storage (and in `localStorage`, where `api/http.ts` reads it).
- When the app starts, put the stored token back into `localStorage` **before mounting**.
- **Profile → Security** (app only): "Unlock with fingerprint". When it's on, starting the app asks
  for biometrics before the stored token is used; a failure or cancel goes to the login page.
- Logout, through `client/src/portal/logout.ts` (`forgetPortal`), already clears the pass, the
  bookings and the conversation. It must also:
  - clear secure storage;
  - cancel every scheduled reminder;
  - unregister the push token.

**Tests:** spec tests for unlock on, off and failed, and for logout clearing everything.

### Step 7.6 — Android manifest and resources

- **Permissions:** `POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM` (fall back to inexact if refused),
  `VIBRATE`, `USE_BIOMETRIC`, `READ_CALENDAR` / `WRITE_CALENDAR`.
- **App Links:** an `intent-filter` with `autoVerify="true"` for the production domain, paths
  `/portal/*`.
- **Notifications:** a small white icon (`ic_stat_icon`) and the accent colour `#8B6F4E`.
- **Version:** `versionCode` / `versionName` start at 1 / 1.0.0.

### Step 7.7 — Check on a real phone (or emulator)

Run `npm run app:sync`, then `cd android && ./gradlew assembleDebug`, then install. Go through:

1. Log in as a client. Make one in the staff app first, with self-booking on in Settings.
2. Up Next shows. Book a time; the "done" sheet appears; Add to calendar puts it in the phone's calendar.
3. Reminders are scheduled: set a booking 70 minutes ahead and choose "1 h before" in Profile.
4. The pass opens at full brightness, then turns airplane mode on: the pass and the bookings still show.
5. Moving and cancelling work; the reminder of a cancelled booking is gone.
6. The assistant opens from the top bar and books through a card; the same done sheet appears.
7. Dark mode and the back button behave.
8. Fingerprint unlock works when switched on.
9. No staff screen can be reached (`/app/...` links go to the portal).

Record the results in the step's commit message or a short note in this file.

### Step 7.8 — Release build (when the owner is ready)

- **Signing key:** create one with `keytool`. Keep it and its passwords **out of git** (a
  `keystore.properties` git-ignored, read by Gradle).
- **Build:** `./gradlew bundleRelease` gives an `.aab` for the Play Console.
- **App Links:** put the key's SHA-256 into `ANDROID_APP_SHA256` on the server.

---

## 4. What only the owner can give

1. **The production domain**: for `VITE_API_BASE_URL` and the App Links filter.
2. **Firebase** (optional until announcements are wanted): `google-services.json` →
   `android/app/` (git-ignored), and the service-account JSON → server env
   `FIREBASE_SERVICE_ACCOUNT`. Both come from one project at console.firebase.google.com with an
   Android app `com.purespaexperience.app`. Free, no card.
3. **A signing keystore**: or the go-ahead to create one, kept off git.
4. **A Play Console account**: only for publishing.

---

## 5. Prompt to paste into Claude Code on the build machine

> We're on branch `ai-assistant` of this repo. Read `docs/redesign/ANDROID_HANDOFF.md`, then
> `CLAUDE.md`, `docs/redesign/REDESIGN_SPEC.md` §6 and `docs/redesign/IMPLEMENTATION_PLAN.md`.
> Build the Android app exactly as the handoff says:
> - steps 7.1 to 7.7 in order, one commit per finished step, each with its tests;
> - the decisions in section 1 are final;
> - run the checks in section 2 first and tell me if anything fails before you change code;
> - ask me for anything in section 4 when you reach the step that needs it.
>
> Don't push without asking. At the end, report what you checked on the phone (step 7.7) and what is still open.
