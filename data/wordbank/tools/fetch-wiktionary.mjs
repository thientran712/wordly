// Lấy IPA (UK/US) từ Wiktionary cho danh sách từ tiếng Anh. Wiktionary: CC BY-SA.
// Dùng: node fetch-wiktionary.mjs <wordlist.json> <out.json>
import { readFileSync, writeFileSync } from "node:fs";

const [listPath, outPath] = process.argv.slice(2);
const list = JSON.parse(readFileSync(listPath, "utf8"));
const words = [...list.en_words, ...list.en_phrases];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Chỉ lấy phần ==English== của trang, rồi các template {{IPA|en|/…/|…|a=…}}
function englishSection(wikitext) {
  const start = wikitext.indexOf("==English==");
  if (start < 0) return "";
  const rest = wikitext.slice(start + 11);
  const next = rest.search(/\n==[^=]/);
  return next < 0 ? rest : rest.slice(0, next);
}

function parseIpa(section) {
  const out = [];
  // Ghi lại tiêu đề Etymology/POS gần nhất để biết IPA thuộc nghĩa nào (vd record noun/verb)
  for (const m of section.matchAll(/\{\{IPA\|en\|([^}]*)\}\}/g)) {
    const parts = m[1].split("|");
    const ipas = parts.filter((p) => /^[/[]/.test(p.trim()));
    const accentArg = parts.find((p) => /^a=/.test(p)) || "";
    const accents = accentArg.replace(/^a=/, "");
    // Ngữ cảnh: dòng chứa template (thường có "{{a|UK}}" hoặc "noun:" ở đầu)
    const lineStart = section.lastIndexOf("\n", m.index) + 1;
    const line = section.slice(lineStart, section.indexOf("\n", m.index) >>> 0);
    out.push({ ipas, accents, line: line.slice(0, 160) });
  }
  return out;
}

const result = {};
for (const w of words) {
  const url = `https://en.wiktionary.org/w/index.php?title=${encodeURIComponent(w.replace(/ /g, "_"))}&action=raw`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "WordlyPilot/0.1 (dictionary research; contact: owner)" } });
    if (!res.ok) { result[w] = { error: res.status }; }
    else result[w] = { ipa: parseIpa(englishSection(await res.text())) };
  } catch (e) { result[w] = { error: e.message }; }
  await sleep(300);
}
writeFileSync(outPath, JSON.stringify(result, null, 2));
const found = Object.values(result).filter((r) => r.ipa?.length).length;
console.log(`${found}/${words.length} mục có IPA → ${outPath}`);
