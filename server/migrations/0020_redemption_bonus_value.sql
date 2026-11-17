-- A redemption (a service in the category Εξαργύρωση, booked at €0 because the
-- client paid earlier) counts for the bonus at the price of the service it
-- stands for, picked in the service form.
ALTER TABLE services ADD COLUMN IF NOT EXISTS bonus_service_id UUID REFERENCES services(id) ON DELETE SET NULL;

-- That price as it was when the redemption was booked, so a later price
-- change doesn't change a bonus already earned. NULL on everything else.
ALTER TABLE appointment_services ADD COLUMN IF NOT EXISTS bonus_value NUMERIC(10,2);

-- Redemptions whose name, without ΕΞΑΓΥΡΩΣΗ / ΕΞΑΡΓΥΡΩΣΗ, is exactly one other
-- service's name (ignoring case and accents) are linked to it; the rest are
-- picked by hand.
WITH norm AS (
  SELECT id, shop_id, trim(category) AS category,
         upper(translate(trim(name), 'άέήίόύώϊϋΐΰΆΈΉΊΌΎΏ', 'αεηιουωιυιυΑΕΗΙΟΥΩ')) AS n
  FROM services
), redemption AS (
  SELECT id, shop_id, trim(regexp_replace(n, '^ΕΞΑΡ?ΓΥΡΩΣΗ\s*', '')) AS rest
  FROM norm WHERE category = 'Εξαργύρωση'
), single AS (
  SELECT r.id, MIN(o.id::text)::uuid AS target
  FROM redemption r
  JOIN norm o ON o.shop_id = r.shop_id AND o.category IS DISTINCT FROM 'Εξαργύρωση' AND o.n = r.rest
  GROUP BY r.id
  HAVING COUNT(*) = 1
)
UPDATE services s SET bonus_service_id = single.target
FROM single WHERE s.id = single.id AND s.bonus_service_id IS NULL;

-- Redemptions already booked count at the linked service's price today.
UPDATE appointment_services aps SET bonus_value = b.price
FROM services r JOIN services b ON b.id = r.bonus_service_id
WHERE aps.service_id = r.id AND trim(r.category) = 'Εξαργύρωση' AND aps.bonus_value IS NULL;
