-- Clears all FUTURE appointments (not yet happened) so a fresh future-bookings
-- CSV export can be re-imported cleanly with the fixed client-matching (see
-- sync_bookings.py — exact-match-or-new instead of fuzzy; this is what fixes
-- the Λιάκου/Βαλιάκου-style mix-ups going forward). Mirror image of
-- clear_window_for_reimport.sql (which covers the past 3 months); this one is
-- unbounded going forward since "future.csv" naturally means "everything not
-- yet happened" with no fixed cutoff.
--
-- Appointments with real payment data attached (transactions or
-- product_sales) are deliberately SKIPPED, never deleted — a future
-- appointment already paid/deposited against is exactly the kind of row this
-- must not touch. Re-importing will naturally leave those alone too, since
-- the sync script's own idempotency check matches by client+staff+service+
-- start_time and won't re-insert a duplicate for a booking that's still present.
--
-- Run as: psql "$POSTGRES_URI" -f scripts/clear_future_window_for_reimport.sql
-- Then re-run sync_bookings.py --commit against the fresh future export.

\set ON_ERROR_STOP on
\set target '00000000-0000-0000-0000-000000000001'

BEGIN;

CREATE TEMP TABLE clear_plan AS
SELECT DISTINCT a.id AS appointment_id
FROM appointments a
JOIN appointment_services aps ON aps.appointment_id = a.id
WHERE a.shop_id = :'target'
  AND aps.start_time >= NOW()
  AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.appointment_id = a.id)
  AND NOT EXISTS (SELECT 1 FROM product_sales ps WHERE ps.appointment_id = a.id)
  AND NOT EXISTS (SELECT 1 FROM membership_usage mu WHERE mu.appointment_id = a.id);

SELECT COUNT(*) AS appointments_to_clear FROM clear_plan;

-- Sanity check before deleting anything: how many future appointments are
-- being deliberately preserved because they have payment data.
SELECT COUNT(*) AS preserved_with_payment_data
FROM appointments a
JOIN appointment_services aps ON aps.appointment_id = a.id
WHERE a.shop_id = :'target'
  AND aps.start_time >= NOW()
  AND a.id NOT IN (SELECT appointment_id FROM clear_plan);

DELETE FROM appointment_services aps
USING clear_plan cp
WHERE aps.appointment_id = cp.appointment_id;

DELETE FROM appointments a
USING clear_plan cp
WHERE a.id = cp.appointment_id;

-- Self-verify: nothing referencing a cleared appointment_id should remain,
-- and every preserved (payment-linked) appointment must still be intact.
DO $$
DECLARE
  dangling_refs int;
  lost_payment_linked int;
BEGIN
  SELECT
    (SELECT COUNT(*) FROM appointment_services aps JOIN clear_plan cp ON aps.appointment_id = cp.appointment_id) +
    (SELECT COUNT(*) FROM appointments a JOIN clear_plan cp ON a.id = cp.appointment_id)
  INTO dangling_refs;

  SELECT COUNT(*) INTO lost_payment_linked
  FROM transactions t
  WHERE t.appointment_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.id = t.appointment_id);

  IF dangling_refs <> 0 OR lost_payment_linked <> 0 THEN
    RAISE EXCEPTION 'Clear verification failed (dangling_refs=%, lost_payment_linked=%) — aborting, nothing committed',
      dangling_refs, lost_payment_linked;
  END IF;
END $$;

COMMIT;

SELECT 'future window cleared' AS result;
