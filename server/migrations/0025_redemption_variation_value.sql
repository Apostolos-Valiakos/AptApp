-- A redemption counts for the bonus at the price of the service it stands
-- for. Until now that was always the main price, also when the client
-- redeemed a longer or shorter variation (90 minutes of ΕΞΑΓΥΡΩΣΗ HOLISTIC is
-- HOLISTIC's 1,5-hour, not its 1-hour). Redemptions already booked are priced
-- again: the variation with the redemption's booked length, at its price
-- today (the price when booked isn't known). Those with no variation of that
-- length keep their value.
UPDATE appointment_services aps SET bonus_value = x.price
FROM (
  SELECT a2.id,
         (SELECT v.price FROM service_variations v
          WHERE v.service_id = b.id AND v.duration_minutes = COALESCE(NULLIF(a2.duration_override, 0), r.duration_minutes)
          ORDER BY v.sort_order, v.id LIMIT 1) AS price
  FROM appointment_services a2
  JOIN services r ON r.id = a2.service_id
  JOIN services b ON b.id = r.bonus_service_id
  WHERE trim(r.category) = 'Εξαργύρωση'
) x
WHERE x.id = aps.id AND x.price IS NOT NULL;
