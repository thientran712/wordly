-- ════════════════════════════════════════════════════════════════════════════
-- Unified review queue — run once on Supabase (SQL editor)
-- Safe to re-run: all statements use IF NOT EXISTS / IF EXISTS.
-- ════════════════════════════════════════════════════════════════════════════

-- 1. translate_history: add FSRS scheduling columns (same shape as journal_entries)
--    so each EN→VI entry becomes a spaced-repetition card.
ALTER TABLE translate_history ADD COLUMN IF NOT EXISTS state TEXT NOT NULL DEFAULT 'new';
ALTER TABLE translate_history ADD COLUMN IF NOT EXISTS stability NUMERIC;
ALTER TABLE translate_history ADD COLUMN IF NOT EXISTS difficulty NUMERIC;
ALTER TABLE translate_history ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ;
ALTER TABLE translate_history ADD COLUMN IF NOT EXISTS review_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE translate_history ADD COLUMN IF NOT EXISTS lapses INTEGER NOT NULL DEFAULT 0;
ALTER TABLE translate_history ADD COLUMN IF NOT EXISTS scheduled_days NUMERIC;
ALTER TABLE translate_history ADD COLUMN IF NOT EXISTS elapsed_days NUMERIC;
ALTER TABLE translate_history ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS translate_history_due_idx ON translate_history (user_id, due_at);

-- 2. journal_entries: repurpose from "word + meaning_vi" to free-form notes
--    (sentences / lessons / questions encountered during the day).
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS content TEXT;

-- Backfill existing word+meaning entries into the new content field.
UPDATE journal_entries
SET content = trim(word || COALESCE(' — ' || meaning_vi, ''))
WHERE content IS NULL;

ALTER TABLE journal_entries ALTER COLUMN content SET NOT NULL;

-- word / meaning_vi are no longer used by the app — drop once backfilled.
ALTER TABLE journal_entries DROP COLUMN IF EXISTS word;
ALTER TABLE journal_entries DROP COLUMN IF EXISTS meaning_vi;

-- 3. email_log: record which specific entries (translate_history / journal_entries
--    ids) were sent in each email, so the next send can avoid repeating them.
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS entry_ids JSONB;
