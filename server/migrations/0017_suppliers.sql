-- Suppliers the shop buys from, kept for later expenses. Admins manage the list;
-- a removed one stays on the expenses that used it and in its totals, and is no
-- longer offered.
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  phone VARCHAR(30),
  vat_number VARCHAR(20),
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_shop_name ON suppliers (shop_id, LOWER(name));

-- Each expense (daily or monthly) may name the supplier it was paid to.
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_supplier ON expenses (supplier_id) WHERE supplier_id IS NOT NULL;
