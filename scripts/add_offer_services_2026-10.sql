-- Adds three services that appear in the bookings export but did not exist
-- in the catalogue, with their variations, plus the "5 PURE" package type.
-- Names match the export exactly so sync_bookings.py matches them.
--
-- Run as: psql "$POSTGRES_URI" -f scripts/add_offer_services_2026-10.sql
-- Safe to re-run: anything that already exists (by name) is left alone.

\set ON_ERROR_STOP on
\set target '00000000-0000-0000-0000-000000000001'

BEGIN;

CREATE TEMP TABLE new_services (name text, category text, duration int, price numeric) ON COMMIT DROP;
INSERT INTO new_services VALUES
  ('ΝΕΑ ΠΡΟΣΦΟΡΑ Αποτρίχωση Full Body', 'Λειζερ',           40, 69),
  ('HOLISTIC',                         'Hot',              60, 32),
  ('5 PURE',                           'Classic Massages', 60,  0);

INSERT INTO services (name, category, duration_minutes, price, shop_id, bookable_online, sort_order)
SELECT ns.name, ns.category, ns.duration, ns.price, :'target', false,
       COALESCE((SELECT MAX(sort_order) + 1 FROM services s WHERE s.shop_id = :'target' AND s.category = ns.category), 0)
FROM new_services ns
WHERE NOT EXISTS (SELECT 1 FROM services s WHERE s.shop_id = :'target' AND s.name = ns.name);

CREATE TEMP TABLE new_variations (service text, name text, duration int, price numeric, sort_order int) ON COMMIT DROP;
INSERT INTO new_variations VALUES
  ('ΝΕΑ ΠΡΟΣΦΟΡΑ Αποτρίχωση Full Body', 'Επαναληπτικό',      20,  10, 0),
  ('ΝΕΑ ΠΡΟΣΦΟΡΑ Αποτρίχωση Full Body', 'Full body',         40,  69, 1),
  ('ΝΕΑ ΠΡΟΣΦΟΡΑ Αποτρίχωση Full Body', 'Full body ανδρικό', 40,  90, 2),
  ('HOLISTIC',                         '1 ώρα',             60,  32, 0),
  ('HOLISTIC',                         '1,5 ώρα',           90,  55, 1),
  ('5 PURE',                           'ΑΓΟΡΑ ΠΑΚΕΤΟΥ',     60, 125, 0),
  ('5 PURE',                           '1o pure',           60,   0, 1),
  ('5 PURE',                           '2o pure',           60,   0, 2),
  ('5 PURE',                           '3o pure',           60,   0, 3),
  ('5 PURE',                           '4o pure',           60,   0, 4),
  ('5 PURE',                           '5o pure',           60,   0, 5);

INSERT INTO service_variations (service_id, name, duration_minutes, price, sort_order)
SELECT s.id, nv.name, nv.duration, nv.price, nv.sort_order
FROM new_variations nv
JOIN services s ON s.shop_id = :'target' AND s.name = nv.service
WHERE NOT EXISTS (SELECT 1 FROM service_variations v WHERE v.service_id = s.id AND v.name = nv.name);

INSERT INTO package_types (shop_id, name, service_id, visits, price, validity_days)
SELECT :'target', '5 PURE', s.id, 5, 125, NULL
FROM services s
WHERE s.shop_id = :'target' AND s.name = '5 PURE'
  AND NOT EXISTS (SELECT 1 FROM package_types p WHERE p.shop_id = :'target' AND p.name = '5 PURE');

INSERT INTO service_categories (shop_id, name, sort_order)
SELECT DISTINCT :'target'::uuid, ns.category,
       (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM service_categories WHERE shop_id = :'target')
FROM new_services ns
ON CONFLICT (shop_id, name) DO NOTHING;

SELECT s.name AS service, COUNT(v.id) AS variations
FROM services s LEFT JOIN service_variations v ON v.service_id = s.id
WHERE s.shop_id = :'target' AND s.name IN (SELECT name FROM new_services)
GROUP BY s.name ORDER BY s.name;

COMMIT;
