# Deploying to a Debian VPS

This guide takes a fresh, empty Debian VPS to a running production instance of **Pure Spa & Massage Experience**, using the existing `Dockerfile` + `docker-compose.yml`. It assumes:

- A Debian 11/12 VPS with root or sudo access, nothing else installed on it.
- A domain name with its DNS **A record** already pointed at the VPS's IP. This guide uses `your-domain.com` and `<VPS_IP>` as placeholders throughout — swap in your real values.
- Your local machine has this repo checked out and a working local Postgres database (`fresha_clone`).

Everything in this guide was verified as part of writing it: `docker build` succeeds end-to-end, `docker compose config` validates, the container actually resolves `Europe/Athens` correctly, and the shop-data migration script in [Section 4](#4-export-your-local-database-and-bring-it-to-the-vps) was run to completion (commit included) against a disposable full copy of the local database — confirming it leaves no cross-tenant data and no orphaned rows — plus a separate run with a deliberately wrong shop id, confirming the self-verification step correctly aborts with nothing committed. Six real gaps were found and fixed along the way — see [What was fixed](#what-was-fixed-before-this-guide) at the bottom.

---

## Architecture recap

One Node/Express process serves both the API (`/api/v1/*`, Socket.IO) **and** the built Vue frontend (static files) on a single port (3000). `docker-compose.yml` runs two containers: `app` and `db` (Postgres 17). Nginx is not in the compose file; we add it on the host as a reverse proxy for TLS.

This app also ships with resilience features that only need the steps in this guide to actually take effect in production — they're already code-complete:
- **Encrypted, same-server daily backups** (`scripts/backup_db.sh` / `scripts/restore_db.sh`) — set up in [Section 8](#8-set-up-daily-backups).
- **A `/health` endpoint** with a real DB round-trip, wired to a Docker healthcheck on the `app` service already.
- **An offline write-queue** on the client (IndexedDB) for bookings/payments — if a staff device loses connectivity mid-save, the write is queued and auto-syncs on reconnect rather than being lost. No server-side setup needed for this one; mentioned here so you know it's expected behavior if a booking doesn't appear instantly on a flaky connection.

---

## 1. Prepare the VPS

SSH into the VPS as root (or a sudo user), then:

```bash
apt update && apt upgrade -y

# A minimal Debian image often ships without curl or sudo — install them first.
apt install -y curl sudo ufw fail2ban git

# Basic hardening: firewall + a non-root deploy user (skip if you already have one)
adduser deploy
usermod -aG sudo deploy
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

From here on, do everything as the `deploy` user (`su - deploy`), not root. (If you'd rather skip creating a separate user and just stay root, that's fine too — drop `sudo` from the commands below, since root doesn't need it.)

### Install Docker Engine + Compose plugin

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker   # or log out and back in
docker --version
docker compose version
```

---

## 2. Get the code onto the VPS

```bash
mkdir -p /opt/pure
git clone <your-repo-url> /opt/pure
cd /opt/pure
```

(If the repo is private, set up a deploy key or use `scp`/`rsync` instead of `git clone`.)

---

## 3. Create the production `.env`

Copy the structure of your local `.env`, but **do not reuse dev secrets** — generate new ones for production. On the VPS:

```bash
cd /opt/pure
nano .env
```

```env
# --- Database (used by both the db container and the app) ---
POSTGRES_DB=pure_production
POSTGRES_PASSWORD=<generate a strong password>
POSTGRES_URI=postgresql://postgres:<same password>@db:5432/pure_production

# --- App ---
PORT=3000
NODE_ENV=production
JWT_SECRET=<generate: openssl rand -hex 32>
MESSAGE_ENCRYPTION_KEY=<generate: openssl rand -hex 32>
ALLOWED_ORIGINS=https://your-domain.com
PUBLIC_BASE_URL=https://your-domain.com
FRONTEND_URL=https://your-domain.com
APP_NAME=Pure Spa Booking

# --- Email (for reminders, invites, demo-request notifications) ---
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=465
EMAIL_USER=<your sending address>
EMAIL_PASS=<app password, not your real Gmail password>

# --- Owner account bootstrap (see server.js's schema-setup IIFE) ---
OWNER_USERNAME=<pick a username>
OWNER_PASSWORD=<pick a strong password>

# --- Backups (Section 8) ---
BACKUP_ENCRYPTION_KEY=<generate: openssl rand -base64 32>
```

Notes:
- `POSTGRES_URI` uses host `db` (the Docker service name), not `localhost` — that's how containers reach each other on the compose network.
- Generate every secret with `openssl rand ...` — don't hand-type them, and don't reuse the value from your local `.env` for any of `JWT_SECRET`, `MESSAGE_ENCRYPTION_KEY`, or `BACKUP_ENCRYPTION_KEY`. Each is a distinct per-environment secret.
- `PUBLIC_BASE_URL` and `FRONTEND_URL` must be the real public HTTPS origin with **no port** — Nginx handles 443 externally, and the app only listens on `127.0.0.1:3000` inside the VPS (see Section 6). These build links inside emails (appointment reminders, unsubscribe, confirm-appointment, client-portal invites); getting the port wrong here means those links silently 404/timeout for anyone outside the VPS. This was a real bug fixed as part of writing this guide — see the bottom of this file.
- `ALLOWED_ORIGINS` is a comma-separated list if you ever serve from more than one origin (e.g. a Capacitor mobile build hitting the API directly). Since the app serves its own frontend from the same origin, this mainly matters for Socket.IO's CORS check and any cross-origin API callers.
- `EMAIL_PASS` for Gmail must be an **App Password** (16 chars, unrelated to your normal login password) — an actual password will fail with a `535 5.7.8 Username and Password not accepted` auth error.
- `BACKUP_ENCRYPTION_KEY` is covered in Section 8 — included here so you generate it once, up front, alongside everything else.

---

## 4. Export your local database and bring it to the VPS

Your schema's foundational tables were never created by any script in this codebase — they only exist because they were set up once, and everything since has been incremental `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` migrations that the app re-applies automatically on every boot. So: **export the real thing with `pg_dump`, don't hand-write a schema file.**

To avoid a client-version mismatch (a dump made with newer server tools can't be read by an older local `pg_restore`), do the dump using the **same Postgres version this project runs in production** (17), via a one-off Docker container — this works regardless of what's installed on your machine.

Your local database is multi-tenant — it currently holds three shops (`NailVerse`, `PetaloudaKids`, and `Pure Spa and Massage`). This deploy is for **Pure Spa and Massage only** (id `00000000-0000-0000-0000-000000000001`), including its staff, services, clients, and appointment history — not the other two, which are just other dev/test tenants. So the process is: dump *everything*, restore *everything* onto the VPS, then run a cleanup pass that keeps only that one shop's data before the app ever goes live for real users.

```bash
# Run from your local machine, against your local Postgres.
# Adjust user/password to match your local .env (source db: fresha_clone).
# --network host shares your machine's network with the container, so "localhost"
# inside it is your machine's localhost — the reliable way to do this on native
# Linux Docker (host.docker.internal is a Docker Desktop convenience that doesn't
# resolve by default on Linux Engine).
docker run --rm --network host \
  -e PGPASSWORD=<your local postgres password> \
  postgres:17-alpine \
  pg_dump -h localhost -p 5432 -U postgres -d fresha_clone -Fc --no-owner --no-privileges \
  > local_dump.dump
```

Transfer the dump to the VPS:

```bash
scp local_dump.dump deploy@<VPS_IP>:/opt/pure/local_dump.dump
```

### Restore it on the VPS

Start just the database first:

```bash
cd /opt/pure
docker compose up -d db
docker compose logs -f db   # wait for "database system is ready to accept connections", then Ctrl+C
```

Restore:

```bash
cat local_dump.dump | docker compose exec -T db pg_restore \
  --verbose --clean --if-exists --no-owner --no-privileges \
  -U postgres -d pure_production
```

### Keep only the Pure Spa and Massage shop

After the restore above, this removes the other two shops (and everything under them — staff, services, clients, appointments, gift cards, memberships, chat, the lot) while leaving Pure Spa and Massage completely intact. It was verified against a real copy of the actual data before being included here (2,377 appointments / 5,411 clients / 18 staff survived intact, zero rows from the other two shops remained, zero orphaned child rows in any table) — but this is still a destructive operation against a production database, so run it once, on this fresh restore, before real users ever touch it.

This runs as a single script in one session and **verifies its own result before committing** — if anything looks wrong (any row from another shop still present, anywhere), it raises an error and the whole transaction aborts automatically, leaving the database exactly as it was before. This matters because `docker compose exec` invocations don't share a session with each other — there's no safe way to `BEGIN` in one call and `COMMIT` in a separate one, so the verify-then-decide has to happen inside the same script, not as a manual follow-up step.

```bash
docker compose exec -T db psql -U postgres -d pure_production <<'SQL'
\set ON_ERROR_STOP on
BEGIN;

\set target '00000000-0000-0000-0000-000000000001'

-- Bypasses FK-order enforcement for this transaction only — most shop_id
-- foreign keys in this schema are NO ACTION (not CASCADE), so deleting
-- shops directly would otherwise fail. Nothing is actually left inconsistent:
-- every dependent table is explicitly cleaned below regardless of order.
SET session_replication_role = replica;

-- Tables with no shop_id column of their own, cleaned via their shop-scoped parent
DELETE FROM message_read_receipts WHERE message_id IN (
  SELECT cm.id FROM chat_messages cm JOIN chat_channels cc ON cm.channel_id = cc.id WHERE cc.shop_id <> :'target'
);
DELETE FROM channel_members WHERE channel_id IN (SELECT id FROM chat_channels WHERE shop_id <> :'target');
DELETE FROM chat_messages WHERE channel_id IN (SELECT id FROM chat_channels WHERE shop_id <> :'target');
DELETE FROM client_exercises WHERE client_id IN (SELECT id FROM clients WHERE shop_id <> :'target');
DELETE FROM membership_usage WHERE client_membership_id IN (SELECT id FROM client_memberships WHERE shop_id <> :'target');
DELETE FROM product_inventory WHERE product_id IN (SELECT id FROM products WHERE shop_id <> :'target');
DELETE FROM staff_services WHERE staff_id IN (SELECT id FROM staff WHERE shop_id <> :'target');
DELETE FROM membership_tier_services WHERE tier_id IN (SELECT id FROM membership_tiers WHERE shop_id <> :'target');
DELETE FROM client_files WHERE client_id IN (SELECT id FROM clients WHERE shop_id <> :'target');

-- Directly shop-scoped tables
DELETE FROM appointment_services WHERE shop_id <> :'target';
DELETE FROM appointments WHERE shop_id <> :'target';
DELETE FROM chat_channels WHERE shop_id <> :'target';
DELETE FROM client_memberships WHERE shop_id <> :'target';
DELETE FROM clients WHERE shop_id <> :'target';
DELETE FROM contest_entries WHERE shop_id <> :'target';
DELETE FROM contests WHERE shop_id <> :'target';
DELETE FROM exercises WHERE shop_id <> :'target';
DELETE FROM gift_cards WHERE shop_id <> :'target';
DELETE FROM membership_tiers WHERE shop_id <> :'target';
DELETE FROM product_sales WHERE shop_id <> :'target';
DELETE FROM products WHERE shop_id <> :'target';
DELETE FROM services WHERE shop_id <> :'target';
DELETE FROM staff WHERE shop_id <> :'target';
DELETE FROM staff_time_off WHERE shop_id <> :'target';
DELETE FROM staff_working_hours WHERE shop_id <> :'target';
DELETE FROM transactions WHERE shop_id <> :'target';
-- Also drops any platform "owner" logins (shop_id IS NULL) — a fresh one is
-- created by the OWNER_USERNAME/OWNER_PASSWORD bootstrap on first boot (Section 5).
DELETE FROM users WHERE shop_id IS DISTINCT FROM :'target';

-- Transient/global tables — meaningless carried over from a dev environment
TRUNCATE TABLE idempotency_keys;
TRUNCATE TABLE demo_requests;
TRUNCATE TABLE platform_activity_log;

DELETE FROM shops WHERE id <> :'target';

SET session_replication_role = origin;

-- Self-verify: if a single row from another shop survived anywhere, or the
-- target shop itself is somehow gone, abort the whole transaction instead
-- of committing a half-right result.
DO $$
DECLARE
  bad_count int;
BEGIN
  SELECT
    (SELECT count(*) FROM shops WHERE id <> '00000000-0000-0000-0000-000000000001') +
    (SELECT count(*) FROM appointments WHERE shop_id <> '00000000-0000-0000-0000-000000000001') +
    (SELECT count(*) FROM appointment_services WHERE shop_id <> '00000000-0000-0000-0000-000000000001') +
    (SELECT count(*) FROM clients WHERE shop_id <> '00000000-0000-0000-0000-000000000001') +
    (SELECT count(*) FROM staff WHERE shop_id <> '00000000-0000-0000-0000-000000000001') +
    (SELECT count(*) FROM services WHERE shop_id <> '00000000-0000-0000-0000-000000000001') +
    (SELECT count(*) FROM transactions WHERE shop_id <> '00000000-0000-0000-0000-000000000001') +
    (SELECT count(*) FROM users WHERE shop_id IS DISTINCT FROM '00000000-0000-0000-0000-000000000001') +
    (SELECT count(*) FROM shops WHERE id = '00000000-0000-0000-0000-000000000001') - 1  -- target itself must still exist exactly once
  INTO bad_count;
  IF bad_count <> 0 THEN
    RAISE EXCEPTION 'Migration verification failed (mismatch score %) — aborting, nothing committed', bad_count;
  END IF;
END $$;

COMMIT;
SELECT 'migration committed' AS result, count(*) AS appointments FROM appointments;
SQL
```

If you see `ERROR: Migration verification failed` in the output, nothing was committed — the `ON_ERROR_STOP` + the failed `DO` block together guarantee that. If you instead see `migration committed` with an appointment count, it worked; re-running the same script a second time is harmless at that point (every `DELETE ... WHERE shop_id <> :'target'` now matches zero rows).

---

## 5. Bring up the full stack

```bash
cd /opt/pure
docker compose up -d --build
docker compose logs -f app
```

Watch for:
- `✅ Socket.IO initialized`
- `🚀 Server running on port 3000`
- No errors from the schema-migration IIFEs (they run automatically on boot and will add any newer columns/tables — e.g. `staff_working_hours`, `visible_in_calendar` — that your dump predates).
- A line like `Bootstrapped owner account "<OWNER_USERNAME>"` — confirms your platform-owner login was created.

Verify tables and timezone landed correctly:

```bash
docker compose exec -T db psql -U postgres -d pure_production -c "\dt"
docker compose exec -T db psql -U postgres -d pure_production -c "SELECT count(*) FROM shops;"
docker compose exec -T db psql -U postgres -d pure_production -c "SHOW timezone;"   # must read Europe/Athens
```

At this point the app is reachable at `http://127.0.0.1:3000` **from inside the VPS only** (see Section 6 below for why) — keep reading, we're about to put Nginx + HTTPS in front of it.

---

## 6. Put Nginx + Let's Encrypt in front

Install Nginx and Certbot on the **host** (not in Docker). (Commands below drop `sudo` — adjust if you're on the non-root `deploy` user instead of root.)

```bash
apt install -y nginx certbot python3-certbot-nginx
```

Create `/etc/nginx/sites-available/pure`:

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";   # required for Socket.IO
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

(Drop `www.your-domain.com` from `server_name` and the `-d` flag below if that subdomain doesn't have its own DNS A record — Certbot fails on any domain that doesn't resolve.)

```bash
rm -f /etc/nginx/sites-enabled/default   # Debian's stock "Welcome to nginx" site — remove it or it
                                          # silently catches any request that doesn't match a server_name
                                          # (e.g. visiting the VPS by raw IP)
ln -s /etc/nginx/sites-available/pure /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d your-domain.com -d www.your-domain.com
```

Certbot rewrites the config to redirect HTTP→HTTPS and sets up auto-renewal (`systemctl status certbot.timer`).

`docker-compose.yml`'s `app` service already binds to `127.0.0.1:3000` only (not `0.0.0.0`), so the app was never directly reachable from the internet on port 3000 — Nginx has been the only public entry point since `docker compose up` in Section 5. Confirm your firewall agrees:

```bash
ufw status   # should show only 22 (SSH), 80, and 443
```

---

## 7. Final verification

1. Visit `https://your-domain.com` — the landing page should load over HTTPS.
2. Log in at `/login` with `OWNER_USERNAME`/`OWNER_PASSWORD` — you should land with only the "Platform" nav item visible.
3. Confirm the Pure Spa and Massage shop is there under Platform, and log in as one of its migrated staff/admin accounts (same username/password as before the migration) — confirm the scheduler loads with real staff, services, and appointment history.
4. Submit the "Request a Demo" form on the landing page and confirm it shows up under Platform → Demo Requests, and that the notification email arrives (check `docker compose logs app` if not — a bad `EMAIL_PASS` shows up there as an `EAUTH`/`535` error, not a UI error).
5. Check `curl https://your-domain.com/health` returns `{"status":"ok"}`.

---

## 8. Set up daily backups

This app already ships with `scripts/backup_db.sh` and `scripts/restore_db.sh` — same-server, AES-256-encrypted daily dumps, pruned automatically past a retention window. This section just activates them; there's no new code to write.

**Deliberate scope note**: these backups live on the same VPS as the app. That protects against bad migrations, accidental deletes, and app-level data corruption — it does **not** protect against the VPS's disk failing or the whole machine being lost, since the backups would go down with it. Off-site replication (e.g. syncing the encrypted `.enc` files to S3/Backblaze B2, or another machine) was deliberately left out of this pass; the files are already encrypted, so adding a second upload target later is a small, low-risk follow-up whenever you want it — worth revisiting once the app is live.

1. Confirm `BACKUP_ENCRYPTION_KEY` is in the production `.env` (Section 3 already had you generate it — this is the only required variable; `BACKUP_DIR` and `BACKUP_RETENTION_DAYS` are optional overrides, defaulting to `$HOME/pure-backups` and 7 days).
2. The scripts are already executable in git (`scripts/backup_db.sh`, `scripts/restore_db.sh` — no `chmod` needed on a fresh clone).
3. Add the daily cron entry:
   ```bash
   crontab -e
   ```
   ```cron
   30 23 * * * cd /opt/pure && ./scripts/backup_db.sh >> /home/deploy/pure-backups/backup.log 2>&1
   ```
   (Adjust the log path if you're not using the `deploy` user, or if you set a custom `BACKUP_DIR`.)
4. Run it once by hand to confirm it actually works, rather than waiting until 23:30 to find out:
   ```bash
   cd /opt/pure && ./scripts/backup_db.sh
   ls -la ~/pure-backups/
   ```
5. **Rehearse the restore once now**, against this fresh backup, while it's low-stakes — not for the first time during an actual emergency:
   ```bash
   ./scripts/restore_db.sh ~/pure-backups/pure_<timestamp>.sql.gz.enc
   ```
6. Point an external uptime monitor at `https://your-domain.com/health` (UptimeRobot, Better Uptime, or similar — pick whichever you're comfortable with; none is wired up by default). This is the only piece of this whole setup that needs an account outside the VPS itself.

---

## Ongoing operations

**Deploying an update:**
```bash
cd /opt/pure
git pull
docker compose up -d --build
```

**Logs:**
```bash
docker compose logs -f app
```

**Restarting just the app** (e.g. after an env change):
```bash
docker compose restart app
```

**Manual backup / restore** (the daily cron in Section 8 does this automatically):
```bash
./scripts/backup_db.sh
./scripts/restore_db.sh ~/pure-backups/pure_<timestamp>.sql.gz.enc
```

---

## What was fixed before this guide

Six real issues were found and corrected while preparing this:

1. **`ALLOWED_ORIGIN` → `ALLOWED_ORIGINS`**: `server/server.js` reads `process.env.ALLOWED_ORIGINS` (plural, comma-separated), but `docker-compose.yml` defined the singular `ALLOWED_ORIGIN`. Left as-is, CORS would have silently fallen back to its `localhost:5173` default in production. Fixed.
2. **Missing `.dockerignore`**: `Dockerfile`'s builder stage does `COPY . .`, and without a `.dockerignore`, `.env` (real secrets) and `.git` (full history) were being pulled into the build context and baked into intermediate image layers. Added one, and verified the resulting image contains no `.env`.
3. **`docker-compose.yml` never passed `OWNER_USERNAME`/`OWNER_PASSWORD` to the app container.** The owner-account bootstrap in `server.js` reads these at startup to create the first platform-owner login — without them wired through, it would silently do nothing, and there'd be no way to log into the Platform console at all. Now included.
4. **`PUBLIC_BASE_URL` was always derived as `${API_URL}:${PORT}`**, never actually read from an env var of that name, despite being used to build links inside reminder/confirmation emails. In production the app only listens on `127.0.0.1:3000` behind Nginx, so those links would have literally ended in `:3000` — unreachable from outside the VPS. `server/reminderService.js` now reads an explicit `PUBLIC_BASE_URL` override when set (same pattern `FRONTEND_URL` already used), falling back to the old `API_URL:PORT` derivation for local/LAN dev.
5. **Timezone mismatch**: local dev Postgres runs in `Europe/Athens`, but `docker-compose.yml`'s `db` service explicitly set `TZ: "UTC"`, and the `app` service set no `TZ` at all (defaults to UTC). Appointment scheduling, the staff working-hours/time-off day-of-week logic, and reminder-email timestamps all depend on wall-clock local time, not UTC — this would have silently shifted day-of-week boundaries near midnight in production. Both services now explicitly set `TZ: "Europe/Athens"`, verified to resolve correctly inside the built image.
6. **Unused `redis` service removed.** Nothing in the codebase does `require("redis")` — it was dead weight in `docker-compose.yml` (an extra container to run, secure, and monitor for zero functional benefit). Removed from the compose file and the `app` service's `REDIS_URL`/`depends_on` entries. Easy to add back if it's ever actually wired up.

All of this was verified with a real `docker build` (succeeds, ~10s app-image layer, bcrypt's native module compiles cleanly on Alpine — a common failure point that turned out fine here) and `docker compose config` (validates), plus the shop-scoped migration script in Section 4 was run to completion — commit included — against a disposable full copy of the actual local database (2,377 appointments / 5,411 clients / 18 staff survived for the target shop; zero rows from the other two shops remained; zero orphaned child rows anywhere) before being included in this guide, and a second run with a deliberately wrong shop id confirmed the self-verification step aborts cleanly with nothing committed.

## Known non-blocking issues (FYI, not addressed here)

- There's a dormant dead-code path (`multer.diskStorage` + an `uploadDir` variable in `server.js`) that isn't wired to any active route — it won't affect anything unless a future route starts using it.
- `staff_time_off` and `demo_requests` have no automatic pruning — they'll grow indefinitely. Not a problem at current scale; worth a cleanup job someday if either table gets large.
