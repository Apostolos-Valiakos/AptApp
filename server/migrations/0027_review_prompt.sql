-- After a visit the portal asks "How was it?" once; five stars opens the
-- shop's review page. The shop's link, and when each booking was asked.
ALTER TABLE shops ADD COLUMN IF NOT EXISTS google_review_url TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS review_prompted_at TIMESTAMPTZ;
