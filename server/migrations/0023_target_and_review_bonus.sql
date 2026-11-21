-- Two more bonuses, each kept from a date like the other staff rules (with no
-- rule they're off):
-- - a sales target: when a staff member's completed services in a calendar
--   month reach a step's target (at the price charged), they earn that step's
--   fixed bonus; with several steps, the highest one reached. `steps` is a list
--   of { target, bonus } in euros.
-- - reviews (for front desk): each month the shop's client reviews grew, at so
--   much per review; everyone with it on gets the whole amount.
CREATE TABLE IF NOT EXISTS staff_target_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  effective_from DATE NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  steps JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (staff_id, effective_from)
);
CREATE INDEX IF NOT EXISTS idx_staff_target_rules_shop ON staff_target_rules (shop_id, staff_id, effective_from);

CREATE TABLE IF NOT EXISTS staff_review_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  effective_from DATE NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  amount_per_review NUMERIC(10,2) NOT NULL DEFAULT 3 CHECK (amount_per_review >= 0 AND amount_per_review <= 1000),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (staff_id, effective_from)
);
CREATE INDEX IF NOT EXISTS idx_staff_review_rules_shop ON staff_review_rules (shop_id, staff_id, effective_from);

-- The shop's review count on the 1st of a month and at its end, typed in on
-- the Bonus page. `month` is the month's first day.
CREATE TABLE IF NOT EXISTS shop_review_counts (
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  month DATE NOT NULL CHECK (EXTRACT(DAY FROM month) = 1),
  start_count INTEGER CHECK (start_count >= 0),
  end_count INTEGER CHECK (end_count >= 0),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (shop_id, month)
);
