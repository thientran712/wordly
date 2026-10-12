import { getUserFast } from "@/lib/auth/get-user-fast";
import { callGroq } from "@/lib/ai/ai-models";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimitResponse } from "@/lib/security/rate-limit";
import { checkRateLimitDb, firstBlockedLimit } from "@/lib/security/rate-limit-db";

// ── Hạn mức gợi ý từ vựng (chặn chi phí AI) ─────────────────────────────
// Route chỉ cho người đã đăng nhập (không nằm trong PUBLIC_API_PATHS) nên
// đếm theo user id. Mỗi lần quay câu hỏi = một lần gọi AI, chưa có cache.
// • 20 lần/phút: quay + đọc câu hỏi + chuẩn bị trả lời mất vài chục giây
//   mỗi câu, người thật khó quá ~5-10 lần/phút kể cả khi quay liên tục.
// • 200 lần/ngày: dư cho buổi luyện dài, chặn script gọi cả ngày.
// Bộ đếm POSTGRES (rate-limit-db.js) — bộ đếm RAM không chặn được gì trên
// Vercel.
const VOCAB_SUGGEST_LIMITS = [
  { scope: "vocab-suggest-min", limit: 20, windowMs: 60_000 },
  { scope: "vocab-suggest-day", limit: 200, windowMs: 86_400_000 },
];


// Nuances the kind of vocabulary suggested per tab, without changing the
// output shape — IELTS wants exam-safe vocab, interview wants professional
// vocab, deep talk wants more reflective/abstract vocab.
const KIND_CONTEXT = {
  ielts: "This is an IELTS Speaking question. Suggest vocabulary that would raise the lexical resource score if used naturally in a spoken answer — exam-appropriate, not overly academic or unnatural to say out loud.",
  interview: "This is a job interview question. Suggest professional, workplace-appropriate vocabulary that would make a spoken answer sound more articulate and confident.",
  deep_talk: "This is a deep, reflective conversation question about self-knowledge, relationships, or philosophy of life. Suggest more nuanced, reflective vocabulary suited to thoughtful spoken discussion.",
};

const PROMPT = (question, kindContext) => `You are an English vocabulary coach helping a learner prepare to speak about the following question.

Question: "${question}"

${kindContext}

Suggest exactly 2 English words or short phrases that would naturally strengthen a spoken answer to this specific question — words genuinely relevant to this question's topic, not generic filler vocabulary. Prefer words a learner at B1-C1 level would find useful and memorable, not overly rare/academic.

For each word, give:
- word: the word or short phrase itself
- ipa: IPA pronunciation, American English, wrapped in slashes
- meaning_vi: short, clear Vietnamese meaning (a few words, not a full sentence)
- example: one natural English example sentence using the word, ideally related to the question's topic

Return ONLY valid JSON, no markdown, no extra text:
{
  "words": [
    { "word": "...", "ipa": "/.../", "meaning_vi": "...", "example": "..." },
    { "word": "...", "ipa": "/.../", "meaning_vi": "...", "example": "..." }
  ]
}`;

export async function POST(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Bị chặn trả 429 chuẩn: web (`d.words || []`) và iOS (`try? ... ?? []`)
  // đều coi lỗi là "không có gợi ý", không vỡ giao diện.
  const blocked = await firstBlockedLimit(
    VOCAB_SUGGEST_LIMITS.map(({ scope, limit, windowMs }) => () =>
      checkRateLimitDb({ supabase: createAdminClient(), scope, clientKey: `u:${user.id}`, limit, windowMs })
    )
  );
  if (blocked) return rateLimitResponse(blocked);

  const { question, kind } = await request.json();
  if (!question || typeof question !== "string") {
    return Response.json({ error: "Missing question" }, { status: 400 });
  }

  const kindContext = KIND_CONTEXT[kind] || KIND_CONTEXT.ielts;

  try {
    const { res } = await callGroq("fast", {
        messages: [{ role: "user", content: PROMPT(question.slice(0, 500), kindContext) }],
        temperature: 0.8,
        max_tokens: 400,
      response_format: { type: "json_object" },
    });

    if (!res.ok) return Response.json({ words: [] });

    const data = await res.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
    const words = Array.isArray(parsed.words) ? parsed.words.slice(0, 2) : [];

    // Bonus-feature failure mode: never surface an error to the UI for a
    // malformed/empty AI response — just report no suggestions available.
    const valid = words.filter((w) => w?.word && w?.example);
    return Response.json({ words: valid });
  } catch {
    return Response.json({ words: [] });
  }
}
