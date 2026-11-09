-- A combination's parts can each carry the price they're sold at inside it
-- (e.g. Holistic 28 + Sauna & scrub 7 = a 35 offer). NULL: the part's own
-- price is carved out of the combination's, as before.
ALTER TABLE service_combo_components ADD COLUMN IF NOT EXISTS price NUMERIC(10,2);

-- The combination a booked line came from, so it still shows as
-- "Holistic (Holistic + Sauna offer)" after the split.
ALTER TABLE appointment_services ADD COLUMN IF NOT EXISTS combo_service_id UUID
  REFERENCES services(id) ON DELETE SET NULL;
