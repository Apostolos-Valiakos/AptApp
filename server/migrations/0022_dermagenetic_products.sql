-- Dermagenetic's order form (ΔΕΛΤΙΟ ΠΑΡΑΓΓΕΛΙΑΣ, 30-07-2026) for Pure: every
-- product's package as its variation, the bulk price (Χονδρική, before VAT;
-- the app adds the 24%) and the retail price (Λιανική). Pages 1-3 only: the
-- marketing materials and samples on page 4 aren't stocked.
--
-- Products already in the shop keep their name and stock; where the form has
-- no retail price they keep the one they have. BIOS MASK is sold by the
-- sachet, so its bulk price is a tenth of the box of 10. New products start
-- with no stock and, without a retail price, at €0 (used in the spa).
DO $$
DECLARE
  pure CONSTANT uuid := '00000000-0000-0000-0000-000000000001';
  r record;
  new_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM shops WHERE id = pure) THEN
    RETURN;
  END IF;

  UPDATE product_inventory pi
  SET variation_name = d.package,
      bulk_price = d.bulk,
      price = COALESCE(d.retail, pi.price),
      updated_at = NOW()
  FROM products p,
  (VALUES
  ('BOTAN FACIAL FOAM EXO', '400ml', 19.00, 53.00),
  ('FYSIO CLEANSER', '400ml', 19.00, 53.00),
  ('ERYTHROS GEL', '250ml', 32.00, 69.00),
  ('DAILY MICROEXFOLIANT ΠΡΟΒΙΟΤΙΚΟ', '80gr', 27.00, 63.00),
  ('REPAIR COMPLEX GEL( ΙΣΧΥΡΟ ΑΝΑΠΛΑΣΤΙΚΟ)', '50ml', 38.00, 83.00),
  ('BIOMAG ΕΝΕΡΓΟΠΟΙΗΤΗΣ ΚΡΕΜΑΣ', '50ml', 28.00, 74.00),
  ('A-NOSO', '50ml', 34.00, 84.00),
  ('VITAMIN C PLUS SERUM', '50ml', 58.50, 120.00),
  ('VITAMIN CS SERUM', '50ml', 62.00, 120.00),
  ('MICROEXO (ΚΡΕΜΑ ΓΙΑ ΑΚΜΗ ΡΥΘΜΙΣΗ PH)', '100ml', 31.50, 79.00),
  ('BRIGHTENING FORTE GEL (ΠΑΝΑΔΑ- ΛΕΥΚΑΝΣΗ-ΜΕΛΑΣΜΑ)', '50ml', 34.00, 84.00),
  ('ANTIOX CREAM', '50ml', 35.00, 95.00),
  ('LEFKO (ΛΕΥΚΑΝΣΗ - ΠΑΝΑΔΑ ΓΙΑ ΚΑΝΟΝΙΚΑ ΠΡΟΣ ΞΗΡΑ)', '50ml', 32.00, 94.00),
  ('A-MELA (ΚΡΕΜΑ ΛΥΠΑΡΑ ΔΕΡΜΑΤΑ ΓΙΑ ΛΕΥΚΑΝΣΗ ΔΕΡΜΑΤΟΣ-ΠΑΝΑΔΑ)', '50ml', 37.00, 100.00),
  ('ANAGIN LIFTING CREAM MASK', '50ml', 64.00, 128.00),
  ('MATI', '30ml', 32.00, 95.00),
  ('BOTOLIFT CREAM', '75ml', 37.00, 84.00),
  ('OLIGO ΣΥΣΦΗΞΗ ΑΝΤΙΓΥΡΑΝΣΗ ΚΑΝΟΝ. ΠΡΟΣ ΛΙΠΑΡΟ', '50ml', 36.00, 95.00),
  ('A -SERUM', '50ml', 35.00, 95.00),
  ('ENRICHED SERUM (ΟΡΟΣ ΜΕ ΡΕΤΙΝΟΛΗ)', '50ml', 41.00, 94.00),
  ('PHYLIC (ΑΝΤΙΞΙΔΙΩΤΙΚΗ ΚΡΕΜΑ -ΒΑΣΗ ΚΡΕΜΑΣ)', '45ml', 32.00, 77.00),
  ('PHYLIC BODY', '300ml', 52.50, 106.00),
  ('LIPID RECOVERY COMPLEX LRC', '100ml', 74.00, 170.00),
  ('APOTOX WASH OFF MASK', '125ml', 23.00, 52.00),
  ('KROKOS CREAM', '10 x 3gr (sachets)', 59.00, 116.00),
  ('Bioci αμπουλες αντιοξειδωσης', '2ml x 5amps', 14.00, 31.00),
  ('Enefos συσφυξης ΤΟ ΚΟΥΤΙ 30,ΤΜΧ10', '2ml x 5amps', 14.00, 31.00),
  ('NZYME', '2ml x 5amps', 13.00, 29.00),
  ('Enzyme ακμή καταπραυνει', '2ml x 5amps', 13.00, 29.00),
  ('Ratin ρετινόλη βραδυ', '2ml x 5amps', 14.00, 31.00),
  ('BIOS MASK/TMX', '10ml', 5.55, NULL),
  ('MATISYN', '4ml x 10blisters', 57.50, 148.00),
  ('METALLO LIGHT 7gr', '7gr', 26.00, 58.00),
  ('METALLO MEDIUM', '7gr', 26.00, 58.00),
  ('METALLO DARK', '7gr', 26.00, 58.00),
  ('ELIOS SPF 20', '75 ml', 26.00, 64.00),
  ('ELIOS SPF 30', '75 ml', 26.50, 64.00),
  ('ELIOS SPF 50', '75 ml', 27.00, 64.00),
  ('ELIOS MAT 30', '75 ml', 28.00, 66.00),
  ('ELIOS MAT 50', '75 ml', 30.00, 69.00),
  ('DAILY MICROEXPOLIANT 100ΓΡ ΧΡΗΣΗ ΣΠΑ', '200gr', 34.00, NULL),
  ('CALMING MASK 2KG ΜΩΒ ΧΡΗΣΗ ΣΠΑ', '2Kg', 101.00, NULL),
  ('ANTIOX MASK 1KG χρηση σπα', '1Kg', 53.50, NULL),
  ('FERSAL χημικό δεν πωλειται', '50ml', 91.50, NULL),
  ('MANSOL', '50ml', 93.00, NULL),
  ('ANSOL ΧΗΜΙΚΟ ΧΡΗΣΗ ΣΠΑ', '50ml', 119.50, NULL),
  ('BOTOLIFT ΜΠΟΥΚΑΛΑΚΙ ΧΡΗΣΗ ΣΠΑ ΤΜΧ', '10x10ml (vial)', 257.00, NULL),
  ('YIALLI ΧΡΗΣΗ ΣΠΑ ΜΠΟΥΚΑΛΑΚΙ', '10x5ml (vial)', 360.00, NULL),
  ('FLEGAK ΚΑΤΑ ΤΩΝ ΦΛΕΓΝΩΝ(ΜΟΝΟ ΧΡΗΣΗ ΣΠΑ)', '10x10ml (vial)', 252.00, NULL),
  ('IONOS (ΓΙΑ ΧΡΗΣΗ ΣΠΑ ΕΞΩΣΩΜΑΤΑ ΓΙΑ ΤΟ ΜΙΚΡΟΒΙΩΜΑ ΚΑΙ ΤΡΙΧΩΤΟ ΚΕΦΑΛΗΣ', '2x10ml (vial)', 70.00, NULL),
  ('CENTELA (ΜΟΝΟ ΓΙΑ ΧΡΗΣΗ ΣΠΑ)', '10x5ml (amp)', 62.00, NULL),
  ('ANBAGIOS (ΓΙΑ ΤΟ ΜΕΛΑΣΜΑ ,ΜΑΥΡΟΙ ΚΥΚΛΟΙ ΧΡΗΣΗ ΣΠΑ ΜΟΝΟ)', '10x5ml (amp)', 60.00, NULL),
  ('ABVITARE (ΑΚΜΗ - ΑΝΤΙΓΥΡΑΝΣΗ ΜΟΝΟ ΧΡΗΣΗ ΣΠΑ)', '10x5ml (amp)', 86.50, NULL),
  ('ABVITACE (ΓΙΑ ΥΠΕΡΜΕΛΑΧΡΩΣΗ ΑΝΤΙΞΙΔΙΩΤΙΚΑ ΧΡΗΣΗ ΧΡΗΣΗ ΣΠΑ)', '10x5ml (amp)', 70.50, NULL),
  ('ABVITA BE ΧΡΗΣΗ ΣΠΑ', '10x5ml (amp)', 77.00, NULL),
  ('VITASI ΑΜΠΟΥΛΕΣ ΧΡΗΣΗ ΣΠΑ', '10x5ml (amp)', 54.50, NULL)
  ) AS d(name, package, bulk, retail)
  WHERE pi.product_id = p.id AND p.shop_id = pure AND p.name = d.name;

  FOR r IN SELECT * FROM (VALUES
  ('ENRICHED SERUM PLAT', '40ml', 62.50, 212.00),
  ('NITHEA', '50ml', 45.80, 95.00),
  ('MASTER PEEL TCA 20%', '100ml', 43.00, NULL),
  ('MASTER PEEL TCA 30%', '100ml', 46.00, NULL),
  ('MASTER PEEL TCA 40%', '100ml', 49.50, NULL),
  ('DAY PEEL TCA 10%', '100ml', 38.00, NULL),
  ('TRI PEEL TCA 20%', '100ml', 41.00, NULL),
  ('PENT PEEL TCA 30%', '100ml', 46.00, NULL),
  ('JESSOL GEL', '50ml', 102.00, NULL),
  ('PYRSSOL GEL', '50ml', 111.00, NULL),
  ('ZOI PLUS', '10x10ml (vial)', 288.00, NULL),
  ('MELA', '10x10ml (vial)', 257.00, NULL),
  ('TRIHO', '10x10ml (vial)', 237.00, NULL),
  ('OPHTHALMOS', '10x5ml (vial)', 227.00, NULL),
  ('LIPO', '10x10ml (vial)', 237.00, NULL),
  ('RAVDOS', '10x10ml (vial)', 247.00, NULL),
  ('GLUTACE', '10x2gr (vial)', 262.00, NULL),
  ('EXOKIN', '10x10ml (vial)', 268.00, NULL),
  ('DERMALYSI', '10x10ml (vial)', 200.00, NULL),
  ('OLIMET EXOSOMES', '5x10ml (vial)', 147.50, NULL),
  ('GIAKUT MULTISOMES', '10x10ml (vial)', 325.00, NULL),
  ('EPION', '5x10ml (vial)', 110.00, NULL),
  ('TRANSEN', '10x5ml (amp)', 49.00, NULL),
  ('A-DYNAT', '10x5ml (amp)', 56.50, NULL),
  ('A-NERGY', '10x5ml (amp)', 49.00, NULL),
  ('ENERGO', '10x2ml (amp)', 70.50, NULL),
  ('FRAXPEEL 0,5mm', '1 PC', 15.50, NULL),
  ('FRAXPEEL 1,0mm', '1 PC', 15.50, NULL)
  ) AS d(name, package, bulk, retail)
  LOOP
    CONTINUE WHEN EXISTS (SELECT 1 FROM products WHERE shop_id = pure AND name = r.name);
    INSERT INTO products (name, description, shop_id) VALUES (r.name, NULL, pure) RETURNING id INTO new_id;
    INSERT INTO product_inventory (product_id, variation_name, price, stock_quantity, bulk_price)
    VALUES (new_id, r.package, COALESCE(r.retail, 0), 0, r.bulk);
  END LOOP;

  -- As when a bulk price is first filled in on the Products screen: earlier
  -- sales without one get it, for the seller's commission.
  UPDATE product_sales ps
  SET unit_bulk_price = pi.bulk_price
  FROM product_inventory pi
  WHERE ps.inventory_id = pi.id AND ps.shop_id = pure
    AND ps.unit_bulk_price IS NULL AND pi.bulk_price IS NOT NULL;
END $$;
