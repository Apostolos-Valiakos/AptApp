#!/usr/bin/env bash
# One-time setup of a server for ./scripts/deploy_image.sh, run from the
# laptop: daily encrypted database backups, and the scripts the deploy and
# a rollback use. Only adds what's missing; never replaces .env values.
#
#   ./scripts/setup_vps.sh
#
# On the server, in APP_DIR (default /opt/petalouda) it:
#   1. checks docker-compose.yml, .env (POSTGRES_DB) and the running db;
#   2. puts scripts/backup_db.sh, restore_db.sh and vps_run_image.sh there;
#   3. adds BACKUP_ENCRYPTION_KEY to .env if there is none, and shows it once
#      (keep it in a password manager: no backup opens without it);
#   4. adds a daily backup at 23:30 to root's crontab, if not there yet;
#   5. makes a first backup, to prove it works.
# Settings: VPS (default root@185.246.164.136), APP_DIR (default /opt/petalouda).

set -euo pipefail

VPS="${VPS:-root@185.246.164.136}"
APP_DIR="${APP_DIR:-/opt/petalouda}"
REPO="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
cd "$REPO"

# One SSH connection for every step, so the password is asked once.
SOCKET="$(mktemp -u /tmp/petalouda-setup-XXXXXX)"
SSH=(ssh -o ControlPath="$SOCKET")
trap '"${SSH[@]}" -O exit "$VPS" 2>/dev/null || true' EXIT
echo "== Connecting to $VPS"
ssh -o ControlMaster=yes -o ControlPath="$SOCKET" -o ControlPersist=yes -fN "$VPS"
on_vps() { "${SSH[@]}" "$VPS" "$@" </dev/null; }

echo "== Checking $APP_DIR"
on_vps "cd '$APP_DIR' && test -f docker-compose.yml && test -f .env" \
  || { echo "!! $APP_DIR needs docker-compose.yml and .env" >&2; exit 1; }
on_vps "cd '$APP_DIR' && grep -qE '^POSTGRES_DB=.+' .env" \
  || { echo "!! POSTGRES_DB is not set in $APP_DIR/.env" >&2; exit 1; }
on_vps "cd '$APP_DIR' && docker compose ps --status running --services | grep -qx db" \
  || { echo "!! The db container isn't running in $APP_DIR" >&2; exit 1; }

echo "== Installing the scripts"
on_vps "mkdir -p '$APP_DIR/scripts'"
for f in backup_db.sh restore_db.sh vps_run_image.sh; do
  "${SSH[@]}" "$VPS" "cat > '$APP_DIR/scripts/$f' && chmod +x '$APP_DIR/scripts/$f'" < "scripts/$f"
  echo "   scripts/$f"
done

echo "== Backup key"
if on_vps "grep -qE '^BACKUP_ENCRYPTION_KEY=.+' '$APP_DIR/.env'"; then
  echo "   already in .env, kept"
else
  KEY="$(on_vps "openssl rand -base64 32" | tr -d '\r\n')"
  on_vps "printf '\n# Encrypts the daily database backups (scripts/backup_db.sh)\nBACKUP_ENCRYPTION_KEY=%s\n' '$KEY' >> '$APP_DIR/.env'"
  echo "   added to .env. Keep a copy somewhere safe; no backup opens without it:"
  echo
  echo "      BACKUP_ENCRYPTION_KEY=$KEY"
  echo
fi

echo "== Daily backup (cron, 23:30)"
CRON_LINE="30 23 * * * cd $APP_DIR && ./scripts/backup_db.sh >> \$HOME/$(basename "$APP_DIR")-backups.log 2>&1"
if on_vps "crontab -l 2>/dev/null | grep -qF 'cd $APP_DIR && ./scripts/backup_db.sh'"; then
  echo "   already scheduled"
else
  on_vps "(crontab -l 2>/dev/null; echo '$CRON_LINE') | crontab -"
  echo "   added: $CRON_LINE"
fi

echo "== First backup"
on_vps "cd '$APP_DIR' && ./scripts/backup_db.sh"

echo "== Done. The server is ready for ./scripts/deploy_image.sh"
