-- Two people in one booking can be in a shared place (the sauna) at the same
-- time, which means two identical rows (same service, place and start). This
-- rule refused them with an error 500. It is replaced by a check in
-- domain/bookings.js (assertNoRepeatedRows) that still refuses the same
-- service twice at once for an ordinary therapist.
ALTER TABLE appointment_services DROP CONSTRAINT IF EXISTS unique_appt_service_time_staff;
