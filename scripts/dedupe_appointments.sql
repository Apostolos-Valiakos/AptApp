-- Removes duplicate appointments: same client + same staff member + same
-- start_time + same duration (service_id intentionally ignored — a staff
-- member can't physically do two different services for one client at the
-- same instant, so a duration match with a differing service is almost
-- certainly the same real booking with the service mismatched by an import's
-- fuzzy-matching, not two distinct bookings).
--
-- Within each duplicate group, the oldest row survives (earliest created_at;
-- id is a deterministic tiebreaker for the groups where created_at ties).
-- Before deleting a loser row, any transactions/product_sales/membership_usage
-- pointing at it are re-pointed to the surviving row first, so no payment or
-- product-sale data is ever lost.
--
-- Run as: psql "$POSTGRES_URI" -f scripts/dedupe_appointments.sql
-- Safe to re-run: once deduped, the CTEs below simply find nothing to do.

\set ON_ERROR_STOP on
\set target '00000000-0000-0000-0000-000000000001'

BEGIN;

CREATE TEMP TABLE dedupe_plan AS
WITH ranked AS (
  SELECT
    a.id AS appointment_id,
    a.client_id,
    aps.staff_id,
    aps.start_time,
    COALESCE(aps.duration_override, s.duration_minutes) AS duration,
    -- The appointment with more service blocks wins: a combo booking (e.g.
    -- massage + its sauna block, after the sauna/hamam split) must never be
    -- deleted in favour of a lone re-imported sauna row with the same block.
    ROW_NUMBER() OVER (
      PARTITION BY a.client_id, aps.staff_id, aps.start_time,
                   COALESCE(aps.duration_override, s.duration_minutes)
      ORDER BY (SELECT COUNT(*) FROM appointment_services x WHERE x.appointment_id = a.id) DESC,
               a.created_at ASC, a.id ASC
    ) AS rn,
    FIRST_VALUE(a.id) OVER (
      PARTITION BY a.client_id, aps.staff_id, aps.start_time,
                   COALESCE(aps.duration_override, s.duration_minutes)
      ORDER BY (SELECT COUNT(*) FROM appointment_services x WHERE x.appointment_id = a.id) DESC,
               a.created_at ASC, a.id ASC
    ) AS keeper_id
  FROM appointments a
  JOIN appointment_services aps ON aps.appointment_id = a.id
  JOIN services s ON s.id = aps.service_id
  WHERE a.shop_id = :'target'
)
-- Deletion removes the whole appointment, so only appointments whose EVERY
-- service block is a duplicate of a block kept elsewhere are removed.
SELECT appointment_id AS loser_id, MIN(keeper_id::text)::uuid AS keeper_id
FROM ranked
GROUP BY appointment_id
HAVING BOOL_AND(rn > 1);

SELECT COUNT(*) AS rows_to_remove FROM dedupe_plan;

-- Re-point dependent rows from the loser onto the keeper before deleting.
UPDATE transactions t
SET appointment_id = dp.keeper_id
FROM dedupe_plan dp
WHERE t.appointment_id = dp.loser_id;

UPDATE product_sales ps
SET appointment_id = dp.keeper_id
FROM dedupe_plan dp
WHERE ps.appointment_id = dp.loser_id;

UPDATE membership_usage mu
SET appointment_id = dp.keeper_id
FROM dedupe_plan dp
WHERE mu.appointment_id = dp.loser_id;

DELETE FROM appointment_services aps
USING dedupe_plan dp
WHERE aps.appointment_id = dp.loser_id;

DELETE FROM appointments a
USING dedupe_plan dp
WHERE a.id = dp.loser_id;

-- Self-verify: no duplicate groups should remain, and nothing referencing a
-- deleted loser_id should still exist anywhere.
DO $$
DECLARE
  remaining_dupes int;
  dangling_refs int;
BEGIN
  SELECT COUNT(*) INTO remaining_dupes FROM (
    SELECT a.client_id, aps.staff_id, aps.start_time,
           COALESCE(aps.duration_override, s.duration_minutes) AS duration
    FROM appointments a
    JOIN appointment_services aps ON aps.appointment_id = a.id
    JOIN services s ON s.id = aps.service_id
    WHERE a.shop_id = '00000000-0000-0000-0000-000000000001'
    GROUP BY a.client_id, aps.staff_id, aps.start_time,
             COALESCE(aps.duration_override, s.duration_minutes)
    HAVING COUNT(*) > 1
  ) x;

  SELECT
    (SELECT COUNT(*) FROM transactions t JOIN dedupe_plan dp ON t.appointment_id = dp.loser_id) +
    (SELECT COUNT(*) FROM product_sales ps JOIN dedupe_plan dp ON ps.appointment_id = dp.loser_id) +
    (SELECT COUNT(*) FROM membership_usage mu JOIN dedupe_plan dp ON mu.appointment_id = dp.loser_id) +
    (SELECT COUNT(*) FROM appointment_services aps JOIN dedupe_plan dp ON aps.appointment_id = dp.loser_id) +
    (SELECT COUNT(*) FROM appointments a JOIN dedupe_plan dp ON a.id = dp.loser_id)
  INTO dangling_refs;

  -- Duplicate blocks can legitimately remain inside appointments that also
  -- hold other, non-duplicate blocks (those are never deleted), so only
  -- leftover references to deleted appointments are a failure.
  IF dangling_refs <> 0 THEN
    RAISE EXCEPTION 'Dedupe verification failed (dangling_refs=%) — aborting, nothing committed', dangling_refs;
  END IF;
  IF remaining_dupes <> 0 THEN
    RAISE NOTICE '% duplicate blocks kept because their appointments also hold other services', remaining_dupes;
  END IF;
END $$;

COMMIT;

SELECT 'dedupe committed' AS result;
