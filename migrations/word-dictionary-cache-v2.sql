-- Run this in Supabase SQL Editor (after word-dictionary-cache.sql)
-- Splits `phonetic` into US/UK variants and adds Vietnamese meanings per
-- definition. Whether "more meanings" exist is now computed client-side
-- from meanings.length, not stored — no column needed for that.
--
-- Old cached rows don't have def_vi / phonetic_uk — rather than backfill
-- incomplete data, clear the cache so every word regenerates with the
-- new prompt on next lookup.
TRUNCATE TABLE word_dictionary_cache;

ALTER TABLE word_dictionary_cache
  DROP COLUMN IF EXISTS phonetic,
  ADD COLUMN IF NOT EXISTS phonetic_us text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS phonetic_uk text NOT NULL DEFAULT '';
