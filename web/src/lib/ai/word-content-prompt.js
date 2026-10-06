// Prompt + hậu kiểm cho nội dung AI của thẻ từ vựng.
//
// Vì sao tách khỏi generate-ai-content.js: file kia phải import supabase và
// ai-models nên không test được bằng `node --test`. Theo đúng ghi chú trong
// CLAUDE.md — logic thuần thì tách ra src/lib/ để test được. File này KHÔNG
// import gì, giống guardian-links.js / quiz-generation.js.

const GOAL_CONTEXT = {
  toeic:    "professional and business environments, office settings, workplace communication",
  ielts:    "academic, social, and professional settings with formal tone",
  business: "entrepreneurship, startups, career growth, and corporate life",
  travel:   "travel adventures, cultural experiences, and meeting new people",
  daily:    "everyday modern life for young Vietnamese adults",
};

const LEVEL_LABELS = {
  A1: "absolute beginner",
  A2: "elementary",
  B1: "intermediate",
  B2: "upper-intermediate",
  C1: "advanced",
  C2: "proficient/near-native",
};

export const MAX_MEANINGS = 3;

/**
 * Bỏ các nghĩa trùng part of speech và cắt còn tối đa 3.
 *
 * Vì sao cần lớp này: đo thật 9/2026 thấy AI trả "run" với CẢ 3 nghĩa đều
 * pos="verb" (mất hẳn nghĩa danh từ "a run"), "record" có lượt trả
 * [noun, verb, noun]. Prompt đã được siết, nhưng model vẫn có thể trả trùng
 * nên không phó thác hết cho AI — chắn thêm ở code.
 *
 * Giữ nghĩa ĐẦU TIÊN của mỗi pos vì prompt yêu cầu sắp theo độ phổ biến.
 */
export function dedupeMeaningsByPos(meanings) {
  if (!Array.isArray(meanings)) return [];

  const seen = new Set();
  const out = [];

  for (const m of meanings) {
    if (!m || typeof m !== "object") continue;

    // Nghĩa thiếu pos vẫn giữ — thà thiếu nhãn hơn mất cả nghĩa
    const key = typeof m.pos === "string" ? m.pos.trim().toLowerCase() : null;
    if (key) {
      if (seen.has(key)) continue;
      seen.add(key);
    }

    out.push(m);
    if (out.length >= MAX_MEANINGS) break;
  }

  return out;
}

/** Prompt sinh nội dung thẻ từ vựng. */
export function buildWordContentPrompt(word, pos, wordLevel, skillLevel, learningGoal) {
  const goalCtx = GOAL_CONTEXT[learningGoal] || GOAL_CONTEXT.daily;
  const levelLabel = LEVEL_LABELS[skillLevel] || "intermediate";

  return `You are an expert lexicographer with the precision of Oxford and Cambridge dictionaries. Create vocabulary learning content for a young Vietnamese adult (age 20–30), English level ${skillLevel} (${levelLabel}).

WORD: "${word}" | Part of speech hint: ${pos} | CEFR: ${wordLevel}
Learner goal: ${goalCtx}

Generate:

1. MEANINGS — Up to ${MAX_MEANINGS} most common everyday meanings of "${word}", ordered by frequency of use.

   CRITICAL: Each meaning MUST have a DIFFERENT "pos" value — never repeat the same part of speech across meanings. If a word is commonly used as several parts of speech, cover those different parts of speech rather than listing near-identical senses.
   • "run" → verb (to move fast on foot) + noun (an act of running) + adjective — NOT three verb senses
   • "record" → noun /ˈrɛkərd/ (a document/best result) + verb /rɪˈkɔːrd/ (to store sound) — NOT two noun senses
   • "light" → noun (brightness) + adjective (not heavy) + verb (to ignite)
   If "${word}" genuinely only works as ONE part of speech, return just ONE meaning — a single accurate meaning is better than padding with duplicates.

   For each meaning:
   - pos: part of speech for THIS meaning (noun / verb / adjective / adverb / etc.), a single value
   - phonetic_ipa: IPA transcription, strictly American English (General American), for THIS specific meaning. Use different IPA when stress/vowel shifts by POS (e.g. noun "record" /ˈrɛkərd/ vs verb /rɪˈkɔːrd/). If pronunciation is identical across meanings, repeat the same IPA. Always wrap in slashes /.../.
   - memory_vi: 1–2 câu tiếng Việt cực ngắn, thô tục nhẹ, gắt gỏng, giúp nhớ nghĩa ngay lập tức. BẮT BUỘC: luôn xưng mày-tao, giọng bạn thân nói thẳng không lọc, mạnh bạo, hơi hung, có thể chửi nhẹ kiểu đường phố nhưng không dùng từ tục nặng. Phải đúng nghĩa từ, buồn cười, khắc vào đầu.
     Ví dụ:
     "besmirch"     → "Tao vừa bị con nào đó dìm hàng sau lưng, giờ cả đám nhìn tao như nhìn cái thứ gì đó tệ hại — đó là bị besmirch đấy mày."
     "resilient"    → "Mày ngã, mày khóc, xong mày đứng dậy — đừng có mà nằm đó ăn vạ mãi, thằng nào resilient là thằng đó sống sót."
     "eloquent"     → "Tao mở miệng ra là cả phòng im thin thít, không phải tao ngầu — tao eloquent đấy, nói hay vl luôn."
     "procrastinate" → "Mày hỏi tao bài tập đâu? Tao để mai làm. Hôm qua tao cũng nói vậy. Đó gọi là procrastinate, lười có hệ thống."
     "ephemeral"    → "Cái thời mày và crush nhắn tin cả đêm — ngắn vl, phai nhanh như đá lạnh ngoài trời — ephemeral đó mày."
   - definition_en: concise Oxford-style English definition. Do not start with the word itself.
   - definition_vi: natural Vietnamese translation + nuance note if needed
   - examples: exactly 3 examples, one per context below. Each example is 1–2 sentences, vivid and relatable for young Vietnamese adults (20–30). Use this specific meaning of the word.
       • context "love"  — romance, relationships, heartbreak, dating
       • context "life"  — personal growth, lifestyle, everyday moments
       • context "work"  — career, ambition, workplace dynamics

2. SYNONYMS — Up to 5 synonyms or near-synonyms for "${word}" overall. Return an empty array [] if there are none.

Complexity rules:
- definition_en: formal, dictionary-grade language
- examples: vocabulary appropriate for ${skillLevel} (${levelLabel}) learners
- Be specific and emotionally resonant. Avoid generic textbook sentences.

Return ONLY valid JSON, no markdown, no extra text:
{
  "meanings": [
    {
      "pos": "...",
      "phonetic_ipa": "/..../",
      "memory_vi": "...",
      "definition_en": "...",
      "definition_vi": "...",
      "examples": [
        { "context": "love", "sentence": "..." },
        { "context": "life", "sentence": "..." },
        { "context": "work", "sentence": "..." }
      ]
    }
  ],
  "synonyms": ["...", "..."]
}`;
}
