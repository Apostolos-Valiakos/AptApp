-- Indexes the calendar and the overlap checks rely on. The first two exist on
-- the databases made so far but were created outside the code (a fresh
-- install wouldn't have them); IF NOT EXISTS makes this a no-op there.
CREATE INDEX IF NOT EXISTS idx_appointment_services_appointment_id ON appointment_services (appointment_id);
CREATE INDEX IF NOT EXISTS idx_appointment_services_start_time ON appointment_services (start_time);
-- Overlap checks: same staff member, overlapping time.
CREATE INDEX IF NOT EXISTS idx_appointment_services_staff_start ON appointment_services (staff_id, start_time);
