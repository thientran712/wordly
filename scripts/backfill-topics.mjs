// One-time backfill: assigns a topic to every word in `words` that doesn't
// already have a `word_layers` row, using the rule-based classifier (no AI
// calls, no API quota risk). Words that already have a curated topic (the
// original hand-authored 104) are left untouched.
//
// Run: node scripts/backfill-topics.mjs

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { classifyTopic } from "../src/lib/topic-classifier.js";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
const getEnv = (key) => env.match(new RegExp(`^${key}=(.+)$`, "m"))?.[1]?.trim();
const supabase = createClient(getEnv("NEXT_PUBLIC_SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"));

async function fetchAllWords() {
  let all = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("words")
      .select("id, word, pos, def_en")
      .range(from, from + 999);
    if (error) throw error;
    if (!data.length) break;
    all = all.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
}

async function fetchExistingLayerIds() {
  let ids = new Set();
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("word_layers")
      .select("word_id")
      .range(from, from + 999);
    if (error) throw error;
    if (!data.length) break;
    for (const row of data) ids.add(row.word_id);
    if (data.length < 1000) break;
    from += 1000;
  }
  return ids;
}

async function main() {
  console.log("Fetching words + existing word_layers...");
  const [allWords, existingIds] = await Promise.all([fetchAllWords(), fetchExistingLayerIds()]);
  console.log(`Total words: ${allWords.length}, already tagged: ${existingIds.size}`);

  const toInsert = allWords
    .filter((w) => !existingIds.has(w.id))
    .map((w) => ({
      word_id: w.id,
      topic: classifyTopic(w),
      semantic_family: null,
      frequency: 3,
    }));

  console.log(`Backfilling topics for ${toInsert.length} words...`);

  const chunkSize = 500;
  let done = 0;
  for (let i = 0; i < toInsert.length; i += chunkSize) {
    const chunk = toInsert.slice(i, i + chunkSize);
    const { error } = await supabase.from("word_layers").insert(chunk);
    if (error) {
      console.error(`Insert failed at chunk ${i}:`, error.message);
      process.exit(1);
    }
    done += chunk.length;
    console.log(`  inserted ${done}/${toInsert.length}`);
  }

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
