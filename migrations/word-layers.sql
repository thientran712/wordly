-- ════════════════════════════════════════════════════════════════════════════
-- Word layers (semantic family, topic, register, collocations, frequency)
-- Run once on Supabase (SQL editor). Safe to re-run: IF NOT EXISTS everywhere.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS word_layers (
  word_id UUID PRIMARY KEY REFERENCES words(id) ON DELETE CASCADE,
  semantic_family TEXT,
  topic TEXT,
  register TEXT,
  collocations JSONB DEFAULT '[]',
  usage_notes TEXT,
  frequency SMALLINT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS word_layers_topic_idx ON word_layers (topic);
CREATE INDEX IF NOT EXISTS word_layers_family_idx ON word_layers (semantic_family);
