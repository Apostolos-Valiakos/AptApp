-- The startup code used to add a copy of six foreign keys on every start
-- ("ADD COLUMN IF NOT EXISTS … REFERENCES …" adds the constraint even when
-- the column exists), and one unique constraint exists twice. Keep the
-- oldest of each identical group and drop the rest. A database without
-- duplicates is left as it is.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass AS tbl, c.conname
    FROM pg_constraint c
    WHERE c.contype IN ('f', 'u')
      AND c.connamespace = 'public'::regnamespace
      AND EXISTS (
        SELECT 1 FROM pg_constraint k
        WHERE k.contype = c.contype
          AND k.conrelid = c.conrelid
          AND k.oid < c.oid
          AND pg_get_constraintdef(k.oid) = pg_get_constraintdef(c.oid)
      )
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
  END LOOP;
END $$;
