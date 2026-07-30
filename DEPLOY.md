# Deploying to a Debian VPS

This guide takes a fresh, empty Debian VPS to a running production instance of this app, using the existing `Dockerfile` + `docker-compose.yml`. It assumes:

- A Debian 11/12 VPS with root or sudo access, nothing else installed on it.
- A domain name with its DNS **A record** already pointed at the VPS's IP.
- Your local machine has this repo checked out and a working local Postgres database.

The Docker setup was verified as part of writing this guide (`docker build` succeeds end-to-end, `docker compose config` validates). Three real gaps were found and fixed along the way — see [What was fixed](#what-was-fixed-before-this-guide) at the bottom.

---

## Architecture recap

One Node/Express process serves both the API (`/api/v1/*`, Socket.IO) **and** the built Vue frontend (static files) on a single port (3000). `docker-compose.yml` runs three containers: `app`, `db` (Postgres 17), `redis` (currently unused by the code — see notes at the end, but harmless to keep). Nginx is not in the compose file; we add it on the host as a reverse proxy for TLS.

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
mkdir -p /opt/book4beauty
git clone <your-repo-url> /opt/book4beauty
cd /opt/book4beauty
```

(If the repo is private, set up a deploy key or use `scp`/`rsync` instead of `git clone`.)

---

## 3. Create the production `.env`

Copy the structure of your local `.env`, but **do not reuse dev secrets** — generate new ones for production. On the VPS:

```bash
cd /opt/book4beauty
nano .env
```

```env
# --- Database (used by both the db container and the app) ---
POSTGRES_DB=book4beauty
POSTGRES_PASSWORD=<generate a strong password>
POSTGRES_URI=postgresql://postgres:<same password>@db:5432/book4beauty

# --- App ---
PORT=3000
NODE_ENV=production
JWT_SECRET=<generate: openssl rand -hex 32>
MESSAGE_ENCRYPTION_KEY=<generate: openssl rand -hex 32>
ALLOWED_ORIGINS=https://book4beauty.gr
PUBLIC_BASE_URL=https://book4beauty.gr

# --- Email (for reminders, invites, demo-request notifications) ---
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=465
EMAIL_USER=<your sending address>
EMAIL_PASS=<app password, not your real Gmail password>

# --- Owner account bootstrap (see server/reminderService.js / server.js schema IIFE) ---
OWNER_USERNAME=<pick a username>
OWNER_PASSWORD=<pick a strong password>
```

Notes:
- `POSTGRES_URI` uses host `db` (the Docker service name), not `localhost` — that's how containers reach each other on the compose network.
- Generate secrets with `openssl rand -hex 32` — don't hand-type them.
- `PUBLIC_BASE_URL` is used to build links inside emails (appointment reminders, unsubscribe, client-portal invites) — set it to your real public URL with **no port** (Nginx handles 443 externally; the app never needs `:3000` in a link anyone outside the VPS will click).
- `ALLOWED_ORIGINS` is a comma-separated list if you ever serve from more than one origin (e.g. a Capacitor app). Since the app serves its own frontend from the same origin, this mainly matters for Socket.IO's CORS check and any cross-origin API callers.
- `EMAIL_PASS` for Gmail must be an **App Password** (16 chars, unrelated to your normal login password) — an actual password will fail with a `535 5.7.8 Username and Password not accepted` auth error.

---

## 4. Export your local database and bring it to the VPS

Your schema's foundational tables were never created by any script in this codebase — they only exist because they were set up once, and everything since has been incremental `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` migrations that the app re-applies automatically on every boot. So: **export the real thing with `pg_dump`, don't hand-write a schema file.**

To avoid a client-version mismatch (a dump made with newer server tools can't be read by an older local `pg_restore`), do the dump using the **same Postgres version this project runs in production** (17), via a one-off Docker container — this works regardless of what's installed on your machine.

Note: your local database is named `fresha_clone` — that's just the source you're dumping *from*. The production database on the VPS is named `book4beauty` (set via `POSTGRES_DB` in the production `.env` above) — that's what you're restoring *into*. The name doesn't need to match on both sides.

```bash
# Run from your local machine, against your local Postgres.
# Adjust user/db/password to match your local .env (source db: fresha_clone).
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
scp local_dump.dump deploy@your-vps-ip:/opt/book4beauty/local_dump.dump
```

### Restore it on the VPS

Start just the database first:

```bash
cd /opt/book4beauty
docker compose up -d db
docker compose logs -f db   # wait for "database system is ready to accept connections", then Ctrl+C
```

Restore:

```bash
cat local_dump.dump | docker compose exec -T db pg_restore \
  --verbose --clean --if-exists --no-owner --no-privileges \
  -U postgres -d book4beauty
```

### Clear transactional data for a clean start

You chose to bring the schema and shop configuration (shops, staff, services) but **not** live customer data. After the restore above, run:

```bash
docker compose exec -T db psql -U postgres -d book4beauty <<'SQL'
TRUNCATE TABLE
  transactions,
  appointment_services,
  appointments,
  client_files,
  clients,
  gift_cards,
  product_sales
CASCADE;
SQL
```

This keeps `shops`, `users` (logins), `staff`, `staff_services`, `services`, and `products` intact, and empties out everything customer/booking-specific. Adjust the table list if your actual schema has additional tables not listed here (check with `\dt` first — see verification step below).

---

## 5. Bring up the full stack

```bash
cd /opt/book4beauty
docker compose up -d --build
docker compose logs -f app
```

Watch for:
- `✅ Socket.IO initialized`
- `🚀 Server running on port 3000`
- No errors from the schema-migration IIFEs (they run automatically on boot and will add any newer columns/tables — e.g. `platform_activity_log`, `demo_requests`, `visible_in_calendar` — that your dump predates).
- A line like `Bootstrapped owner account "<OWNER_USERNAME>"` — confirms your platform-owner login was created.

Verify tables landed correctly:

```bash
docker compose exec -T db psql -U postgres -d book4beauty -c "\dt"
docker compose exec -T db psql -U postgres -d book4beauty -c "SELECT count(*) FROM shops;"
```

At this point the app is reachable at `http://your-vps-ip:3000` — but keep reading, we're about to lock that down and put HTTPS in front of it.

---

## 6. Put Nginx + Let's Encrypt in front

Install Nginx and Certbot on the **host** (not in Docker). (Commands below drop `sudo` — adjust if you're on the non-root `deploy` user instead of root.)

```bash
apt install -y nginx certbot python3-certbot-nginx
```

Create `/etc/nginx/sites-available/book4beauty`:

```nginx
server {
    listen 80;
    server_name book4beauty.gr www.book4beauty.gr;

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

(Drop `www.book4beauty.gr` from `server_name` and the `-d` flag below if that subdomain doesn't have its own DNS A record — Certbot fails on any domain that doesn't resolve.)

```bash
ln -s /etc/nginx/sites-available/book4beauty /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d book4beauty.gr -d www.book4beauty.gr
```

Certbot rewrites the config to redirect HTTP→HTTPS and sets up auto-renewal (`systemctl status certbot.timer`).

### Lock the app port down to localhost only

Now that Nginx is the public entry point, the app container shouldn't be directly reachable from the internet on port 3000. In `docker-compose.yml`, change:

```yaml
    ports:
      - "3000:3000"
```

to:

```yaml
    ports:
      - "127.0.0.1:3000:3000"
```

Then:

```bash
docker compose up -d
ufw delete allow 3000/tcp 2>/dev/null || true   # in case you'd opened it
```

Your firewall should now only allow 22 (SSH), 80, and 443.

---

## 7. Final verification

1. Visit `https://book4beauty.gr` — the landing page should load over HTTPS.
2. Log in at `/login` with `OWNER_USERNAME`/`OWNER_PASSWORD` — you should land with only the "Platform" nav item visible.
3. Create a shop from the Platform console, create an admin login for it, log in as that admin in an incognito window — confirm the scheduler loads.
4. Submit the "Request a Demo" form on the landing page and confirm it shows up under Platform → Demo Requests, and that the notification email arrives (check `docker compose logs app` if not — a bad `EMAIL_PASS` shows up there as an `EAUTH`/`535` error, not a UI error).

---

## Ongoing operations

**Deploying an update:**
```bash
cd /opt/book4beauty
git pull
docker compose up -d --build
```

**Logs:**
```bash
docker compose logs -f app
```

**Backups** (set up a cron job on the host):
```bash
docker compose exec -T db pg_dump -U postgres -Fc book4beauty > ~/backups/backup-$(date +%F).dump
```
Keep these off-box too (rsync to another machine or object storage) — a backup that only lives on the same VPS doesn't protect you if the VPS itself is lost.

**Restarting just the app** (e.g. after an env change):
```bash
docker compose restart app
```

---

## What was fixed before this guide

Three real issues were found and corrected while preparing this:

1. **`ALLOWED_ORIGIN` → `ALLOWED_ORIGINS`**: `server/server.js` reads `process.env.ALLOWED_ORIGINS` (plural, comma-separated), but `docker-compose.yml` and `.env` defined the singular `ALLOWED_ORIGIN`. Left as-is, CORS would have silently fallen back to its `localhost:5173` default in production. Both files are now fixed and consistent.
2. **Missing `.dockerignore`**: `Dockerfile`'s builder stage does `COPY . .`, and without a `.dockerignore`, `.env` (real secrets) and `.git` (full history) were being pulled into the build context and baked into intermediate image layers. Added a `.dockerignore` excluding `.env`, `.git`, `*.sql`, `node_modules`, `dist`, and a few other local-only files.
3. **`docker-compose.yml` never passed `OWNER_USERNAME`/`OWNER_PASSWORD` to the app container.** The owner-account bootstrap in `server.js` reads these at startup to create the first platform-owner login — without them wired through, it would silently do nothing, and there'd be no way to log into the Platform console at all. Both are now included in the `app` service's `environment:` block.

All three were verified with a real `docker build` (succeeds, ~35s, bcrypt's native module compiles cleanly on Alpine — a common failure point that turned out fine here) and `docker compose config` (validates).

## Known non-blocking issues (FYI, not addressed here)

- The `redis` service in `docker-compose.yml` isn't actually used anywhere in the code (no `require("redis")` in `server/`). Harmless to keep for future use, or remove it and its `REDIS_URL` env var if you'd rather not run an idle container.
- There's a dormant dead-code path (`multer.diskStorage` + an undefined `uploadDir` variable in `server.js`) that isn't wired to any active route — it won't affect anything unless a future route starts using it, at which point it'll need `uploadDir` actually defined.
