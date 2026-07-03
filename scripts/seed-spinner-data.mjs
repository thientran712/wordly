// One-time seed: parses the reference project's raw SQL INSERT tuples
// (topics-full.sql, seed.sql — from the standalone speaking-practice repo)
// and loads them into Wordly's own spinner_* tables. Safe to re-run: skips
// insertion entirely if a table already has rows, so it won't duplicate data.
//
// Run: node scripts/seed-spinner-data.mjs

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
const getEnv = (key) => env.match(new RegExp(`^${key}=(.+)$`, "m"))?.[1]?.trim();
const supabase = createClient(getEnv("NEXT_PUBLIC_SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"));

const REF_DIR = "/Users/thientran/Downloads/Working Companies/Dự án cá nhân/speaking-practice/supabase";

// A SQL file may contain multiple `insert into x (...) values (...), ...;`
// statements for the same table (e.g. topics-full.sql has 2 separate blocks).
// Finds every such statement, splits each into its individual `(...)` tuples,
// then parses each tuple's comma-separated SQL literals into a JS array of
// strings, honoring '' as an escaped quote.
function parseTuples(sql, tableName) {
  const tuples = [];
  const pattern = new RegExp(`insert into ${tableName}\\s*\\([^)]*\\)\\s*values`, "g");
  let match;
  while ((match = pattern.exec(sql)) !== null) {
    const rest = sql.slice(match.index + match[0].length);
    const endIdx = rest.indexOf(";");
    const block = endIdx === -1 ? rest : rest.slice(0, endIdx);
    tuples.push(...parseValuesBlock(block));
  }
  return tuples;
}

function parseValuesBlock(block) {
  const tuples = [];
  let depth = 0, current = "", inString = false;
  for (let i = 0; i < block.length; i++) {
    const ch = block[i];
    if (ch === "'" ) {
      inString = !inString;
      current += ch;
      continue;
    }
    if (!inString && ch === "(") { depth++; if (depth === 1) { current = ""; continue; } }
    if (!inString && ch === ")") {
      depth--;
      if (depth === 0) { tuples.push(parseTuple(current)); continue; }
    }
    if (depth >= 1) current += ch;
  }
  return tuples;
}

function parseTuple(tupleStr) {
  const fields = [];
  let current = "", inString = false;
  for (let i = 0; i < tupleStr.length; i++) {
    const ch = tupleStr[i];
    if (ch === "'") {
      // Handle doubled '' as an escaped quote within a string literal
      if (inString && tupleStr[i + 1] === "'") { current += "'"; i++; continue; }
      inString = !inString;
      continue;
    }
    if (!inString && ch === ",") { fields.push(current.trim()); current = ""; continue; }
    current += ch;
  }
  if (current.trim() !== "") fields.push(current.trim());
  return fields;
}

async function tableHasRows(table) {
  const { count } = await supabase.from(table).select("*", { count: "exact", head: true });
  return (count || 0) > 0;
}

async function insertBatches(table, rows) {
  const chunkSize = 500;
  let done = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from(table).insert(chunk);
    if (error) { console.error(`Insert failed for ${table} at chunk ${i}:`, error.message); process.exit(1); }
    done += chunk.length;
    console.log(`  ${table}: inserted ${done}/${rows.length}`);
  }
}

async function seedTopics() {
  if (await tableHasRows("spinner_topics")) { console.log("spinner_topics already has data, skipping."); return; }

  const files = ["topics-full.sql", "seed.sql"];
  const rows = [];
  const seen = new Set();
  for (const file of files) {
    const sql = readFileSync(`${REF_DIR}/${file}`, "utf-8");
    const tuples = parseTuples(sql, "topics");
    for (const [text, difficulty, category, language] of tuples) {
      const key = `${text}::${language}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ text, difficulty, category, language });
    }
  }
  console.log(`Parsed ${rows.length} unique topics.`);
  await insertBatches("spinner_topics", rows);
}

async function seedInterviewQuestions() {
  if (await tableHasRows("spinner_interview_questions")) { console.log("spinner_interview_questions already has data, skipping."); return; }

  const sql = readFileSync(`${REF_DIR}/seed.sql`, "utf-8");
  const tuples = parseTuples(sql, "interview_questions");
  const rows = tuples.map(([text, framework, category]) => ({ text, framework, category }));
  console.log(`Parsed ${rows.length} interview questions.`);
  await insertBatches("spinner_interview_questions", rows);
}

async function seedVocab() {
  if (await tableHasRows("spinner_vocab")) { console.log("spinner_vocab already has data, skipping."); return; }

  const sql = readFileSync(`${REF_DIR}/seed.sql`, "utf-8");
  const tuples = parseTuples(sql, "vocabulary");
  const rows = tuples.map(([word, pos, definition, sentence, angle, difficulty, language]) => ({
    word, pos, definition, sentence, angle, difficulty, language,
  }));
  console.log(`Parsed ${rows.length} vocab words.`);
  await insertBatches("spinner_vocab", rows);
}

async function main() {
  await seedTopics();
  await seedInterviewQuestions();
  await seedVocab();
  console.log("Done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
