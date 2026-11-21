-- Removing someone's access also ends the logins they already hold: tokens
-- issued before this moment are refused (see isUserRevoked).
ALTER TABLE users ADD COLUMN IF NOT EXISTS sessions_revoked_at TIMESTAMPTZ;

-- Staff removed before this fix kept a working login. Admins can be on the
-- calendar too; removing them from it never touched their account.
UPDATE users SET is_active = false, sessions_revoked_at = NOW()
WHERE is_active IS NOT FALSE
  AND role NOT IN ('admin', 'super_admin')
  AND staff_id IN (SELECT id FROM staff WHERE is_active = false);
