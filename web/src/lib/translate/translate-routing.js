// Logic thuần cho dịch lai DeepL + Gemini (tách khỏi route để test được).
//
// Vì sao: DeepL tính ~$25/1 triệu ký tự, ~95% ký tự đến từ CÂU chứ không phải
// từ đơn. Đánh giá mù 75 mục (10/2026):
//   • Câu/đoạn: gemini-3.5-flash-lite ngang DeepL → chuyển sang Gemini
//   • Từ đơn: Gemini đôi khi BỊA từ tiếng Việt (5/40, vd. awkward → "vềnh",
//     resilient → "kiên hồi") → từ đơn/cụm ngắn BẮT BUỘC ở lại DeepL
import { createHash } from "node:crypto";
import { parseJsonResponse } from "../ai/ai-models.js";

const MAX_SHORT_WORDS = 3;

/**
 * Chọn nhà dịch cho CẢ đầu vào: ≤3 từ → DeepL (kể cả có dấu câu, vd.
 * "resilient." vẫn là từ đơn), còn lại (câu, đoạn) → Gemini.
 */
export function chooseEngine(text) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return words <= MAX_SHORT_WORDS ? "deepl" : "gemini";
}

const TERMINATOR_RE = /[.!?…]/;
const CLOSER_RE = /["'”’)\]]/;
const WS_RE = /\s/;
const LOWER_RE = /\p{Ll}/u;
// Viết tắt hay gặp — dấu chấm sau chúng KHÔNG phải hết câu ("Mr. Smith")
const ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "vs", "etc", "e.g", "i.e", "no", "vol", "fig", "approx",
]);

function endsWithAbbreviation(chunk) {
  const m = chunk.match(/(\S+)\.$/);
  return Boolean(m && ABBREVIATIONS.has(m[1].toLowerCase().replace(/^["'(“‘[]+/, "")));
}

/**
 * Tách văn bản thành câu, GIỮ NGUYÊN phần phân cách (khoảng trắng, xuống
 * dòng) để ghép bản dịch lại đúng bố cục.
 *
 * Ranh giới câu:
 *   • xuống dòng (luôn luôn)
 *   • . ! ? … (kèm nháy/ngoặc đóng) rồi khoảng trắng, NẾU chữ kế tiếp không
 *     phải chữ thường và từ trước dấu chấm không phải viết tắt
 *
 * @returns {{ leading: string, parts: {text: string, trailing: string}[] }}
 *   ghép lại: leading + Σ(text + trailing) === văn bản gốc
 */
export function splitSentences(text) {
  const leading = text.match(/^\s*/)[0];
  const parts = [];
  const n = text.length;
  let start = leading.length;
  let i = start;

  const push = (end, sepEnd) => {
    const sep = text.slice(end, sepEnd);
    if (end > start) parts.push({ text: text.slice(start, end), trailing: sep });
    else if (parts.length) parts[parts.length - 1].trailing += text.slice(start, sepEnd);
    start = sepEnd;
  };
  const skipWs = (j) => {
    while (j < n && WS_RE.test(text[j])) j++;
    return j;
  };

  while (i < n) {
    const ch = text[i];
    if (ch === "\n") {
      // Khoảng trắng cuối dòng thuộc phần phân cách, không thuộc câu
      let end = i;
      while (end > start && (text[end - 1] === " " || text[end - 1] === "\t" || text[end - 1] === "\r")) end--;
      const sepEnd = skipWs(i);
      push(end, sepEnd);
      i = sepEnd;
      continue;
    }
    if (TERMINATOR_RE.test(ch)) {
      let j = i;
      while (j < n && TERMINATOR_RE.test(text[j])) j++;
      while (j < n && CLOSER_RE.test(text[j])) j++;
      if (j < n && WS_RE.test(text[j])) {
        const k = skipWs(j);
        const nextIsLower = k < n && LOWER_RE.test(text[k]);
        const hasNewline = text.slice(j, k).includes("\n");
        if (k < n && (hasNewline || (!nextIsLower && !endsWithAbbreviation(text.slice(start, j).replace(CLOSER_RE, ""))))) {
          push(j, k);
          i = k;
          continue;
        }
      }
      i = j;
      continue;
    }
    i++;
  }

  if (start < n) {
    const rest = text.slice(start);
    const body = rest.replace(/\s+$/, "");
    if (body) parts.push({ text: body, trailing: rest.slice(body.length) });
    else if (parts.length) parts[parts.length - 1].trailing += rest;
  }
  return { leading, parts };
}

/** Ghép bản dịch (cùng thứ tự với parts) kèm phân cách gốc. */
export function joinSentences(leading, parts, translations) {
  return leading + parts.map((p, i) => translations[i] + p.trailing).join("");
}

/** Chuẩn hoá trước khi băm: bỏ khoảng trắng đầu cuối, gộp khoảng trắng giữa. Giữ hoa/thường. */
export function normalizeForCache(text) {
  return text.trim().replace(/\s+/g, " ");
}

/**
 * Khoá cache bền (Postgres) và RAM: sha256 của chiều dịch + văn bản chuẩn hoá.
 * Băm để khoá có độ dài cố định (đoạn dài tới 10k ký tự vẫn ra 64 ký tự).
 */
export function persistentCacheKey(text, source, target) {
  return createHash("sha256").update(`${source}>${target}:${normalizeForCache(text)}`).digest("hex");
}

const LANG_NAMES = { EN: "English", VI: "Vietnamese" };

/** System prompt — bản đã dùng khi đánh giá, chuyển sang dạng mảng JSON. */
export function buildTranslateSystemPrompt(source, target, count) {
  const src = LANG_NAMES[source] || source;
  const tgt = LANG_NAMES[target] || target;
  return `You are a ${src}→${tgt} translator inside a vocabulary-learning app for Vietnamese learners.
The user message is a JSON object {"texts": [...]}. Each item is an independent sentence or paragraph from the same document; translate each one separately, in order.
Sentence or paragraph: one natural, fluent translation that keeps the tone. If the input has an obvious typo, translate the intended word.
Output ONLY the translation, as JSON: {"translations": [...]} with exactly ${count} strings, item i being the translation of texts[i]. No notes, no explanations, no markdown.`;
}

/**
 * Đọc phản hồi Gemini. Trả mảng chuỗi đúng `expected` phần tử, hoặc null
 * nếu sai bất kỳ điều gì (→ caller tụt về DeepL).
 */
export function parseGeminiTranslations(content, expected) {
  const parsed = parseJsonResponse(content);
  const arr = parsed?.translations;
  if (!Array.isArray(arr) || arr.length !== expected) return null;
  if (!arr.every((s) => typeof s === "string" && s.trim())) return null;
  return arr.map((s) => s.trim());
}

/**
 * max_tokens theo độ dài đầu vào — có chặn trên để một request không đốt
 * quá nhiều token. Bị cắt giữa chừng → JSON hỏng → tụt về DeepL, vẫn đúng.
 */
export function translateMaxTokens(totalChars) {
  return Math.min(8192, Math.max(256, Math.ceil(totalChars * 0.75) + 200));
}
