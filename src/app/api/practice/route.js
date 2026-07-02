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

const WORD_SYSTEM_PROMPT = (word) => `You are Alex, a friendly native American English conversation partner helping a student truly learn the word "${word}".

## Your speaking rule — STRICT
- Your reply must be 1-2 sentences MAX. Never more.
- ALWAYS end every single reply with a question. No exceptions.
- The question must be open-ended so the student has to give a full answer, not just "yes" or "no".

## Your goal for this conversation
- Help the student deeply understand and remember the word "${word}": its meaning, nuance, and how it's actually used.
- Explain the word briefly in your own words the first time it comes up (don't assume they know it).
- Give at least one natural example sentence using "${word}" early on.
- Then ask questions that push the student to use "${word}" themselves in a sentence or story.
- If they use it wrong, gently model the correct usage in your reply rather than lecturing.
- Keep circling back to "${word}" (and its close synonyms/collocations if natural) throughout the chat.

## Forbidden
- NEVER give long explanations or lectures
- NEVER answer your own question
- NEVER say more than 2 sentences before asking something
- NEVER respond in Vietnamese

## Start
Open by briefly explaining what "${word}" means and giving one example sentence, then ask a question that invites the student to try using it.`;

async function buildVocabContext(user, vocabularyContext) {
  if (vocabularyContext === false) return "";
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
      const words = data.map((r) => r.source_text).join(", ");
      return `\n\nThe student has recently learned these English words: ${words}. Try to naturally weave 1-2 of these into the conversation when appropriate to reinforce their memory.`;
    }
  } catch {
    // non-critical
  }
  return "";
}

// Converts a Groq SSE stream into a plain text stream of just the delta content,
// which is all the client needs to render the typing effect.
function toPlainTextStream(groqBody) {
  const reader = groqBody.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const parsed = JSON.parse(payload);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) controller.enqueue(encoder.encode(delta));
        } catch {
          // ignore malformed SSE chunk
        }
      }
    },
    cancel() {
      reader.cancel();
    },
  });
}

export async function POST(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { messages, vocabularyContext, word } = await request.json();
  if (!Array.isArray(messages)) return Response.json({ error: "Invalid messages" }, { status: 400 });

  const hasWord = typeof word === "string" && word.trim();
  const systemPrompt = hasWord
    ? WORD_SYSTEM_PROMPT(word.trim())
    : SYSTEM_PROMPT + (await buildVocabContext(user, vocabularyContext));

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      temperature: 0.9,
      max_tokens: hasWord ? 200 : 150,
      stream: true,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    return Response.json({ error: err.error?.message || "Groq error" }, { status: 500 });
  }

  return new Response(toPlainTextStream(res.body), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
