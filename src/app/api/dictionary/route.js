import { createAdminClient } from "@/lib/supabase-admin";
import { getUserFast } from "@/lib/get-user-fast";
import {
  createRateLimiter,
  clientKeyFromRequest,
  rateLimitResponse,
} from "@/lib/rate-limit";

// Route CÔNG KHAI nên phải có rate limit: mỗi lần cache miss là một lượt
// gọi Groq trả phí. Cache toàn cục giúp giảm nhiều, nhưng người gọi từ
// điển liên tục với từ mới vẫn đốt được quota.
//
// Khách: 15 lượt/phút. Đã đăng nhập: 40 lượt/phút.
const guestLimiter = createRateLimiter({ limit: 15, windowMs: 60_000 });
const userLimiter = createRateLimiter({ limit: 40, windowMs: 60_000 });

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const POS_VALUES = ["noun", "verb", "adjective", "adverb", "pronoun", "preposition", "conjunction", "interjection"];

const PROMPT = (word) => `You are an American and British English dictionary. Give a concise, accurate entry for the word "${word}".

For each meaning, pick exactly ONE part of speech from this list: ${POS_VALUES.join(", ")}. Never combine multiple values or copy the list itself — "pos" must be a single word from that list.

Return ONLY valid JSON, no markdown, no extra text, in this exact shape:
{
  "phonetic_us": "/IPA transcription, American English/",
  "phonetic_uk": "/IPA transcription, British English/",
  "meanings": [
    {
      "pos": "adjective",
      "defs": [
        {
          "def": "concise dictionary-style definition in English, do not start with the word itself",
          "def_vi": "short Vietnamese TRANSLATION of def, a few Vietnamese words, not English, not a full sentence",
          "example": "one natural example sentence using the word"
        }
      ]
    }
  ]
}

Rules:
- Each meaning in the array must have a DIFFERENT "pos" value — never repeat the same part of speech across meanings.
- Include up to 3 of the most common meanings, ordered by frequency of use.
- Each meaning has up to 2 definitions with one example each.
- "def_vi" must be written in Vietnamese, e.g. for "resilient" (adjective) def_vi could be "kiên cường, dẻo dai".
- If phonetic_us and phonetic_uk are identical, still return both.
- If "${word}" is not a real English word (typo, gibberish), return {"phonetic_us": "", "phonetic_uk": "", "meanings": []}.`;

export async function POST(request) {
  const user = await getUserFast();
  const limiter = user ? userLimiter : guestLimiter;
  const rl = limiter.check(clientKeyFromRequest(request, user?.id));
  if (!rl.allowed) return rateLimitResponse(rl);

  const { word } = await request.json();
  if (!word || typeof word !== "string" || !word.trim()) {
    return Response.json({ error: "Missing word" }, { status: 400 });
  }

  const key = word.trim().toLowerCase();
  const supabase = createAdminClient();

  const { data: cached } = await supabase
    .from("word_dictionary_cache")
    .select("word, phonetic_us, phonetic_uk, meanings")
    .eq("word", key)
    .single();

  if (cached) {
    return Response.json({
      detail: {
        word: cached.word,
        phoneticUs: cached.phonetic_us,
        phoneticUk: cached.phonetic_uk,
        meanings: cached.meanings,
        // Deterministic, not AI-reported — the 8B model's self-assessment
        // of "are there more meanings?" was unreliable (e.g. "run" → false).
        hasMoreMeanings: cached.meanings.length >= 3,
      },
    });
  }

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: PROMPT(key) }],
      temperature: 0.3,
      max_tokens: 600,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    return Response.json({ error: `AI dictionary error: ${res.status}` }, { status: 502 });
  }

  const data = await res.json();
  let parsed;
  try {
    parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
  } catch {
    return Response.json({ error: "Failed to parse AI response" }, { status: 502 });
  }

  const phoneticUs = parsed.phonetic_us || "";
  const phoneticUk = parsed.phonetic_uk || "";
  const meanings = Array.isArray(parsed.meanings) ? parsed.meanings : [];

  if (meanings.length === 0) {
    return Response.json({ detail: null });
  }

  const row = { word: key, phonetic_us: phoneticUs, phonetic_uk: phoneticUk, meanings };
  const detail = { word: key, phoneticUs, phoneticUk, meanings, hasMoreMeanings: meanings.length >= 3 };

  await supabase
    .from("word_dictionary_cache")
    .upsert(row, { onConflict: "word" });

  return Response.json({ detail });
}
