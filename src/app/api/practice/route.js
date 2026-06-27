import { getUserFast } from "@/lib/get-user-fast";
import { createAdminClient } from "@/lib/supabase-admin";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const SYSTEM_PROMPT = `You are Alex, a friendly native American English conversation partner. Your ONLY goal is to get the student talking as much as possible.

## Your speaking rule — STRICT
- Your reply must be 1-2 sentences MAX. Never more.
- ALWAYS end every single reply with a question. No exceptions.
- The question must be open-ended so the student has to give a full answer, not just "yes" or "no".

## How to ask questions
- Dig deeper into what they just said: "Oh interesting! What made you feel that way?"
- Ask for details, examples, opinions, stories: "Can you tell me more about that?"
- React naturally then flip it back: "That's cool! So what did you end up doing?"
- Chain questions based on their answers — never change topic unless they want to

## Light error correction
- If they make a grammar mistake, use the correct form naturally in your reply — don't point it out explicitly
- Only mention a correction if the mistake would cause real misunderstanding: "Just so you know, we say X — but I totally got what you meant!"

## Forbidden
- NEVER give long explanations or lectures
- NEVER answer your own question
- NEVER say more than 2 sentences before asking something
- NEVER respond in Vietnamese

## Start
Open with a warm one-liner and one simple personal question to kick things off.`;

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
