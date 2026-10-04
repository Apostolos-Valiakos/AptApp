#!/usr/bin/env bash
#
# End-to-end import of a "future bookings" CSV export (Treatwell/Fresha-style)
# into the app's database — clears the existing future-appointments window,
# previews what would change, then (after confirmation) applies the import
# and the follow-up cleanup steps a direct CSV import bypasses.
#
# Usage:
#   ./scripts/import_future_bookings.sh <path-to-bookings_future.csv>
#
# Pipeline (confirmed with the user before this script was written):
#   1. Preview  — read-only: how many future appointments would be cleared
#                 (mirrors clear_future_window_for_reimport.sql's own
#                 criteria; anything with a payment/product-sale/membership-
#                 usage attached is always preserved, never cleared), plus
#                 sync_bookings.py's own dry run of the CSV against the
#                 CURRENT (not-yet-cleared) database.
#   2. Confirm  — single y/N prompt covering the whole sequence below.
#   3. Clear    — scripts/clear_future_window_for_reimport.sql (for real)
#   4. Import   — scripts/sync_bookings.py <csv> --commit
#   5. Dedupe   — scripts/dedupe_appointments.sql
#                 (same client + staff + start_time + duration)
#   6. Split    — scripts/retroactive_sauna_hamam_split_2026-10-01.sql
#                 (the live booking UI splits the 6 sauna/hamam-combo
#                 services into a separate staff block; a direct CSV import
#                 bypasses that client-side logic, so this re-applies it to
#                 whatever was just imported — idempotent, a no-op for
#                 anything already split)
#
# Deliberately NOT included (confirmed with the user):
#   - reset_stale_appointment_durations_2026-10-01.sql: sync_bookings.py
#     already inserts each row with the service's own current default
#     duration (see its duration_override insert), so newly imported rows
#     can't need this — it only ever applied to older, already-bad data.
#   - merge_duplicate_clients_2026-09-30.sql / _nophone variant: targeted one
#     specific historical bug window in the old client-matching logic (fixed
#     in sync_bookings.py itself), not an ongoing per-import concern.
#
# Safe to re-run: every step here is idempotent except step 3, which only
# ever removes future, not-yet-paid appointments (see its own header) before
# step 4 re-adds whatever the CSV says should be there.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

CSV_PATH="${1:-}"
if [ -z "$CSV_PATH" ]; then
  echo "Usage: $0 <path-to-bookings_future.csv>" >&2
  exit 1
fi
if [ ! -f "$CSV_PATH" ]; then
  echo "ERROR: file not found: $CSV_PATH" >&2
  exit 1
fi

# Loaded via python-dotenv (sync_bookings.py's own dependency, so nothing
# extra is required beyond what this script already needs) rather than a raw
# `source .env` — this repo's .env has lines (URLs with '#', etc.) that
# aren't safely sourceable as plain shell. Deliberately not Node: on the VPS
# this runs inside a throwaway python:3.11-slim container (see DEPLOY.md's
# "Syncing a bookings.csv export" section) that has no Node at all.
POSTGRES_URI="$(python3 -c "
import os
from dotenv import load_dotenv
load_dotenv('$REPO_ROOT/.env')
print(os.environ.get('POSTGRES_URI', ''), end='')
")"
if [ -z "$POSTGRES_URI" ]; then
  echo "ERROR: POSTGRES_URI not set (check .env)" >&2
  exit 1
fi

echo "=================================================================="
echo " Future bookings import — $(date '+%Y-%m-%d %H:%M')"
echo " CSV: $CSV_PATH"
echo "=================================================================="

echo
echo "--- Preview (1/2): future appointments that would be cleared ---"
psql "$POSTGRES_URI" -v ON_ERROR_STOP=1 <<'SQL'
\set target '00000000-0000-0000-0000-000000000001'

SELECT COUNT(*) AS would_clear
FROM appointments a
JOIN appointment_services aps ON aps.appointment_id = a.id
WHERE a.shop_id = :'target'
  AND aps.start_time >= NOW()
  AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.appointment_id = a.id)
  AND NOT EXISTS (SELECT 1 FROM product_sales ps WHERE ps.appointment_id = a.id)
  AND NOT EXISTS (SELECT 1 FROM membership_usage mu WHERE mu.appointment_id = a.id);

SELECT COUNT(*) AS preserved_with_payment_data
FROM appointments a
JOIN appointment_services aps ON aps.appointment_id = a.id
WHERE a.shop_id = :'target'
  AND aps.start_time >= NOW()
  AND (
    EXISTS (SELECT 1 FROM transactions t WHERE t.appointment_id = a.id)
    OR EXISTS (SELECT 1 FROM product_sales ps WHERE ps.appointment_id = a.id)
    OR EXISTS (SELECT 1 FROM membership_usage mu WHERE mu.appointment_id = a.id)
  );
SQL

echo
echo "--- Preview (2/2): sync_bookings.py dry run against the CSV ---"
echo "(reflects the CURRENT, not-yet-cleared database — after the real"
echo " clear step below, rows not already excluded above will show as new)"
echo
python3 scripts/sync_bookings.py "$CSV_PATH"

echo
read -r -p "Proceed with clearing the future window, importing, and running cleanup? [y/N] " CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  echo "Aborted — nothing changed."
  exit 0
fi

echo
echo "--- Step 1/4: clearing future appointment window ---"
psql "$POSTGRES_URI" -v ON_ERROR_STOP=1 -f scripts/clear_future_window_for_reimport.sql

echo
echo "--- Step 2/4: importing $CSV_PATH ---"
python3 scripts/sync_bookings.py "$CSV_PATH" --commit

echo
echo "--- Step 3/4: deduping appointments ---"
psql "$POSTGRES_URI" -v ON_ERROR_STOP=1 -f scripts/dedupe_appointments.sql

echo
echo "--- Step 4/4: retroactive sauna/hamam split ---"
psql "$POSTGRES_URI" -v ON_ERROR_STOP=1 -f scripts/retroactive_sauna_hamam_split_2026-10-01.sql

echo
echo "=================================================================="
echo " Done."
echo "=================================================================="
