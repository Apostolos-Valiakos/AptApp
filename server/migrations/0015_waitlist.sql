-- The waitlist the front desk keeps: clients who want a service when a place
-- opens. When one is booked from it, the entry is marked booked (with its
-- appointment); removed ones are kept as removed.
CREATE TABLE waitlist_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops(id),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  -- The therapist they want; none = anyone.
  staff_id uuid REFERENCES staff(id) ON DELETE SET NULL,
  -- The dates they can come, and on which weekdays (0 = Sunday … 6; none = any).
  date_from date NOT NULL,
  date_to date NOT NULL,
  days smallint[] NOT NULL DEFAULT '{}',
  -- The time of day they can come; none = any.
  time_from time,
  time_to time,
  note text,
  status varchar(10) NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'booked', 'removed')),
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  created_by_user_id varchar(255),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CHECK (date_to >= date_from),
  CHECK (time_from IS NULL OR time_to IS NULL OR time_to > time_from)
);
CREATE INDEX idx_waitlist_shop_status ON waitlist_entries (shop_id, status, date_to);
