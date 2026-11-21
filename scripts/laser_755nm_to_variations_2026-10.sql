-- Turns the separate services in category "Laser 755nm" into ONE service,
-- "Laser 755nm", with a variation per old service — the same set-up as
-- "Αποτρίχωση".
--
-- - Variation names drop the "Laser 755nm - " prefix ("Full Face", "Πόδια",
--   ...), keep each old service's duration and price, and follow the old
--   services' order.
-- - An old service that had variations of its own is flattened, since a
--   variation can't have variations: one variation per old variation, named
--   "<service> — <variation>" (e.g. "Πόδια — Επαναληπτικό") with that
--   variation's own duration and price. Its plain entry ("Πόδια") is not
--   added, and if an earlier run added it, it is removed again unless a
--   booking uses it.
-- - The new service's own duration/price are the first variation's, and it
--   copies the first old service's online/colour/default-staff settings and
--   position in the category.
-- - Staff who could do any of the old services can do the new one.
-- - The old services are deactivated, not deleted: existing bookings,
--   packages and history stay on them unchanged.
--
-- Run as: psql "$POSTGRES_URI" -f scripts/laser_755nm_to_variations_2026-10.sql
-- Safe to re-run: the service and its variations are only created if missing.
-- Re-running after the earlier version of this script also adds the
-- flattened variations it missed.

\set ON_ERROR_STOP on
\set target '00000000-0000-0000-0000-000000000001'

BEGIN;

CREATE TEMP TABLE old_laser ON COMMIT DROP AS
SELECT s.*,
       btrim(regexp_replace(s.name, '^\s*Laser\s*755\s*nm\s*-\s*', '', 'i')) AS variation_name,
       ROW_NUMBER() OVER (ORDER BY s.sort_order, s.name) - 1 AS variation_order
FROM services s
WHERE s.shop_id = :'target'
  AND s.category = 'Laser 755nm'
  AND s.name ~* '^\s*Laser\s*755\s*nm\s*-';

-- What the single service will offer: one variation per old service, or one
-- per old variation for services that had variations.
CREATE TEMP TABLE target_variations ON COMMIT DROP AS
SELECT o.name AS old_service, o.variation_name AS name, o.duration_minutes, o.price,
       o.variation_order * 100 AS sort_order, false AS flattened
FROM old_laser o
WHERE NOT EXISTS (SELECT 1 FROM service_variations v WHERE v.service_id = o.id)
UNION ALL
SELECT o.name, o.variation_name || ' — ' || btrim(v.name), v.duration_minutes, v.price,
       o.variation_order * 100 + 1 + ROW_NUMBER() OVER (PARTITION BY o.id ORDER BY v.sort_order, v.id)::int, true
FROM old_laser o JOIN service_variations v ON v.service_id = o.id;

SELECT old_service, name AS new_variation, duration_minutes, price,
       CASE WHEN flattened THEN 'flattened' ELSE '' END AS note
FROM target_variations ORDER BY sort_order;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM old_laser) THEN
    RAISE EXCEPTION 'No "Laser 755nm - ..." services found in category "Laser 755nm" — nothing to do';
  END IF;
END $$;

-- The single service, created once; its own duration/price are the first
-- variation's.
INSERT INTO services (name, category, duration_minutes, price, shop_id, is_active,
                      bookable_online, color_code, default_staff_id, sort_order)
SELECT 'Laser 755nm', 'Laser 755nm', t.duration_minutes, t.price, :'target', true,
       o.bookable_online, o.color_code, o.default_staff_id, o.sort_order
FROM old_laser o
CROSS JOIN (SELECT duration_minutes, price FROM target_variations ORDER BY sort_order LIMIT 1) t
WHERE o.variation_order = 0
  AND NOT EXISTS (SELECT 1 FROM services WHERE shop_id = :'target' AND name = 'Laser 755nm');

CREATE TEMP TABLE new_laser ON COMMIT DROP AS
SELECT id FROM services WHERE shop_id = :'target' AND name = 'Laser 755nm';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM new_laser) <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one service named "Laser 755nm"';
  END IF;
END $$;

INSERT INTO service_variations (service_id, name, duration_minutes, price, sort_order)
SELECT n.id, t.name, t.duration_minutes, t.price, t.sort_order
FROM target_variations t CROSS JOIN new_laser n
WHERE NOT EXISTS (SELECT 1 FROM service_variations v WHERE v.service_id = n.id AND v.name = t.name);

-- An earlier run may have added the plain entry for a service that had
-- variations ("Πόδια" next to "Πόδια — ..."): remove it, unless a booking
-- already uses it.
DELETE FROM service_variations v
USING new_laser n, old_laser o
WHERE v.service_id = n.id
  AND v.name = o.variation_name
  AND EXISTS (SELECT 1 FROM service_variations ov WHERE ov.service_id = o.id)
  AND NOT EXISTS (SELECT 1 FROM appointment_services aps
                  WHERE aps.service_id = n.id AND aps.variation_name = v.name);

-- Plain entries kept only because bookings use them (they can be removed by
-- hand once those bookings are moved to a flattened variation).
SELECT v.name AS plain_entry_kept_because_booked,
       (SELECT COUNT(*) FROM appointment_services aps
        WHERE aps.service_id = n.id AND aps.variation_name = v.name) AS bookings
FROM service_variations v
JOIN new_laser n ON n.id = v.service_id
JOIN old_laser o ON o.variation_name = v.name
WHERE EXISTS (SELECT 1 FROM service_variations ov WHERE ov.service_id = o.id);

INSERT INTO staff_services (staff_id, service_id)
SELECT DISTINCT ss.staff_id, n.id
FROM staff_services ss JOIN old_laser o ON o.id = ss.service_id CROSS JOIN new_laser n
WHERE NOT EXISTS (SELECT 1 FROM staff_services x WHERE x.staff_id = ss.staff_id AND x.service_id = n.id);

UPDATE services SET is_active = false WHERE id IN (SELECT id FROM old_laser);

SELECT s.name AS service, s.duration_minutes, s.price,
       (SELECT COUNT(*) FROM staff_services ss WHERE ss.service_id = s.id) AS staff,
       string_agg(v.name || ' ' || v.duration_minutes || ''' €' || v.price, ', ' ORDER BY v.sort_order) AS variations
FROM services s JOIN new_laser n ON n.id = s.id
LEFT JOIN service_variations v ON v.service_id = s.id
GROUP BY s.id;

COMMIT;
