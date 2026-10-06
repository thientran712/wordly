// Generates new C1/C2 vocabulary organized by Topic x Semantic Family, verifies
// each word with a second independent AI pass, then inserts into `words` +
// `word_layers`. Run manually: node scripts/generate-c1c2-words.mjs
//
// Resumable: progress is written to scripts/.c1c2-progress.json after every
// topic+family batch, so re-running skips batches already completed.

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
const getEnv = (key) => env.match(new RegExp(`^${key}=(.+)$`, "m"))?.[1]?.trim();

const SUPABASE_URL = getEnv("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_KEY = getEnv("SUPABASE_SERVICE_ROLE_KEY");
const GROQ_API_KEY = getEnv("GROQ_API_KEY");
const GEMINI_API_KEY = getEnv("GEMINI_API_KEY");

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const PROGRESS_FILE = new URL("./.c1c2-progress.json", import.meta.url);

const ALL_TOPICS = [
  { key: "business", label: "Business & Strategy" },
  { key: "communication", label: "Communication & Negotiation" },
  { key: "psychology", label: "Psychology & Human Behavior" },
  { key: "technology", label: "Technology & AI" },
  { key: "academic", label: "Academic & IELTS" },
  { key: "daily", label: "Daily Sophisticated English" },
];

// TEST_MODE=1 restricts to 1 topic + 2 families for a cheap smoke test.
const TEST_MODE = process.env.TEST_MODE === "1";
const TOPICS = TEST_MODE ? [ALL_TOPICS[0]] : ALL_TOPICS;

const FAMILIES_PER_TOPIC = TEST_MODE ? 2 : 18;
const WORDS_PER_FAMILY = 8;
const VERIFY_BATCH_SIZE = 15;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function callGroqOnce(messages, { json, model, maxTokens }) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: maxTokens,
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (res.status === 429) return { rateLimited: true };
  if (!res.ok) throw new Error(`Groq error ${res.status}: ${await res.text()}`);

  const data = await res.json();
  return { content: data.choices?.[0]?.message?.content || "" };
}

async function callGemini(messages, { maxTokens = 2000 } = {}) {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");

  // Gemini has no separate system role in this simple call — merge into one user turn.
  const prompt = messages.map((m) => m.content).join("\n\n");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: maxTokens,
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    }
  );

  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return content;
}

// Gemini is the primary model (better JSON reliability than Groq's small models).
// Falls back to Groq's llama-3.1-8b-instant if Gemini errors out for this call.
async function callGroq(messages, { json = true, maxTokens = 2000 } = {}) {
  if (GEMINI_API_KEY) {
    try {
      return await callGemini(messages, { maxTokens });
    } catch (err) {
      console.log(`  Gemini failed (${err.message}) — falling back to Groq...`);
    }
  }

  const GROQ_ATTEMPTS_BEFORE_GIVING_UP = 3;
  for (let attempt = 0; attempt < GROQ_ATTEMPTS_BEFORE_GIVING_UP; attempt++) {
    const result = await callGroqOnce(messages, { json, model: "llama-3.1-8b-instant", maxTokens });
    if (!result.rateLimited) return result.content;

    const wait = Math.min(5000 * (attempt + 1), 15000);
    console.log(`  Groq rate limited, retrying in ${wait}ms (attempt ${attempt + 1}/${GROQ_ATTEMPTS_BEFORE_GIVING_UP})...`);
    await sleep(wait);
  }

  throw new Error("Both Gemini and Groq failed for this call");
}

function parseJsonLoose(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("Could not parse JSON from AI response");
  }
}

function loadProgress() {
  if (existsSync(PROGRESS_FILE)) {
    return JSON.parse(readFileSync(PROGRESS_FILE, "utf-8"));
  }
  return { completedBatches: [], pendingWords: [] };
}

function saveProgress(progress) {
  writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function loadExistingWords() {
  const set = new Set();
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from("words").select("word").range(from, from + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) set.add(row.word.trim().toLowerCase());
    if (data.length < 1000) break;
    from += 1000;
  }
  return set;
}

async function getFamiliesForTopic(topic) {
  const prompt = `List ${FAMILIES_PER_TOPIC} distinct "semantic families" (core meaning clusters like "Increase", "Communicate", "Manage", "Analyze") that are highly relevant to the "${topic.label}" domain for a C1/C2 English learner. Return ONLY valid JSON: {"families": ["Increase", "Manage", ...]}`;

  const content = await callGroq([{ role: "user", content: prompt }]);
  const parsed = parseJsonLoose(content);
  return parsed.families || [];
}

async function generateWordsForFamily(topic, family, existingWords) {
  const excludeSample = [...existingWords].slice(0, 0); // exclusion handled by post-filter; keep prompt short
  const prompt = `List ${WORDS_PER_FAMILY} real, commonly-used C1 or C2 level English words or short phrases that belong to the semantic family "${family}" (words that mean roughly "${family}" but differ in nuance/register — like boost, enhance, elevate for "Increase") AND are naturally used in the "${topic.label}" domain.

For each word return:
- word: the headword (lowercase, no punctuation)
- pos: part of speech (noun/verb/adjective/adverb)
- cefr: "C1" or "C2"
- definition: concise English dictionary-style definition
- example: one natural example sentence using the word
- register: "neutral", "formal", or "informal"
- collocations: array of 3-5 short collocations (e.g. "mitigate risk")
- usage_note: one short note on what NOT to pair it with, or null if not notable
- frequency: integer 1-5 star rating of how common the word is in real-world C1/C2 usage (5 = very common, 1 = rare)

Only include real dictionary words — no proper nouns, no made-up words, no rare scientific jargon.

Return ONLY valid JSON: {"words": [{...}, ...]}`;

  const content = await callGroq([{ role: "user", content: prompt }], { maxTokens: 2500 });
  const parsed = parseJsonLoose(content);
  return parsed.words || [];
}

async function verifyWords(candidates) {
  const valid = [];
  for (let i = 0; i < candidates.length; i += VERIFY_BATCH_SIZE) {
    const batch = candidates.slice(i, i + VERIFY_BATCH_SIZE);
    const prompt = `For each word below, verify: (1) it is a real, correctly-spelled English dictionary word (not a proper noun, not a made-up word, not just an inflected form of a simpler word like a plural or -ing form), (2) its CEFR level is genuinely C1 or C2 for a general adult learner (not a narrow scientific/technical term).

Words: ${JSON.stringify(batch.map((w) => ({ word: w.word, cefr: w.cefr })))}

Return ONLY valid JSON: {"results": [{"word": "...", "valid": true/false, "corrected_cefr": "C1"|"C2"}]}`;

    const content = await callGroq([{ role: "user", content: prompt }], { maxTokens: 1500 });
    const parsed = parseJsonLoose(content);
    const results = parsed.results || [];
    const resultMap = new Map(results.map((r) => [r.word.toLowerCase(), r]));

    for (const candidate of batch) {
      const result = resultMap.get(candidate.word.toLowerCase());
      if (result?.valid) {
        valid.push({ ...candidate, cefr: result.corrected_cefr || candidate.cefr });
      } else {
        console.log(`  ✗ rejected: ${candidate.word}`);
      }
    }
    await sleep(5000);
  }
  return valid;
}

async function insertWords(words, topic, family) {
  for (const w of words) {
    const { data: inserted, error } = await supabase
      .from("words")
      .insert({
        word: w.word.trim().toLowerCase(),
        pos: w.pos || null,
        level: w.cefr,
        def_en: w.definition || null,
        ex_en: w.example || null,
        synonyms: [],
      })
      .select("id")
      .single();

    if (error) {
      console.log(`  insert failed for "${w.word}": ${error.message}`);
      continue;
    }

    const { error: layerError } = await supabase.from("word_layers").insert({
      word_id: inserted.id,
      semantic_family: family,
      topic: topic.key,
      register: w.register || "neutral",
      collocations: w.collocations || [],
      usage_notes: w.usage_note || null,
      frequency: w.frequency || 3,
    });

    if (layerError) console.log(`  layer insert failed for "${w.word}": ${layerError.message}`);
  }
}

async function main() {
  console.log("Loading existing words from DB...");
  const existingWords = await loadExistingWords();
  console.log(`Found ${existingWords.size} existing words.\n`);

  const progress = loadProgress();
  let totalInserted = 0;

  for (const topic of TOPICS) {
    console.log(`\n=== Topic: ${topic.label} ===`);
    const familyBatchKey = `families:${topic.key}`;
    let families;

    if (progress[familyBatchKey]) {
      families = progress[familyBatchKey];
      console.log(`  (resumed families from progress file)`);
    } else {
      families = await getFamiliesForTopic(topic);
      progress[familyBatchKey] = families;
      saveProgress(progress);
      await sleep(5000);
    }

    console.log(`  Families: ${families.join(", ")}`);

    for (const family of families) {
      const batchId = `${topic.key}::${family}`;
      if (progress.completedBatches.includes(batchId)) {
        console.log(`  [skip] ${family} (already done)`);
        continue;
      }

      console.log(`  Generating words for family "${family}"...`);
      try {
        const candidates = await generateWordsForFamily(topic, family, existingWords);
        await sleep(5000);

        const newCandidates = candidates.filter((c) => c.word && !existingWords.has(c.word.trim().toLowerCase()));
        console.log(`    ${candidates.length} generated, ${newCandidates.length} new (not in DB)`);

        if (newCandidates.length > 0) {
          const verified = await verifyWords(newCandidates);
          console.log(`    ${verified.length} passed verification`);

          // Dedup against words already added earlier in this run
          const toInsert = verified.filter((w) => !existingWords.has(w.word.trim().toLowerCase()));
          for (const w of toInsert) existingWords.add(w.word.trim().toLowerCase());

          await insertWords(toInsert, topic, family);
          totalInserted += toInsert.length;
          console.log(`    inserted ${toInsert.length} words. Running total: ${totalInserted}`);
        }

        progress.completedBatches.push(batchId);
        saveProgress(progress);
      } catch (err) {
        console.error(`    ERROR on batch ${batchId}: ${err.message}`);
        console.error(`    Will retry this batch on next run.`);
      }

      await sleep(5000);
    }
  }

  console.log(`\nDone. Total new words inserted: ${totalInserted}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
