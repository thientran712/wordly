const fs = require('fs');

const data = JSON.parse(fs.readFileSync('./scripts/oxford-5000.json', 'utf-8'));
const words = Object.values(data);

console.log(`Loaded ${words.length} words from JSON`);

// Group by level
const byLevel = {};
for (const w of words) {
  if (!w.word || !w.cefr) continue;
  const level = w.cefr.toUpperCase();
  if (!byLevel[level]) byLevel[level] = [];
  byLevel[level].push(capitalize(w.word.trim()));
}

console.log('\nLevels distribution:');
for (const level in byLevel) {
  console.log(`  ${level}: ${byLevel[level].length} words`);
}

// Generate UPDATE statements
let sql = '-- Update levels from Oxford 5000 dataset\n\n';

for (const level in byLevel) {
  const words = byLevel[level].map(w => `'${escape(w)}'`).join(', ');
  sql += `UPDATE words SET level = '${level}' WHERE word IN (${words});\n\n`;
}

fs.writeFileSync('./scripts/update-levels.sql', sql);
console.log('\n✅ Generated ./scripts/update-levels.sql');
console.log(`File size: ${(fs.statSync('./scripts/update-levels.sql').size / 1024).toFixed(1)} KB`);

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function escape(s) {
  return String(s || '').replace(/'/g, "''");
}
