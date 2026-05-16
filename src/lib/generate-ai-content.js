
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

function buildPrompt(word, pos, wordLevel, skillLevel, learningGoal) {
  const goalCtx = GOAL_CONTEXT[learningGoal] || GOAL_CONTEXT.daily;
  const levelLabel = LEVEL_LABELS[skillLevel] || "intermediate";

  return `You are an expert lexicographer with the precision of Oxford and Cambridge dictionaries. Create vocabulary learning content for a young Vietnamese adult (age 20–30), English level ${skillLevel} (${levelLabel}).

WORD: "${word}" | Part of speech hint: ${pos} | CEFR: ${wordLevel}
Learner goal: ${goalCtx}

Generate:

1. MEANINGS — Up to 3 most common everyday meanings of "${word}". For each meaning:
   - pos: part of speech for THIS meaning (noun / verb / adjective / adverb / etc.)
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

export async function getOrGenerateWordContent(adminSupabase, { word_id, word, pos, word_level, skill_level, learning_goal }) {
  const sl = skill_level || "B1";

  const { data: cached } = await adminSupabase
    .from("word_ai_content")
    .select("meanings, synonyms")
    .eq("word_id", word_id)
    .eq("skill_level", sl)
    .single();

  if (cached?.meanings?.length > 0) return cached;

  const prompt = buildPrompt(word, pos || "", word_level || "", sl, learning_goal || "daily");

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.75,
        max_tokens: 1500,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) throw new Error(`Groq API error: ${res.status}`);
    const data = await res.json();
    const parsed = JSON.parse(data.choices[0].message.content);
    if (!Array.isArray(parsed.meanings) || parsed.meanings.length === 0) throw new Error("Invalid shape");

    parsed.meanings = parsed.meanings.slice(0, 3);
    if (!Array.isArray(parsed.synonyms)) parsed.synonyms = [];

    await adminSupabase.from("word_ai_content").upsert({
      word_id,
      skill_level: sl,
      meanings: parsed.meanings,
      synonyms: parsed.synonyms,
    }, { onConflict: "word_id,skill_level" });

    return { meanings: parsed.meanings, synonyms: parsed.synonyms };
  } catch (err) {
    console.error("[generate-ai-content] failed:", err.message);
    return null;
  }
}
