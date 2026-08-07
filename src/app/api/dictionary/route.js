import { createAdminClient } from "@/lib/supabase-admin";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const PROMPT = (word) => `You are an American English dictionary. Give a concise, accurate entry for the word "${word}".

Return ONLY valid JSON, no markdown, no extra text, in this exact shape:
{
  "phonetic": "/IPA transcription, American English/",
  "meanings": [
    {
      "pos": "noun | verb | adjective | adverb | pronoun | preposition | conjunction | interjection",
      "defs": [
        { "def": "concise dictionary-style definition, do not start with the word itself", "example": "one natural example sentence using the word" }
      ]
    }
  ]
}

Rules:
- Include up to 3 of the most common meanings, ordered by frequency of use.
- Each meaning has up to 2 definitions with one example each.
- If "${word}" is not a real English word (typo, gibberish), return {"phonetic": "", "meanings": []}.`;

export async function POST(request) {
  const { word } = await request.json();
  if (!word || typeof word !== "string" || !word.trim()) {
    return Response.json({ error: "Missing word" }, { status: 400 });
  }

  const key = word.trim().toLowerCase();
  const supabase = createAdminClient();

  const { data: cached } = await supabase
    .from("word_dictionary_cache")
    .select("word, phonetic, meanings")
    .eq("word", key)
    .single();

  if (cached) return Response.json({ detail: cached });

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

  const phonetic = parsed.phonetic || "";
  const meanings = Array.isArray(parsed.meanings) ? parsed.meanings : [];

  if (meanings.length === 0) {
    return Response.json({ detail: null });
  }

  const detail = { word: key, phonetic, meanings };

  await supabase
    .from("word_dictionary_cache")
    .upsert({ word: key, phonetic, meanings }, { onConflict: "word" });

  return Response.json({ detail });
}
