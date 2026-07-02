-- ════════════════════════════════════════════════════════════════════════════
-- Vocabulary chat — run once on Supabase (SQL editor)
-- Safe to re-run: all statements use IF NOT EXISTS / IF EXISTS.
-- ════════════════════════════════════════════════════════════════════════════

-- Link a practice session to the word it's about (null for regular free-talk sessions).
ALTER TABLE practice_sessions ADD COLUMN IF NOT EXISTS word_id UUID REFERENCES words(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS practice_sessions_word_idx ON practice_sessions (user_id, word_id);
