#!/usr/bin/env bash
# Daily encrypted DB backup, run on the same server as the app.
# Reads DB name and encryption key from .env, dumps via the running
# `db` container (so it works whether or not Postgres is reachable
# from the host directly), and prunes anything older than 7 days.
#
# Usage: ./scripts/backup_db.sh
# Meant to be run from cron once a day — see setup instructions at the
# bottom of this file.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

if [ ! -f .env ]; then
  echo "backup_db.sh: no .env found in $SCRIPT_DIR" >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a; source .env; set +a

: "${POSTGRES_DB:?POSTGRES_DB not set in .env}"
: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY not set in .env}"

BACKUP_DIR="${BACKUP_DIR:-$HOME/pure-backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUT_FILE="$BACKUP_DIR/pure_${TIMESTAMP}.sql.gz.enc"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

docker compose exec -T db pg_dump -U postgres "$POSTGRES_DB" \
  | gzip \
  | openssl enc -aes-256-cbc -pbkdf2 -salt -pass "pass:${BACKUP_ENCRYPTION_KEY}" \
  > "$OUT_FILE"

if [ ! -s "$OUT_FILE" ]; then
  echo "backup_db.sh: backup file is empty, something failed" >&2
  rm -f "$OUT_FILE"
  exit 1
fi

echo "backup_db.sh: wrote $OUT_FILE ($(du -h "$OUT_FILE" | cut -f1))"

# Prune backups older than the retention window.
find "$BACKUP_DIR" -name 'pure_*.sql.gz.enc' -mtime "+${RETENTION_DAYS}" -delete

# --- One-time setup on the server ---
# 1. Add to .env:
#      BACKUP_ENCRYPTION_KEY=<random secret, e.g. `openssl rand -base64 32`>
#      BACKUP_DIR=/home/<user>/pure-backups        # optional, defaults shown above
#      BACKUP_RETENTION_DAYS=7                      # optional
# 2. chmod +x scripts/backup_db.sh
# 3. Add a daily cron entry (runs at 23:30 server time), no sudo needed:
#      crontab -e
#      30 23 * * * cd /path/to/pure && ./scripts/backup_db.sh >> /home/<user>/pure-backups/backup.log 2>&1
