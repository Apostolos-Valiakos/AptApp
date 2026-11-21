# Client Portal Redesign — Implementation Plan

Branch: **`ai-assistant`** (it now contains `pure_changes`, merged in `777010d`).
Source of truth for *what*: [`REDESIGN_SPEC.md`](REDESIGN_SPEC.md) and the prototype
[`client-portal-prototype.html`](client-portal-prototype.html). This file says *how*, in which order,
and what each step changes.

Decisions already taken:

| Question | Decision |
|---|---|
| Scope | Everything in the spec (K1–K14, N1–N13, R1–R5) |
| Order | **Web first, native later**: phases 0–6 ship the redesign on the web; phase 7 is the Capacitor app |
| AI assistant | **A button in the top bar** on every portal screen **and "Ask the assistant" in Book** |
| Commits | One commit per finished step, on `ai-assistant`, tests included; nothing pushed without asking |
| R2 (remove the chat button in the tab bar) | Done differently: the tab bar loses the button, the assistant moves to the top bar |

Rule for the whole plan: **the two ways of booking, the screens and the assistant, must follow the
same rules.** In practice:

- **One server path.** Both call the same server routes:
  - `POST /appointments` for a client booking;
  - `/portal/appointments/:id/cancel`, `/reschedule` and `/confirm`.
- **One rule for free times.** Every client booking or move is checked against
  `domain/availability.js` `freeStartTimes`. This already holds (commit `6d57409`).
- **One client path.** On the client, both go through one composable, `usePortalBookingActions`. The
  screens and the assistant's cards therefore get the same:
  - success sheet;
  - haptics;
  - calendar export;
  - list refresh;
  - error texts.

---

## Already done on this branch

| Commit | What |
|---|---|
| `777010d` | Merged `pure_changes`. The assistant's routes are now in `server/routes/ai.js` (`/ai/context`, `PUT /shop/ai-assistant`) and `server/routes/portal.js` (`GET /portal/appointments/upcoming`, `POST /portal/appointments/:id/reschedule`). Free times are shared in `server/domain/availability.js`. The `ai_assistant_enabled` column moved into migration `0024`. Tests: `tests/server/aiAssistant.test.mjs` AI1–AI5. **This is N2's server side.** |
| `6d57409` | Bugs found in the audit, with tests (AI6, AI7, AIC1–AIC3, one pytest). See the list below. |

Bugs found and fixed in the AI branch:

1. **Reschedule checked only the shop's opening hours.** It ignored the staff member's own shifts, leave and breaks, so it could move a booking onto someone on leave. It now uses `freeStartTimes`.
2. **A moved booking kept `push_reminder_sent = true`.** No push reminder was sent for the new time. Both reminder flags are now reset.
3. **A client's booking request was never checked against the offered times.** It was checked only for overlaps, so a hand-made request could book a past time, an off-grid time, or a time past the staff member's hours. It now has to be one of `freeStartTimes` (`slot_unavailable`).
4. **A client could cancel a booking that had already happened** (or a no-show) from the portal, which changed their balance. Only bookings still to come can be cancelled now.
5. **A failed card gave the assistant no reason** ("the time may no longer be free" every time). The server's reason is now passed on, so the assistant can explain it and offer another time.
6. **Nothing refreshed after a card was confirmed.** Home and Bookings now reload on `appointments-changed`.
7. **The assistant's screens used raw `fetch` with hand-made auth headers.** They now use `api/http.ts`.
   - The booking's idempotency key is kept per card, so a retry can't book twice.
   - Money, duration and date are shown with the shared formatters, not `€x.toFixed(2)`.
   - Deleting a policy document now asks first.
8. **If the model kept calling tools for all 8 steps, the client got an empty reply.** It now gets an error message.

---

## Phase 0 — Lock in today's behaviour (tests first)

**Step 0.1: K1–K14 requirement tests.**
- New `tests/spec/portalKeep.spec.ts`, one `describe` per row of spec §3. Each test is written against
  **today's** screens (`views/portal/*`), with the existing `fakeServer`. In short:
  - K1 next appointment; K2 booking reaches `POST /appointments` with service, staff and time;
  - K3 confirm; K4 cancel; K5 past list with paid amounts;
  - K6 QR; K7 packages; K8 profile and password rule; K9 email and push toggles;
  - K10 notifications read / read all; K11 EL/EN; K12 the `tel:` link; K13 contest; K14 self-booking off.
- Each test reaches its screen through a small `openPortalScreen(name)` helper. When phase 2 swaps the
  screens, only that helper's map changes, and the same assertions must pass on the new screens.
- Commit: "Add requirement tests for every portal feature the redesign keeps".

## Phase 1 — Foundations

**Step 1.1: The `client/src/portal/` skeleton and the shared actions.**
- New folders: `portal/views/`, `portal/components/`, `portal/composables/`, `portal/theme/`,
  `portal/native/` (the last one empty until phase 7).
- `portal/composables/usePortalBookingActions.ts` holds `book`, `cancel`, `reschedule` and
  `confirmAttendance`:
  - each uses `api`, adds an idempotency key for bookings and maps server reasons to i18n texts
    (`slot_unavailable`, `self_booking_disabled`, `past_time`, `multi_service`);
  - each fires `appointments-changed` and calls `useFeedback()`.
- `portal/composables/useFeedback.ts` holds the toast and haptic pairs from spec §6.4. On the web the
  haptic is `navigator.vibrate` or nothing.
- `AiChatPanel.vue` switches its `performAction` to `usePortalBookingActions`. Its own copy of the
  requests goes, and AIC1–AIC3 must still pass.
- Tests: `tests/spec/portalActions.spec.ts` (PA1–PA4: the four actions, their error texts, one key per
  booking).

**Step 1.2: The portal preset (white-label).**
- `portal/theme/portalPreset.ts` exactly as in spec §4, plus `usePortalTheme()`. It applies
  `usePreset(portalPreset(shop colour))` when the portal shell mounts and goes back to the admin preset
  on logout.
- Typography: Noto Serif Display for headings, radii and elevations as in spec §4.
- Appearance, System / Light / Dark (N11), sits on the existing `.my-app-dark`:
  - `portal/composables/useAppearance.ts`;
  - the choice is a per-viewer setting in `localStorage`, wrapped in try/catch.
- Tests: PT1 (the shop's colour becomes `primary`), PT2 (dark follows the device, then the setting).

**Step 1.3: The shell, the routes and the assistant button.**
- New `portal/PortalShell.vue` replaces `components/ClientLayout.vue` behind the flag:
  - **mobile:** a top bar (shop name or logo, **assistant button**, bell) and 5 tabs (Home · Bookings ·
    **Book**, raised · Wallet · Profile), safe areas respected;
  - **≥ 1024 px:** a left rail with the same 5 destinations and a compact EL/EN switch (R4), the main
    column, and a right context panel holding Up Next and the open sheet.
- The assistant button shows only when `/shop` says `ai_assistant_enabled`. It opens `AiChatPanel`:
  - **mobile:** as a bottom `Drawer`;
  - **desktop:** in the context panel;
  - the panel keeps its conversation while the client moves between tabs.
- Routes, in `router/index.ts` (spec §2):
  - `/portal/home`, `/portal/book`, `/portal/book/reschedule/:id`;
  - `/portal/bookings`, `/portal/bookings/:id`;
  - `/portal/wallet`, `/portal/wallet/pass`, `/portal/profile`.
  - Redirects: `/portal/appointments` → `/portal/bookings`, `/portal/more` → `/portal/profile`.
- **The flag:**
  - `?portal=v2` stores `portalV2 = 1` in `localStorage`; `?portal=v1` clears it.
  - The router guard sends `/portal/*` to the new screens when the flag is on and to the old ones
    otherwise.
  - The flag goes away in step 6.2.
- R2: the commented-out chat markup and the tab-bar AI button are removed.
- Tests: `tests/spec/portalShell.spec.ts`:
  - PS1 five tabs in order;
  - PS2 the old links redirect;
  - PS3 the assistant button only when it is switched on;
  - PS4 the rail on desktop;
  - PS5 the flag on and off.

## Phase 2 — Screens (web)

Each screen is a thin view plus composables, as the staff app does. When a screen replaces an old one,
its K tests from phase 0 are moved onto it in `openPortalScreen`.

**Step 2.1: Home (K1, K12, K13, N1, the Up Next states).**
- `portal/views/HomeView.vue`.
- `portal/composables/useUpNext.ts` holds the card's states (> 24 h, ≤ 24 h, ≤ 60 min, started,
  completed today). It is a pure function of (booking, now), so it can be tested on its own.
- `portal/components/UpNextCard.vue`.
- `portal/components/BookAgainCarousel.vue`: the last 5 distinct (service, staff) pairs from the
  history the screen already loads.
- Wallet strip, contest card, Call chip.
- Server: none. It uses `/clients/:id/full`, `/shop` and `/contests/active`, which exist.
- Tests: `portalHome.spec.ts` (UN1–UN5 the card states, BA1 book again opens Book at step 2 with
  `?service=&staff=`).

**Step 2.2: Book (K2, K14, N1, the 3 steps and the sticky bar), with the assistant in it.**
- `portal/views/BookView.vue` with these steps:
  - `ServiceStep.vue`: category pills, cards, search on desktop.
  - `TimeStep.vue`:
    - staff chips, *Anyone* first;
    - a 14-day date strip with dots;
    - times grouped by morning, afternoon and evening;
    - "N left" only from the real count.
  - `ConfirmStep.vue`: summary, notes, the shop's cancellation note, then **Book**.
  - `BookingSuccessSheet.vue`: Add to calendar, Share, Done.
- *Anyone* (`useAnyoneSlots.ts`):
  - asks `/availability` for each eligible staff member and merges the times;
  - the confirm step shows who will do it;
  - two staff free at the same time: the one listed first in `/portal/staff` (the shop's own order).
- **"Ask the assistant" in Book.** At the top of step 1 sits a card, "Not sure what to choose? Ask the
  assistant". It opens the same panel with the question already typed ("Help me choose a treatment").
  On steps 2–3 a small link opens it with the chosen service as context ("I want X, when is it free?").
  Both show only when the assistant is switched on.
- A booking card confirmed in the chat ends in the **same** `BookingSuccessSheet`. It uses
  `usePortalBookingActions`, so calendar, share and haptics are the same.
- Reschedule mode, at `/portal/book/reschedule/:id` (N2):
  - steps 2–3 with "Moving from Fri 18:30" and the service and staff kept;
  - it calls `/portal/appointments/:id/reschedule`, which already exists;
  - a multi-service booking shows "Call the spa to move this booking" instead (the server says
    `multi_service`).
- Tests: `portalBook.spec.ts`:
  - BK1 three steps;
  - BK2 Anyone merges and the confirm step names the staff member;
  - BK3 the sticky bar from step 2;
  - BK4 self-booking off shows the phone (K14);
  - BK5 `?service=&staff=` lands on step 2;
  - BK6 "Ask the assistant" opens the panel with the question;
  - BK7 reschedule mode posts to `/reschedule`;
  - BK8 `slot_unavailable` shows the text and reloads the times.

**Step 2.3: Bookings hub and detail (K3, K4, K5, N3, N5, N6, N7).**
- `portal/views/BookingsView.vue`, Upcoming / Past:
  - status chips, Confirm;
  - Past shows the **paid amount** with `PaidAmount.vue` (as the staff see it) and **Book again**.
- `portal/components/BookingDetailSheet.vue`, opened at `/portal/bookings/:id`:
  - a bottom `Drawer` on mobile, the context panel on desktop;
  - actions: Confirm · Reschedule · Cancel · Add to calendar · Share · Directions · Call.
- Cancel flow: a warning, the shop's cancellation note, then the destructive confirm (`askConfirm`).
- Helpers, each with web behaviour now and a native slot for later:
  - `portal/composables/useCalendarExport.ts` (N5): `.ics` built in the browser, plus a Google
    Calendar link;
  - `useShare.ts` (N6): `navigator.share`, or the clipboard and a toast;
  - `useMaps.ts` (N7): `https://maps.google.com/?q=<shop address>`.
- Tests: `portalBookings.spec.ts`:
  - BH1 upcoming and past split;
  - BH2 a past booking shows only what was paid;
  - BH3 the detail opens from its link;
  - BH4 cancel asks, then posts;
  - BH5 the `.ics` holds the right start, end and place;
  - BH6 share falls back to the clipboard;
  - BH7 an assistant-made booking appears without a reload.

**Step 2.4: Wallet and pass (K6, K7, N4).**
- `portal/views/WalletView.vue`: the membership card, and packages with progress rings
  (`ClientPackagesPanel.vue` data).
- `portal/views/PassView.vue`, full screen:
  - the shop's colour, the client's name, the tier and a large QR (`qr_token`, error correction M);
  - the screen is lit white on the web.
- The token is cached (N13), so the pass opens with no connection.
- Tests: `portalWallet.spec.ts`:
  - WL1 the QR encodes `qr_token`;
  - WL2 packages show used of total;
  - WL3 the pass opens offline from the cache.

**Step 2.5: Profile (K8–K11, N11).**
- `portal/views/ProfileView.vue`, in sections:
  - Account (edit sheet, password with the existing rule);
  - Notifications (push, email, **reminder timing**, see step 3.2);
  - Appearance; Language; Activity; Log out.
- Logout clears the portal caches (pass, upcoming) and the assistant's conversation.
- Tests: `portalProfile.spec.ts`:
  - PF1 edit saves to `/portal/profile`;
  - PF2 the password rule;
  - PF3 the language switch;
  - PF4 appearance;
  - PF5 logout clears the caches.

## Phase 3 — Server additions

Each step adds a migration where needed, a server test file (a new DB name and port; list it in
CLAUDE.md), and the matching admin setting in Settings → the self-booking card.

**Step 3.1: Shop booking rules — a notice period and the cancellation note (N2, K4).**
- Migration `0025_portal_rules.sql` adds to `shops`:
  - `portal_min_notice_minutes INT NOT NULL DEFAULT 0`: how long before a booking a client may still
    book, move or cancel it online;
  - `cancellation_note TEXT`: shown in the cancel flow and the confirm step.
- `freeStartTimes` takes the notice into account (`skipPast` becomes "not before now + notice"). The
  portal's `/cancel` and `/reschedule` refuse inside the notice with `too_late`.
- The same rule reaches the assistant: `/ai/context` returns both fields, and `dynamic_system` states
  them. So the assistant quotes the shop's own note even with no documents uploaded, and never proposes
  a time inside the notice.
- Admin: two fields in `SelfBookingCard`.
- Tests: `tests/server/portalRules.test.mjs`:
  - PR1 a time inside the notice is not offered and not bookable;
  - PR2 cancel and move inside the notice are refused;
  - PR3 the default 0 changes nothing.
- Plus a pytest that the system prompt carries the note.

**Step 3.2: Reminder timing (K9).**
- Migration adds `clients.reminder_offsets_minutes INT[] DEFAULT '{1440}'`.
- `PUT /portal/notifications` takes the offsets: any of 1440, 120 and 60.
- `reminderService.js` sends one reminder per chosen offset; the "sent" flags become per offset.
- Tests: server RT1–RT3 and spec PF6.

**Step 3.3: Post-visit review prompt (N10).**
- Migration adds `shops.google_review_url TEXT` and `appointments.review_prompted_at TIMESTAMPTZ`.
- New `POST /portal/appointments/:id/review-prompted`.
- The Home card "How was it?" shows once, for a completed booking of today. 5 stars opens the URL;
  fewer stars says thank you and stores nothing else.
- Admin: the URL field in the self-booking card.
- Tests: server RV1–RV2, spec UN6.

**Step 3.4: Shared places in the portal (the known limitation).**
- Client bookings skip `assertCapacity`, and `freeStartTimes` treats every staff member as one place.
  So the sauna or hammam (capacity 5) shows as taken after one booking, and a capacity-1 overlap check
  is all that guards it.
- `freeStartTimes` counts overlapping bookings against `staff.capacity` (as `utils/capacity.ts` and
  `assertCapacity` do). Client bookings run `assertCapacity` too.
- Both booking ways get this at once.
- Tests: `capacityCases`-style server tests CP-P1 to CP-P3, using the dev data's ΣΑΟΥΝΑ with 5 places.

## Phase 4 — The assistant, aligned with the redesign

**Step 4.1: The assistant knows what the screens know.**
- A new read-only tool, `list_recent_visits`. It returns the last distinct (service, staff) pairs, so
  "the same as last time" works in the chat as Book again does on Home (N1).
  - Server: `GET /portal/appointments/recent`, client only, the same data the carousel uses.
- `check_availability` with *Anyone* picks the same staff member the screen would: the first one listed
  in `/portal/staff`.
- `propose_reschedule` and `propose_cancellation` refuse inside the notice period, with the shop's
  note.
- Cards carry a link, "Open in Bookings", to `/portal/bookings/:id` (the detail sheet).
- Tests:
  - pytest: the new tool, the notice refusal, Anyone's choice;
  - spec: AIC4, a confirmed booking card shows the success sheet with Add to calendar.

**Step 4.2: The chat panel in the new look.**
- `AiChatPanel.vue` moves to `portal/components/`:
  - portal preset tokens instead of grey utility classes;
  - dark-mode parity;
  - a bottom `Drawer` with detents on mobile.
- The conversation lives in a small Pinia store (`portal/stores/assistant.ts`), so it survives tab
  changes and is cleared at logout.
- Tests: AIC5 (the conversation is kept between tabs and cleared at logout).

## Phase 5 — Offline and polish (web)

**Step 5.1: Offline cache (N13).**
- Upcoming bookings and the pass token are kept in IndexedDB (`portal/cache.ts`).
- On a failed load the screens show the cached copy with an "offline" banner (`useNetwork`).
- Tests: OF1 and OF2.

**Step 5.2: Accessibility and dark-mode pass.**
- Checks: contrast, focus rings, 44 px targets, labels on icon buttons, screen-reader names for the
  tabs and the QR.
- Tests: spec checks on aria labels; a Chrome run with `scripts/test_image_browser.cjs`, in both themes.

**Step 5.3: Stryker** on `useUpNext`, `useAnyoneSlots` and `usePortalBookingActions`.
- Add them to `stryker.config.json`.
- Raise the scores to ≥ 70 %.

## Phase 6 — Switch over (web)

**Step 6.1: Side-by-side check.**
- With `?portal=v2`, the K tests run against both versions in CI (the `openPortalScreen` map has both).

**Step 6.2: Make v2 the only portal.**
- Remove the flag, `views/portal/*` and `components/ClientLayout.vue`.
- The K tests now point only at the new screens.
- Update CLAUDE.md (the portal's structure, the new test files).

## Phase 7 — Native app (later; needs your answers to spec §8)

Not started until you answer spec §8:
- the app id;
- Capacitor 8;
- the Apple account.

Steps, in the order of spec §6:
1. Capacitor 8 upgrade (`npx cap migrate`) and the iOS project.
2. The portal-only entry: `client/portal.html` → `client/src/portal/main.ts`, built to
   `client/dist-portal` and used as `webDir`.
3. The native composables in `portal/native/*`, each with the web fallback already written in phases 2–5.
4. Server:
   - CORS for `https://localhost` and `capacitor://localhost`;
   - the `.well-known` files;
   - FCM/APNs sending and a device-token table.
5. Local reminders with Confirm / Directions actions (N9), deep links (N12), biometrics (N8),
   brightness, status bar and splash.

---

## Order and size at a glance

| Phase | Steps | Server | Main risk |
|---|---|---|---|
| 0 | 1 | — | none (tests only) |
| 1 | 3 | — | the preset must not leak into the staff app (PT tests check the admin preset after logout) |
| 2 | 5 | — | Anyone merging: many `/availability` calls (one per staff member, run in parallel, cached per day) |
| 3 | 4 | 4 migrations | reminder offsets change `reminderService.js`; run its tests and keep `RUN_JOBS=0` in test servers |
| 4 | 2 | 1 route | the prompt changes; pytest covers the tools, but the live model needs a manual check with a real key |
| 5 | 3 | — | — |
| 6 | 2 | — | removing the old screens; the redirects keep emailed links working |
| 7 | 5 | 3 | store accounts and certificates |

Each step ends with:
- `npm test`;
- the hand-run server files it touches;
- `ai/.venv/bin/python -m pytest` when it touches the assistant;
- `npm run typecheck`;
- a commit.
