-- Add definition columns to word_ai_content
ALTER TABLE word_ai_content
  ADD COLUMN IF NOT EXISTS definition_en text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS definition_vi text NOT NULL DEFAULT '';

-- Clear all cached rows so every word gets regenerated with new schema
TRUNCATE TABLE word_ai_content;
