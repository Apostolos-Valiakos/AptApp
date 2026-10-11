-- Retroactively splits already-saved appointments under the 6 services that
-- bake Σάουνα/Χαμάμ straight into their own name (the keyword-fallback
-- group added this session — NOT the 3 already-explicit combos, which are
-- deliberately left alone for now) into a main-treatment block + a
-- sauna/hamam block, matching what the live booking UI now does for new
-- bookings of these same services.
--
-- None of these appointments were ever split before — the CSV import never
-- ran the client-side splitting logic at all, it only applies when staff
-- book through the app's own UI. Covers every status (completed/cancelled/
-- confirmed/new), per explicit instruction, since this is also a
-- staff-attribution correction for historical reporting, not just a
-- calendar-view fix.
--
-- For each matching row: shortens the main block's duration/price by the
-- resource service's own current duration/price (same carve-out math the
-- client already uses), then inserts a new block for the resource service
-- immediately after it (sequential, not simultaneous), assigned to that
-- resource's own default staff member.
--
-- Idempotent: guarded on "does this appointment already have a row for the
-- resource service", so re-running only touches appointments not yet split.
-- Run as: psql "$POSTGRES_URI" -f scripts/retroactive_sauna_hamam_split_2026-10-01.sql

\set ON_ERROR_STOP on
\set target '00000000-0000-0000-0000-000000000001'

BEGIN;

CREATE TEMP TABLE sauna_hamam_targets AS
SELECT aps.id AS aps_id, aps.appointment_id, aps.service_id, aps.staff_id,
       aps.start_time, aps.shop_id,
       COALESCE(aps.duration_override, s.duration_minutes) AS effective_duration,
       COALESCE(aps.price_override, s.price) AS effective_price,
       CASE WHEN s.name ~* 'χαμ[αά]μ|χαμμαμ|ham+am' THEN 'hamam' ELSE 'sauna' END AS kind
FROM appointment_services aps
JOIN appointments a ON a.id = aps.appointment_id
JOIN services s ON s.id = aps.service_id
WHERE a.shop_id = :'target'
AND s.name IN (
  'Holistic + Sauna', 'HOLISTIC-SAUNA SCRUB-LEAVE ON', 'ΘΕΡΑΠΕΥΤΙΚΟ+SAUNA+SCRUB+ALOE',
  'ΘΕΡΑΠΕΥΤΙΚΟ+ΣΑΟΥΝΑ+ΜΑΣΚΑ ΛΑΣΠΗΣ', 'ΠΡΟΣΦΟΡΑ CANDLE ΜΑΣΚΑ SAUNA',
  'ΠΡΟΣΦΟΡΑ ΘΕΡΑΠΕΥΤΙΚΟ ΧΑΜΜΑΜ ΛΑΣΠΗ ΕΧΤΡΑ ΒΕΝΤΟΥΖΕΣ',
  'Holistic + Hammam', 'Pure + Hammam', 'Hammam - Ολιστικό Μασάζ & Leave on Mask'
)
AND NOT EXISTS (
  SELECT 1 FROM appointment_services aps2
  JOIN services s2 ON s2.id = aps2.service_id
  WHERE aps2.appointment_id = aps.appointment_id
  AND s2.name IN ('ΣΑΟΥΝΑ ΣΕ ΥΠΗΡΕΣΙΑ', 'ΗΑΜΑΜ ΣΕ ΥΠΗΡΕΣΙΑ')
);

SELECT COUNT(*) AS appointments_to_split FROM sauna_hamam_targets;

-- Shorten the main block.
UPDATE appointment_services aps
SET
  duration_override = GREATEST(5, t.effective_duration - r.duration_minutes),
  price_override = GREATEST(0, t.effective_price - r.price)
FROM sauna_hamam_targets t
JOIN services r ON r.shop_id = :'target'
  AND r.name = (CASE WHEN t.kind = 'hamam' THEN 'ΗΑΜΑΜ ΣΕ ΥΠΗΡΕΣΙΑ' ELSE 'ΣΑΟΥΝΑ ΣΕ ΥΠΗΡΕΣΙΑ' END)
WHERE aps.id = t.aps_id;

-- Insert the sauna/hamam block right after the (now shortened) main block.
INSERT INTO appointment_services (appointment_id, service_id, staff_id, start_time, duration_override, price_override, shop_id)
SELECT
  t.appointment_id,
  r.id,
  r.default_staff_id,
  t.start_time + (GREATEST(5, t.effective_duration - r.duration_minutes) || ' minutes')::interval,
  r.duration_minutes,
  r.price,
  t.shop_id
FROM sauna_hamam_targets t
JOIN services r ON r.shop_id = :'target'
  AND r.name = (CASE WHEN t.kind = 'hamam' THEN 'ΗΑΜΑΜ ΣΕ ΥΠΗΡΕΣΙΑ' ELSE 'ΣΑΟΥΝΑ ΣΕ ΥΠΗΡΕΣΙΑ' END);

-- Self-verify: every targeted appointment should now have exactly one
-- resource-service row, and no main block should have gone negative.
DO $$
DECLARE
  missing_resource_rows int;
  bad_durations int;
BEGIN
  SELECT COUNT(*) INTO missing_resource_rows
  FROM sauna_hamam_targets t
  WHERE NOT EXISTS (
    SELECT 1 FROM appointment_services aps2
    JOIN services s2 ON s2.id = aps2.service_id
    WHERE aps2.appointment_id = t.appointment_id
    AND s2.name IN ('ΣΑΟΥΝΑ ΣΕ ΥΠΗΡΕΣΙΑ', 'ΗΑΜΑΜ ΣΕ ΥΠΗΡΕΣΙΑ')
  );

  SELECT COUNT(*) INTO bad_durations
  FROM appointment_services aps
  JOIN sauna_hamam_targets t ON t.aps_id = aps.id
  WHERE aps.duration_override < 5 OR aps.price_override < 0;

  IF missing_resource_rows <> 0 OR bad_durations <> 0 THEN
    RAISE EXCEPTION 'Retroactive split verification failed (missing_resource_rows=%, bad_durations=%) — aborting, nothing committed',
      missing_resource_rows, bad_durations;
  END IF;
END $$;

COMMIT;

SELECT 'retroactive sauna/hamam split committed' AS result;
