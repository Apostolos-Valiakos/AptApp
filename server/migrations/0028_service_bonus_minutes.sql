-- For the staff bonus, a service can count fewer minutes than it's booked for
-- (e.g. a deep facial cleansing booked for 1h15 counts 1 hour). NULL: all of
-- its booked time. Bonus reports are worked out when opened, so past days
-- follow the setting too.
ALTER TABLE services ADD COLUMN IF NOT EXISTS bonus_minutes INTEGER
  CHECK (bonus_minutes IS NULL OR (bonus_minutes >= 1 AND bonus_minutes <= 1440));

-- The deep facial cleansing services (any spelling, offers and redemptions
-- too) count at most 1 hour.
UPDATE services SET bonus_minutes = 60
WHERE bonus_minutes IS NULL AND duration_minutes > 60
  AND upper(translate(name, 'άέήίόύώΆΈΉΊΌΎΏ', 'αεηιουωΑΕΗΙΟΥΩ')) LIKE '%ΒΑΘΥΣ ΚΑΘΑΡΙΣΜ%';
