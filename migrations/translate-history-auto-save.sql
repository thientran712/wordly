-- Run this in Supabase SQL Editor
--
-- Splits "a translation happened" from "the user explicitly saved it":
-- previously every row in translate_history was created only by the
-- "Lưu" button, so a row's mere existence meant "saved". Now every
-- translation gets auto-logged (is_saved = false), and the "Lưu" button
-- marks the most recent matching row is_saved = true. Only is_saved = true
-- rows are eligible for the daily email reminder (see select-word-for-email.js).
ALTER TABLE translate_history
  ADD COLUMN IF NOT EXISTS is_saved boolean NOT NULL DEFAULT false;

-- Every row that already exists was created via the old "Lưu"-only flow,
-- so it represents an explicit save — mark it as such.
UPDATE translate_history SET is_saved = true WHERE is_saved = false;

-- Drop the old unique constraint on (user_id, source_text, direction).
-- Auto-logging no longer upserts — translating the same word twice now
-- creates two rows — so this constraint would reject valid inserts.
-- Constraint name isn't hardcoded here since it wasn't tracked in-repo;
-- this looks it up from pg_constraint by the columns it covers.
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'translate_history'
    AND con.contype = 'u'
    AND (
      SELECT array_agg(attname::text ORDER BY attname::text)
      FROM unnest(con.conkey) AS k(attnum)
      JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
    ) = ARRAY['direction', 'source_text', 'user_id']::text[]
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE translate_history DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

-- Index to keep the "find most recent unsaved row for this word" lookup
-- (used by the PATCH /api/translate-history handler) fast.
CREATE INDEX IF NOT EXISTS idx_translate_history_unsaved_lookup
  ON translate_history (user_id, source_text, direction, saved_at DESC)
  WHERE is_saved = false;
