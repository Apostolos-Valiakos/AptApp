-- The shop's rules for online bookings (client portal and AI assistant):
-- how long before a booking a client may still book, move or cancel it
-- online (0 = up to its start), and the cancellation note shown before
-- cancelling and on the confirm step.
ALTER TABLE shops ADD COLUMN IF NOT EXISTS portal_min_notice_minutes INT NOT NULL DEFAULT 0;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS cancellation_note TEXT;
