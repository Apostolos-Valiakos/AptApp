#!/usr/bin/env bash
# Daily encrypted database backup, run on the server next to the app.
# Dumps through the running `db` container, encrypts with the key in .env,
# and deletes backups older than the retention period.
#
# Usage, from the app folder (e.g. /opt/petalouda): ./scripts/backup_db.sh
# Set up once by ./scripts/setup_vps.sh from the laptop (the key, the folder,
# the daily cron). Restore with ./scripts/restore_db.sh.
#
# The dump is made with --clean --if-exists, so restoring it replaces the
# database's contents (instead of clashing with what's there).

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

if [ ! -f .env ]; then
  echo "backup_db.sh: no .env found in $APP_DIR" >&2
  exit 1
fi

# One setting from .env, without running .env as a script (a value with
# spaces or symbols would break `source`).
env_get() {
  { grep -E "^$1=" .env || true; } | tail -1 | cut -d= -f2- | sed -E "s/^[\"']//; s/[\"']\$//"
}

POSTGRES_DB="$(env_get POSTGRES_DB)"
BACKUP_ENCRYPTION_KEY="$(env_get BACKUP_ENCRYPTION_KEY)"
BACKUP_DIR="$(env_get BACKUP_DIR)"
RETENTION_DAYS="$(env_get BACKUP_RETENTION_DAYS)"
: "${POSTGRES_DB:?POSTGRES_DB not set in .env}"
: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY not set in .env (run ./scripts/setup_vps.sh from the laptop)}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/$(basename "$APP_DIR")-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUT_FILE="$BACKUP_DIR/$(basename "$APP_DIR")_${TIMESTAMP}.sql.gz.enc"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

docker compose exec -T db pg_dump -U postgres --clean --if-exists "$POSTGRES_DB" \
  | gzip \
  | openssl enc -aes-256-cbc -pbkdf2 -salt -pass "pass:${BACKUP_ENCRYPTION_KEY}" \
  > "$OUT_FILE"

if [ ! -s "$OUT_FILE" ]; then
  echo "backup_db.sh: backup file is empty, something failed" >&2
  rm -f "$OUT_FILE"
  exit 1
fi

echo "backup_db.sh: wrote $OUT_FILE ($(du -h "$OUT_FILE" | cut -f1))"

find "$BACKUP_DIR" -name '*.sql.gz.enc' -mtime "+${RETENTION_DAYS}" -delete
