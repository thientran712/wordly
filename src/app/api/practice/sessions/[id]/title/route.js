import { getUserFast } from "@/lib/get-user-fast";
import { createAdminClient } from "@/lib/supabase-admin";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const TITLE_PROMPT = `Summarize the following conversation opener into a short chat title, 3-6 words, no quotes, no trailing punctuation, no emoji. Just the title text, nothing else.`;

export async function POST(request, { params }) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { messages } = await request.json();
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "Missing messages" }, { status: 400 });
  }

  const transcript = messages.map((m) => `${m.role}: ${m.content}`).join("\n");

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: TITLE_PROMPT },
        { role: "user", content: transcript },
      ],
      temperature: 0.5,
      max_tokens: 20,
    }),
  });

  if (!res.ok) return Response.json({ error: "Title generation failed" }, { status: 500 });

  const data = await res.json();
  const title = (data.choices?.[0]?.message?.content || "").trim().replace(/^["']|["']$/g, "");
  if (!title) return Response.json({ error: "Empty title" }, { status: 500 });

  const supabase = createAdminClient();
  const { data: updated, error } = await supabase
    .from("practice_sessions")
    .update({ title })
    .eq("id", params.id)
    .eq("user_id", user.id)
    .select("id, title")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ session: updated });
}
