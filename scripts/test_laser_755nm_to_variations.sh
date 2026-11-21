#!/usr/bin/env bash
#
# Tests scripts/laser_755nm_to_variations_2026-10.sql on throwaway copies of
# the dev database (POSTGRES_URI in .env). The dev database itself is only
# read (pg_dump); every case runs in its own copy, dropped at the end.
#
# Cases:
#   1. Fresh (before any conversion), old services without variations
#   2. Fresh, old services with variations (incl. the first one) -> flattened
#   3. After the earlier script version ran, old services with variations
#      -> flattened ones added, the stale plain entries removed
#   4. As 3, but a booking uses a plain entry -> that entry is kept
#   5. Running twice changes nothing the second time
#   6. No "Laser 755nm - ..." services -> error, nothing changed
#   7. Staff of old services copied to the new service (no duplicates)
#   8. The dev database's real bookings as they are: every plain entry a
#      booking uses is kept
#
# Usage: ./scripts/test_laser_755nm_to_variations.sh

set -uo pipefail
cd "$(dirname "$0")/.."

SCRIPT=scripts/laser_755nm_to_variations_2026-10.sql
T="00000000-0000-0000-0000-000000000001"
DEV_URI="$(grep '^POSTGRES_URI=' .env | cut -d= -f2- | sed 's/[[:space:]]*#.*$//')"
SERVER="${DEV_URI%/*}"
BASE=laser_test_base
PASS=0
FAIL=0

q() { psql "$SERVER/$1" -X -v ON_ERROR_STOP=1 -Atqc "$2"; }
admin() { psql "$SERVER/postgres" -X -qc "$1" >/dev/null; }

new_case() {
  admin "DROP DATABASE IF EXISTS $1"
  admin "CREATE DATABASE $1 TEMPLATE $BASE"
}

run_script() { psql "$SERVER/$1" -X -q -f "$SCRIPT" >"/tmp/laser_test_$1.log" 2>&1; }

check() { # db, description, SQL that must return 't'
  local got
  got="$(q "$1" "SELECT ($3)" 2>&1)"
  if [ "$got" = "t" ]; then
    PASS=$((PASS + 1)); echo "  ok    $2"
  else
    FAIL=$((FAIL + 1)); echo "  FAIL  $2  (got: $got)"
  fi
}

new_id() { q "$1" "SELECT id FROM services WHERE shop_id = '$T' AND name = 'Laser 755nm'"; }
variations() { # db -> "name|duration|price|sort" lines of the new service
  q "$1" "SELECT v.name || '|' || v.duration_minutes || '|' || v.price || '|' || v.sort_order
          FROM service_variations v JOIN services s ON s.id = v.service_id
          WHERE s.shop_id = '$T' AND s.name = 'Laser 755nm' ORDER BY v.sort_order, v.name"
}
has_var() { echo "EXISTS (SELECT 1 FROM service_variations v JOIN services s ON s.id = v.service_id
               WHERE s.shop_id = '$T' AND s.name = 'Laser 755nm' AND v.name = '$1')"; }
var_count() { echo "(SELECT COUNT(*) FROM service_variations v JOIN services s ON s.id = v.service_id
               WHERE s.shop_id = '$T' AND s.name = 'Laser 755nm')"; }
has_var_expr() { echo "EXISTS (SELECT 1 FROM service_variations v2 JOIN services s2 ON s2.id = v2.service_id
               WHERE s2.shop_id = '$T' AND s2.name = 'Laser 755nm' AND v2.name = $1)"; }
sort_of() { echo "(SELECT v.sort_order FROM service_variations v JOIN services s ON s.id = v.service_id
               WHERE s.shop_id = '$T' AND s.name = 'Laser 755nm' AND v.name = '$1')"; }

# Starting states (applied inside a test copy only).
SETUP_FRESH="
  DELETE FROM appointment_services WHERE service_id IN (SELECT id FROM services WHERE shop_id = '$T' AND name = 'Laser 755nm');
  DELETE FROM staff_services WHERE service_id IN (SELECT id FROM services WHERE shop_id = '$T' AND name = 'Laser 755nm');
  DELETE FROM services WHERE shop_id = '$T' AND name = 'Laser 755nm';
  UPDATE services SET is_active = true WHERE shop_id = '$T' AND category = 'Laser 755nm';"
old_id() { echo "(SELECT id FROM services WHERE shop_id = '$T' AND name = 'Laser 755nm - $1')"; }
SETUP_VARIATIONS="
  INSERT INTO service_variations (service_id, name, duration_minutes, price, sort_order) VALUES
    ($(old_id 'Πόδια'), 'Επαναληπτικό', 20, 10, 0),
    ($(old_id 'Πόδια'), '1η συνεδρία', 25, 70, 1),
    ($(old_id 'Χέρια'), ' Mini ', 10, 15, 0);"
SETUP_FIRST_VARIATIONS="
  INSERT INTO service_variations (service_id, name, duration_minutes, price, sort_order) VALUES
    ($(old_id 'Full Body & Full Face'), 'Γυναικείο', 40, 130, 0),
    ($(old_id 'Full Body & Full Face'), 'Ανδρικό', 45, 150, 1);"
STAFF_A="$(psql "$DEV_URI" -X -Atqc "SELECT id FROM staff WHERE shop_id = '$T' ORDER BY id LIMIT 1")"
STAFF_B="$(psql "$DEV_URI" -X -Atqc "SELECT id FROM staff WHERE shop_id = '$T' ORDER BY id OFFSET 1 LIMIT 1")"
SETUP_STAFF="
  INSERT INTO staff_services (staff_id, service_id) VALUES
    ('$STAFF_A', $(old_id 'Πόδια')), ('$STAFF_A', $(old_id 'Χέρια')), ('$STAFF_B', $(old_id 'Πόδια'))
  ON CONFLICT DO NOTHING;"

# Cases 3/4 control which plain entries are booked: point the copy's existing
# Laser bookings at an entry the cases don't touch ("Full Face").
SETUP_BOOKINGS_UNRELATED="
  UPDATE appointment_services SET variation_name = 'Full Face'
  WHERE service_id = (SELECT id FROM services WHERE shop_id = '$T' AND name = 'Laser 755nm');"

echo "Preparing a snapshot of the dev database ($BASE)..."
admin "DROP DATABASE IF EXISTS $BASE"
admin "CREATE DATABASE $BASE"
pg_dump "$DEV_URI" | psql "$SERVER/$BASE" -X -q >/dev/null 2>&1

# --- 1 ---------------------------------------------------------------------
echo "1. Fresh, no old variations"
new_case laser_t1; q laser_t1 "$SETUP_FRESH"
run_script laser_t1 || echo "  (script failed, see /tmp/laser_test_laser_t1.log)"
check laser_t1 "single service created, active" "(SELECT is_active FROM services WHERE shop_id = '$T' AND name = 'Laser 755nm')"
check laser_t1 "10 plain variations" "$(var_count) = 10"
check laser_t1 "plain names without prefix (Πόδια, Full Face)" "$(has_var 'Πόδια') AND $(has_var 'Full Face')"
check laser_t1 "prices/durations copied (Πόδια 70€ 20')" "(SELECT price = 70 AND duration_minutes = 20 FROM service_variations WHERE name = 'Πόδια' AND service_id = (SELECT id FROM services WHERE shop_id = '$T' AND name = 'Laser 755nm'))"
check laser_t1 "old services archived" "NOT EXISTS (SELECT 1 FROM services WHERE shop_id = '$T' AND name LIKE 'Laser 755nm -%' AND is_active)"
check laser_t1 "default = first variation (130€ 40')" "(SELECT price = 130 AND duration_minutes = 40 FROM services WHERE shop_id = '$T' AND name = 'Laser 755nm')"

# --- 2 + 7 -----------------------------------------------------------------
echo "2. Fresh, old variations (incl. the first service) + 7. staff"
new_case laser_t2; q laser_t2 "$SETUP_FRESH $SETUP_VARIATIONS $SETUP_FIRST_VARIATIONS $SETUP_STAFF"
run_script laser_t2 || echo "  (script failed, see /tmp/laser_test_laser_t2.log)"
check laser_t2 "12 variations (7 plain + 5 flattened)" "$(var_count) = 12"
check laser_t2 "flattened names" "$(has_var 'Πόδια — Επαναληπτικό') AND $(has_var 'Πόδια — 1η συνεδρία') AND $(has_var 'Χέρια — Mini') AND $(has_var 'Full Body & Full Face — Ανδρικό')"
check laser_t2 "no plain entry for services that had variations" "NOT ($(has_var 'Πόδια') OR $(has_var 'Χέρια') OR $(has_var 'Full Body & Full Face'))"
check laser_t2 "flattened keep their own price/duration (Πόδια — 1η συνεδρία 70€ 25')" "(SELECT price = 70 AND duration_minutes = 25 FROM service_variations WHERE name = 'Πόδια — 1η συνεδρία')"
check laser_t2 "variation names trimmed ('Χέρια — Mini')" "NOT EXISTS (SELECT 1 FROM service_variations v JOIN services s ON s.id = v.service_id WHERE s.shop_id = '$T' AND s.name = 'Laser 755nm' AND (v.name LIKE '% ' OR v.name LIKE ' %' OR v.name LIKE '%  %'))"
check laser_t2 "default = first flattened variation (Γυναικείο 130€ 40')" "(SELECT price = 130 AND duration_minutes = 40 FROM services WHERE shop_id = '$T' AND name = 'Laser 755nm')"
check laser_t2 "first in the list: Full Body & Full Face — Γυναικείο" "(SELECT v.name = 'Full Body & Full Face — Γυναικείο' FROM service_variations v JOIN services s ON s.id = v.service_id WHERE s.shop_id = '$T' AND s.name = 'Laser 755nm' ORDER BY v.sort_order LIMIT 1)"
check laser_t2 "flattened stay in the old order (Πλάτη-Μέση < Πόδια — … < Στήθος-Κοιλιά)" "$(sort_of 'Πλάτη-Μέση') < $(sort_of 'Πόδια — Επαναληπτικό') AND $(sort_of 'Πόδια — Επαναληπτικό') < $(sort_of 'Πόδια — 1η συνεδρία') AND $(sort_of 'Πόδια — 1η συνεδρία') < $(sort_of 'Στήθος-Κοιλιά')"
check laser_t2 "7. staff of old services copied once (2 staff)" "(SELECT COUNT(*) = 2 FROM staff_services WHERE service_id = (SELECT id FROM services WHERE shop_id = '$T' AND name = 'Laser 755nm'))"

# --- 5 ---------------------------------------------------------------------
echo "5. Running twice changes nothing"
before="$(variations laser_t2)|$(q laser_t2 "SELECT COUNT(*) FROM staff_services")|$(q laser_t2 "SELECT price || '/' || duration_minutes FROM services WHERE shop_id = '$T' AND name = 'Laser 755nm'")"
if run_script laser_t2; then
  PASS=$((PASS + 1)); echo "  ok    second run succeeds"
else
  FAIL=$((FAIL + 1)); echo "  FAIL  second run failed, see /tmp/laser_test_laser_t2.log"
fi
after="$(variations laser_t2)|$(q laser_t2 "SELECT COUNT(*) FROM staff_services")|$(q laser_t2 "SELECT price || '/' || duration_minutes FROM services WHERE shop_id = '$T' AND name = 'Laser 755nm'")"
if [ "$before" = "$after" ]; then PASS=$((PASS + 1)); echo "  ok    variations, staff and defaults unchanged"; else FAIL=$((FAIL + 1)); echo "  FAIL  second run changed something"; fi

# --- 3 ---------------------------------------------------------------------
echo "3. After the earlier script version, old services gain variations"
new_case laser_t3; q laser_t3 "$SETUP_VARIATIONS $SETUP_BOOKINGS_UNRELATED"
bookings_before="$(q laser_t3 "SELECT COUNT(*) FROM appointment_services WHERE service_id = (SELECT id FROM services WHERE shop_id = '$T' AND name = 'Laser 755nm')")"
run_script laser_t3 || echo "  (script failed, see /tmp/laser_test_laser_t3.log)"
check laser_t3 "flattened variations added" "$(has_var 'Πόδια — Επαναληπτικό') AND $(has_var 'Πόδια — 1η συνεδρία') AND $(has_var 'Χέρια — Mini')"
check laser_t3 "stale plain entries removed (Πόδια, Χέρια)" "NOT ($(has_var 'Πόδια') OR $(has_var 'Χέρια'))"
check laser_t3 "other plain entries kept (Full Face)" "$(has_var 'Full Face')"
check laser_t3 "11 variations (10 - 2 + 3)" "$(var_count) = 11"
check laser_t3 "existing bookings untouched ($bookings_before)" "(SELECT COUNT(*) = $bookings_before FROM appointment_services WHERE service_id = (SELECT id FROM services WHERE shop_id = '$T' AND name = 'Laser 755nm'))"

# --- 4 ---------------------------------------------------------------------
echo "4. As 3, but a booking uses the plain entry 'Πόδια'"
new_case laser_t4; q laser_t4 "$SETUP_VARIATIONS $SETUP_BOOKINGS_UNRELATED
  UPDATE appointment_services SET variation_name = 'Πόδια'
  WHERE ctid = (SELECT ctid FROM appointment_services
                WHERE service_id = (SELECT id FROM services WHERE shop_id = '$T' AND name = 'Laser 755nm') LIMIT 1);"
run_script laser_t4 || echo "  (script failed, see /tmp/laser_test_laser_t4.log)"
check laser_t4 "booked plain entry kept (Πόδια)" "$(has_var 'Πόδια')"
check laser_t4 "unbooked plain entry removed (Χέρια)" "NOT $(has_var 'Χέρια')"
check laser_t4 "flattened variations added" "$(has_var 'Πόδια — Επαναληπτικό') AND $(has_var 'Χέρια — Mini')"
check laser_t4 "12 variations (10 - 1 + 3)" "$(var_count) = 12"

# --- 8 ---------------------------------------------------------------------
echo "8. Real dev bookings as they are (one uses plain 'Χέρια')"
new_case laser_t8; q laser_t8 "$SETUP_VARIATIONS"
booked="$(q laser_t8 "SELECT string_agg(DISTINCT variation_name, ',') FROM appointment_services WHERE service_id = (SELECT id FROM services WHERE shop_id = '$T' AND name = 'Laser 755nm')")"
run_script laser_t8 || echo "  (script failed, see /tmp/laser_test_laser_t8.log)"
check laser_t8 "every plain entry a booking uses is kept ($booked)" "NOT EXISTS (SELECT 1 FROM appointment_services aps JOIN services s ON s.id = aps.service_id WHERE s.shop_id = '$T' AND s.name = 'Laser 755nm' AND aps.variation_name IS NOT NULL AND NOT $(has_var_expr 'aps.variation_name'))"
check laser_t8 "unbooked stale entry removed (Πόδια)" "NOT $(has_var 'Πόδια')"
check laser_t8 "flattened variations added" "$(has_var 'Πόδια — Επαναληπτικό') AND $(has_var 'Χέρια — Mini')"

# --- 6 ---------------------------------------------------------------------
echo "6. No 'Laser 755nm - ...' services"
new_case laser_t6; q laser_t6 "UPDATE services SET category = 'Other' WHERE shop_id = '$T' AND name LIKE 'Laser 755nm -%'"
snapshot="$(variations laser_t6)|$(q laser_t6 "SELECT COUNT(*) FROM services")"
if run_script laser_t6; then
  FAIL=$((FAIL + 1)); echo "  FAIL  script should have stopped with an error"
else
  PASS=$((PASS + 1)); echo "  ok    stops with an error: $(grep -o 'No "Laser 755nm.*' /tmp/laser_test_laser_t6.log | head -1)"
fi
if [ "$snapshot" = "$(variations laser_t6)|$(q laser_t6 "SELECT COUNT(*) FROM services")" ]; then
  PASS=$((PASS + 1)); echo "  ok    nothing changed"
else
  FAIL=$((FAIL + 1)); echo "  FAIL  database changed"
fi

# --- clean up --------------------------------------------------------------
for db in laser_t1 laser_t2 laser_t3 laser_t4 laser_t6 laser_t8 $BASE; do admin "DROP DATABASE IF EXISTS $db"; done
: # logs kept in /tmp for inspection

echo
echo "Passed: $PASS   Failed: $FAIL"
[ "$FAIL" -eq 0 ]
