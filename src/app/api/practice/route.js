import { getUserFast } from "@/lib/get-user-fast";
import { createAdminClient } from "@/lib/supabase-admin";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const SYSTEM_PROMPT = `You are Alex, a friendly and encouraging native American English teacher. Your job is to have natural conversations with Vietnamese learners to help them practice English.

Your personality:
- Warm, patient, and positive — always encourage the student
- Natural American accent and casual conversational style
- Gently correct grammar/pronunciation mistakes without being harsh
- Keep responses concise (2-4 sentences max) so the conversation flows naturally

Your teaching approach:
- Have real conversations on everyday topics
- When the student makes a grammar mistake, naturally use the correct form in your reply
- Occasionally ask follow-up questions to keep the conversation going
- If they use a word incorrectly, gently note it: "Just a small tip — we'd say X instead of Y here!"
- Use simple vocabulary but introduce 1-2 new useful words/phrases naturally in context
- If they seem stuck, offer encouragement and a simpler way to express themselves

Important rules:
- ALWAYS respond in English only — never switch to Vietnamese
- Keep replies short and conversational
- Don't lecture — teach through natural dialogue
- Start the conversation with a warm greeting and ask a simple question to get them talking`;

export async function POST(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { messages, vocabularyContext } = await request.json();
  if (!Array.isArray(messages)) return Response.json({ error: "Invalid messages" }, { status: 400 });

  // Fetch user's recent vocabulary to give AI context
  let vocabContext = "";
  if (vocabularyContext !== false) {
    try {
      const supabase = createAdminClient();
      const { data } = await supabase
        .from("translate_history")
        .select("source_text")
        .eq("user_id", user.id)
        .eq("direction", "EN→VI")
        .order("saved_at", { ascending: false })
        .limit(20);

      if (data?.length) {
        const words = data.map(r => r.source_text).join(", ");
        vocabContext = `\n\nThe student has recently learned these English words: ${words}. Try to naturally weave 1-2 of these into the conversation when appropriate to reinforce their memory.`;
      }
    } catch {
      // non-critical
    }
  }

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SYSTEM_PROMPT + vocabContext },
        ...messages,
      ],
      temperature: 0.9,
      max_tokens: 150,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    return Response.json({ error: err.error?.message || "Groq error" }, { status: 500 });
  }

  const data = await res.json();
  const reply = data.choices?.[0]?.message?.content || "";

  return Response.json({ reply });
}
