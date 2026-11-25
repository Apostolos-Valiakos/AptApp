-- The Android app's devices, for shop announcements through Firebase Cloud
-- Messaging (docs/redesign/ANDROID_HANDOFF.md step 7.3). One row per app
-- install: its FCM token, the client signed in on it. Web push keeps its own
-- table (push_subscriptions). A token moves to whoever signs in on that phone
-- next, and is removed at logout or when FCM says it's no longer valid.
CREATE TABLE IF NOT EXISTS push_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  platform VARCHAR(10) NOT NULL DEFAULT 'android' CHECK (platform IN ('android', 'ios')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_devices_client ON push_devices (client_id);
CREATE INDEX IF NOT EXISTS idx_push_devices_shop ON push_devices (shop_id);
