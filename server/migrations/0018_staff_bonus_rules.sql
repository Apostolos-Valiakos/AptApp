-- Each staff member's bonus rule: after threshold_minutes of completed services
-- in a day, they earn percent of the price of the service time past it. A rule
-- applies from effective_from until the staff member's next one, so changing it
-- never changes a day already worked. A staff member with no rule gets the
-- default (5 hours, 10%; none for shared places), see server/domain/bonus.js.
CREATE TABLE IF NOT EXISTS staff_bonus_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  effective_from DATE NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  threshold_minutes INTEGER NOT NULL DEFAULT 300 CHECK (threshold_minutes >= 0 AND threshold_minutes <= 1440),
  percent NUMERIC(5,2) NOT NULL DEFAULT 10 CHECK (percent >= 0 AND percent <= 100),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (staff_id, effective_from)
);
CREATE INDEX IF NOT EXISTS idx_staff_bonus_rules_shop ON staff_bonus_rules (shop_id, staff_id, effective_from);

-- ΔΩΡΟΚΑΡΤΑ is a calendar column for gift-card bookings, not a person, and it's
-- inactive, so it can't be opened in the staff form to turn its bonus off.
INSERT INTO staff_bonus_rules (shop_id, staff_id, effective_from, enabled)
SELECT shop_id, id, DATE '2000-01-01', false FROM staff
WHERE trim(name) = 'ΔΩΡΟΚΑΡΤΑ' AND shop_id IS NOT NULL
ON CONFLICT (staff_id, effective_from) DO NOTHING;
