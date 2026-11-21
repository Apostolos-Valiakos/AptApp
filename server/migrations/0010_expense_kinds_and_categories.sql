-- Daily expenses (frontdesk and admins) and monthly ones (admins only). A monthly
-- expense is stored on the first day of its month. Existing expenses are daily.
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS kind VARCHAR(10) NOT NULL DEFAULT 'daily'
  CHECK (kind IN ('daily', 'monthly'));

-- Categories admins manage. A removed one stays for the expenses and reports
-- that used it, and is no longer offered.
CREATE TABLE IF NOT EXISTS expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_expense_categories_shop_name ON expense_categories (shop_id, LOWER(name));
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES expense_categories(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_shop_kind_date ON expenses (shop_id, kind, expense_date);
