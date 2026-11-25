-- Three more settings on a percent-kind hours bonus rule (see domain/bonus.js):
-- - laser_amount_per_hour: laser services (name or category with Laser or
--   Λειζερ) earn this much per hour of their time past the threshold instead of
--   the percent; NULL pays them like any other service.
-- - deduction_per_service: taken off each other service's price before the
--   percent (never below 0).
-- - last_service_fixed: the day's last (non-laser) service, when 30 minutes or
--   less of it is past the threshold, earns this fixed amount instead; NULL off.
ALTER TABLE staff_bonus_rules ADD COLUMN IF NOT EXISTS laser_amount_per_hour NUMERIC(10,2)
  CHECK (laser_amount_per_hour IS NULL OR (laser_amount_per_hour >= 0 AND laser_amount_per_hour <= 1000));
ALTER TABLE staff_bonus_rules ADD COLUMN IF NOT EXISTS deduction_per_service NUMERIC(10,2) NOT NULL DEFAULT 0
  CHECK (deduction_per_service >= 0 AND deduction_per_service <= 1000);
ALTER TABLE staff_bonus_rules ADD COLUMN IF NOT EXISTS last_service_fixed NUMERIC(10,2)
  CHECK (last_service_fixed IS NULL OR (last_service_fixed >= 0 AND last_service_fixed <= 1000));

-- The shop's rules from November 2026, for every day (past ones included):
-- the last service up to 30 minutes past the threshold earns €2.20.
UPDATE staff_bonus_rules SET last_service_fixed = 2.20 WHERE last_service_fixed IS NULL;

-- Aestheticians (specialty Αισθητικός, any case): laser at €4 an hour (or the
-- amount their per-hour rule had), other services 10% of the price less €15,
-- after their threshold (4 hours unless their rule says otherwise).
UPDATE staff_bonus_rules r
SET kind = 'percent',
    laser_amount_per_hour = COALESCE(NULLIF(r.amount_per_hour, 0), 4),
    deduction_per_service = 15
FROM staff st
WHERE st.id = r.staff_id
  AND (upper(st.specialty) LIKE '%ΑΙΣΘΗΤΙΚ%' OR lower(st.specialty) LIKE '%αισθητικ%');

INSERT INTO staff_bonus_rules (shop_id, staff_id, effective_from, enabled, kind, threshold_minutes, percent,
                               amount_per_hour, laser_amount_per_hour, deduction_per_service, last_service_fixed)
SELECT st.shop_id, st.id, DATE '2000-01-01', true, 'percent', 240, 10, 0, 4, 15, 2.20
FROM staff st
WHERE st.shop_id IS NOT NULL
  AND (upper(st.specialty) LIKE '%ΑΙΣΘΗΤΙΚ%' OR lower(st.specialty) LIKE '%αισθητικ%')
  AND NOT EXISTS (SELECT 1 FROM staff_bonus_rules r WHERE r.staff_id = st.id)
ON CONFLICT (staff_id, effective_from) DO NOTHING;
