-- A note for one service of a booking and its staff member (e.g. "pressure
-- on the left shoulder"), next to the booking's own notes. For the shop only:
-- the client portal never gets it.
ALTER TABLE appointment_services ADD COLUMN IF NOT EXISTS notes TEXT
  CHECK (notes IS NULL OR length(notes) <= 2000);
