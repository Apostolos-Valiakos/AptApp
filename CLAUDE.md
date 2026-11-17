# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Booking and point-of-sale app for a massage and spa shop (Pure, Larisa), multi-tenant: an Express + PostgreSQL server, a Vue 3 staff app with a client portal, and a separate public home page. The interface is in Greek and English.

## Commands

```bash
npm run dev                # server (PORT, default 3000) + Vite dev server (port 5173, proxies /api, /socket.io and /health to API_URL:PORT from .env)
npm run build              # Vue app → client/dist (what the server serves in production)
npm run typecheck          # vue-tsc on client/
npm test                   # typecheck + unit tests + requirement tests + every server test file

npx vitest run                                        # unit tests: tests/offline, tests/booking (node env)
npx vitest run --config vitest.spec.config.mjs        # requirement tests: tests/spec (jsdom, real PrimeVue/Pinia/i18n)
npx vitest run --config vitest.spec.config.mjs tests/spec/authStore.spec.ts -t "S6"   # one file / one test
node --test tests/server/roles.test.mjs               # one server test file

npm run test:offline:e2e   # builds, then drives the offline mode in headless Chrome (/usr/bin/google-chrome)
npm run test:mutation      # StrykerJS on the files in stryker.config.json (~10 min)
./scripts/test_image.sh    # builds the Docker image of HEAD and tests it against a copy of the local DB
./scripts/deploy_image.sh  # builds HEAD's image here, uploads it to the VPS and runs it (see DEPLOY.md)
```

The public home page is its own Next.js project: `cd landing && npm run dev` (port 3010) / `npm run build` (static export to `landing/out`). Read `landing/AGENTS.md` first: its Next.js version differs from what you may know.

Server tests (`tests/server/*.test.mjs`, `tests/offline/server.test.mjs`) need the local PostgreSQL running and `POSTGRES_URI` in `.env`. Each file copies the dev database into its own throwaway database (`createTestDb` in `tests/offline/helpers.mjs`) and starts the server on its own port: a new test file needs a **database name and port no other file uses**, or `npm test` fails intermittently when files run in parallel. Some tests depend on the dev data (e.g. capacity tests expect the ΣΑΟΥΝΑ staff member to have 5 places).

## Architecture

**Server (`server/`, CommonJS).** `server.js` sets up Express, Socket.IO, static files and the area routers in `routes/`. Each router file exports a factory taking its dependencies (`authenticateToken`, middleware, helpers) from `server.js` — a new helper a route needs is passed in where `server.js` mounts that router. Shared business logic lives in `domain/` (bookings and their checks, balances, packages, debts, idempotency, email link signing, Greek date texts). `http.js` has `asyncHandler` (turns thrown errors into JSON answers; `HttpError` for a deliberate status), `withTransaction` and malformed-id handling — new routes use `asyncHandler`.

- **Multi-tenant:** almost every table has `shop_id`; queries filter on `req.shopId` (set from the login token). Roles: `owner` (platform operator, no shop), `super_admin`, `admin`, `frontdesk`, `staff` (calendar only, read-only, enforced on the server by `notForStaff`), `client` (portal). Role middleware is in `middleware/auth.js`; the client-side page guard in `client/src/router/index.ts` is only a convenience.
- **Migrations:** `server/migrations/NNNN_name.sql`, each run once in order at server start (`migrate.js`) and recorded in `schema_migrations`; if one fails the server doesn't start. All schema changes go in a new migration file.
- **Money:** amounts are rounded to the cent; a client's stored `outstanding_balance` comes from `domain/balances.js` (`clientBalanceSql`) and counts bookings from 1 March 2026 that have already happened. The front end mirrors these rules in `client/src/utils/money.ts` and `composables/useBookingTotals.ts`; keep both sides in step.
- **Background jobs:** reminders and memberships (`reminderService.js`, `membershipService.js`) run on cron; `RUN_JOBS=0` turns them off (test servers use copies of real client data).
- Times are Europe/Athens (`TZ` in docker-compose for both the app and the database).

**Client (`client/src/`, Vue 3 + TypeScript, Vite root is `client/`).** Pinia stores in `stores/`, screens in `views/` (portal screens in `views/portal/`), PrimeVue components auto-imported by `unplugin-vue-components` (the app's own components are imported explicitly).

- **API calls** go through `api/http.ts` (`api.get/post/...`, adds the login header; `withMessage` / `ifRefused` for errors). Never put the login token in a URL.
- **Offline mode** (`offline/`): data is cached in IndexedDB, writes made offline are queued (`fetchOrQueue` in `queue.ts`) with idempotency keys and replayed by `sync.ts`; the calendar draws waiting changes on top (`overlay.ts`). Queued writes belong to the shop and user that made them. Booking writes that should survive a lost connection use `fetchOrQueue`, not `api`.
- **Text:** every visible string goes through vue-i18n (`i18n/locales/el.ts`, `en.ts`); Greek is the default.
- **Shared helpers to reuse rather than re-write:** `utils/format.ts` (`formatMoney`, `formatDate(value, locale, style)`, `clockTime`, `formatDuration`), `utils/text.ts` (`foldText` for accent-insensitive search), `utils/money.ts` (`round2`), `utils/appointmentStatus.ts`, `utils/confirm.ts` (`askConfirm`), `utils/exportXlsx.ts`, `composables/useNotify.ts` (error/success toasts), `composables/useIsPhone.ts`, `utils/staffAvailability.ts` (`toLocalDateStr`, working hours, overtime), `utils/capacity.ts` (shared places such as the sauna). `code-review.html` lists remaining duplication.
- Dialogs use `defineModel("visible")`.

**Public home page (`landing/`).** A Next.js static export; the server serves `landing/out` at `/` and the Vue app everywhere else. In development the app sends "/" to `VITE_LANDING_URL` (`client/.env.development`).

**Deployment.** One Docker image (Dockerfile: Vue build, landing build, slim runtime) run by docker-compose next to PostgreSQL 17 on the VPS. `deploy_image.sh` builds from a clean copy of HEAD, so uncommitted files never ship; the VPS script backs up the database, waits for `/health` and rolls back if the new image isn't healthy. Details in `DEPLOY.md`.

## Testing conventions

Tests in `tests/spec/` are written from business requirements (IDs like C4, S13, U5, CP1 map to `test-report.html`), not from what the code currently does: when a test and the code disagree, check the requirement before changing the test. They mock only the network (`fakeServer` in `tests/spec/helpers.ts`) and browser APIs; stores, PrimeVue, i18n and the offline queue are real. StrykerJS line ranges for `.vue` files in `stryker.config.json` count from the `<script setup>` line, not the top of the file.

## Style

Comments explain why, in plain sentences; commit messages are one short imperative sentence ("Move every screen to the shared API client; no login token in links").
