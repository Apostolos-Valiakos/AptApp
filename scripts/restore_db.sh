#!/usr/bin/env bash
# Restore a backup produced by backup_db.sh.
#
# Usage: ./scripts/restore_db.sh /path/to/pure_20260804_233000.sql.gz.enc
#
# WARNING: this overwrites the current database contents. Confirms before running.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

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
  echo "restore_db.sh: no .env found in $SCRIPT_DIR" >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a; source .env; set +a

: "${POSTGRES_DB:?POSTGRES_DB not set in .env}"
: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY not set in .env}"

echo "This will REPLACE all data in database '$POSTGRES_DB' with the contents of:"
echo "  $BACKUP_FILE"
read -r -p "Type 'yes' to continue: " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Aborted."
  exit 1
fi

openssl enc -d -aes-256-cbc -pbkdf2 -salt -pass "pass:${BACKUP_ENCRYPTION_KEY}" -in "$BACKUP_FILE" \
  | gunzip \
  | docker compose exec -T db psql -U postgres -d "$POSTGRES_DB"

echo "restore_db.sh: restore complete."
