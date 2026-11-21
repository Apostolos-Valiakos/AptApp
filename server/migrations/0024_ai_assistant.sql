-- The client portal's AI assistant (ai/): each shop switches it on or off.
ALTER TABLE shops ADD COLUMN IF NOT EXISTS ai_assistant_enabled BOOLEAN NOT NULL DEFAULT false;
