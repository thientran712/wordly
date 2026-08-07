-- Run this in Supabase SQL Editor
-- Caches AI-generated dictionary-style definitions, keyed by lowercased word
-- text (not word_id) so any word the user types can be cached, not just
-- words already present in the `words` table.
CREATE TABLE IF NOT EXISTS word_dictionary_cache (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  word        text NOT NULL UNIQUE,
  phonetic    text NOT NULL DEFAULT '',
  meanings    jsonb NOT NULL DEFAULT '[]',
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE word_dictionary_cache ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read
CREATE POLICY "auth read dictionary cache"
  ON word_dictionary_cache FOR SELECT
  TO authenticated
  USING (true);

-- Service role manages writes (API route uses admin client)
CREATE POLICY "service write dictionary cache"
  ON word_dictionary_cache FOR ALL
  TO service_role
  USING (true);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_word_dictionary_cache_word
  ON word_dictionary_cache (word);
