-- The staff bonus for package sessions and for services with a fixed bonus.
--
-- 1. A fixed bonus per service, instead of the percent of its price, once
--    past the staff member's threshold (domain/bonus.js); NULL for none.
ALTER TABLE services ADD COLUMN IF NOT EXISTS bonus_fixed NUMERIC(10,2)
  CHECK (bonus_fixed IS NULL OR (bonus_fixed >= 0 AND bonus_fixed <= 1000));

-- The diagnostic appointment is free for the client and earns €2.20.
UPDATE services SET bonus_fixed = 2.20
WHERE upper(translate(trim(name), 'άέήίόύώΆΈΉΊΌΎΏ', 'αεηιουωΑΕΗΙΟΥΩ')) = 'ΔΙΑΓΝΩΣΤΙΚΟ ΡΑΝΤΕΒΟΥ'
  AND bonus_fixed IS NULL;

-- 2. A package's sessions (the paid one too) count as one session of the
--    service the package is for, like redemptions (migration 0020). The
--    shop's packages are linked here by name; any other one is linked by hand
--    in the service form ("Μετρά στο μπόνους ως"). Laser packages are left
--    out on purpose: laser is paid by the hour.
WITH norm AS (
  SELECT id, shop_id, is_active, trim(COALESCE(category, '')) AS category,
         upper(translate(regexp_replace(trim(name), '\s+', ' ', 'g'),
                         'άέήίόύώϊϋΐΰΆΈΉΊΌΎΏΪΫ', 'αεηιουωιυιυΑΕΗΙΟΥΩΙΥ')) AS n
  FROM services
), pairs(package, single) AS (
  VALUES
    ('10 HOLISTIC THERAPY', 'HOLISTIC'),
    ('ΠΑΚΕΤΟ 5 HOLISTIC THERAPY', 'HOLISTIC'),
    ('ΠΑΚΕΤΟ 10 PURE MASSAGE', 'PURE MASSAGE'),
    ('ΠΑΚΕΤΟ 5 PURE MASSAGE', 'PURE MASSAGE'),
    ('5 PURE', 'PURE MASSAGE'),
    ('ΠΑΚΕΤΟ 10 SPORT', 'SPORTS MASSAGE'),
    ('ΠΑΚΕΤΟ 5 SPORT MASSAGE', 'SPORTS MASSAGE'),
    ('5 ΣΥΝΕΔΡΙΕΣ HOT STONES', 'HOT STONES MASSAGE'),
    ('ΠΑΚΕΤΟ 10 ΣΥΝΕΔΡΙΩΝ HOT STONES', 'HOT STONES MASSAGE'),
    ('ΠΑΚΕΤΟ 10 ΣΥΝΕΔΡΙΩΝ 10 ΛΕΜΦΙΚΩΝ', 'ΛΕΜΦΙΚΟ ΜΑΣΑΖ'),
    ('ΠΑΚΕΤΟ 5 ΣΥΝΕΔΡΙΩΝ ΛΕΜΦΙΚΟΥ ΜΑΣΑΖ', 'ΛΕΜΦΙΚΟ ΜΑΣΑΖ'),
    ('10 ΣΥΝΕΔΡΙΕΣ ΠΑΚΕΤΟ ΚΥΤΤΑΡΙΤΙΔΑΣ', 'ΜΑΣΑΖ ΚΑΤΑ ΤΗΣ ΚΥΤΤΑΡΙΤΙΔΑΣ ΜΕ ΦΥΚΙΑ'),
    ('ΠΑΚΕΤΟ 5 ΜΑΣΑΖ ΚΥΤΤΑΡΙΤΙΔΑΣ', 'ΜΑΣΑΖ ΚΑΤΑ ΤΗΣ ΚΥΤΤΑΡΙΤΙΔΑΣ ΜΕ ΦΥΚΙΑ')
), links AS (
  -- One target per package: an active one first, if a name is used twice.
  SELECT DISTINCT ON (p.id) p.id, t.id AS target
  FROM pairs
  JOIN norm p ON p.n = pairs.package AND p.category <> 'Εξαργύρωση'
  JOIN norm t ON t.shop_id = p.shop_id AND t.n = pairs.single AND t.category <> 'Εξαργύρωση' AND t.id <> p.id
  ORDER BY p.id, t.is_active DESC, t.id
)
UPDATE services s SET bonus_service_id = links.target
FROM links WHERE s.id = links.id AND s.bonus_service_id IS NULL;

-- 3. Package sessions already booked count at that service's price today
--    (the price when booked isn't known): its variation of the session's
--    length, else its main price (as domain/bookings.js stamps new ones).
UPDATE appointment_services aps SET bonus_value = COALESCE(
    (SELECT v.price FROM service_variations v
     WHERE v.service_id = b.id AND v.duration_minutes = COALESCE(NULLIF(aps.duration_override, 0), r.duration_minutes)
     ORDER BY v.sort_order, v.id LIMIT 1),
    b.price)
FROM services r JOIN services b ON b.id = r.bonus_service_id
WHERE aps.service_id = r.id AND trim(COALESCE(r.category, '')) <> 'Εξαργύρωση';
