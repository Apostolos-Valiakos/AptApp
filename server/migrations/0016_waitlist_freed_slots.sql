-- Times freed by a cancelled or deleted booking, for the waitlist: the
-- calendar's waitlist button counts the ones that still suit someone waiting
-- (see freedSlots in domain/waitlist.js). Recorded by triggers, so every way a
-- booking is cancelled or deleted counts (the calendar, the booking dialog,
-- the client portal, a replayed offline change).
CREATE TABLE waitlist_freed_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops(id),
  staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  -- The booking it came from (no reference: a deleted one is gone).
  appointment_id uuid,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  -- Dismissed by hand from the waitlist panel, for everyone.
  dismissed_at timestamptz,
  dismissed_by_user_id varchar(255)
);
CREATE INDEX idx_waitlist_freed_open ON waitlist_freed_slots (shop_id, start_time) WHERE dismissed_at IS NULL;

-- A booking's service rows that are still to come, as freed times. Time
-- blocks aren't bookings, so they free nothing here.
CREATE FUNCTION waitlist_record_freed(appt appointments) RETURNS void AS $$
BEGIN
  IF COALESCE(appt.is_block, false) OR appt.shop_id IS NULL THEN RETURN; END IF;
  INSERT INTO waitlist_freed_slots (shop_id, staff_id, start_time, end_time, appointment_id)
  SELECT appt.shop_id, aps.staff_id, aps.start_time,
         aps.start_time + (COALESCE(NULLIF(aps.duration_override, 0), s.duration_minutes, 60) || ' minutes')::interval,
         appt.id
  FROM appointment_services aps
  LEFT JOIN services s ON s.id = aps.service_id
  WHERE aps.appointment_id = appt.id AND aps.staff_id IS NOT NULL AND aps.start_time > NOW();
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION waitlist_on_cancel() RETURNS trigger AS $$
BEGIN
  PERFORM waitlist_record_freed(NEW);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Before the delete, while its service rows are still there (they go with it).
CREATE FUNCTION waitlist_on_delete() RETURNS trigger AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM 'cancelled' THEN PERFORM waitlist_record_freed(OLD); END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER waitlist_freed_on_cancel
  AFTER UPDATE OF status ON appointments
  FOR EACH ROW WHEN (NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled')
  EXECUTE FUNCTION waitlist_on_cancel();

CREATE TRIGGER waitlist_freed_on_delete
  BEFORE DELETE ON appointments
  FOR EACH ROW EXECUTE FUNCTION waitlist_on_delete();
