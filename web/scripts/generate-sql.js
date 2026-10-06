const fs = require('fs');

const data = JSON.parse(fs.readFileSync('./scripts/oxford-5000.json', 'utf-8'));

// Convert object to array
const words = Object.values(data);
console.log(`Loaded ${words.length} words from JSON`);

// Filter & clean
const cleaned = words
  .filter(w => w.word && w.definition) // Phải có word + definition
  .map(w => ({
    word: capitalize(w.word.trim()),
    phonetic: (w.us || w.uk || '').replace(/'/g, "''").trim(),
    pos: (w.type || 'noun').split(',')[0].trim().toLowerCase(),
    level: (w.level || 'B1').toUpperCase(),
    def_en: cleanText(w.definition),
    ex_en: cleanText(w.example || ''),
  }))
  .filter(w => w.def_en.length > 0);

console.log(`Cleaned: ${cleaned.length} words`);

// Generate SQL with chunks of 500 to avoid query size limits
const CHUNK_SIZE = 500;
const chunks = [];
for (let i = 0; i < cleaned.length; i += CHUNK_SIZE) {
  chunks.push(cleaned.slice(i, i + CHUNK_SIZE));
}

let fileIndex = 1;
for (const chunk of chunks) {
  let sql = 'INSERT INTO words (word, phonetic, pos, level, def_en, def_vi, ex_en, ex_vi, synonyms) VALUES\n';
  
  const values = chunk.map(w => 
    `('${escape(w.word)}', '${escape(w.phonetic)}', '${escape(w.pos)}', '${escape(w.level)}', '${escape(w.def_en)}', '', '${escape(w.ex_en)}', '', ARRAY[]::TEXT[])`
  );
  
  sql += values.join(',\n');
  sql += '\nON CONFLICT (word) DO NOTHING;\n';
  
  const filename = `./scripts/oxford-${String(fileIndex).padStart(2, '0')}.sql`;
  fs.writeFileSync(filename, sql);
  console.log(`Generated ${filename} (${chunk.length} words)`);
  fileIndex++;
}

console.log(`\n✅ Total ${cleaned.length} words across ${chunks.length} SQL files`);

// Helpers
function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function cleanText(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}

function escape(s) {
  return String(s || '').replace(/'/g, "''");
}
