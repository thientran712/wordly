/**
 * fetch-gre.js
 *
 * 1. Reads GRE word lists (magoosh-basic, magoosh-common, magoosh-advanced, gre-3000)
 * 2. Labels: magoosh-advanced → C2, everything else → C1
 * 3. Skips words already in Oxford 5000 dataset
 * 4. Fetches definitions from Free Dictionary API (no key needed)
 * 5. Saves progress every 50 words → safe to resume on interrupt
 * 6. Outputs gre-words.json (same format as oxford-5000.json)
 *
 * Usage:
 *   node scripts/fetch-gre.js
 *   node scripts/fetch-gre.js --resume   (continue from saved progress)
 */

const fs = require('fs');
const https = require('https');
const path = require('path');

const DELAY_MS = 300;        // Delay between API requests to avoid rate limiting
const SAVE_EVERY = 50;       // Save progress every N words
const PROGRESS_FILE = './scripts/gre-source/progress.json';
const OUTPUT_FILE = './scripts/gre-words.json';

// ── 1. Load word lists ────────────────────────────────────────────────────────

function loadWordList(filepath) {
  if (!fs.existsSync(filepath)) return new Set();
  return new Set(
    fs.readFileSync(filepath, 'utf-8')
      .replace(/^﻿/, '')       // strip BOM
      .split('\n')
      .map(w => w.trim().toLowerCase())
      .filter(w => w.length > 1 && /^[a-z]/.test(w))
  );
}

const advancedWords = loadWordList('./scripts/gre-source/magoosh-advanced.txt');
const basicWords    = loadWordList('./scripts/gre-source/magoosh-basic.txt');
const commonWords   = loadWordList('./scripts/gre-source/magoosh-common.txt');
const gre3000       = loadWordList('./scripts/gre-source/gre-3000.txt');

// Words already in Oxford 5000
const oxfordData = JSON.parse(fs.readFileSync('./scripts/oxford-5000.json', 'utf-8'));
const oxfordWords = new Set(Object.values(oxfordData).map(w => w.word.toLowerCase()));

// Build final word→level map (advanced = C2, rest = C1), skip oxford
const wordMap = new Map();

for (const w of [...basicWords, ...commonWords, ...gre3000]) {
  if (!oxfordWords.has(w) && !wordMap.has(w)) wordMap.set(w, 'C1');
}
for (const w of advancedWords) {
  if (!oxfordWords.has(w)) wordMap.set(w, 'C2');  // advanced overrides to C2
}

console.log(`📚 Total unique words to fetch: ${wordMap.size}`);
console.log(`   C1: ${[...wordMap.values()].filter(v => v === 'C1').length}`);
console.log(`   C2: ${[...wordMap.values()].filter(v => v === 'C2').length}`);
console.log(`   (skipped ${oxfordWords.size} Oxford 5000 words)`);

// ── 2. Resume from progress if exists ────────────────────────────────────────

const isResume = process.argv.includes('--resume');
let results = {};
let done = new Set();

if (isResume && fs.existsSync(PROGRESS_FILE)) {
  const prog = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
  results = prog.results || {};
  done = new Set(Object.keys(results));
  console.log(`\n▶ Resuming: ${done.size} words already fetched`);
}

// ── 3. API fetch helpers ──────────────────────────────────────────────────────

function fetchDefinition(word) {
  return new Promise((resolve) => {
    const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
    https.get(url, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) return resolve(null);
        try {
          const data = JSON.parse(body);
          resolve(data[0] || null);
        } catch {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

// Prefer pos in this order for learning value
const POS_PRIORITY = ['adjective', 'verb', 'noun', 'adverb'];

function extractBestMeaning(entry) {
  if (!entry || !entry.meanings?.length) return null;

  // Sort meanings by preferred POS
  const sorted = [...entry.meanings].sort((a, b) => {
    const ai = POS_PRIORITY.indexOf(a.partOfSpeech);
    const bi = POS_PRIORITY.indexOf(b.partOfSpeech);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  for (const meaning of sorted) {
    const def = meaning.definitions.find(d => d.definition?.length > 10);
    if (!def) continue;

    // Find example anywhere in this meaning
    const example = meaning.definitions.find(d => d.example)?.example || '';
    const synonyms = [
      ...(meaning.synonyms || []),
      ...meaning.definitions.flatMap(d => d.synonyms || []),
    ].slice(0, 5);

    return {
      pos: meaning.partOfSpeech,
      definition: def.definition,
      example,
      synonyms,
    };
  }
  return null;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── 4. Main fetch loop ────────────────────────────────────────────────────────

async function main() {
  const allWords = [...wordMap.entries()].filter(([w]) => !done.has(w));
  let fetched = 0;
  let failed = 0;

  console.log(`\n🚀 Fetching ${allWords.length} words...\n`);

  for (const [word, level] of allWords) {
    process.stdout.write(`  [${fetched + failed + done.size + 1}/${wordMap.size}] ${word}... `);

    const entry = await fetchDefinition(word);
    const meaning = extractBestMeaning(entry);

    if (!meaning) {
      process.stdout.write('❌ not found\n');
      failed++;
    } else {
      const phonetic = entry.phonetic || entry.phonetics?.find(p => p.text)?.text || '';
      results[word] = {
        word,
        type: meaning.pos,
        cefr: level.toLowerCase(),
        phon_n_am: phonetic,
        definition: meaning.definition,
        example: meaning.example,
        synonyms: meaning.synonyms,
      };
      process.stdout.write(`✅ ${level}\n`);
      fetched++;
    }

    // Save progress periodically
    if ((fetched + failed) % SAVE_EVERY === 0) {
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ results }, null, 2));
    }

    await delay(DELAY_MS);
  }

  // Final save
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ results }, null, 2));

  // ── 5. Output gre-words.json ─────────────────────────────────────────────
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));

  console.log(`\n✅ Done!`);
  console.log(`   Fetched: ${Object.keys(results).length} words`);
  console.log(`   Failed:  ${failed} words (not in dictionary)`);
  console.log(`   Output:  ${OUTPUT_FILE}`);
  console.log(`\nNext step: node scripts/generate-gre-sql.js`);
}

main().catch(console.error);
