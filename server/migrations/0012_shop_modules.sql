-- Optional modules the owner can switch off per shop (platform console).
-- Empty = everything on, so existing shops don't change. Values are the keys
-- in server/modules.js.
ALTER TABLE shops ADD COLUMN IF NOT EXISTS disabled_modules TEXT[] NOT NULL DEFAULT '{}';
