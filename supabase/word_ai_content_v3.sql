-- Add phonetic IPA and multi-meanings support
ALTER TABLE word_ai_content
  ADD COLUMN IF NOT EXISTS phonetic_ipa text DEFAULT '',
  ADD COLUMN IF NOT EXISTS meanings jsonb DEFAULT '[]';

-- Clear cache so all words regenerate with new schema
TRUNCATE TABLE word_ai_content;
