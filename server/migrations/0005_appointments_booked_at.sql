-- When a booking was made, date and time (created_at is only a date). Older
-- bookings stay empty: their time was never recorded. Set from now on.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS booked_at TIMESTAMPTZ;
ALTER TABLE appointments ALTER COLUMN booked_at SET DEFAULT now();
