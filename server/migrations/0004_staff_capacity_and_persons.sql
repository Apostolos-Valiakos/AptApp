-- Places at the same time: a staff member that is really a room (the sauna,
-- the hammam) can take several persons at once. 1 = one booking at a time,
-- as every staff member was until now.
ALTER TABLE staff ADD COLUMN IF NOT EXISTS capacity INTEGER NOT NULL DEFAULT 1;
ALTER TABLE staff ADD CONSTRAINT staff_capacity_positive CHECK (capacity >= 1);
-- How many persons one service row is for (e.g. three friends in the sauna
-- on one booking). The price stays what the row says.
ALTER TABLE appointment_services ADD COLUMN IF NOT EXISTS persons INTEGER NOT NULL DEFAULT 1;
ALTER TABLE appointment_services ADD CONSTRAINT appointment_services_persons_positive CHECK (persons >= 1);
-- The shop's two rooms start with 5 places; changed later in the staff form.
UPDATE staff SET capacity = 5 WHERE trim(name) IN ('ΣΑΟΥΝΑ', 'ΧΑΜΜΑΜ');
