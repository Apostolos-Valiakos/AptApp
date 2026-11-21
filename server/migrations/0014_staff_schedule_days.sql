-- Staff schedules as the staff schedule page sets them.
--
-- A weekly schedule applies from its Monday on. It used to exist only through
-- its rows in staff_working_hours, so a week with no working days couldn't be
-- saved (it had no rows). Each weekly schedule is now recorded here too.
CREATE TABLE staff_schedule_versions (
  staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  shop_id uuid NOT NULL REFERENCES shops(id),
  effective_from date NOT NULL,
  PRIMARY KEY (staff_id, effective_from)
);
INSERT INTO staff_schedule_versions (staff_id, shop_id, effective_from)
SELECT DISTINCT staff_id, shop_id, effective_from FROM staff_working_hours;

-- One date's own hours, instead of the weekly schedule's for that date only.
-- ranges is a list of {start_time, end_time} ("HH:MM"); an empty list is a
-- day off that date.
CREATE TABLE staff_schedule_days (
  staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  shop_id uuid NOT NULL REFERENCES shops(id),
  date date NOT NULL,
  ranges jsonb NOT NULL DEFAULT '[]',
  PRIMARY KEY (staff_id, date)
);
