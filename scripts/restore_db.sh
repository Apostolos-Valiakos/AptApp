#!/usr/bin/env bash
# Restores a backup made by backup_db.sh, replacing the database's contents.
#
# Usage, from the app folder (e.g. /opt/petalouda):
#   ./scripts/restore_db.sh ~/petalouda-backups/petalouda_20261107_233000.sql.gz.enc
#
# Stops the app while restoring (so nothing writes meanwhile), stops at the
# first error, and starts the app again. Asks before doing anything.

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

if [ $# -ne 1 ]; then
  echo "Usage: $0 <backup-file.sql.gz.enc>" >&2
  exit 1
fi
BACKUP_FILE="$1"
if [ ! -f "$BACKUP_FILE" ]; then
  echo "restore_db.sh: file not found: $BACKUP_FILE" >&2
  exit 1
fi
if [ ! -f .env ]; then
  echo "restore_db.sh: no .env found in $APP_DIR" >&2
  exit 1
fi

env_get() {
  { grep -E "^$1=" .env || true; } | tail -1 | cut -d= -f2- | sed -E "s/^[\"']//; s/[\"']\$//"
}
POSTGRES_DB="$(env_get POSTGRES_DB)"
BACKUP_ENCRYPTION_KEY="$(env_get BACKUP_ENCRYPTION_KEY)"
: "${POSTGRES_DB:?POSTGRES_DB not set in .env}"
: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY not set in .env}"

# The key must open this file before anything is stopped.
# (Reads only its start, so the pipe closing early isn't counted as a failure.)
FIRST_BYTES="$( (openssl enc -d -aes-256-cbc -pbkdf2 -salt -pass "pass:${BACKUP_ENCRYPTION_KEY}" -in "$BACKUP_FILE" 2>/dev/null | gunzip 2>/dev/null | head -c 64) || true )"
if [ -z "$FIRST_BYTES" ]; then
  echo "restore_db.sh: can't open $BACKUP_FILE with the key in .env" >&2
  exit 1
fi

echo "This REPLACES all data in database '$POSTGRES_DB' with:"
echo "  $BACKUP_FILE"
read -r -p "Type 'yes' to continue: " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Aborted."
  exit 1
fi

echo "== Stopping the app"
docker compose stop app

echo "== Restoring"
# Start from an empty schema, so the database is exactly the backup: tables
# added since (by a later version's migrations, with their record in
# schema_migrations) mustn't stay behind, or that version would think it had
# already upgraded the database.
docker compose exec -T db psql -q -v ON_ERROR_STOP=1 -U postgres -d "$POSTGRES_DB" \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" >/dev/null
if openssl enc -d -aes-256-cbc -pbkdf2 -salt -pass "pass:${BACKUP_ENCRYPTION_KEY}" -in "$BACKUP_FILE" \
  | gunzip \
  | docker compose exec -T db psql -q -v ON_ERROR_STOP=1 -U postgres -d "$POSTGRES_DB" >/dev/null; then
  echo "== Restored"
else
  echo "!! The restore stopped at an error (see above). The app stays stopped; check before starting it." >&2
  exit 1
fi

echo "== Starting the app"
docker compose up -d --no-build app
echo "restore_db.sh: done."
