/**
 * generate-gre-sql.js
 *
 * Reads gre-words.json → generates SQL insert files (gre-01.sql, gre-02.sql, ...)
 * Same logic as generate-sql.js but reads from gre-words.json
 *
 * Usage:
 *   node scripts/generate-gre-sql.js
 */

const fs = require('fs');

const data = JSON.parse(fs.readFileSync('./scripts/gre-words.json', 'utf-8'));
const words = Object.values(data);

console.log(`Loaded ${words.length} words from gre-words.json`);

const cleaned = words
  .filter(w => w.word && w.definition)
  .map(w => ({
    word: capitalize(w.word.trim()),
    phonetic: cleanText(w.phon_n_am || ''),
    pos: (w.type || 'adjective').split(',')[0].trim().toLowerCase(),
    level: (w.cefr || 'C1').toUpperCase(),
    def_en: cleanText(w.definition),
    ex_en: cleanText(w.example || ''),
    synonyms: (w.synonyms || []).slice(0, 5).map(s => cleanText(s)).filter(Boolean),
  }))
  .filter(w => w.def_en.length > 5);

console.log(`Cleaned: ${cleaned.length} words`);

const byLevel = {};
for (const w of cleaned) {
  if (!byLevel[w.level]) byLevel[w.level] = 0;
  byLevel[w.level]++;
}
console.log('Distribution:', byLevel);

const CHUNK_SIZE = 500;
const chunks = [];
for (let i = 0; i < cleaned.length; i += CHUNK_SIZE) {
  chunks.push(cleaned.slice(i, i + CHUNK_SIZE));
}

let fileIndex = 1;
for (const chunk of chunks) {
  const values = chunk.map(w => {
    const syns = w.synonyms.map(s => `'${escape(s)}'`).join(',');
    return `('${escape(w.word)}', '${escape(w.phonetic)}', '${escape(w.pos)}', '${w.level}', '${escape(w.def_en)}', '${escape(w.ex_en)}', ARRAY[${syns}]::TEXT[])`;
  });

  const sql =
    `INSERT INTO words (word, phonetic, pos, level, def_en, ex_en, synonyms) VALUES\n` +
    values.join(',\n') +
    `\nON CONFLICT (word) DO NOTHING;\n`;

  const filename = `./scripts/gre-${String(fileIndex).padStart(2, '0')}.sql`;
  fs.writeFileSync(filename, sql);
  console.log(`Generated ${filename} (${chunk.length} words)`);
  fileIndex++;
}

console.log(`\n✅ ${cleaned.length} words across ${chunks.length} SQL files`);
console.log(`Paste gre-01.sql, gre-02.sql... into Supabase SQL Editor to insert.`);

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function cleanText(s) {
  return String(s || '').replace(/\s+/g, ' ').replace(/'/g, "''").trim();
}

function escape(s) {
  return String(s || '').replace(/'/g, "''");
}
