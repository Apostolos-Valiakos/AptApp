# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Booking and point-of-sale app for a massage and spa shop (Pure, Larisa), multi-tenant: an Express + PostgreSQL server, a Vue 3 staff app with a client portal, and a separate public home page. The interface is in Greek and English.

## Commands

```bash
npm run dev                # server (PORT, default 3000) + Vite dev server (port 5173, proxies /api, /socket.io and /health to API_URL:PORT from .env)
npm run build              # Vue app → client/dist (what the server serves in production)
npm run typecheck          # vue-tsc on client/
npm test                   # typecheck + unit tests + requirement tests + the server test files listed in package.json

npx vitest run                                        # unit tests: tests/offline, tests/booking (node env)
npx vitest run --config vitest.spec.config.mjs        # requirement tests: tests/spec (jsdom, real PrimeVue/Pinia/i18n)
npx vitest run --config vitest.spec.config.mjs tests/spec/authStore.spec.ts -t "S6"   # one file / one test
node --test tests/server/roles.test.mjs               # one server test file

npm run test:offline:e2e   # builds, then drives the offline mode in headless Chrome (/usr/bin/google-chrome)
npm run test:mutation      # StrykerJS on the files in stryker.config.json (~10 min)
./scripts/test_image.sh    # builds the Docker image of HEAD and tests it against a copy of the local DB
./scripts/deploy_image.sh  # builds HEAD's image here, uploads it to the VPS and runs it (see DEPLOY.md)
```

`npm test` runs only the server test files named in its script. Others exist and must be run by hand when their area changes: `aiAssistant`, `capacityCases`, `portal`, `clientNotes`, `clientPhones`, `moneySql`, `roleGates`, `staffSchedule`, `waitlist` (`node --test tests/server/<name>.test.mjs`).

The public home page is its own Next.js project: `cd landing && npm run dev` (port 3010) / `npm run build` (static export to `landing/out`). Read `landing/AGENTS.md` first: its Next.js version differs from what you may know.

Server tests (`tests/server/*.test.mjs`, `tests/offline/server.test.mjs`) need the local PostgreSQL running and `POSTGRES_URI` in `.env`. Each file copies the dev database into its own throwaway database (`createTestDb` in `tests/offline/helpers.mjs`) and starts the server on its own port: a new test file needs a **database name and port no other file uses** (see what's taken with `grep -h "PORT = \|const DB = " tests/server/*.mjs tests/offline/*.mjs`), or `npm test` fails intermittently when files run in parallel. Some tests depend on the dev data (e.g. capacity tests expect the ΣΑΟΥΝΑ staff member to have 5 places). `startServer` serves the built app when `APP_DIST_PATH` points at `client/dist`, which lets a puppeteer-core script (as in `scripts/test_image_browser.cjs`) check screens in Chrome against a throwaway database.

## Architecture

**Server (`server/`, CommonJS).** `server.js` sets up Express, Socket.IO, static files and the area routers in `routes/` (the large areas are folders: `routes/clients/`, `routes/reports/`). Each router file exports a factory taking its dependencies (`authenticateToken`, middleware, helpers) from `server.js` — a new helper a route needs is passed in where `server.js` mounts that router. Shared business logic lives in `domain/`: bookings and their checks (`bookings.js`), balances, packages, debts, idempotency, email link signing, Greek date texts, money SQL fragments (`moneySql.js`, `reportSql.js`), phone matching (`phones.js`), staff schedules (`staffSchedule.js`), the waitlist and the staff bonus. `http.js` has `asyncHandler` (turns thrown errors into JSON answers; `HttpError` for a deliberate status), `withTransaction` and malformed-id handling — new routes use `asyncHandler`.

- **Multi-tenant:** almost every table has `shop_id`; queries filter on `req.shopId` (set from the login token). Roles: `owner` (platform operator, no shop), `super_admin`, `admin`, `frontdesk`, `staff` (calendar only, read-only, enforced on the server by `notForStaff`), `client` (portal). Role middleware is in `middleware/auth.js`; the client-side page guard in `client/src/router/index.ts` is only a convenience. Analytics-type pages use `requireSensitiveAccess` (admin + the password retyped): the client sends `X-Reauth-Token` (`utils/reauth.ts`), and `SensitiveGate.vue` asks for the password before such a page loads.
- **Migrations:** `server/migrations/NNNN_name.sql`, each run once in order at server start (`migrate.js`, one file per query, so plpgsql `$$` blocks work) and recorded in `schema_migrations`; if one fails the server doesn't start. All schema changes go in a new migration file. The local dev database only gets new migrations when the dev server restarts.
- **Money:** amounts are rounded to the cent; a client's stored `outstanding_balance` comes from `domain/balances.js` (`clientBalanceSql`) and counts bookings from 1 March 2026 that have already happened. What a booking was paid is the sum of its `transactions` (`appointmentPaidSql`; package visits and gift cards are transactions too). The front end mirrors these rules in `client/src/utils/money.ts` and `composables/useBookingTotals.ts`; keep both sides in step.
- **Bookings off the receipts:** `appointments.save_receipt = false` bookings are seen only by super admins in reports. The booking API takes `save_receipt` as false when a request doesn't send it (the screens always do), so scripts and tests creating bookings through the API must send `save_receipt: true` to see them in admin reports.
- **Live updates:** any successful write under the calendar paths emits `appointments:changed` to the shop's socket room (`server.js`), writes under `/api/v1/waitlist` emit `waitlist:changed`; `stores/chat.ts` turns them into window events (`appointments-changed`, `waitlist-changed`) that screens listen to. Ctrl+1 / Ctrl+8 hide cash / card amounts shop-wide (`settingsStore.hideCashPaid` / `hideCardPaid`, broadcast as `cash:filter:set` / `card:filter:set`; `utils/paymentFilters.ts`); every money screen and export honours them, and Ctrl+1 also hides the waitlist.
- **Staff working hours** (`domain/staffSchedule.js`, mirrored in `client/src/utils/staffAvailability.ts`): a date's own hours (`staff_schedule_days`) come first, else the latest weekly schedule on or before it (`staff_schedule_versions` + `staff_working_hours`); staff with `working_hours_enabled` off work the shop's opening hours. Shared places (staff `capacity` > 1, the sauna and hammam) take several people at once (`domain/bookings.js` `assertCapacity`, `utils/capacity.ts`).
- **Waitlist** (`domain/waitlist.js`, `routes/waitlist.js`): front desk and admins only. Free times for an entry respect working hours, leave, breaks, bookings, `staff_services` (staff with services linked do only those; none linked do any) and shared places. Times freed by cancellations and deletions are recorded by database triggers (migration 0016) in `waitlist_freed_slots`; the calendar button's number is the entries that can be booked now (`/waitlist/bookable`).
- **Staff bonus** (`domain/bonus.js` for the calculation, `routes/bonus.js`): hours bonus (percent or per extra hour, per day), product commission (on profit over the bulk price + 24% VAT), monthly sales-target steps and review bonus. Each kind of rule is kept from a date (`staff_*_rules`), so a change never alters days already worked. Only bookings with status `completed` count.
- **Background jobs:** reminders and memberships (`reminderService.js`, `membershipService.js`) run on cron; `RUN_JOBS=0` turns them off (test servers use copies of real client data).
- Times are Europe/Athens (`TZ` in docker-compose for both the app and the database).

**Client (`client/src/`, Vue 3 + TypeScript, Vite root is `client/`).** Pinia stores in `stores/`, screens in `views/` (portal screens in `views/portal/`), PrimeVue 4 components auto-imported by `unplugin-vue-components` (the app's own components are imported explicitly).

- **Large screens are split into a thin view plus composables sharing one context** (`provide`/`inject` through a `context.ts`): the calendar is `views/SchedulerView.vue` + `views/scheduler/` (`useSchedulerCore` state, `useCalendarData` columns and events, `useCalendarMoves`, `useCalendarOptions`, `SchedulerToolbar.vue`…); the booking dialog is `components/BookingDialog.vue` + `components/booking/dialog/` (`useBookingState`, `useBookingLoad`, `useBookingSave`, `useBookingPayment`, `useBookingDelete` and the tab components); Financials is `components/financials/`, Settings is cards in `views/settings/`. Add to the matching composable rather than back into the view.
- **API calls** go through `api/http.ts` (`api.get/post/...`, adds the login header; `withMessage` / `ifRefused` for errors). Never put the login token in a URL.
- **Offline mode** (`offline/`): data is cached in IndexedDB, writes made offline are queued (`fetchOrQueue` in `queue.ts`) with idempotency keys and replayed by `sync.ts`; the calendar draws waiting changes on top (`overlay.ts`). Queued writes belong to the shop and user that made them. Booking writes that should survive a lost connection use `fetchOrQueue`, not `api`.
- **Text:** every visible string goes through vue-i18n (`i18n/locales/el.ts`, `en.ts`); Greek is the default, English is loaded on demand.
- **Shared helpers to reuse rather than re-write:** `utils/format.ts` (`formatMoney`, `formatDate(value, locale, style)`, `clockTime`, `formatDuration`), `utils/text.ts` (`foldText` for accent-insensitive search), `utils/money.ts` (`round2`), `utils/appointmentStatus.ts`, `utils/confirm.ts` (`askConfirm`), `utils/exportXlsx.ts` (Excel files; sheet names at most 31 characters, unique), `composables/useNotify.ts` (error/success toasts), `composables/useIsPhone.ts`, `utils/staffAvailability.ts` (`toLocalDateStr`, working hours, leave, overtime), `utils/capacity.ts` (shared places such as the sauna), `utils/phone.ts` (phone matching, as `domain/phones.js`), `components/PaidAmount.vue` (what a booking was paid). `code-review.html` lists remaining duplication.
- Dialogs use `defineModel("visible")`. On phones, text inputs are kept at 16px on purpose (`assets/tailwind.css`: iPhones zoom into smaller ones).

**Public home page (`landing/`).** A Next.js static export; the server serves `landing/out` at `/` and the Vue app everywhere else. In development the app sends "/" to `VITE_LANDING_URL` (`client/.env.development`).

**Deployment.** One Docker image (Dockerfile: Vue build, landing build, slim runtime) run by docker-compose next to PostgreSQL 17 on the VPS. `deploy_image.sh` builds from a clean copy of HEAD, so uncommitted files never ship; the VPS script backs up the database, waits for `/health` and rolls back if the new image isn't healthy. The Python data scripts (`scripts/import_appointments.py`, `sync_bookings.py`, `import_clients.py`) share `scripts/import_common.py` (database address, shop id, name matching), so they're run as files (`python scripts/<name>.py`), never piped into Python. Database dumps for the VPS are made with PostgreSQL 17's `pg_dump` through Docker (the local tools are older); `*.dump` files are git-ignored. Details in `DEPLOY.md`.

## Testing conventions

Tests in `tests/spec/` are written from business requirements (IDs like C4, S13, U5, CP1, WS3, BN14 map to `test-report.html`), not from what the code currently does: when a test and the code disagree, check the requirement before changing the test; when a requirement changes, change its test and say so. They mock only the network (`fakeServer` in `tests/spec/helpers.ts`; routes match the path exactly, query strings aside) and browser APIs; stores, PrimeVue, i18n and the offline queue are real. Tests touching Excel replace `utils/exportXlsx` with `vi.mock` and read the sheets (see `tests/spec/exports.spec.ts`). The spec suite is heavy: under a full parallel run a few tests can hit the 30 s timeout; rerun those files alone before treating them as failures. StrykerJS line ranges for `.vue` files in `stryker.config.json` count from the `<script setup>` line, not the top of the file.

## Style

Comments explain why, in plain sentences; commit messages are one short imperative sentence ("Move every screen to the shared API client; no login token in links").
