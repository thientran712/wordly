-- Run this in Supabase SQL Editor
CREATE TABLE IF NOT EXISTS word_ai_content (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  word_id     int  NOT NULL,
  skill_level text NOT NULL,
  examples    jsonb NOT NULL DEFAULT '[]',
  paragraph   text NOT NULL DEFAULT '',
  created_at  timestamptz DEFAULT now(),
  UNIQUE (word_id, skill_level)
);

ALTER TABLE word_ai_content ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read
CREATE POLICY "auth read ai content"
  ON word_ai_content FOR SELECT
  TO authenticated
  USING (true);

-- Service role manages writes (API routes use admin client)
CREATE POLICY "service write ai content"
  ON word_ai_content FOR ALL
  TO service_role
  USING (true);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_word_ai_word_level
  ON word_ai_content (word_id, skill_level);
