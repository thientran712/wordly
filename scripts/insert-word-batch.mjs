// Inserts a hand-authored batch of words + layers into Supabase.
// Input: a JSON file (see scripts/word-batches/*.json) with shape:
// { "topic": "technology", "family": "Automate", "words": [ {...}, ... ] }
//
// Run: node scripts/insert-word-batch.mjs scripts/word-batches/technology-automate.json

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
const getEnv = (key) => env.match(new RegExp(`^${key}=(.+)$`, "m"))?.[1]?.trim();
const supabase = createClient(getEnv("NEXT_PUBLIC_SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"));

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: node scripts/insert-word-batch.mjs <path-to-batch.json>");
  process.exit(1);
}

const batch = JSON.parse(readFileSync(filePath, "utf-8"));
const { topic, family, words } = batch;

if (!topic || !family || !Array.isArray(words)) {
  console.error("Batch file must have { topic, family, words: [] }");
  process.exit(1);
}

async function main() {
  const { data: existingRows } = await supabase
    .from("words")
    .select("word")
    .in("word", words.map((w) => w.word.trim().toLowerCase()));
  const existing = new Set((existingRows || []).map((r) => r.word));

  let inserted = 0;
  for (const w of words) {
    const wordLower = w.word.trim().toLowerCase();
    if (existing.has(wordLower)) {
      console.log(`  [skip] "${wordLower}" already in DB`);
      continue;
    }

    const { data: row, error } = await supabase
      .from("words")
      .insert({
        word: wordLower,
        pos: w.pos || null,
        level: w.cefr,
        def_en: w.definition || null,
        ex_en: w.example || null,
        synonyms: [],
      })
      .select("id")
      .single();

    if (error) {
      console.log(`  [error] insert "${wordLower}": ${error.message}`);
      continue;
    }

    const { error: layerError } = await supabase.from("word_layers").insert({
      word_id: row.id,
      semantic_family: family,
      topic,
      register: w.register || "neutral",
      collocations: w.collocations || [],
      usage_notes: w.usage_note || null,
      frequency: w.frequency || 3,
    });

    if (layerError) {
      console.log(`  [error] layer "${wordLower}": ${layerError.message}`);
      continue;
    }

    inserted++;
    console.log(`  [ok] ${wordLower} (${w.cefr})`);
  }

  console.log(`\nDone: ${inserted}/${words.length} inserted for ${topic}::${family}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
