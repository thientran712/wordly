import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { openai } from "@/lib/openai";

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

  return `You are a vocabulary teacher creating content for a young Vietnamese adult (age 20–30) learning English.

Word: "${word}" | Part of speech: ${pos} | CEFR level: ${wordLevel}
Learner's English level: ${skillLevel} (${levelLabel})
Their learning goal: ${goalCtx}

Generate the following in English:
1. Three vivid, memorable example sentences using "${word}" — one for each context below:
   - 💕 Romance / relationships / dating
   - 🌿 Daily life / lifestyle / personal growth
   - 💼 Work / career / ambition
2. One short paragraph (3–4 sentences) that tells a micro-story naturally featuring "${word}". Make it emotionally engaging and relatable.

Rules:
- Match vocabulary complexity to ${skillLevel} level — do NOT use words harder than this level in the examples
- Be specific, vivid, and avoid generic filler sentences
- Topics should feel real and modern (social media, career hustle, relationships are fine)
- Do NOT add Vietnamese, explanations, or extra commentary
- Return ONLY valid JSON, no markdown, exactly this shape:

{
  "examples": [
    { "context": "love", "sentence": "..." },
    { "context": "life", "sentence": "..." },
    { "context": "work", "sentence": "..." }
  ],
  "paragraph": "..."
}`;
}

// GET — fetch cached content
export async function GET(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const word_id = searchParams.get("word_id");
  const skill_level = searchParams.get("skill_level");

  if (!word_id || !skill_level) {
    return Response.json({ error: "Missing params" }, { status: 400 });
  }

  const { data } = await supabase
    .from("word_ai_content")
    .select("examples, paragraph")
    .eq("word_id", word_id)
    .eq("skill_level", skill_level)
    .single();

  return Response.json({ content: data || null });
}

// POST — generate (or return cache hit)
export async function POST(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { word_id, word, pos, word_level, skill_level, learning_goal } = await request.json();

  if (!word_id || !word) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Cache hit?
  const { data: cached } = await admin
    .from("word_ai_content")
    .select("examples, paragraph")
    .eq("word_id", word_id)
    .eq("skill_level", skill_level || "B1")
    .single();

  if (cached) return Response.json({ content: cached, cached: true });

  // Generate with OpenAI
  const prompt = buildPrompt(word, pos, word_level, skill_level || "B1", learning_goal || "daily");

  let parsed;
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.8,
      max_tokens: 600,
      response_format: { type: "json_object" },
    });

    parsed = JSON.parse(completion.choices[0].message.content);

    // Validate shape
    if (!Array.isArray(parsed.examples) || typeof parsed.paragraph !== "string") {
      throw new Error("Invalid response shape");
    }
  } catch (err) {
    console.error("[AI word-content] generation failed:", err.message);
    return Response.json({ error: "Generation failed" }, { status: 500 });
  }

  // Save to cache
  await admin.from("word_ai_content").upsert({
    word_id,
    skill_level: skill_level || "B1",
    examples: parsed.examples,
    paragraph: parsed.paragraph,
  }, { onConflict: "word_id,skill_level" });

  return Response.json({ content: parsed, cached: false });
}
