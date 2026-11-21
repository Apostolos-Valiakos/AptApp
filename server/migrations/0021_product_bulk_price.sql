-- A product variation's bulk (wholesale) price, before the 24% VAT. The
-- seller's product commission is a percent of the profit: what the product was
-- sold for less the bulk price with VAT. Without a bulk price it stays a
-- percent of what it was sold for.
ALTER TABLE product_inventory ADD COLUMN IF NOT EXISTS bulk_price NUMERIC(10,2)
  CHECK (bulk_price IS NULL OR bulk_price >= 0);

-- The bulk price (before VAT) a sale was made at, so a later change doesn't
-- alter commission already earned. Sales made before a variation had one get
-- it the first time it's filled in.
ALTER TABLE product_sales ADD COLUMN IF NOT EXISTS unit_bulk_price NUMERIC(10,2);
