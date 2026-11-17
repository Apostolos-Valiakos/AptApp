-- A bonus rule pays either a percentage of the price of the service time past
-- the threshold ('percent', as before) or a fixed amount for each hour past it,
-- in proportion for part of an hour ('per_hour').
ALTER TABLE staff_bonus_rules ADD COLUMN IF NOT EXISTS kind VARCHAR(10) NOT NULL DEFAULT 'percent'
  CHECK (kind IN ('percent', 'per_hour'));
ALTER TABLE staff_bonus_rules ADD COLUMN IF NOT EXISTS amount_per_hour NUMERIC(10,2) NOT NULL DEFAULT 0
  CHECK (amount_per_hour >= 0 AND amount_per_hour <= 1000);

-- Product commission: a staff member with it on can be picked as the seller of
-- a product (product_sales.staff_id) and earns percent of what it was sold for.
-- Kept from a date like the bonus rules; with no rule, it's off.
CREATE TABLE IF NOT EXISTS staff_product_commission_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  effective_from DATE NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  percent NUMERIC(5,2) NOT NULL DEFAULT 10 CHECK (percent >= 0 AND percent <= 100),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (staff_id, effective_from)
);
CREATE INDEX IF NOT EXISTS idx_product_commission_rules_shop ON staff_product_commission_rules (shop_id, staff_id, effective_from);
CREATE INDEX IF NOT EXISTS idx_product_sales_shop_date ON product_sales (shop_id, sale_date);
