-- Add synonyms column and move phonetic to per-meaning (stored in meanings jsonb)
ALTER TABLE word_ai_content
  ADD COLUMN IF NOT EXISTS synonyms jsonb DEFAULT '[]';

-- Clear cache so all words regenerate with per-meaning phonetics and synonyms
TRUNCATE TABLE word_ai_content;
