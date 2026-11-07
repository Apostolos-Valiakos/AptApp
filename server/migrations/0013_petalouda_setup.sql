-- Petalouda only (this branch). Runs once, on the first start of this version.
--
-- 1. The modules petalouda doesn't use are switched off for its shops (the
--    owner can turn them back on from the platform console's Shops page).
UPDATE shops
SET disabled_modules = ARRAY['gift_cards','packages','products','memberships','cash_filter','client_portal','discounts','shared_places','contests']
WHERE disabled_modules = '{}';

-- 2. An owner login for the platform console (petalouda had none), unless one
--    already uses the name. Only the password's bcrypt hash is stored.
INSERT INTO users (username, password, role, shop_id, is_active)
VALUES ('owner', '$2b$12$E/kTW5dyNVINGodprGgZ.uW6jDFpOEm3m8ft4cMSy53XFVTHMpaZq', 'owner', NULL, true)
ON CONFLICT (username) DO NOTHING;
