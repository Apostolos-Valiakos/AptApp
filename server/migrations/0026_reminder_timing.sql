-- Each client chooses when they're reminded (24 h, 2 h and/or 1 h before; NULL
-- = the shop's reminder_hours_before). Every reminder sent is recorded with
-- the booking's start then, so a moved booking is reminded again for its new
-- time and none is sent twice. appointments.email_reminder_sent /
-- push_reminder_sent now mean "all of this booking's reminders are sent".
ALTER TABLE clients ADD COLUMN IF NOT EXISTS reminder_offsets_minutes INT[];

CREATE TABLE IF NOT EXISTS appointment_reminders (
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'push')),
  offset_minutes INT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (appointment_id, channel, offset_minutes, start_time)
);
