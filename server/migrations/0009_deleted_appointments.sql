-- A copy of each booking deleted with the delete button: what it was, who
-- deleted it, when and why. The booking itself is still removed. Copied values
-- rather than links, so an entry stays readable whatever is later changed.
CREATE TABLE IF NOT EXISTS deleted_appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL,
  appointment_id UUID NOT NULL,
  group_id UUID,
  client_id UUID,
  client_name TEXT,
  client_phone TEXT,
  status TEXT,
  start_time TIMESTAMPTZ,
  services JSONB NOT NULL DEFAULT '[]',
  products JSONB NOT NULL DEFAULT '[]',
  total NUMERIC(10, 2) NOT NULL DEFAULT 0,
  internal_notes TEXT,
  booking_notes TEXT,
  booked_at TIMESTAMPTZ,
  deleted_by_user_id UUID,
  deleted_by_name TEXT,
  reason TEXT,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_deleted_appointments_shop_deleted ON deleted_appointments (shop_id, deleted_at DESC);
